/**
 * ผูก Role + Community Scope ให้ Development Test User (idempotent)
 * ใช้เฉพาะ local development เท่านั้น — ห้ามใช้กับ Production
 *
 * รัน: npm run auth:assign-dev-access
 * ต้องตั้ง DEV_AUTH_EMAIL / DEV_AUTH_ROLE ใน .env (gitignored) ก่อน
 * DEV_AUTH_COMMUNITIES = รหัสชุมชนคั่นด้วย comma (เว้นว่างได้สำหรับ global role)
 */
import { UserRoleEnum } from "@prisma/client";
import { prisma } from "../lib/prisma";

const LOCAL_HOST_RE = /localhost|127\.0\.0\.1/;

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const email = process.env.DEV_AUTH_EMAIL ?? "";
  const roleInput = process.env.DEV_AUTH_ROLE ?? "";
  const communitiesInput = process.env.DEV_AUTH_COMMUNITIES ?? "";

  // Safety gates — local dev เท่านั้น + synthetic เท่านั้น
  if (!LOCAL_HOST_RE.test(dbUrl)) {
    throw new Error("DATABASE_URL ไม่ใช่ localhost — ห้ามรัน script นี้กับฐานข้อมูลอื่น");
  }
  if (!email.endsWith("@test.invalid")) {
    throw new Error("DEV_AUTH_EMAIL ต้องใช้ domain @test.invalid (บัญชี synthetic เท่านั้น)");
  }

  const validRoles = Object.values(UserRoleEnum) as string[];
  if (!validRoles.includes(roleInput)) {
    throw new Error(
      `DEV_AUTH_ROLE ไม่ถูกต้อง — ต้องเป็นหนึ่งใน: ${validRoles.join(", ")}`,
    );
  }
  const role = roleInput as UserRoleEnum;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `ไม่พบผู้ใช้ ${email} — รัน npm run auth:create-dev-user ก่อน (script นี้ไม่สร้าง user)`,
    );
  }

  const userRole = await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role } },
    update: { isActive: true },
    create: { userId: user.id, role, isActive: true },
  });
  console.log(`[assign-dev-access] role ${role} → active (id: ${userRole.id})`);

  const codes = communitiesInput
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  for (const code of codes) {
    const community = await prisma.community.findUnique({ where: { code } });
    if (!community) {
      throw new Error(`ไม่พบชุมชนรหัส "${code}" — ตรวจ DEV_AUTH_COMMUNITIES`);
    }
    await prisma.userCommunityScope.upsert({
      where: {
        userId_communityId: { userId: user.id, communityId: community.id },
      },
      update: {},
      create: { userId: user.id, communityId: community.id },
    });
    console.log(`[assign-dev-access] community scope: ${code} (${community.nameTh})`);
  }

  if (codes.length === 0) {
    console.log("[assign-dev-access] ไม่ได้ระบุ DEV_AUTH_COMMUNITIES — ไม่ผูก community scope");
  }

  console.log("[assign-dev-access] เสร็จสิ้น (idempotent — รันซ้ำได้)");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
