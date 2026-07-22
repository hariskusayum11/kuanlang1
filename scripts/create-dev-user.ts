/**
 * สร้าง Synthetic Development Test User ผ่าน Better Auth server API (ครั้งเดียว, idempotent)
 * ใช้เฉพาะ local development เท่านั้น — ห้ามใช้กับ Production
 *
 * รัน: npm run auth:create-dev-user
 * ต้องตั้ง DEV_AUTH_EMAIL / DEV_AUTH_PASSWORD ใน .env (gitignored) ก่อน
 */
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

const LOCAL_HOST_RE = /localhost|127\.0\.0\.1/;

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const authUrl = process.env.BETTER_AUTH_URL ?? "";
  const email = process.env.DEV_AUTH_EMAIL ?? "";
  const password = process.env.DEV_AUTH_PASSWORD ?? "";

  // Safety gates — local dev เท่านั้น + synthetic เท่านั้น
  if (!LOCAL_HOST_RE.test(dbUrl)) {
    throw new Error("DATABASE_URL ไม่ใช่ localhost — ห้ามรัน script นี้กับฐานข้อมูลอื่น");
  }
  if (!LOCAL_HOST_RE.test(authUrl)) {
    throw new Error("BETTER_AUTH_URL ไม่ใช่ localhost — ห้ามรัน script นี้นอก local dev");
  }
  if (!email.endsWith("@test.invalid")) {
    throw new Error("DEV_AUTH_EMAIL ต้องใช้ domain @test.invalid (บัญชี synthetic เท่านั้น)");
  }
  if (password.length < 12) {
    throw new Error("DEV_AUTH_PASSWORD ต้องยาวอย่างน้อย 12 ตัวอักษร");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const credential = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
    });
    console.log(
      `[create-dev-user] บัญชี ${email} มีอยู่แล้ว (credential account: ${credential ? "มี" : "ไม่มี"}) — ไม่สร้างซ้ำ`,
    );
    if (!credential) process.exitCode = 1;
    return;
  }

  // ให้ Better Auth hash password เอง (ห้าม hash เอง)
  await auth.api.signUpEmail({
    body: { email, password, name: "Development Test User (dev-admin)" },
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("[create-dev-user] สร้างไม่สำเร็จ — ไม่พบ user หลัง signUp");

  // ทุกบัญชีใหม่เกิดมาเป็น isActive=false (user.create.before hook)
  // dev user ต้อง activate explicit — เป็น script local dev ที่ผ่าน safety gates ข้างบนแล้ว
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!credential) {
    throw new Error("[create-dev-user] ไม่พบ Account provider 'credential' หลัง signUp");
  }

  console.log(`[create-dev-user] สร้าง Development Test User สำเร็จ: ${email} (password ไม่แสดง)`);
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
