import { PrismaClient } from "@prisma/client";

// Prisma Client singleton — ใช้ฝั่ง Server เท่านั้น (ห้าม import จาก Client Component)
// กัน hot-reload ใน dev สร้าง connection ใหม่ซ้ำ
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
