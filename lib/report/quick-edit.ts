import { AuditAction, TriageLevel } from "@prisma/client";
import { isTriageBelowRecommendation, recommendedTriage, type TriageCode } from "../../domain/triage";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { decryptText, encryptText } from "../crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring } from "../crypto/keys";
import { prisma } from "../prisma";

export type VolunteerState = "INTERESTED" | "UNAVAILABLE" | "UNSPECIFIED";

export type ReportQuickEditInput =
  | { kind: "triage"; recordId: string; value: TriageLevel }
  | { kind: "host-house"; recordId: string; value: boolean | null }
  | { kind: "survival-kit"; recordId: string; value: boolean | null }
  | { kind: "assistance"; recordId: string; needId: string; active: boolean; typeId?: string; personCount: number | null; detail: string }
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
  if (raw.kind === "survival-kit") {
    if (raw.value !== true && raw.value !== false && raw.value !== null) return null;
    return { kind: "survival-kit", recordId, value: raw.value };
  }
  if (raw.kind === "assistance") {
    if (typeof raw.needId !== "string" || !raw.needId.trim() || typeof raw.active !== "boolean") return null;
    const typeId = typeof raw.typeId === "string" && raw.typeId.trim() ? raw.typeId.trim() : undefined;
    if (raw.active && !typeId) return null;
    const personCount = raw.personCount === null || raw.personCount === undefined
      ? null
      : typeof raw.personCount === "number" && Number.isSafeInteger(raw.personCount) && raw.personCount >= 0 && raw.personCount <= 5000
        ? raw.personCount
        : undefined;
    if (personCount === undefined) return null;
    if (typeof raw.detail !== "string" || raw.detail.length > 1000) return null;
    return { kind: "assistance", recordId, needId: raw.needId.trim(), active: raw.active, typeId, personCount, detail: raw.detail.trim() };
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
      select: {
        id: true,
        triageLevel: true,
        household: { select: { surveyedAt: true } },
        vulnerabilities: { select: { vulnerabilityType: { select: { basePriority: true, nameTh: true } } } },
      },
    });
    if (!before) return { ok: false, reason: "NOT_FOUND" };
    const recommended = recommendedTriage(
      before.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
    );
    const recommendationReasons = recommended
      ? before.vulnerabilities
          .filter((item) => item.vulnerabilityType.basePriority === recommended)
          .map((item) => item.vulnerabilityType.nameTh)
      : [];
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
      changes: {
        triageLevel: { old: before.triageLevel, new: input.value },
        recommendedLevel: recommended,
        recommendationReasons,
        belowRecommendation: isTriageBelowRecommendation(input.value as TriageCode, recommended),
      },
    });
    return { ok: true };
  }

  const household = await prisma.household.findFirst({
    where: { id: input.recordId, deletedAt: null },
    select: {
      id: true,
      volunteerNotAvailable: true,
      floodRiskProfile: { select: { canBeHostHouse: true, hasSurvivalKit: true } },
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

  if (input.kind === "survival-kit") {
    await prisma.floodRiskProfile.upsert({
      where: { householdId: household.id },
      update: { hasSurvivalKit: input.value },
      create: { householdId: household.id, hasSurvivalKit: input.value },
    });
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entityType: "Household",
      entityId: household.id,
      reason: "report-quick-edit:survival-kit",
      changes: { hasSurvivalKit: { old: household.floodRiskProfile?.hasSurvivalKit ?? null, new: input.value } },
    });
    return { ok: true };
  }

  if (input.kind === "assistance") {
    const before = await prisma.assistanceNeed.findFirst({
      where: { id: input.needId, householdId: household.id },
      select: { id: true, needTypeId: true, personCount: true, detail: true },
    });
    if (!before) return { ok: false, reason: "NOT_FOUND" };

    let targetType: { id: string; requiresCount: boolean; requiresDetail: boolean } | null = null;
    if (input.active) {
      targetType = await prisma.assistanceNeedType.findFirst({
        where: { id: input.typeId, isActive: true },
        select: { id: true, requiresCount: true, requiresDetail: true },
      });
      if (!targetType) return { ok: false, reason: "INVALID" };
      if (targetType.requiresCount && (input.personCount === null || input.personCount < 1)) return { ok: false, reason: "INVALID" };
      if (targetType.requiresDetail && !input.detail) return { ok: false, reason: "INVALID" };
      if (targetType.id !== before.needTypeId) {
        const duplicate = await prisma.assistanceNeed.count({
          where: { householdId: household.id, needTypeId: targetType.id, id: { not: before.id } },
        });
        if (duplicate > 0) return { ok: false, reason: "INVALID" };
      }
    }

    const keyring = getKeyring();
    let oldDetail = "";
    if (before.detail) {
      try { oldDetail = decryptText(before.detail, keyring); } catch { oldDetail = ""; }
    }
    await prisma.$transaction(async (tx) => {
      if (!input.active) {
        await tx.assistanceNeed.delete({ where: { id: before.id } });
      } else {
        await tx.assistanceNeed.update({
          where: { id: before.id },
          data: {
            needTypeId: targetType!.id,
            personCount: targetType!.requiresCount ? input.personCount : null,
            detail: targetType!.requiresDetail || input.detail
              ? encryptText(input.detail, keyring, CURRENT_KEY_VERSION)
              : null,
          },
        });
      }
      const totals = await tx.assistanceNeed.aggregate({
        where: { householdId: household.id },
        _sum: { personCount: true },
        _count: { personCount: true },
      });
      await tx.household.update({
        where: { id: household.id },
        data: { assistanceTotalPersonCount: totals._count.personCount > 0 ? totals._sum.personCount ?? 0 : null },
      });
    });
    await writeAuditLog({
      userId: ctx.userId,
      action: input.active ? AuditAction.UPDATE : AuditAction.DELETE,
      entityType: "AssistanceNeed",
      entityId: before.id,
      reason: "report-quick-edit:assistance",
      changes: {
        active: { old: true, new: input.active },
        needTypeId: { old: before.needTypeId, new: input.active ? targetType!.id : null },
        personCount: { old: before.personCount, new: input.active && targetType!.requiresCount ? input.personCount : null },
        detailChanged: oldDetail !== (input.active ? input.detail : ""),
      },
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
