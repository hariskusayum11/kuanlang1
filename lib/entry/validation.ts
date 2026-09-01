// Entry Validation — Pure Functions (ทดสอบได้: tests/unit/entry-validation.test.ts)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (Owner Decision 2026-07-26):
//   "บังคับกรอก" = ต้องมีค่า **หรือ** ถูกมาร์ก F2 (อ่านไม่ออก) / F3 (ว่างในกระดาษ)
//   เหตุผล: CLAUDE.md ห้ามบังคับให้ผู้คีย์เดาค่าที่อ่านไม่ออก — การมาร์ก F2/F3
//   คือ "คำตอบที่ถูกต้อง" ของกระดาษใบนั้น ไม่ใช่การเลี่ยงการกรอก
//   สิ่งที่ห้ามคือ "ปล่อยว่างเงียบ ๆ แล้วส่งใบ"
//
// ไม่มี DOM / ไม่มี React / ไม่มี Prisma — ใช้ได้ทั้ง client และ server

import type { EntryField, EntryStep } from "./steps";

export interface MissingItem {
  /** คีย์อ้างอิงสำหรับ jump ไปยังช่องที่ขาด */
  key: string;
  label: string;
  stepId: string;
  stepIndex: number;
}

export interface VulnerableRowLike {
  prefix: string;
  prefixOther: string;
  firstName: string;
  lastName: string;
  age: string;
  ageUnit?: "YEAR" | "MONTH";
  phone: string;
  vulnerabilities: string[];
  details: Record<string, string>;
}

/** ประเภทความเปราะบางเท่าที่ validation ต้องรู้ */
export interface VulnerabilityTypeLike {
  id: string;
  label: string;
  requiresDetail: boolean;
}

/** ประเภทความต้องการช่วยเหลือเท่าที่ validation ต้องรู้ */
export interface AssistanceTypeLike {
  id: string;
  label: string;
  requiresCount: boolean;
  requiresDetail: boolean;
}

export type MarkMap = Record<string, string | null | undefined>;

/** ฟิลด์ถือว่า "มีค่า" — boolean false ก็นับว่าตอบแล้ว (มีความหมายต่างจากว่าง) */
export function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * แสดงฟิลด์นี้อยู่หรือไม่ (skip logic ระดับฟิลด์ — showWhen)
 * รองรับค่าเดียว (radio/select), อาร์เรย์ (checkbox-group — ติ๊ก OTHER ในกลุ่ม), และ boolean
 */
export function isFieldVisible(
  field: EntryField,
  answers: Record<string, unknown>,
  codeOf: (masterKey: string, id: string) => string | undefined,
): boolean {
  if (!field.showWhen) return true;
  const { field: depName, equals } = field.showWhen;
  const raw = answers[depName];
  if (typeof raw === "boolean") return String(raw) === equals;
  // ค่าที่เก็บอาจเป็น id ของ master — เทียบด้วย code (เช่น "OTHER")
  const target = ENTRY_MASTER_OF[depName];
  const resolve = (v: string) => (target ? codeOf(target, v) : v);
  if (Array.isArray(raw)) {
    return raw.some((v) => typeof v === "string" && resolve(v) === equals);
  }
  if (typeof raw === "string" && raw !== "") return resolve(raw) === equals;
  return false;
}

/** ฟิลด์ที่ค่าเป็น id ของ master ตัวไหน — ใช้แปลง id → code ตอนเช็ค showWhen */
const ENTRY_MASTER_OF: Record<string, string> = {
  surveyorPrefix: "namePrefixes",
  respondentPrefix: "namePrefixes",
  buildingTypeId: "buildingTypes",
  ownershipTypeId: "ownershipTypes",
  // checkbox-group ที่มีตัวเลือกรหัส OTHER (อ่าน id → code เพื่อเช็ค showWhen)
  householdResources: "resourceTypes",
};

/** แถวกลุ่มเปราะบางถูกเริ่มกรอกแล้วหรือยัง — แถวว่างเปล่าไม่ถือว่าขาด */
export function isRowStarted(row: VulnerableRowLike): boolean {
  return (
    row.prefix.trim() !== "" ||
    row.prefixOther.trim() !== "" ||
    row.firstName.trim() !== "" ||
    row.lastName.trim() !== "" ||
    row.phone.trim() !== "" ||
    row.age.trim() !== "" ||
    row.vulnerabilities.length > 0
  );
}

