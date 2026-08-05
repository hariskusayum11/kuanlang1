/**
 * Bootstrap Admin คนแรกสำหรับ Production/Test deploy (idempotent — รันซ้ำได้)
 *
 * ต่างจาก scripts/create-dev-user.ts ที่ล็อกเฉพาะ localhost + @test.invalid (dev เท่านั้น)
 * สคริปต์นี้ตั้งใจให้รันบน DB จริงเพื่อสร้างผู้ดูแลระบบคนแรก — ที่จะไปอนุมัติคำขอสมัครคนอื่น
 *
 * ต้องมี env: ADMIN_EMAIL, ADMIN_PASSWORD (>= 12 ตัว), ADMIN_NAME
 * รันในคอนเทนเนอร์:  docker compose -f docker-compose.prod.yml exec app npm run admin:create
 * (env มาจาก .env.production ที่ส่งให้ compose อยู่แล้ว)
 */
import { UserRoleEnum } from "@prisma/client";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "").trim() || "ผู้ดูแลระบบ";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL ไม่ถูกต้อง — ตั้งค่าใน .env.production ก่อน");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD ต้องยาวอย่างน้อย 12 ตัวอักษร");
  }

  // มีอยู่แล้ว → ไม่สร้าง user ซ้ำ เพียงยืนยันว่า active + มี role ADMIN
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // ให้ Better Auth hash password เอง (ระบบไม่เคยเก็บ/เห็น plaintext)
    await auth.api.signUpEmail({ body: { email, password, name } });
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("สร้างบัญชีไม่สำเร็จ — ไม่พบ user หลัง signUp");
    console.log(`[create-admin] สร้างบัญชี ${email} แล้ว`);
  } else {
    console.log(`[create-admin] บัญชี ${email} มีอยู่แล้ว — ข้ามการสร้าง`);
  }

  // ทุกบัญชีใหม่เกิดมา isActive=false (user.create.before hook) — admin คนแรกต้อง activate ตรงนี้
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: UserRoleEnum.ADMIN } },
    update: { isActive: true },
    create: {
      userId: user.id,
      role: UserRoleEnum.ADMIN,
      isActive: true,
      // bootstrap: ไม่มีผู้มอบสิทธิ์อื่น — บันทึกว่ามอบให้ตัวเอง
      assignedBy: user.id,
    },
  });

  // ยืนยันว่ามี credential account (login ด้วยอีเมล/รหัสผ่านได้จริง)
  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!credential) {
    throw new Error(
      "ไม่พบ credential account — บัญชีอาจถูกสร้างด้วยวิธีอื่น ตรวจสอบก่อนใช้งาน",
    );
  }

  console.log(`[create-admin] เสร็จสิ้น: ${email} เป็น ADMIN + active (password ไม่แสดง)`);
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
