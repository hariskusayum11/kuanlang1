import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Minimal config เพื่อ Gate เปรียบเทียบ schema เท่านั้น (ไม่ใช้ admin plugin เป็น RBAC หลัก)
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      isActive: { type: "boolean", required: false },
      lastLoginAt: { type: "date", required: false },
    },
  },
});
