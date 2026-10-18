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
  UserRoleEnum.DATA_ENTRY,
  UserRoleEnum.OFFICER,
  UserRoleEnum.VOLUNTEER,
] as const satisfies readonly UserRoleEnum[];

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

/**
 * ป้ายในหน้าสมัคร — ตอบคำถาม **"คุณคือใคร"** ไม่ใช่ "เลือกสิทธิ์ที่อยากได้"
 * (Owner Decision 2026-10-18)
 *
 * ค่าที่เก็บยังเป็น UserRoleEnum เหมือนเดิมเพื่อไม่ต้อง migrate — แต่ความหมาย
 * เปลี่ยนเป็น "บทบาทที่ผู้สมัครเสนอ" ซึ่ง **ADMIN มีสิทธิ์เปลี่ยนตอนอนุมัติ**
 * เช่น ผู้ที่เลือก "เจ้าหน้าที่หน่วยงาน" อาจได้ EXECUTIVE ถ้าเป็นแพทย์/ผู้บริหาร
 */
export const REQUESTABLE_ROLE_LABELS: Record<RequestableRole, string> = {
  [UserRoleEnum.DATA_ENTRY]: "ผู้คีย์ข้อมูล",
  [UserRoleEnum.OFFICER]: "เจ้าหน้าที่หน่วยงาน",
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
};

/** คำอธิบายใต้ตัวเลือก — ช่วยให้ผู้สมัครเลือกถูกตั้งแต่ครั้งแรก */
export const REQUESTABLE_ROLE_HINTS: Record<RequestableRole, string> = {
  [UserRoleEnum.DATA_ENTRY]: "คีย์ข้อมูลจากแบบสอบถามกระดาษเข้าระบบ",
  [UserRoleEnum.OFFICER]: "เจ้าหน้าที่หน่วยงาน/โรงพยาบาล/ชุมชน ที่ต้องใช้ข้อมูลทำงาน",
  [UserRoleEnum.VOLUNTEER]: "อาสาช่วยเหลือเมื่อเกิดเหตุ — ลงทะเบียนไว้ล่วงหน้า",
};

/**
 * บทบาทที่ ADMIN "มอบได้" ตอนกดอนุมัติ (Owner Decision 2026-10-18)
 *
 * กว้างกว่า REQUESTABLE_ROLES เพราะ EXECUTIVE (ผู้บริหาร/แพทย์) ถูกถอดออกจาก
 * การสมัครเองแล้ว — ต้องให้ ADMIN เป็นผู้มอบเท่านั้น เนื่องจากเห็นข้อมูลสุขภาพ
 * รายบุคคลและดาวน์โหลดรายชื่อกลุ่มเปราะบางพร้อมพิกัดบ้านได้
 *
 * **ADMIN ไม่อยู่ในรายการนี้โดยตั้งใจ** — การยกสิทธิ์ผู้ดูแลระบบต้องทำแยกที่หน้า
 * จัดการผู้ใช้ เพื่อไม่ให้เกิดขึ้นได้ด้วยการกดปุ่มเดียวในคิวอนุมัติ
 *
 * รายการนี้ยังเป็นด่านตรวจของคำขอเก่าที่ค้างอยู่ด้วย (เช่นคำขอที่ยื่นมาเป็น
 * EXECUTIVE ก่อนเปลี่ยนกติกา) จึงต้องครอบคลุมค่าที่เคยยื่นได้ทั้งหมด
 */
export const APPROVABLE_ROLES = [
  UserRoleEnum.DATA_ENTRY,
  UserRoleEnum.OFFICER,
  UserRoleEnum.EXECUTIVE,
  UserRoleEnum.VOLUNTEER,
] as const satisfies readonly UserRoleEnum[];

export type ApprovableRole = (typeof APPROVABLE_ROLES)[number];

export const APPROVABLE_ROLE_LABELS: Record<ApprovableRole, string> = {
  [UserRoleEnum.DATA_ENTRY]: "เจ้าหน้าที่คีย์ข้อมูล",
  [UserRoleEnum.OFFICER]: "เจ้าหน้าที่",
  [UserRoleEnum.EXECUTIVE]: "ผู้บริหาร/แพทย์",
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
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
