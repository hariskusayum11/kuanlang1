// =============================================================================
// กลุ่มเปราะบาง "สีแดง" — ต้องเคลื่อนย้ายเมื่อได้รับสัญญาณ (เช่น ธงส้ม) · docs/42
// Owner Decision 2026-10-26 — Pure Function (ไม่แตะ DB/คีย์ถอดรหัส)
// -----------------------------------------------------------------------------
// เกณฑ์ของทีม 4 กลุ่ม เทียบกับสิ่งที่แบบสอบถามเก็บได้จริง:
//  1. ผู้ป่วยติดเตียง (ทุกคน) — ช่อง "ผู้ป่วยติดเตียง / พิการ" · อุปกรณ์การแพทย์เก็บระดับบ้าน
//     จึงแสดงเป็นคอลัมน์ประกอบ ไม่ใช้คัดออก
//  2. ผู้ป่วยฟอกไต — ช่องตรง
//  3. หญิงใกล้คลอด (อายุครรภ์ ณ วันนี้ ≥ 36 สัปดาห์) และทารก ≤ 3 เดือน
//     อายุครรภ์/อายุลูกอยู่ใน "ข้อความตามกระดาษ" (ไม่มีหน่วยบังคับ) → อ่านด้วย parse*Text
//  4. ผู้สูงอายุ 60+ ที่ติดเตียงทุกคน + ค้นในช่องรายละเอียดเผื่อเขียนไว้ใน "อื่นๆ"
//
// หลักความปลอดภัย: งานนี้คือการอพยพ — **ตกหล่นอันตรายกว่ารายชื่อยาว**
// อ่านค่าไม่ออก/พบจากคำในช่องอื่นๆ → ใส่ไว้ก่อนพร้อมธง "ควรโทรยืนยัน" ไม่ตัดทิ้ง
// =============================================================================

export type RedGroup = "BEDRIDDEN" | "DIALYSIS" | "MATERNAL_NEWBORN" | "ELDERLY_BEDRIDDEN";

export const RED_GROUPS: readonly RedGroup[] = ["BEDRIDDEN", "DIALYSIS", "MATERNAL_NEWBORN", "ELDERLY_BEDRIDDEN"];

/** เลขกลุ่มตามเอกสารของทีม (1–4) — ใช้ในตาราง/ไฟล์ให้ตรงกับที่ทีมพูดถึง */
export const RED_GROUP_NO: Record<RedGroup, number> = {
  BEDRIDDEN: 1,
  DIALYSIS: 2,
  MATERNAL_NEWBORN: 3,
  ELDERLY_BEDRIDDEN: 4,
};

export const RED_GROUP_LABELS: Record<RedGroup, string> = {
  BEDRIDDEN: "ผู้ป่วยติดเตียง",
  DIALYSIS: "ผู้ป่วยฟอกไต",
  MATERNAL_NEWBORN: "หญิงใกล้คลอด / ทารกแรกเกิด",
  ELDERLY_BEDRIDDEN: "ผู้สูงอายุติดเตียง",
};

/** ค่าเกณฑ์ (Owner Decision 2026-10-26) */
export const RED_GROUP_RULES = {
  nearTermWeeks: 36,
  /** อายุครรภ์เกินนี้ถือว่าคลอดแล้ว → พิจารณาเป็นทารกแทน */
  deliveredAfterWeeks: 42,
  /** อายุครรภ์ครบกำหนด ใช้ประมาณอายุทารกเมื่อคลอดแล้ว */
  termWeeks: 40,
  newbornMaxMonths: 3,
  elderlyAge: 60,
} as const;

/** รหัส VulnerabilityType ที่ใช้ (master data — prisma/seed.ts) */
export const RED_TYPE_CODES = {
  bedridden: "BEDRIDDEN",
  dialysis: "DIALYSIS",
  pregnant: "PREGNANT",
  postpartum: "POSTPARTUM",
} as const;

export type FloorLevelCode = "BELOW_ROAD" | "EQUAL_ROAD" | "ABOVE_ROAD";

export interface RedGroupPersonInput {
  age: number | null;
  ageMonths: number | null;
  /** detail = ข้อความที่ถอดรหัสแล้ว */
  vulnerabilities: { code: string; detail: string | null }[];
}

export interface RedGroupHouseholdInput {
  memberCount: number | null;
  floorLevelVsRoad: FloorLevelCode | null;
  /** บ้านติ๊ก "ต้องการเคลื่อนย้ายอุปกรณ์การแพทย์" */
  needsMedicalEquipment: boolean;
  /** วันที่สำรวจจากกระดาษ (หรือวันที่คีย์ถ้าไม่มี) — อายุครรภ์/อายุทารกนับต่อจากวันนี้ */
  referenceDate: Date | null;
}

