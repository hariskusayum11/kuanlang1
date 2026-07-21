import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";

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
      },
    },
  },
});
