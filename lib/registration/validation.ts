import { UserRoleEnum } from "@prisma/client";
import { z } from "zod";

/**
 * บทบาทที่ยื่นขอเองได้จากหน้า public (Hybrid — docs/26 §5)
 * บทบาทอำนาจสูง (OFFICER/COORDINATOR/VERIFIER/RESEARCHER/EXECUTIVE/ADMIN)
 * แอดมินสร้างให้เองเท่านั้น — ห้ามเพิ่มใน list นี้โดยไม่มี Owner Decision
 *
 * Owner Decision (2026-07-26): ถอด `FIELD_SURVEYOR` ออกจากรายการที่สมัครเองได้
 * เหตุผล: กระบวนการเป็น Paper-first — ผู้สำรวจกรอกลงกระดาษ ไม่ได้กรอกในระบบ
 * และโมดูลเดียวที่เขาต้องใช้ (`FieldQuery` — ตอบกลับเมื่อคนคีย์อ่านลายมือไม่ออก)
 * ยังไม่ได้สร้าง จึงมี 0 permission → สมัครแล้ว login เข้ามาเจอ /access-denied ทันที
 * เดิมเป็นทางตันจริงในระบบ (พบจากการทดสอบ 2026-07-26)
 */
export const REQUESTABLE_ROLES = [
  UserRoleEnum.VOLUNTEER,
  UserRoleEnum.DATA_ENTRY,
] as const satisfies readonly UserRoleEnum[];

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export const REQUESTABLE_ROLE_LABELS: Record<RequestableRole, string> = {
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
  [UserRoleEnum.DATA_ENTRY]: "เจ้าหน้าที่คีย์ข้อมูล",
};

// ช่อง optional จากฟอร์ม: ค่าว่าง ("") ถือว่าไม่กรอก — แปลงเป็น undefined ก่อนตรวจ
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

// ใช้ทั้ง Client (ก่อน submit) และ Server (ใน action — ห้ามเชื่อถือ client)
export const registrationSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "กรุณากรอกอีเมล")
    .email("รูปแบบอีเมลไม่ถูกต้อง")
    .max(255),
  password: z
    .string()
    .min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
    .max(128, "รหัสผ่านยาวเกินไป"),
  firstName: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อ")
    .max(100, "ชื่อยาวเกินไป"),
  lastName: z
    .string()
    .trim()
    .min(1, "กรุณากรอกนามสกุล")
    .max(100, "นามสกุลยาวเกินไป"),
  // เบอร์โทร: เลข 10 หลักพอ (มือถือไทย) — ตัดขีด/เว้นวรรคออก เก็บเฉพาะตัวเลข
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, "เบอร์โทรต้องเป็นตัวเลข 10 หลัก")
      .optional(),
  ),
  requestedRole: z
    .nativeEnum(UserRoleEnum)
    .refine(
      (r): r is RequestableRole =>
        (REQUESTABLE_ROLES as readonly UserRoleEnum[]).includes(r),
      "บทบาทนี้ไม่สามารถยื่นขอเองได้",
    ),
  communityId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().cuid().optional(),
  ),
  organization: optionalTrimmed(200),
  note: optionalTrimmed(1000),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
