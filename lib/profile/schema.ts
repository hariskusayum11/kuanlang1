import { z } from "zod";

// Validation ที่ใช้ร่วมทั้ง Client (ก่อน submit) และ Server (ใน action — ห้ามเชื่อถือ client)
// เป็น pure schema ทดสอบได้โดยไม่ต้องมี DB/session

/** แก้ข้อมูลส่วนตัว: ชื่อ-นามสกุล (เก็บใน User.name ช่องเดียว) + เบอร์โทร */
export const profileInfoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อ-นามสกุล")
    .max(200, "ชื่อยาวเกินไป"),
  // เบอร์โทร: เลข 10 หลัก (มือถือไทย) — ค่าว่างถือว่าไม่กรอก → undefined (ล้างเบอร์เดิมได้)
  // กติกาเดียวกับหน้าลงทะเบียน (lib/registration/validation.ts)
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, "เบอร์โทรต้องเป็นตัวเลข 10 หลัก")
      .optional(),
  ),
});

export type ProfileInfoInput = z.infer<typeof profileInfoSchema>;

/** เปลี่ยนรหัสผ่านขณะล็อกอิน — Better Auth ตรวจ currentPassword จริงฝั่ง server อีกชั้น */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
    newPassword: z
      .string()
      .min(8, "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร")
      .max(128, "รหัสผ่านยาวเกินไป"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
    path: ["newPassword"],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
