// =============================================================================
// ประเมินครัวเรือนด้วยชุดกฎ + ผลกระทบเมื่อเปลี่ยนกฎ (docs/40) — Pure Functions
// -----------------------------------------------------------------------------
// ใช้ร่วมกันทั้งหน้า /risk, ชั้น "ลำดับการช่วยเหลือ" บน /map และตัวอย่างผลกระทบก่อนบันทึกกฎ
// เพื่อให้ตัวเลขทุกหน้าคำนวณด้วยสูตรเดียวกัน (tests/unit/rule-impact.test.ts)
//
// กติกาเมื่อเปลี่ยนการจับคู่ประเภท → P1/P2/P3:
//   ระดับที่บันทึกไว้ (VulnerablePerson.triageLevel) ถูกตั้งอัตโนมัติตอนตรวจใบ หรือถูกแก้มือจากรายงาน
//   - ค่าที่บันทึก = ค่าที่เกณฑ์เดิมแนะนำ → ถือว่า "ตั้งอัตโนมัติ" → เปลี่ยนตามเกณฑ์ใหม่
//   - ค่าที่บันทึก ≠ ค่าที่เกณฑ์เดิมแนะนำ → ถือว่า "ผู้ดูแลปรับเอง" → คงไว้
//   - ยังไม่บันทึก → ใช้เกณฑ์ใหม่โดยตรง
// =============================================================================

import { effectiveTriage, recommendedTriage, type TriageCode } from "../triage";
import { householdToRiskInput, type HouseholdRiskSource } from "../risk/factors";
import { computeRisk, type RiskComputationResult } from "../risk/score";
import type { RiskLevel, RiskWeightConfig } from "../risk/weights";
import type { TriageMap } from "./priority-rules";

export interface RulePerson {
  /** ระดับที่บันทึกไว้ (null = ยังไม่ประเมิน) */
  stored: TriageCode | null;
  /** รหัสประเภทความเปราะบางของบุคคลนี้ */
  typeCodes: string[];
}

/** ข้อมูลครัวเรือนที่ใช้คำนวณ — ส่วนกระดาษ (ไม่รวมกลุ่มเปราะบาง) + รายชื่อกลุ่มเปราะบางแบบไม่มี PII */
export interface RuleHousehold {
  source: Omit<HouseholdRiskSource, "vulnerableTriages" | "vulnerabilityCodes">;
  persons: RulePerson[];
}

export type TriageTally = Record<TriageCode | "UNASSESSED", number>;
export type RiskTally = Record<RiskLevel | "INSUFFICIENT", number>;

export function emptyTriageTally(): TriageTally {
  return { P1: 0, P2: 0, P3: 0, UNASSESSED: 0 };
}

export function emptyRiskTally(): RiskTally {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 };
}

function priorities(typeCodes: string[], map: TriageMap): Array<TriageCode | undefined> {
  return typeCodes.map((code) => map[code]);
}

/** ระดับความเร่งด่วนใช้งานจริงของบุคคลภายใต้การจับคู่ชุดหนึ่ง */
export function personTriage(person: RulePerson, map: TriageMap): TriageCode | null {
  return effectiveTriage(person.stored, priorities(person.typeCodes, map));
}

/** ค่าที่ควรบันทึกหลังเปลี่ยนการจับคู่ (ดูกติกาหัวไฟล์) — คืน stored เดิมถ้าไม่ต้องเปลี่ยน */
export function storedTriageAfterMapChange(
  person: RulePerson,
  oldMap: TriageMap,
  newMap: TriageMap,
): TriageCode | null {
  if (person.stored === null) return null;
  const oldRecommended = recommendedTriage(priorities(person.typeCodes, oldMap));
  if (person.stored !== oldRecommended) return person.stored;
  return recommendedTriage(priorities(person.typeCodes, newMap)) ?? person.stored;
}

export interface HouseholdEvaluation {
  triages: Array<TriageCode | null>;
  tally: TriageTally;
  risk: RiskComputationResult;
}

/** ประเมินครัวเรือนหนึ่ง: ความเร่งด่วนรายบุคคล → ปัจจัย HAS_P1/HAS_P2 + กฎบังคับ → คะแนนความเสี่ยง */
export function evaluateHousehold(
  household: RuleHousehold,
  map: TriageMap,
  config: RiskWeightConfig,
): HouseholdEvaluation {
  const triages = household.persons.map((p) => personTriage(p, map));
  const tally = emptyTriageTally();
  for (const t of triages) tally[t ?? "UNASSESSED"] += 1;
  const input = householdToRiskInput({
    ...household.source,
    vulnerableTriages: triages.filter((t): t is TriageCode => t !== null),
    vulnerabilityCodes: household.persons.flatMap((p) => p.typeCodes),
  });
  return { triages, tally, risk: computeRisk(input, config) };
}

export interface RuleImpact {
  households: number;
  people: { before: TriageTally; after: TriageTally };
  risk: { before: RiskTally; after: RiskTally };
  /** บุคคลที่ระดับความเร่งด่วนเปลี่ยน */
  peopleChanged: number;
  /** ครัวเรือนที่ระดับความเสี่ยงเปลี่ยน */
  householdsChanged: number;
}

/** เปรียบเทียบผลก่อน/หลังเปลี่ยนกฎ — ใช้แสดง "วิกฤต 82 → 95 คน" ก่อนกดบันทึก */
export function computeRuleImpact(
  households: readonly RuleHousehold[],
  before: { triage: TriageMap; risk: RiskWeightConfig },
  after: { triage: TriageMap; risk: RiskWeightConfig },
): RuleImpact {
  const impact: RuleImpact = {
    households: households.length,
    people: { before: emptyTriageTally(), after: emptyTriageTally() },
    risk: { before: emptyRiskTally(), after: emptyRiskTally() },
    peopleChanged: 0,
    householdsChanged: 0,
  };
  for (const h of households) {
    const migrated: RuleHousehold = {
      source: h.source,
      persons: h.persons.map((p) => ({ ...p, stored: storedTriageAfterMapChange(p, before.triage, after.triage) })),
    };
    const b = evaluateHousehold(h, before.triage, before.risk);
    const a = evaluateHousehold(migrated, after.triage, after.risk);
    for (const key of Object.keys(b.tally) as Array<keyof TriageTally>) {
      impact.people.before[key] += b.tally[key];
      impact.people.after[key] += a.tally[key];
    }
    b.triages.forEach((t, i) => { if (t !== a.triages[i]) impact.peopleChanged += 1; });
    const lb = b.risk.riskLevelAuto ?? "INSUFFICIENT";
    const la = a.risk.riskLevelAuto ?? "INSUFFICIENT";
    impact.risk.before[lb] += 1;
    impact.risk.after[la] += 1;
    if (lb !== la) impact.householdsChanged += 1;
  }
  return impact;
}