/** ตอบแล้วหรือยัง โดยนับ F2/F3 เป็นคำตอบ */
function answeredOrMarked(
  name: string,
  answers: Record<string, unknown>,
  marks: MarkMap,
): boolean {
  if (marks[name]) return true;
  return isAnswered(answers[name]);
}

export interface CollectMissingArgs {
  steps: EntryStep[];
  answers: Record<string, unknown>;
  marks: MarkMap;
  vulnerableRows: VulnerableRowLike[];
  vulnerabilityTypes: VulnerabilityTypeLike[];
  assistanceTypes: AssistanceTypeLike[];
  /** แปลง id ของ master → code (ใช้กับ showWhen) */
  codeOf: (masterKey: string, id: string) => string | undefined;
}

/**
 * รายการที่ยัง "ขาด" ทั้งใบ — ใช้ทั้งบล็อกการส่งและไฮไลต์ทีละ step
 *
 * กติกา (Owner Decision 2026-07-26): **ทุกช่องที่มองเห็นต้องถูกตอบ**
 * ตอบ = มีค่า / F2 (อ่านไม่ออก) / F3 (ว่างในกระดาษ) — ไม่มีการเว้นว่างเงียบ ๆ
 * เพื่อไม่ให้ "กระดาษไม่ได้เขียน" ปนกับ "ผู้คีย์ลืม" ซึ่งทำให้ข้อมูลตกหล่นโดยไม่มีร่องรอย
 */
export function collectMissing(args: CollectMissingArgs): MissingItem[] {
  const {
    steps,
    answers,
    marks,
    vulnerableRows,
    vulnerabilityTypes,
    assistanceTypes,
    codeOf,
  } = args;
  const out: MissingItem[] = [];

  steps.forEach((step, stepIndex) => {
    if (step.kind === "vulnerable-grid") {
      collectVulnerableMissing(
        vulnerableRows,
        vulnerabilityTypes,
        marks,
        step.id,
        stepIndex,
        out,
      );
      return;
    }

    for (const f of step.fields) {
      if (!isFieldVisible(f, answers, codeOf)) continue;

      if (f.type === "assistance-needs") {
        collectAssistanceMissing(f, answers, marks, assistanceTypes, step.id, stepIndex, out);
        continue;
      }

      // checkbox-group ที่มีตัวเลือก "ไม่มี/ไม่สะดวก" แบบ exclusive — ติ๊ก none = ตอบแล้ว
      // (แม้ array ทรัพยากร/ทักษะจะว่าง) ไม่ถือว่าขาด
      if (f.exclusiveNone && answers[f.exclusiveNone.key] === true) continue;

      // Owner Decision 2026-07-26: ทุกช่องที่มองเห็นต้อง "ถูกตอบ" เสมอ
      // ตอบ = มีค่า / F2 (อ่านไม่ออก) / F3 (ว่างในกระดาษ)
      // เหตุผล: ถ้าปล่อยให้เว้นว่างเงียบ ๆ ผ่านได้ จะแยกไม่ออกว่า
      // "กระดาษไม่ได้เขียน" หรือ "ผู้คีย์ลืม" → ข้อมูลตกหล่นโดยไม่มีใครรู้

      // measure-pair: ช่องใดช่องหนึ่งมีค่า/ถูกมาร์ก = ตอบแล้ว (เช่น "1 เมตร" ซม.ว่าง)
      if (f.pair) {
        const answered =
          answeredOrMarked(f.name, answers, marks) ||
          answeredOrMarked(f.pair.name, answers, marks);
        if (!answered) {
          out.push({ key: f.name, label: f.label, stepId: step.id, stepIndex });
        }
        continue;
      }

      if (
        f.type === "number" &&
        f.min != null &&
        !marks[f.name] &&
        typeof answers[f.name] === "number" &&
        (answers[f.name] as number) < f.min
      ) {
        out.push({ key: f.name, label: f.label, stepId: step.id, stepIndex });
        continue;
      }

      if (!answeredOrMarked(f.name, answers, marks)) {
        out.push({ key: f.name, label: f.label, stepId: step.id, stepIndex });
      }
    }
  });

  return out;
}

