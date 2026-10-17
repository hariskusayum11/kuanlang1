/**
 * ตั้ง/ถอด "บัญชีคุ้มครอง" จากบรรทัดคำสั่งบนเซิร์ฟเวอร์ (Owner Decision 2026-10-17)
 *
 * ทำไมต้องทำจากนอกระบบ: ถ้าตั้งจากหน้าเว็บได้ ADMIN คนใดก็แต่งตั้งตัวเองเป็นบัญชี
 * คุ้มครองแล้วเดินผ่านกฎคุ้มครองทั้งหมดได้ในคลิกเดียว — ผู้ที่ตั้งบัญชีคุ้มครอง
 * "คนแรก" จึงต้องเป็นผู้ที่เข้าถึงเซิร์ฟเวอร์ได้เท่านั้น
 * หลังจากมีบัญชีคุ้มครองแล้ว บัญชีนั้นตั้งให้คนอื่นผ่านหน้า /admin/users ได้
 *
 * รันในคอนเทนเนอร์:
 *   docker compose exec app npm run account:protect -- someone@example.com
 *   docker compose exec app npm run account:protect -- someone@example.com --off
 *
 * idempotent — รันซ้ำได้ ไม่เปลี่ยนอะไรถ้าค่าตรงอยู่แล้ว
 */
import { AuditAction, UserRoleEnum } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit/log";

async function main() {
  const args = process.argv.slice(2);
  const off = args.includes("--off");
  const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
  const next = !off;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      "ระบุอีเมลของบัญชีที่ต้องการตั้งเป็นบัญชีคุ้มครอง\n" +
        "  ตั้ง:  npm run account:protect -- someone@example.com\n" +
        "  ถอด:  npm run account:protect -- someone@example.com --off",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      isActive: true,
      isProtectedAccount: true,
      userRoles: { where: { isActive: true }, select: { role: true } },
    },
  });
  if (!user) throw new Error(`ไม่พบบัญชีที่ใช้อีเมลนี้: ${email}`);

  // ถอดคนสุดท้ายไม่ได้ — เหลือศูนย์เมื่อใดจะตั้งกลับจากในระบบไม่ได้อีก
  // (ยกเว้นมารันสคริปต์นี้ ซึ่งก็คือสิ่งที่กำลังทำอยู่ จึงอนุญาตแต่เตือน)
  if (!next && user.isProtectedAccount) {
    const others = await prisma.user.count({
      where: { isProtectedAccount: true, id: { not: user.id } },
    });
    if (others === 0) {
      console.warn("  ⚠️  นี่คือบัญชีคุ้มครองบัญชีสุดท้าย — ถอดแล้วจะไม่เหลือบัญชีคุ้มครองในระบบ");
    }
  }

  if (user.isProtectedAccount === next) {
    console.log(
      `[account:protect] ${email} เป็น ${next ? "บัญชีคุ้มครอง" : "บัญชีทั่วไป"} อยู่แล้ว — ไม่เปลี่ยนอะไร`,
    );
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { isProtectedAccount: next },
    });
    await writeAuditLog({
      userId: user.id,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: user.id,
      changes: { field: "isProtectedAccount", before: !next, after: next },
      // แยกจาก protected-account-granted ของหน้าเว็บ เพื่อให้ตรวจย้อนหลังรู้ว่ามาจาก CLI
      reason: next ? "cli-protected-account-granted" : "cli-protected-account-revoked",
    });
    console.log(
      `[account:protect] ตั้ง ${email} เป็น ${next ? "บัญชีคุ้มครอง" : "บัญชีทั่วไป"} แล้ว`,
    );
  }

  if (next) {
    // บัญชีคุ้มครองที่ไม่มี ADMIN จะกลายเป็น "ใครแตะไม่ได้ แต่ตัวเองก็ทำอะไรไม่ได้"
    // และจะตั้งบัญชีคุ้มครองให้คนอื่นไม่ได้ด้วย เพราะ setProtectedAccount ต้องมี user.manage
    const hasAdmin = user.userRoles.some((r) => r.role === UserRoleEnum.ADMIN);
    if (!hasAdmin) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: UserRoleEnum.ADMIN } },
        update: { isActive: true },
        create: {
          userId: user.id,
          role: UserRoleEnum.ADMIN,
          isActive: true,
          // bootstrap จาก CLI — ไม่มีผู้มอบสิทธิ์อื่น บันทึกว่ามอบให้ตัวเอง (แบบเดียวกับ create-admin)
          assignedBy: user.id,
        },
      });
      await writeAuditLog({
        userId: user.id,
        action: AuditAction.UPDATE,
        entityType: "UserRole",
        entityId: user.id,
        changes: { added: UserRoleEnum.ADMIN },
        reason: "cli-protected-account-needs-admin",
      });
      console.log("[account:protect] บัญชีนี้ยังไม่มีบทบาท ADMIN — มอบให้แล้ว");
    }
    if (!user.isActive) {
      console.warn("  ⚠️  บัญชีนี้ยังไม่ active — ต้องเปิดใช้งานก่อนจึงจะเข้าสู่ระบบได้");
    }
  }

  const protectedUsers = await prisma.user.findMany({
    where: { isProtectedAccount: true },
    select: { email: true },
    orderBy: { email: "asc" },
  });
  console.log("");
  console.log(`  บัญชีคุ้มครองในระบบตอนนี้ (${protectedUsers.length}):`);
  for (const p of protectedUsers) console.log(`    - ${p.email}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
