// Risk List core — จัดลำดับความเสี่ยงครัวเรือน (คำนวณสด ไม่เขียนลง DB)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md + docs/08):
// - RBAC ฝั่ง server (household.view)
// - คำนวณเฉพาะครัวเรือน VERIFIED เท่านั้น — "ห้ามใช้ข้อมูล Unverified คำนวณ Risk"
// - ⚠️ ค่าน้ำหนัก/เกณฑ์เป็น v1.0-draft (ยังไม่รับรอง — docs/29) → คำนวณ on-the-fly
//   ไม่ persist ลง FloodRiskProfile (สคีมายัง WAITING_FOR_BUSINESS_RULE) → แก้ config
//   ที่เดียวแล้วทุกหน้าคำนวณใหม่ ย้อนกลับได้ 100% ไม่มีคะแนนกำพร้าค้าง (เลี่ยง RISK-06/10)
// - Privacy: คืนเฉพาะฟิลด์โครงสร้าง (รหัสใบ, ชุมชน, ระดับ/คะแนน/ความมั่นใจ) ไม่มี PII
// - Audit READ ทุกครั้งที่เปิดดู

import { AuditAction, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import {
  DRAFT_RISK_CONFIG_V1,
  computeRiskProfile,
  householdToRiskInput,
  totalSystemWeight,
  type RiskLevel,
} from "@/domain/risk";

/** เพดานจำนวนครัวเรือนที่ดึงมาคำนวณต่อครั้ง — กันโหลดทั้งฐานในคำขอเดียว */
export const RISK_LIST_LIMIT = 500;

export function canViewRisk(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW);
}

export interface RiskRow {
  householdId: string;
  sheetNo: string;
  communityTh: string;
  /** null = ข้อมูลไม่พอประเมิน */
  level: RiskLevel | null;
  absoluteScore: number;
  confidence: number;
  factorsUsed: number;
  factorsTotal: number;
  appliedHardRules: string[];
}

export interface RiskListResult {
  allowed: boolean;
  rows: RiskRow[];
  /** สรุปจำนวนตามระดับ (รวม insufficient) */
  counts: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT", number>;
  config: { weightVersion: string; formulaVersion: string; draft: boolean };
  /** เพดานน้ำหนักที่ map ได้จริง / น้ำหนักทั้งระบบ — บอกว่าเดโมยัง map ไม่ครบ */
  mappableWeight: number;
  systemWeight: number;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function emptyCounts(): RiskListResult["counts"] {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 };
}

/**
 * ดึงครัวเรือน VERIFIED มาคำนวณความเสี่ยงสด ๆ แล้วจัดลำดับ (เร่งด่วนสุดก่อน)
 * คืน allowed=false เมื่อไม่มีสิทธิ์
 */
export async function getRiskList(
  ctx: AuthorizationContext,
): Promise<RiskListResult> {
  const config = DRAFT_RISK_CONFIG_V1;
  const systemWeight = totalSystemWeight(config);
  // น้ำหนักที่ map ได้จริง (8 ปัจจัย) — ที่เหลือยัง BLANK ทั้งระบบ
  const mappableCodes = new Set([
    "FLOOR_LEVEL",
    "HAS_FLOODED",
    "FLOOD_DEPTH",
    "FLOOD_DURATION",
    "HAS_P1",
    "HAS_P2",
    "NO_SURVIVAL_KIT",
    "UNKNOWN_EVAC_SITE",
  ]);
  const mappableWeight = config.factors
    .filter((f) => mappableCodes.has(f.code))
    .reduce((s, f) => s + f.weight, 0);

  const base = {
    allowed: false as boolean,
    rows: [] as RiskRow[],
    counts: emptyCounts(),
    config: {
      weightVersion: config.weightVersion,
      formulaVersion: config.formulaVersion,
      draft: config.draft,
    },
    mappableWeight,
    systemWeight,
  };

  if (!canViewRisk(ctx)) return base;

  const households = await prisma.household.findMany({
    where: {
      deletedAt: null,
      hasDuplicateFlag: false,
      sheet: { status: SheetStatus.VERIFIED },
    },
    take: RISK_LIST_LIMIT,
    select: {
      id: true,
      sheet: { select: { sheetNo: true } },
      community: { select: { nameTh: true } },
      floodRiskProfile: {
        select: {
          floorLevelVsRoad: true,
          hasFloodedBefore: true,
          maxFloodDepthCm: true,
          lastFloodDurationDays: true,
          hasSurvivalKit: true,
          nearestEvacSiteType: true,
        },
      },
      vulnerablePersons: {
        where: { isActive: true },
        select: {
          triageLevel: true,
          vulnerabilities: {
            select: { vulnerabilityType: { select: { code: true } } },
          },
        },
      },
    },
  });

  const rows: RiskRow[] = households.map((h) => {
    const p = h.floodRiskProfile;
    const triages = h.vulnerablePersons
      .map((v) => v.triageLevel)
      .filter((t): t is NonNullable<typeof t> => t !== null);
    const codes = h.vulnerablePersons.flatMap((v) =>
      v.vulnerabilities.map((pv) => pv.vulnerabilityType.code),
    );

    const input = householdToRiskInput({
      floorLevelVsRoad: p?.floorLevelVsRoad ?? null,
      hasFloodedBefore: p?.hasFloodedBefore ?? null,
      maxFloodDepthCm: p?.maxFloodDepthCm ?? null,
      lastFloodDurationDays: p?.lastFloodDurationDays ?? null,
      hasSurvivalKit: p?.hasSurvivalKit ?? null,
      nearestEvacSiteType: p?.nearestEvacSiteType ?? null,
      vulnerableTriages: triages,
      vulnerabilityCodes: codes,
    });
    const r = computeRiskProfile(input, config);

    return {
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityTh: h.community.nameTh,
      level: r.riskLevelAuto,
      absoluteScore: r.absoluteScore,
      confidence: r.riskConfidence,
      factorsUsed: r.factorsUsed,
      factorsTotal: r.factorsTotal,
      appliedHardRules: r.appliedHardRules,
    };
  });

  // เรียง: มีระดับก่อน (รุนแรง→น้อย) แล้วคะแนน · insufficient ไปท้าย
  rows.sort((a, b) => {
    const la = a.level ? LEVEL_ORDER[a.level] : -1;
    const lb = b.level ? LEVEL_ORDER[b.level] : -1;
    if (lb !== la) return lb - la;
    return b.absoluteScore - a.absoluteScore;
  });

  const counts = emptyCounts();
  for (const r of rows) counts[r.level ?? "INSUFFICIENT"] += 1;

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "RiskList",
    reason: `คำนวณความเสี่ยงสด ${rows.length} ครัวเรือน (weightVersion=${config.weightVersion})`,
  });

  return { ...base, allowed: true, rows, counts };
}