/** ตารางกลุ่มเปราะบาง — ชื่อ/สกุลบังคับ และรายละเอียดบังคับตาม requiresDetail */
function collectVulnerableMissing(
  rows: VulnerableRowLike[],
  types: VulnerabilityTypeLike[],
  marks: MarkMap,
  stepId: string,
  stepIndex: number,
  out: MissingItem[],
): void {
  const byId = new Map(types.map((t) => [t.id, t]));

  rows.forEach((row, ri) => {
    // แถวที่ยังไม่เริ่มกรอกและไม่มีมาร์กใด ๆ = ข้าม (แถวเปล่าไม่ถือว่าขาด)
    const marked = (cell: string) => Boolean(marks[`vg-${ri}-${cell}`]);
    const rowMarked = ["firstName", "lastName", "age", "phone"].some(marked);
    if (!isRowStarted(row) && !rowMarked) return;
    const who = `กลุ่มเปราะบาง คนที่ ${ri + 1}`;

    // มาร์ก F2/F3 นับเป็นคำตอบ — ชื่อ/สกุลที่อ่านไม่ออกไม่ถือว่าขาด (ห้ามบังคับเดา)
    if (row.firstName.trim() === "" && !marked("firstName")) {
      out.push({ key: `vg-${ri}-firstName`, label: `${who}: ชื่อ`, stepId, stepIndex });
    }
    if (row.lastName.trim() === "" && !marked("lastName")) {
      out.push({ key: `vg-${ri}-lastName`, label: `${who}: นามสกุล`, stepId, stepIndex });
    }

    // ติ๊กหญิงตั้งครรภ์/มารดาหลังคลอด/ยาประจำ/อื่นๆ → ต้องระบุรายละเอียด
    for (const typeId of row.vulnerabilities) {
      const t = byId.get(typeId);
      if (!t?.requiresDetail) continue;
      if ((row.details[typeId] ?? "").trim() === "") {
        out.push({
          key: `vg-${ri}-detail-${typeId}`,
          label: `${who}: รายละเอียด "${t.label}"`,
          stepId,
          stepIndex,
        });
      }
    }
  });
}

/** ความต้องการช่วยเหลือ — ติ๊กข้อไหนต้องกรอกจำนวน/รายละเอียดของข้อนั้น */
function collectAssistanceMissing(
  field: EntryField,
  answers: Record<string, unknown>,
  marks: MarkMap,
  types: AssistanceTypeLike[],
  stepId: string,
  stepIndex: number,
  out: MissingItem[],
): void {
  const selected = Array.isArray(answers[field.name])
    ? (answers[field.name] as string[])
    : [];

  // ไม่ติ๊กเลย = ต้องยืนยันด้วย F3 ว่ากระดาษไม่ได้เขียน (ห้ามปล่อยว่างเงียบ ๆ)
  if (selected.length === 0) {
    if (!marks[field.name]) {
      out.push({ key: field.name, label: field.label, stepId, stepIndex });
    }
    return;
  }

  const counts = asRecord(answers.assistanceNeedCounts);
  const details = asRecord(answers.assistanceNeedDetails);
  const byId = new Map(types.map((t) => [t.id, t]));

  for (const id of selected) {
    const t = byId.get(id);
    if (!t) continue;
    if (t.requiresCount && (counts[id] ?? "").trim() === "") {
      out.push({
        key: `an-count-${id}`,
        label: `ความต้องการ "${t.label}": จำนวนคน`,
        stepId,
        stepIndex,
      });
    }
    if (t.requiresDetail && (details[id] ?? "").trim() === "") {
      out.push({
        key: `an-detail-${id}`,
        label: `ความต้องการ "${t.label}": รายละเอียด`,
        stepId,
        stepIndex,
      });
    }
  }
}

export function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** จำนวนที่ขาดแยกตาม step — ใช้ระบายสีแถบซ้าย */
export function missingCountByStep(missing: MissingItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of missing) out[m.stepId] = (out[m.stepId] ?? 0) + 1;
  return out;
}