export interface RedClassification {
  groups: RedGroup[];
  /** สิ่งที่ทีมต้องรู้ก่อนเคลื่อนย้าย เช่น "อายุครรภ์ ณ วันนี้ประมาณ 37 สัปดาห์" */
  notes: string[];
  /** เข้ากลุ่มจากการอ่านข้อความ/ค่าไม่ครบ → ควรโทรยืนยันก่อน */
  needsCheck: boolean;
}

const DAY_MS = 86_400_000;
const WEEKS_PER_MONTH = 4.345;
const DAYS_PER_MONTH = 30.44;

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

function normalize(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d))).trim();
}

function firstNumber(text: string): number | null {
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

const WEEK_UNIT = /สัปดาห์|สัปดา|อาทิตย์|week|wk|\d\s*w\b/i;
const MONTH_UNIT = /เดือน|ด\.|month|\d\s*m\b/i;
const DAY_UNIT = /วัน|day|\d\s*d\b/i;

/**
 * อ่านอายุครรภ์จากข้อความตามกระดาษ → สัปดาห์ ณ วันสำรวจ
 * มีหน่วย → ตามหน่วย · ไม่มีหน่วย: ≤ 10 ถือเป็นเดือน (คนมักพูด "ท้อง 7") · 11–45 ถือเป็นสัปดาห์
 * อ่านไม่ได้ → null
 */
export function parsePregnancyWeeks(raw: string | null): number | null {
  if (!raw) return null;
  const text = normalize(raw);
  const value = firstNumber(text);
  if (value === null || value <= 0) return null;
  // "7 เดือน 2 สัปดาห์" — มีทั้งสองหน่วย ต้องอ่านตัวเลขของแต่ละหน่วยแยกกัน
  const monthPart = text.match(/(\d+(?:\.\d+)?)\s*(?:เดือน|ด\.)/);
  const weekPart = text.match(/(\d+(?:\.\d+)?)\s*(?:สัปดาห์|สัปดา|อาทิตย์)/);
  let weeks: number;
  if (monthPart) weeks = Number(monthPart[1]) * WEEKS_PER_MONTH + (weekPart ? Number(weekPart[1]) : 0);
  else if (weekPart || WEEK_UNIT.test(text)) weeks = weekPart ? Number(weekPart[1]) : value;
  else if (MONTH_UNIT.test(text)) weeks = value * WEEKS_PER_MONTH;
  else if (value <= 10) weeks = value * WEEKS_PER_MONTH;
  else if (value <= 45) weeks = value;
  else return null;
  return weeks > 0 && weeks <= 45 ? weeks : null;
}

/**
 * อ่านอายุลูกของมารดาหลังคลอด (ช่อง "ระบุอายุเดือนของเด็ก") → เดือน ณ วันสำรวจ
 * ไม่มีหน่วย = เดือน (ตามป้ายช่องบนกระดาษ) · อ่านไม่ได้ → null
 */
export function parseBabyAgeMonths(raw: string | null): number | null {
  if (!raw) return null;
  const text = normalize(raw);
  const value = firstNumber(text);
  if (value === null || value < 0) return null;
  let months: number;
  if (DAY_UNIT.test(text)) months = value / DAYS_PER_MONTH;
  else if (WEEK_UNIT.test(text)) months = value / WEEKS_PER_MONTH;
  else months = value;
  return months <= 60 ? months : null;
}

/** คำในช่องรายละเอียดที่บ่งว่าเข้ากลุ่ม แม้ไม่ได้ติ๊กช่องนั้น */
const BEDRIDDEN_WORDS = /ติดเตียง/;
const DIALYSIS_WORDS = /ฟอกไต|ล้างไต|ฟอกเลือด|ล้างช่องท้อง/;
const FEEDING_TUBE_WORDS = /สายยาง|สายให้อาหาร|ให้อาหารทางสาย|\bNG\b|\bPEG\b|เจาะคอ/i;
const NO_CAREGIVER_WORDS = /ไม่มีผู้ดูแล|ไม่มีคนดูแล|อยู่คนเดียว|อยู่ลำพัง/;

function elapsedDays(referenceDate: Date | null, now: Date): number {
  if (!referenceDate) return 0;
  return Math.max(0, (now.getTime() - referenceDate.getTime()) / DAY_MS);
}

const fmt = (n: number) => Math.round(n).toLocaleString("th-TH");

/** คัดหนึ่งคน → null = ไม่อยู่ในกลุ่มสีแดง */
export function classifyRedPerson(
  person: RedGroupPersonInput,
  household: RedGroupHouseholdInput,
  now: Date = new Date(),
): RedClassification | null {
  const groups = new Set<RedGroup>();
  const notes: string[] = [];
  let needsCheck = false;

  const codes = new Set(person.vulnerabilities.map((v) => v.code));
  const details = person.vulnerabilities.map((v) => v.detail ?? "").filter(Boolean);
  const detailText = details.join(" ");
  const days = elapsedDays(household.referenceDate, now);
  const elapsedWeeks = days / 7;
  const elapsedMonths = days / DAYS_PER_MONTH;
  const elderly = person.age !== null && person.age >= RED_GROUP_RULES.elderlyAge;

  // --- 1. ติดเตียง ---
  let bedridden = false;
  if (codes.has(RED_TYPE_CODES.bedridden)) {
    bedridden = true;
  } else if (BEDRIDDEN_WORDS.test(detailText)) {
    bedridden = true;
    needsCheck = true;
    notes.push("พบคำว่า “ติดเตียง” ในรายละเอียด (ไม่ได้ติ๊กช่องติดเตียง)");
  }
  if (bedridden) groups.add("BEDRIDDEN");

  // --- 2. ฟอกไต ---
  if (codes.has(RED_TYPE_CODES.dialysis)) {
    groups.add("DIALYSIS");
  } else if (DIALYSIS_WORDS.test(detailText)) {
    groups.add("DIALYSIS");
    needsCheck = true;
    notes.push("พบคำเรื่องฟอกไตในรายละเอียด (ไม่ได้ติ๊กช่องฟอกไต)");
  }

  // --- 3. หญิงใกล้คลอด / ทารกแรกเกิด ---
  if (codes.has(RED_TYPE_CODES.pregnant)) {
    const raw = person.vulnerabilities.find((v) => v.code === RED_TYPE_CODES.pregnant)?.detail ?? null;
    const weeksAtSurvey = parsePregnancyWeeks(raw);
    if (weeksAtSurvey === null) {
      // ตั้งครรภ์อยู่ตอนสำรวจ ถ้าผ่านมานานเกินกว่าทารกจะยังไม่ถึง 3 เดือนแน่นอน จึงตัดได้
      const maxPossibleWeeks = RED_GROUP_RULES.deliveredAfterWeeks + RED_GROUP_RULES.newbornMaxMonths * WEEKS_PER_MONTH;
      if (elapsedWeeks <= maxPossibleWeeks) {
        groups.add("MATERNAL_NEWBORN");
        needsCheck = true;
        notes.push("ตั้งครรภ์ — อ่านอายุครรภ์จากกระดาษไม่ได้ ควรโทรถาม");
      }
    } else {
      const weeksNow = weeksAtSurvey + elapsedWeeks;
      if (weeksNow >= RED_GROUP_RULES.nearTermWeeks && weeksNow <= RED_GROUP_RULES.deliveredAfterWeeks) {
        groups.add("MATERNAL_NEWBORN");
        notes.push(`ใกล้คลอด — อายุครรภ์ ณ วันนี้ประมาณ ${fmt(weeksNow)} สัปดาห์`);
      } else if (weeksNow > RED_GROUP_RULES.deliveredAfterWeeks) {
        const babyMonths = (weeksNow - RED_GROUP_RULES.termWeeks) / WEEKS_PER_MONTH;
        if (babyMonths <= RED_GROUP_RULES.newbornMaxMonths) {
          groups.add("MATERNAL_NEWBORN");
          needsCheck = true;
          notes.push(`น่าจะคลอดแล้ว — ทารกอายุประมาณ ${fmt(Math.max(0, babyMonths * WEEKS_PER_MONTH))} สัปดาห์ ควรโทรยืนยัน`);
        }
      }
    }
  }
  if (codes.has(RED_TYPE_CODES.postpartum)) {
    const raw = person.vulnerabilities.find((v) => v.code === RED_TYPE_CODES.postpartum)?.detail ?? null;
    const monthsAtSurvey = parseBabyAgeMonths(raw);
    if (monthsAtSurvey === null) {
      if (elapsedMonths <= RED_GROUP_RULES.newbornMaxMonths) {
        groups.add("MATERNAL_NEWBORN");
        needsCheck = true;
        notes.push("มารดาหลังคลอด — อ่านอายุลูกจากกระดาษไม่ได้ ควรโทรถาม");
      }
    } else {
      const babyNow = monthsAtSurvey + elapsedMonths;
      if (babyNow <= RED_GROUP_RULES.newbornMaxMonths) {
        groups.add("MATERNAL_NEWBORN");
        notes.push(`มารดาหลังคลอด — ลูกอายุ ณ วันนี้ประมาณ ${babyNow < 1 ? `${fmt(babyNow * WEEKS_PER_MONTH)} สัปดาห์` : `${fmt(babyNow)} เดือน`}`);
      }
    }
  }
  // ทารกที่อยู่ในตารางเอง (อายุ 0 ปี)
  const infant = person.age === 0 || (person.age === null && person.ageMonths !== null);
  if (infant) {
    if (person.ageMonths === null) {
      if (elapsedMonths <= RED_GROUP_RULES.newbornMaxMonths) {
        groups.add("MATERNAL_NEWBORN");
        needsCheck = true;
        notes.push("ทารกอายุต่ำกว่า 1 ปี — ไม่ทราบอายุเดือน ควรโทรถาม");
      }
    } else {
      const monthsNow = person.ageMonths + elapsedMonths;
      if (monthsNow <= RED_GROUP_RULES.newbornMaxMonths) {
        groups.add("MATERNAL_NEWBORN");
        notes.push(`ทารก — อายุ ณ วันนี้ประมาณ ${fmt(monthsNow)} เดือน`);
      }
    }
  }

  // --- 4. ผู้สูงอายุติดเตียง (+ ค้นในช่องอื่นๆ) ---
  const feedingTube = FEEDING_TUBE_WORDS.test(detailText);
  if (elderly && bedridden) {
    groups.add("ELDERLY_BEDRIDDEN");
  } else if (elderly && feedingTube) {
    // ใส่สายยางให้อาหาร = เงื่อนไขของผู้ป่วยติดเตียงตามเกณฑ์ทีม แม้ไม่ได้ติ๊กช่อง
    groups.add("ELDERLY_BEDRIDDEN");
    needsCheck = true;
  }
  if (groups.has("ELDERLY_BEDRIDDEN") || groups.has("BEDRIDDEN")) {
    if (feedingTube) notes.push("พบคำเรื่องสายยาง/ให้อาหารทางสายในรายละเอียด");
    if (NO_CAREGIVER_WORDS.test(detailText)) notes.push("รายละเอียดระบุว่าไม่มีผู้ดูแล/อยู่ลำพัง");
  }

  if (groups.size === 0) return null;

  if (household.memberCount === 1) notes.push("บ้านมีสมาชิก 1 คน (อยู่คนเดียว)");
  if (household.floorLevelVsRoad === "BELOW_ROAD") notes.push("พื้นบ้านต่ำกว่าถนน");
  else if (household.floorLevelVsRoad === "EQUAL_ROAD") notes.push("พื้นบ้านเท่าระดับถนน");
  if (!household.referenceDate && groups.has("MATERNAL_NEWBORN")) {
    needsCheck = true;
    notes.push("ไม่มีวันที่สำรวจ — คำนวณอายุ ณ วันนี้ไม่ได้");
  }

  return { groups: RED_GROUPS.filter((g) => groups.has(g)), notes, needsCheck };
}

export interface RedGroupTally {
  people: number;
  households: number;
  needsCheck: number;
  byGroup: Record<RedGroup, number>;
}

/** นับคน/บ้าน/รายกลุ่ม (หนึ่งคนอยู่ได้หลายกลุ่ม ยอดรายกลุ่มจึงรวมเกินจำนวนคนได้) */
export function tallyRedGroups(
  rows: readonly { householdId: string; classification: RedClassification }[],
): RedGroupTally {
  const byGroup = { BEDRIDDEN: 0, DIALYSIS: 0, MATERNAL_NEWBORN: 0, ELDERLY_BEDRIDDEN: 0 } as Record<RedGroup, number>;
  let needsCheck = 0;
  for (const row of rows) {
    for (const group of row.classification.groups) byGroup[group] += 1;
    if (row.classification.needsCheck) needsCheck += 1;
  }
  return {
    people: rows.length,
    households: new Set(rows.map((row) => row.householdId)).size,
    needsCheck,
    byGroup,
  };
}

/** "1, 4" — เลขกลุ่มตามเอกสารของทีม */
export function redGroupNumbers(groups: readonly RedGroup[]): string {
  return groups.map((g) => RED_GROUP_NO[g]).join(", ");
}
