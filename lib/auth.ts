import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { AuditAction } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAuditLog } from "./audit/log";

// Better Auth server instance — โครงสร้าง field ตรงกับ prisma/schema.prisma (Gate: auth-gate/)
// RBAC ใช้ตาราง UserRole แยกต่างหาก — ไม่ใช้ admin plugin (ยังไม่ audit role flow)
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // ไม่มีหน้าสมัครสมาชิกใน UI — sign-up ใช้เฉพาะ script local dev
    // (scripts/create-dev-user.ts) และถูกปิดใน production
    disableSignUp: process.env.NODE_ENV === "production",
  },
  // นโยบาย Session (ระดับ global) — ระบบมีข้อมูลสุขภาพ จึงไม่ใช้ค่าเริ่มต้น 7 วัน
  // หมายเหตุ: Better Auth 1.6.x รองรับเฉพาะอายุ session ระดับ global เท่านั้น
  // การแยกอายุ session ต่อบทบาท (เช่น back-office ยาวกว่า volunteer มือถือ)
  // ต้องทำเป็น validation layer เพิ่ม — เลื่อนไปทำภายหลัง (ดู docs/26 §4)
  session: {
    expiresIn: 60 * 60 * 12, // 12 ชม. — ครอบคลุมวันทำงานเต็มวันโดยไม่ต้อง login ซ้ำ แต่หมดอายุข้ามคืน
    updateAge: 60 * 60, // ต่ออายุอัตโนมัติเมื่อยัง active ภายใน 1 ชม.
    cookieCache: {
      // cache session ใน cookie 5 นาที ลดภาระ DB
      // (การบังคับ isActive ราย request ยังทำแยกใน getActiveSessionUser — ไม่ถูก bypass)
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  // Rate limit — กัน brute-force การเดารหัสผ่าน
  // storage เริ่มต้นเป็น in-memory (ไม่แชร์ข้าม instance) — เพียงพอช่วงเริ่มระบบ
  // เมื่อ scale หลาย instance ค่อยย้ายไป storage แบบ database/redis (ต้องเพิ่ม model — ดู Roadmap)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 }, // ผิดได้ 5 ครั้ง/นาที ต่อ IP
    },
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      isActive: { type: "boolean", required: false },
      lastLoginAt: { type: "date", required: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // ผู้ใช้ inactive ต้อง Login ไม่ได้ — บล็อกตั้งแต่สร้าง session
          // ข้อความกลาง ไม่เปิดเผยเหตุผลจริงต่อผู้ใช้ (login form แสดง generic message)
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          if (!user?.isActive) {
            throw new APIError("FORBIDDEN", { message: "ไม่สามารถเข้าสู่ระบบได้" });
          }
          return { data: session };
        },
        after: async (session) => {
          // เข้าสู่ระบบสำเร็จ (session ถูกสร้าง) → อัปเดต lastLoginAt + เขียน Audit LOGIN
          // ทั้งสองเป็น best-effort: ห้ามทำให้ login ล้มเหลวถ้าเขียนไม่สำเร็จ
          try {
            await prisma.user.update({
              where: { id: session.userId },
              data: { lastLoginAt: new Date() },
            });
          } catch {
            // ไม่บล็อก login — ปล่อยผ่าน
          }
          await writeAuditLog({
            userId: session.userId,
            action: AuditAction.LOGIN,
            entityType: "Session",
            entityId: session.id,
            ipAddress: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
          });
        },
      },
    },
  },
});
