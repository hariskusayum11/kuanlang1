/**
 * กู้ฉุกเฉิน — ตั้งรหัสผ่านชั่วคราวให้บัญชีใด ๆ จากบรรทัดคำสั่งบนเซิร์ฟเวอร์
 *
 * ใช้เมื่อ "ไม่มีใครเข้าหน้าจัดการผู้ใช้ได้แล้ว" เช่น ADMIN คนเดียวของระบบลืมรหัสผ่าน
 * ในสถานการณ์ปกติให้ใช้ปุ่ม "ตั้งรหัสใหม่" ในหน้า /admin/users แทน เพราะผูกกับ
 * ผู้กระทำที่ล็อกอินอยู่จริงและตรวจสิทธิ์ตามปกติ
 *
 * รันในคอนเทนเนอร์:
 *   docker compose exec app npm run password:reset -- someone@example.com
 *
 * ความปลอดภัย: ผู้ที่รันได้ต้องเข้าถึงเซิร์ฟเวอร์ได้อยู่แล้ว (จึงเข้าถึงฐานข้อมูลได้ด้วย)
 * สคริปต์นี้ไม่ได้เพิ่มช่องโหว่ใหม่ แต่ต้องบันทึก Audit Log ไว้เสมอว่าเกิดขึ้นเมื่อไร
 */
import { randomBytes } from "node:crypto";
import { AuditAction } from "@prisma/client";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit/log";
import {
  TEMP_PASSWORD_RANDOM_BYTES,
  buildTempPassword,
} from "../domain/admin/temp-password";

async function main() {
  const email = (process.argv[2] ?? process.env.RESET_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      "ระบุอีเมลของบัญชีที่ต้องการตั้งรหัสใหม่\n" +
        "  ตัวอย่าง: npm run password:reset -- someone@example.com",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });
  if (!user) throw new Error("ไม่พบบัญชีที่ใช้อีเมลนี้");

  const tempPassword = buildTempPassword(randomBytes(TEMP_PASSWORD_RANDOM_BYTES));

  // ตั้งธงก่อนเปลี่ยนรหัสจริง — ลำดับเดียวกับ lib/admin/user-password.ts
  await prisma.user.update({
    where: { id: user.id },
    data: { mustChangePassword: true },
  });

  const authCtx = await auth.$context;
  const hashed = await authCtx.password.hash(tempPassword);
  const accounts = await authCtx.internalAdapter.findAccounts(user.id);
  if (accounts.some((a) => a.providerId === "credential")) {
    await authCtx.internalAdapter.updatePassword(user.id, hashed);
  } else {
    await authCtx.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hashed,
    });
  }
  await authCtx.internalAdapter.deleteUserSessions(user.id);

  await writeAuditLog({
    userId: user.id,
    action: AuditAction.UPDATE,
    entityType: "UserCredential",
    entityId: user.id,
    // ไม่บันทึกค่ารหัสผ่าน — บันทึกเฉพาะว่าเกิดอะไรขึ้นและมาจากช่องทางใด
    changes: { field: "password", by: "cli-temp-password" },
    reason: "cli-temp-password",
  });

  // จงใจพิมพ์รหัสออกหน้าจอ — เป็นช่องทางเดียวที่ผู้ดูแลจะได้รหัสนี้
  // (ไม่ถูกเก็บลงฐานข้อมูลและไม่อยู่ใน log ของแอป)
  console.log("");
  console.log("  ตั้งรหัสผ่านชั่วคราวสำเร็จ");
  console.log(`  รหัสชั่วคราว : ${tempPassword}`);
  console.log("");
  console.log("  ผู้ใช้จะถูกบังคับให้ตั้งรหัสใหม่ทันทีที่เข้าสู่ระบบ");
  console.log("  เซสชันเดิมทั้งหมดถูกตัดออกแล้ว");
  if (!user.isActive) {
    console.log("  หมายเหตุ: บัญชีนี้ยังไม่ active — ต้องเปิดใช้งานก่อนจึงจะล็อกอินได้");
  }
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
