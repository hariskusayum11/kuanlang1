import { UserRoleEnum } from "@prisma/client";
import { z } from "zod";

/**
 * บทบาทที่ยื่นขอเองได้จากหน้า public (Hybrid — docs/26 §5)
 * บทบาทอำนาจสูง (OFFICER/COORDINATOR/VERIFIER/RESEARCHER/EXECUTIVE/ADMIN)
 * แอดมินสร้างให้เองเท่านั้น — ห้ามเพิ่มใน list นี้โดยไม่มี Owner Decision
 */
export const REQUESTABLE_ROLES = [
  UserRoleEnum.VOLUNTEER,
  UserRoleEnum.FIELD_SURVEYOR,
  UserRoleEnum.DATA_ENTRY,
] as const satisfies readonly UserRoleEnum[];

export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export const REQUESTABLE_ROLE_LABELS: Record<RequestableRole, string> = {
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
  [UserRoleEnum.FIELD_SURVEYOR]: "ผู้สำรวจภาคสนาม",
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
  name: z
    .string()
    .trim()
    .min(2, "กรุณากรอกชื่อ-นามสกุล")
    .max(200),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9+\- ]+$/, "เบอร์โทรไม่ถูกต้อง")
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
