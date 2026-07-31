/**
 * รัน Data Migration ย้ายบทบาทเดิมเข้า OFFICER (Owner Decision 2026-07-31 #R6-D)
 *
 *   COORDINATOR → OFFICER
 *   VERIFIER    → OFFICER + hasGlobalCommunityScope = true
 *
 * ขั้นตอนที่แนะนำในทุก environment:
 *   1) สำรองฐานข้อมูลก่อน (migration นี้เป็น forward-only — ดู docs/16 §6.7 #R6-D)
 *   2) ดูผลก่อน:  node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts --dry-run
 *   3) รันจริง:   node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts
 *   4) ยืนยัน:    node --env-file=.env --import tsx scripts/audit-legacy-roles.ts
 *
 * รันซ้ำได้อย่างปลอดภัย (idempotent) — ครั้งที่สองจะรายงานว่าไม่มีอะไรให้ย้าย
 * **ห้ามพิมพ์ PII** — รายงานเป็นจำนวนเท่านั้น
 */
import { PrismaClient } from "@prisma/client";
import { migrateLegacyRoles, verifyMigration } from "../lib/admin/migrate-legacy-roles";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const result = await migrateLegacyRoles(prisma, { dryRun });
  console.log(dryRun ? "— DRY RUN (ไม่เขียนข้อมูล) —" : "— รันจริง —");
  console.log(JSON.stringify(result, null, 2));

  if (result.noop) {
    console.log("\n✓ ไม่มีบทบาทเดิมที่ต้องย้าย — ฐานข้อมูลนี้ผ่าน migration แล้ว");
    return;
  }
  if (dryRun) {
    console.log("\nรันคำสั่งเดิมโดยไม่ใส่ --dry-run เพื่อเขียนข้อมูลจริง");
    return;
  }

  const check = await verifyMigration(prisma);
  console.log("\nตรวจหลังย้าย:", JSON.stringify(check));
  if (!check.ok) {
    console.error("! ยังเหลือบทบาทเดิมที่ใช้งานอยู่ — ตรวจสอบก่อนถือว่าเสร็จ");
    process.exitCode = 1;
  } else {
    console.log("✓ ไม่เหลือบทบาทเดิมที่ใช้งานอยู่");
  }
}

void main().finally(() => prisma.$disconnect());
