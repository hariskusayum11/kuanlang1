import { z } from "zod";
import { SELECTABLE_STATUSES, type PersonStatus } from "../../domain/vulnerable/status";

// ใช้ร่วมกันทั้งฝั่ง Client (ฟอร์ม) และ Server (Server Action) — ห้ามเชื่อ payload จาก client
// กฎวันที่ (ไม่อยู่ในอนาคต/ย้อนหลังไม่เกิน 5 ปี) ตรวจซ้ำที่ server ด้วย parseEventDate
// เพราะ "วันนี้" ของเครื่องผู้ใช้เชื่อถือไม่ได้

export const statusChangeSchema = z
  .object({
    personId: z.string().cuid(),
    target: z
      .string()
      .refine((v): v is PersonStatus => (SELECTABLE_STATUSES as readonly string[]).includes(v), "สถานะไม่ถูกต้อง"),
    eventDate: z.string().trim().optional(),
    /** ย้ายออกทั้งบ้าน — ใช้ได้กับ MOVED_OUT เท่านั้น (docs/43) */
    wholeHousehold: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target !== "ACTIVE" && !value.eventDate) {
      ctx.addIssue({ code: "custom", path: ["eventDate"], message: "ระบุวันที่เกิดเหตุการณ์" });
    }
    if (value.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate)) {
      ctx.addIssue({ code: "custom", path: ["eventDate"], message: "รูปแบบวันที่ไม่ถูกต้อง" });
    }
    if (value.wholeHousehold && value.target !== "MOVED_OUT") {
      ctx.addIssue({ code: "custom", path: ["wholeHousehold"], message: "ทั้งบ้านใช้ได้กับการย้ายออกเท่านั้น" });
    }
  });

export type StatusChangeInput = z.infer<typeof statusChangeSchema> & { target: PersonStatus };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ยาวเกิน ${max} ตัวอักษร`)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * แจ้งเพิ่มคนเปราะบางรายใหม่ในบ้านที่สำรวจแล้ว (docs/43) — นับทันที (Owner Decision 2026-10-26)
 * อายุ: ปี (0–120) · ถ้า 0 ปี ระบุเดือนได้ (0–11)
 */
export const reportPersonSchema = z
  .object({
    householdId: z.string().cuid("เลือกบ้านก่อน"),
    namePrefixId: z.string().cuid().optional().or(z.literal("").transform(() => undefined)),
    firstName: z.string().trim().min(1, "ระบุชื่อ").max(100, "ชื่อยาวเกินไป"),
    lastName: optionalText(100),
    ageYears: z.number().int().min(0, "อายุต้องไม่ติดลบ").max(120, "อายุเกิน 120 ปี").optional(),
    ageMonths: z.number().int().min(0).max(11, "อายุเดือนต้องไม่เกิน 11").optional(),
    phone: optionalText(20).refine((v) => !v || /^[0-9+\-\s]{9,20}$/.test(v), "เบอร์โทรไม่ถูกต้อง"),
    vulnerabilityTypeIds: z.array(z.string().cuid()).min(1, "เลือกลักษณะความเปราะบางอย่างน้อย 1 ข้อ").max(20),
    /** รายละเอียดต่อประเภท (เช่น อายุครรภ์) — คีย์ = vulnerabilityTypeId · เข้ารหัสก่อนบันทึก
     *  ไม่มีช่อง "หมายเหตุ" อิสระโดยตั้งใจ: คอลัมน์ notes ไม่เข้ารหัส แต่คนมักพิมพ์ข้อมูลสุขภาพลงไป */
    details: z.record(z.string().cuid(), z.string().trim().max(200, "รายละเอียดยาวเกินไป")).default({}),
  })
  .superRefine((value, ctx) => {
    if (value.ageMonths !== undefined && value.ageYears !== 0) {
      ctx.addIssue({ code: "custom", path: ["ageMonths"], message: "ระบุเดือนได้เฉพาะเด็กอายุต่ำกว่า 1 ปี" });
    }
  });

export type ReportPersonInput = z.input<typeof reportPersonSchema>;
