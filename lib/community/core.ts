// Community Management core — testable (ctx-based, ไม่ import next/headers)
// ตรวจ permission + community scope ฝั่ง server · ตั้ง totalHouseholds (ตัวหาร Coverage)
// ข้อมูลชุมชนไม่ใช่ PII → Audit บันทึกค่า old→new ได้ (ต่างจากฟิลด์ครัวเรือน)

import { AuditAction } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { validateTotalHouseholds } from "../../domain/coverage/coverage";
import { fetchCommunityCoverage } from "../dashboard/get-coverage";
import type { CommunityCoverageRow } from "../dashboard/coverage";

export interface CommunityListItem {
  id: string;
  code: string;
  nameTh: string;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  populationDataSource: string | null;
  populationDataNote: string | null;
  lastPopulationUpdatedAt: Date | null;
  tambons: { nameTh: string; isPrimary: boolean }[];
  coverage: CommunityCoverageRow | null;
}

function inScope(ctx: AuthorizationContext, communityId: string): boolean {
  return ctx.isGlobalScope || ctx.communityIds.includes(communityId);
}

/** รายชุมชนใน scope + coverage (reuse fetchCommunityCoverage) — read-only */
export async function listCommunities(
  ctx: AuthorizationContext,
): Promise<{ allowed: boolean; communities: CommunityListItem[] }> {
  if (!hasPermission(ctx, PERMISSIONS.COMMUNITY_VIEW)) {
    return { allowed: false, communities: [] };
  }
  const scope = { isGlobalScope: ctx.isGlobalScope, communityIds: ctx.communityIds };
  if (!scope.isGlobalScope && scope.communityIds.length === 0) {
    return { allowed: true, communities: [] };
  }

  const [{ rows }, communities] = await Promise.all([
    fetchCommunityCoverage(scope),
    prisma.community.findMany({
      where: scope.isGlobalScope
        ? { deletedAt: null }
        : { deletedAt: null, id: { in: scope.communityIds } },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        nameTh: true,
        totalHouseholds: true,
        targetCoveragePercent: true,
        populationDataSource: true,
        populationDataNote: true,
        lastPopulationUpdatedAt: true,
        communityTambons: {
          orderBy: { isPrimary: "desc" },
          select: { isPrimary: true, tambon: { select: { nameTh: true } } },
        },
      },
    }),
  ]);

  const coverageById = new Map(rows.map((r) => [r.communityId, r]));
  return {
    allowed: true,
    communities: communities.map((c) => ({
      id: c.id,
      code: c.code,
      nameTh: c.nameTh,
      totalHouseholds: c.totalHouseholds,
      targetCoveragePercent: c.targetCoveragePercent,
      populationDataSource: c.populationDataSource,
      populationDataNote: c.populationDataNote,
      lastPopulationUpdatedAt: c.lastPopulationUpdatedAt,
      tambons: c.communityTambons.map((ct) => ({
        nameTh: ct.tambon.nameTh,
        isPrimary: ct.isPrimary,
      })),
      coverage: coverageById.get(c.id) ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// อัปเดตข้อมูลประชากร (ตัวหาร Coverage)
// ---------------------------------------------------------------------------

export interface PopulationInput {
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  dataSource?: string | null;
  dataNote?: string | null;
}

export interface NormalizedPopulation {
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  dataSource: string | null;
  dataNote: string | null;
}

export type PopulationValidation =
  | { ok: true; value: NormalizedPopulation }
  | { ok: false; error: string };

const MAX_HOUSEHOLDS = 1_000_000;

/** ตรวจ/normalize ข้อมูลประชากร (pure) — totalHouseholds NULL หรือ int>0, target 0<x≤100 */
export function validatePopulationInput(input: PopulationInput): PopulationValidation {
  const total = input.totalHouseholds;
  if (total !== null) {
    if (!validateTotalHouseholds(total).ok || !Number.isInteger(total) || total > MAX_HOUSEHOLDS) {
      return { ok: false, error: "จำนวนครัวเรือนทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0 (หรือเว้นว่าง = ยังไม่ทราบ)" };
    }
  }
  const target = input.targetCoveragePercent;
  if (!Number.isFinite(target) || target <= 0 || target > 100) {
    return { ok: false, error: "เปอร์เซ็นต์เป้าหมายต้องอยู่ระหว่าง 1–100" };
  }
  const trim = (v: string | null | undefined): string | null => {
    const s = (v ?? "").trim();
    return s === "" ? null : s.slice(0, 200);
  };
  return {
    ok: true,
    value: {
      totalHouseholds: total,
      targetCoveragePercent: target,
      dataSource: trim(input.dataSource),
      dataNote: trim(input.dataNote),
    },
  };
}

export type UpdatePopulationResult =
  | { ok: true }
  | { ok: false; reason: "NOT_ALLOWED" | "NOT_FOUND" | "INVALID"; error?: string };

/** ตั้ง totalHouseholds/target/source/note ของชุมชน + Audit (บันทึกค่า old→new — ไม่ใช่ PII) */
export async function updatePopulation(
  ctx: AuthorizationContext,
  communityId: string,
  input: PopulationInput,
): Promise<UpdatePopulationResult> {
  if (!hasPermission(ctx, PERMISSIONS.COMMUNITY_MANAGE)) {
    return { ok: false, reason: "NOT_ALLOWED" };
  }
  if (!inScope(ctx, communityId)) return { ok: false, reason: "NOT_FOUND" };

  const validation = validatePopulationInput(input);
  if (!validation.ok) return { ok: false, reason: "INVALID", error: validation.error };

  const current = await prisma.community.findFirst({
    where: { id: communityId, deletedAt: null },
    select: { id: true, totalHouseholds: true, targetCoveragePercent: true },
  });
  if (!current) return { ok: false, reason: "NOT_FOUND" };

  const v = validation.value;
  await prisma.community.update({
    where: { id: communityId },
    data: {
      totalHouseholds: v.totalHouseholds,
      targetCoveragePercent: v.targetCoveragePercent,
      populationDataSource: v.dataSource,
      populationDataNote: v.dataNote,
      lastPopulationUpdatedAt: new Date(),
      populationUpdatedById: ctx.userId,
    },
  });

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "Community",
    entityId: communityId,
    changes: {
      totalHouseholds: { old: current.totalHouseholds, new: v.totalHouseholds },
      targetCoveragePercent: { old: current.targetCoveragePercent, new: v.targetCoveragePercent },
    },
    reason: "population-update",
  });

  return { ok: true };
}
