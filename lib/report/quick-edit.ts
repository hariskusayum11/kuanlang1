import { AuditAction, TriageLevel } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { prisma } from "../prisma";

export type VolunteerState = "INTERESTED" | "UNAVAILABLE" | "UNSPECIFIED";

export type ReportQuickEditInput =
  | { kind: "triage"; recordId: string; value: TriageLevel }
  | { kind: "host-house"; recordId: string; value: boolean | null }
  | { kind: "volunteer"; recordId: string; state: VolunteerState; skillIds: string[] };

export type ReportQuickEditResult =
  | { ok: true }
  | { ok: false; reason: "FORBIDDEN" | "INVALID" | "NOT_FOUND" };

const VOLUNTEER_STATES = new Set<VolunteerState>(["INTERESTED", "UNAVAILABLE", "UNSPECIFIED"]);

/** แปลง payload จาก client แบบ strict — ไม่ยอมรับ kind/enum/id ที่ไม่รู้จัก */
export function parseReportQuickEditInput(value: unknown): ReportQuickEditInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.recordId !== "string" || !raw.recordId.trim()) return null;
  const recordId = raw.recordId.trim();

  if (raw.kind === "triage") {
    if (!Object.values(TriageLevel).includes(raw.value as TriageLevel)) return null;
    return { kind: "triage", recordId, value: raw.value as TriageLevel };
  }
  if (raw.kind === "host-house") {
    if (raw.value !== true && raw.value !== false && raw.value !== null) return null;
    return { kind: "host-house", recordId, value: raw.value };
  }
  if (raw.kind === "volunteer") {
    if (!VOLUNTEER_STATES.has(raw.state as VolunteerState) || !Array.isArray(raw.skillIds)) return null;
    const skillIds = [...new Set(raw.skillIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))];
    if (raw.state === "INTERESTED" && skillIds.length === 0) return null;
    if (raw.state !== "INTERESTED" && skillIds.length > 0) return null;
    return { kind: "volunteer", recordId, state: raw.state as VolunteerState, skillIds };
  }
  return null;
}

/** บันทึกค่าแบบสั้นจากรายงาน — ไม่เปลี่ยนสถานะใบและไม่สร้าง workflow เพิ่ม */
export async function applyReportQuickEdit(
  ctx: AuthorizationContext,
  input: ReportQuickEditInput,
): Promise<ReportQuickEditResult> {
  if (!hasPermission(ctx, PERMISSIONS.REPORT_QUICK_EDIT)) return { ok: false, reason: "FORBIDDEN" };

  if (input.kind === "triage") {
    const before = await prisma.vulnerablePerson.findFirst({
      where: { id: input.recordId, isActive: true, household: { deletedAt: null } },
      select: { id: true, triageLevel: true, household: { select: { surveyedAt: true } } },
    });
    if (!before) return { ok: false, reason: "NOT_FOUND" };
    await prisma.vulnerablePerson.update({
      where: { id: before.id },
      data: {
        triageLevel: input.value,
        triageComputedAt: new Date(),
        triageBasedOnDate: before.household.surveyedAt,
        triageStale: false,
      },
    });
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entityType: "VulnerablePerson",
      entityId: before.id,
      reason: "report-quick-edit:triage",
      changes: { triageLevel: { old: before.triageLevel, new: input.value } },
    });
    return { ok: true };
  }

  const household = await prisma.household.findFirst({
    where: { id: input.recordId, deletedAt: null },
    select: {
      id: true,
      volunteerNotAvailable: true,
      floodRiskProfile: { select: { canBeHostHouse: true } },
      volunteerInterests: { where: { isAvailable: true }, select: { volunteerTypeId: true } },
    },
  });
  if (!household) return { ok: false, reason: "NOT_FOUND" };

  if (input.kind === "host-house") {
    await prisma.floodRiskProfile.upsert({
      where: { householdId: household.id },
      update: { canBeHostHouse: input.value },
      create: { householdId: household.id, canBeHostHouse: input.value },
    });
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entityType: "Household",
      entityId: household.id,
      reason: "report-quick-edit:host-house",
      changes: { canBeHostHouse: { old: household.floodRiskProfile?.canBeHostHouse ?? null, new: input.value } },
    });
    return { ok: true };
  }

  if (input.state === "INTERESTED") {
    const validCount = await prisma.volunteerSkillType.count({
      where: { id: { in: input.skillIds }, isActive: true },
    });
    if (validCount !== input.skillIds.length) return { ok: false, reason: "INVALID" };
  }
  const beforeSkillIds = household.volunteerInterests.map((item) => item.volunteerTypeId).sort();
  await prisma.$transaction(async (tx) => {
    await tx.volunteerInterest.deleteMany({ where: { householdId: household.id } });
    if (input.state === "INTERESTED") {
      await tx.volunteerInterest.createMany({
        data: input.skillIds.map((volunteerTypeId) => ({
          householdId: household.id,
          volunteerTypeId,
          isAvailable: true,
        })),
      });
    }
    await tx.household.update({
      where: { id: household.id },
      data: { volunteerNotAvailable: input.state === "UNAVAILABLE" ? true : input.state === "INTERESTED" ? false : null },
    });
  });
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "Household",
    entityId: household.id,
    reason: "report-quick-edit:volunteer",
    changes: {
      volunteerState: { old: household.volunteerNotAvailable === true ? "UNAVAILABLE" : beforeSkillIds.length ? "INTERESTED" : "UNSPECIFIED", new: input.state },
      volunteerSkillIds: { old: beforeSkillIds, new: [...input.skillIds].sort() },
    },
  });
  return { ok: true };
}
