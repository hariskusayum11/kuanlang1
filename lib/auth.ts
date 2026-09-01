import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { AuditAction } from "@prisma/client";
import { prisma } from "./prisma";
import { writeAuditLog } from "./audit/log";
import {
  passwordResetEmail,
  sendSystemEmail,
  verificationEmail,
} from "./email/smtp";

// Better Auth server instance — โครงสร้าง field ตรงกับ prisma/schema.prisma (Gate: auth-gate/)
// RBAC ใช้ตาราง UserRole แยกต่างหาก — ไม่ใช้ admin plugin (ยังไม่ audit role flow)
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // Self-registration + Approval (docs/26 §5): เปิด sign-up ได้ทุก environment
    // เพราะบัญชีใหม่ "ทุกบัญชี" เกิดมาเป็น isActive=false เสมอ (user.create.before hook)
    // → login ไม่ได้และไม่มีสิทธิ์ใด จนกว่า ADMIN จะอนุมัติ (กันคนนอกโดยดีไซน์ ไม่ใช่โดยปิด endpoint)
    disableSignUp: false,
    // ห้าม auto-login หลังสมัคร — ผู้สมัครต้องรอการอนุมัติก่อนเสมอ
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      const message = passwordResetEmail(user.name, url);
      await sendSystemEmail({ to: user.email, ...message });
    },
    resetPasswordTokenExpiresIn: 60 * 30,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      await writeAuditLog({
        userId: user.id,
        action: AuditAction.UPDATE,
        entityType: "UserCredential",
        entityId: user.id,
        reason: "password-reset",
      });
    },
  },
  emailVerification: {
    // ส่งหลังสร้าง RegistrationRequest สำเร็จใน submitRegistration เพื่อไม่ให้เกิด orphan user
    // หาก SMTP ขัดข้องระหว่าง Better Auth สร้างบัญชี
    sendOnSignUp: false,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const message = verificationEmail(user.name, url);
      await sendSystemEmail({ to: user.email, ...message });
    },
    afterEmailVerification: async (user) => {
      await writeAuditLog({
        userId: user.id,
        action: AuditAction.VERIFY,
        entityType: "UserEmail",
        entityId: user.id,
        reason: "email-verification",
      });
    },
  },
  // นโยบาย Session (ระดับ global) — ระบบมีข้อมูลสุขภาพ จึงไม่ใช้ค่าเริ่มต้น 7 วัน
  // หมายเหตุ: Better Auth 1.6.x รองรับเฉพาะอายุ session ระดับ global เท่านั้น
  // การแยกอายุ session ต่อบทบาท (เช่น back-office ยาวกว่า volunteer มือถือ)
  // ต้องทำเป็น validation layer เพิ่ม — เลื่อนไปทำภายหลัง (ดู docs/26 §4)
  session: {
    // Idle timeout แบบเลื่อนตามการใช้งาน (Owner Decision 2026-07-26):
    //   ไม่แตะระบบ 30 นาที → เซสชันหมดอายุเอง ต้อง Login ใหม่
    //   ใช้งานอยู่ = ต่ออายุให้อัตโนมัติ จึงไม่หลุดกลางคันระหว่างคีย์
    // เหตุผล: เครื่องคีย์ข้อมูลมักเป็นเครื่องกลาง วางทิ้งไว้แล้วเดินออกได้
    // และระบบมีข้อมูลสุขภาพ/กลุ่มเปราะบาง จึงไม่ควรค้าง session ข้ามวัน
    expiresIn: 60 * 30,
    // 0 = ต่ออายุทุก request ที่แตะ DB → หน้าต่าง 30 นาทีเลื่อนตามการใช้งานจริง
    updateAge: 0,
    cookieCache: {
      // cache session ใน cookie สั้น ๆ ลดภาระ DB
      // ต้องสั้นกว่า expiresIn มาก มิฉะนั้น cache จะยืดอายุเกินที่ตั้งใจ
      // (การบังคับ isActive ราย request ยังทำแยกใน getActiveSessionUser — ไม่ถูก bypass)
      enabled: true,
      maxAge: 60,
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
      "/sign-in/email": { window: 60, max: 10 }, // ได้ 10 ครั้ง/นาที ต่อ IP
      "/sign-up/email": { window: 3600, max: 10 }, // สมัครได้ 10 ครั้ง/ชม. ต่อ IP — กัน bot สแปมคำขอ
      "/request-password-reset": { window: 900, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
    },
  },
  // Server Actions (เช่น autosave/ต่ออายุ lock ระหว่างกรอก) ต้องส่ง Set-Cookie
  // กลับไปยังเบราว์เซอร์ มิฉะนั้น session ฝั่ง DB ต่ออายุแต่ cookie ยังหมดใน 30 นาที
  // Better Auth กำหนดให้ nextCookies เป็น plugin ตัวสุดท้ายเสมอ
  plugins: [nextCookies()],
  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      isActive: { type: "boolean", required: false },
      lastLoginAt: { type: "date", required: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // ทุกบัญชีใหม่เริ่มต้นเป็น inactive เสมอ — บังคับฝั่ง server, client override ไม่ได้
          // เปิดใช้งานได้ทางเดียว: ADMIN อนุมัติคำขอ (RegistrationRequest)
          // หรือ script dev ที่ activate ให้ explicit หลังสร้าง (scripts/create-dev-user.ts)
          return { data: { ...user, isActive: false } };
        },
      },
    },
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
