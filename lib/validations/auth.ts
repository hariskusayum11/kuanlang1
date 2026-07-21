import { z } from "zod";

// Login validation — ใช้ทั้ง Client (ก่อน submit) และตรวจซ้ำได้ฝั่ง Server
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "กรุณากรอกอีเมล")
    .email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export type LoginInput = z.infer<typeof loginSchema>;
