// Entry Payload — โครงคำตอบจาก Wizard (ใช้ทั้ง client และ server)
// ---------------------------------------------------------------------------
// Pure ทั้งไฟล์ (ไม่มี crypto/prisma) — server เป็นผู้เข้ารหัสก้อนนี้ก่อนเก็บเสมอ
// การ validate เป็นแบบ "หลวมแต่มีขอบเขต": paper-first ไม่บังคับกรอกช่องใด
// (ค่าว่าง/อ่านไม่ออก คือข้อมูลที่ถูกต้องของกระดาษ) แต่จำกัดชนิด/ขนาด/คีย์ที่รู้จัก

import { z } from "zod";
import { ENTRY_STEPS } from "./steps";

/** ชื่อฟิลด์ทั้งหมดที่ Wizard รู้จัก — คีย์นอกรายการนี้ถูกตัดทิ้งตอน sanitize
 *  measure-pair มี answer key 2 ตัว (name + pair.name) จึงรวมทั้งคู่ */
export const KNOWN_FIELD_NAMES: ReadonlySet<string> = new Set(
  ENTRY_STEPS.flatMap((s) =>
    s.kind === "fields"
      ? s.fields.flatMap((f) => (f.pair ? [f.name, f.pair.name] : [f.name]))
      : [],
  ),
);

const answerValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(64)).max(50),
]);

export const fieldMarkSchema = z.enum(["ILLEGIBLE", "BLANK_IN_PAPER"]);

export const vulnerableRowSchema = z.object({
  prefix: z.string().max(64).default(""), // id ของ NamePrefix (master)
  prefixOther: z.string().max(64).default(""), // ระบุคำนำหน้า เมื่อเลือก "อื่นๆ"
  firstName: z.string().max(200).default(""),
  lastName: z.string().max(200).default(""),
  age: z.union([z.string().max(6), z.number()]).default(""),
  phone: z.string().max(30).default(""),
  vulnerabilities: z.array(z.string().max(64)).max(30).default([]),
  details: z.record(z.string().max(64), z.string().max(500)).default({}),
});
export type VulnerableRowInput = z.infer<typeof vulnerableRowSchema>;

export const entryPayloadSchema = z.object({
  answers: z.record(z.string().max(64), answerValueSchema.nullable()).default({}),
  marks: z.record(z.string().max(64), fieldMarkSchema.nullable()).default({}),
  vulnerableRows: z.array(vulnerableRowSchema).max(30).default([]),
  /** ขั้นตอนล่าสุดที่ค้างอยู่ — ใช้พากลับมาที่เดิมตอน resume */
  stepIndex: z.number().int().min(0).max(20).default(0),
});
export type EntryPayload = z.infer<typeof entryPayloadSchema>;

/**
 * ตัดคีย์ที่ไม่รู้จักออกจาก answers/marks — กัน payload ยัดข้อมูลแปลกปลอม
 * (zod record รับทุกคีย์ — ขั้นนี้คือ whitelist จริง)
 */
export function sanitizeEntryPayload(payload: EntryPayload): EntryPayload {
  const answers: EntryPayload["answers"] = {};
  for (const [k, v] of Object.entries(payload.answers)) {
    if (KNOWN_FIELD_NAMES.has(k)) answers[k] = v;
  }
  const marks: EntryPayload["marks"] = {};
  for (const [k, v] of Object.entries(payload.marks)) {
    if (KNOWN_FIELD_NAMES.has(k) && v) marks[k] = v;
  }
  return { ...payload, answers, marks };
}

/**
 * แปลงวันที่จากกระดาษ "วว/ดด/ปปปป" (พ.ศ. หรือ ค.ศ.) → Date (UTC เที่ยงคืน)
 * คืน null เมื่อ parse ไม่ได้ — ค่าดิบยังอยู่ใน payload เสมอ ไม่มีข้อมูลหาย
 * ห้ามเดา: รูปแบบอื่น (เช่น "ต้นปี 67") ให้ผู้ตรวจตัดสินจากค่าดิบ
 */
export function parseThaiDate(raw: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // กันวันที่เกินจริง เช่น 31/02 (Date จะ roll over เดือน — ต้องปฏิเสธ)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

// ---------- ตัวช่วยอ่านค่าจาก answers (ใช้ตอน map ลง Household) ----------

export function answerString(payload: EntryPayload, name: string): string | null {
  const v = payload.answers[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function answerBoolean(payload: EntryPayload, name: string): boolean | null {
  const v = payload.answers[name];
  return typeof v === "boolean" ? v : null;
}

/** ตัวเลขจำนวนเต็มไม่ติดลบ — ค่าผิดชนิด/ติดลบ → null (เก็บดิบไว้ใน payload) */
export function answerCount(payload: EntryPayload, name: string): number | null {
  const v = payload.answers[name];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 100000) return null;
  return n;
}
