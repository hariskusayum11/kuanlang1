// Risk List core — จัดลำดับความเสี่ยงครัวเรือน (คำนวณสด ไม่เขียนลง DB)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md + docs/08 + docs/40):
// - RBAC ฝั่ง server (household.view)
// - คำนวณเฉพาะครัวเรือน VERIFIED เท่านั้น — "ห้ามใช้ข้อมูล Unverified คำนวณ Risk"
// - ใช้กฎเวอร์ชันที่ใช้งานอยู่ (priority_rule_version ล่าสุด · ไม่มี → ค่าร่างในโค้ด)
//   คำนวณ on-the-fly ไม่ persist ลง FloodRiskProfile → แก้กฎแล้วทุกหน้าคำนวณใหม่ทันที
// - ไม่มีเพดานจำนวน (เดิม 500 หลัง — บ้านที่เกินหายจากรายการและตัวเลขสรุปโดยไม่มีใครรู้)
// - Privacy: คืนเฉพาะฟิลด์โครงสร้าง (รหัสใบ, ชุมชน, ระดับ/คะแนน/ความมั่นใจ) ไม่มี PII
// - Audit READ ทุกครั้งที่เปิดดู

import { AuditAction } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { totalSystemWeight, type RiskLevel } from "../../domain/risk";
import { emptyRiskTally, evaluateHousehold, type RiskTally } from "../../domain/rules/impact";
import { getActiveRuleSet } from "../rules/core";
import { loadRiskHouseholds } from "./household-risk";

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
  counts: RiskTally;
  config: { weightVersion: string; formulaVersion: string; draft: boolean; versionNo: number };
  /** เพดานน้ำหนักที่ map ได้จริง / น้ำหนักทั้งระบบ — บอกว่าเดโมยัง map ไม่ครบ */
  mappableWeight: number;
  systemWeight: number;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// ปัจจัยที่ map จากแบบสอบถามได้จริง (domain/risk/factors.ts) — ที่เหลือยัง BLANK ทั้งระบบ
const MAPPABLE_CODES = new Set([
  "FLOOR_LEVEL",
  "HAS_FLOODED",
  "FLOOD_DEPTH",
  "FLOOD_DURATION",
  "HAS_P1",
  "HAS_P2",
  "NO_SURVIVAL_KIT",
  "UNKNOWN_EVAC_SITE",
]);

/**
 * ดึงครัวเรือน VERIFIED ทั้งหมดมาคำนวณความเสี่ยงสด ๆ แล้วจัดลำดับ (เร่งด่วนสุดก่อน)
 * คืน allowed=false เมื่อไม่มีสิทธิ์
 */
export async function getRiskList(
  ctx: AuthorizationContext,
): Promise<RiskListResult> {
  const rules = await getActiveRuleSet();
  const config = rules.risk;
  const systemWeight = totalSystemWeight(config);
  const mappableWeight = config.factors
    .filter((f) => MAPPABLE_CODES.has(f.code))
    .reduce((s, f) => s + f.weight, 0);

  const base = {
    allowed: false as boolean,
    rows: [] as RiskRow[],
    counts: emptyRiskTally(),
    config: {
      weightVersion: config.weightVersion,
      formulaVersion: config.formulaVersion,
      draft: rules.isDraft,
      versionNo: rules.versionNo,
    },
    mappableWeight,
    systemWeight,
  };

  if (!canViewRisk(ctx)) return base;

  const households = await loadRiskHouseholds({}, ctx.isGlobalScope ? undefined : ctx.communityIds);
  const rows: RiskRow[] = households.map((h) => {
    const { risk: r } = evaluateHousehold(h, rules.triage, config);
    return {
      householdId: h.id,
      sheetNo: h.sheetNo,
      communityTh: h.communityTh,
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

  const counts = emptyRiskTally();
  for (const r of rows) counts[r.level ?? "INSUFFICIENT"] += 1;

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "RiskList",
    reason: `คำนวณความเสี่ยงสด ${rows.length} ครัวเรือน (weightVersion=${config.weightVersion})`,
  });

  return { ...base, allowed: true, rows, counts };
}
