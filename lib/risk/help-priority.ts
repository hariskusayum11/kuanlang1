// ชั้น "ลำดับการช่วยเหลือ" บนแผนที่ภายใน (Owner Decision 2026-10-19 · docs/40)
// ---------------------------------------------------------------------------
// - สิทธิ์: map.view (เปิดหน้าแผนที่) + household.view (เห็นคะแนนความเสี่ยงรายบ้านเหมือนหน้า /risk)
// - ทุกครัวเรือน VERIFIED ตามตัวกรองพื้นที่/วันที่ ไม่มีเพดาน · บ้านที่ไม่มีพิกัดยังอยู่ในรายการ
//   (ระบุว่า "ไม่มีพิกัด") — ไม่มีบ้านหายเงียบจากลำดับ
// - คืนเฉพาะที่อยู่ระดับบ้าน + ตัวเลขความเร่งด่วน/ความเสี่ยง ไม่มีชื่อ เบอร์ หรือโรค

import { AuditAction } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import type { RiskLevel } from "../../domain/risk";
import { evaluateHousehold, type TriageTally } from "../../domain/rules/impact";
import { highestUrgency } from "../../domain/geo/map-urgency";
import { rankHelpCases, type HelpUrgency } from "../../domain/geo/help-priority";
import { getActiveRuleSet } from "../rules/core";
import { loadRiskHouseholds, type RiskHouseholdFilters } from "./household-risk";

export interface HelpCase {
  rank: number;
  householdId: string;
  sheetNo: string;
  communityName: string;
  houseNo: string | null;
  mooNo: number | null;
  /** null = ยังไม่มีพิกัด (อยู่ในรายการ แต่ไม่มีหมุด) */
  lat: number | null;
  lng: number | null;
  urgency: HelpUrgency;
  triage: TriageTally;
  riskLevel: RiskLevel | null;
  absoluteScore: number;
  confidence: number;
  hardRule: boolean;
}

export interface HelpPriorityResult {
  cases: HelpCase[];
  rules: { versionNo: number; weightVersion: string; isDraft: boolean };
}

export function canViewHelpPriority(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.MAP_VIEW) && hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW);
}

/** null = ไม่มีสิทธิ์ (หน้าแผนที่ไม่แสดงชั้นนี้เลย) */
export async function getHelpPriority(
  ctx: AuthorizationContext,
  filters: RiskHouseholdFilters,
): Promise<HelpPriorityResult | null> {
  if (!canViewHelpPriority(ctx)) return null;
  const [rules, households] = await Promise.all([
    getActiveRuleSet(),
    loadRiskHouseholds(filters, ctx.isGlobalScope ? undefined : ctx.communityIds),
  ]);

  const cases = rankHelpCases(
    households.map((h) => {
      const { tally, risk } = evaluateHousehold(h, rules.triage, rules.risk);
      return {
        householdId: h.id,
        sheetNo: h.sheetNo,
        communityName: h.communityTh,
        houseNo: h.houseNo,
        mooNo: h.mooNo,
        lat: h.lat,
        lng: h.lng,
        urgency: (highestUrgency([tally]) ?? "none") as HelpUrgency,
        triage: tally,
        riskLevel: risk.riskLevelAuto,
        // ปัดทศนิยมก่อนส่งให้ client — ลดขนาดข้อมูล และเรียงด้วยค่าเดียวกับที่แสดง
        absoluteScore: Math.round(risk.absoluteScore * 10) / 10,
        confidence: Math.round(risk.riskConfidence * 100) / 100,
        hardRule: risk.appliedHardRules.length > 0,
      };
    }),
  );

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "HelpPriorityMap",
    reason: `เปิดลำดับการช่วยเหลือบนแผนที่ ${cases.length} ครัวเรือน (กฎเวอร์ชัน ${rules.versionNo})`,
  });

  return {
    cases,
    rules: { versionNo: rules.versionNo, weightVersion: rules.risk.weightVersion, isDraft: rules.isDraft },
  };
}
