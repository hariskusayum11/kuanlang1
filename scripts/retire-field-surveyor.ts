/**
 * รัน Data Migration เลิกใช้บทบาท FIELD_SURVEYOR (Owner Decision 2026-07-31 #R6-E)
 *
 *   ปิด Active FIELD_SURVEYOR UserRole (ไม่ลบ — เก็บเป็นประวัติ)
 *   คำขอสมัคร PENDING → REJECTED พร้อมเหตุผลและ Audit Log
 *   **ไม่เพิ่มบทบาททดแทน · ไม่แตะ User.isActive · ไม่แตะคำขอที่ APPROVED**
 *
 * ขั้นตอนที่ต้องทำในทุก environment (ดู docs/16 §6.7 #R6-E Runbook):
 *   1) สำรองฐานข้อมูล
 *   2) node --env-file=.env --import tsx scripts/audit-field-surveyor.ts
 *   3) node --env-file=.env --import tsx scripts/retire-field-surveyor.ts --dry-run
 *   4) node --env-file=.env --import tsx scripts/retire-field-surveyor.ts
 *   5) node --env-file=.env --import tsx scripts/audit-field-surveyor.ts
 *
 * รันซ้ำได้อย่างปลอดภัย (idempotent) · **ห้ามพิมพ์ PII** — รายงานเป็นจำนวนเท่านั้น
 * คืน exit code 1 เมื่อ postcondition หลังรันไม่ผ่าน
 */
import { PrismaClient } from "@prisma/client";
import {
  retireFieldSurveyor,
  verifyFieldSurveyorRetired,
} from "../lib/admin/retire-field-surveyor";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const result = await retireFieldSurveyor(prisma, { dryRun });
  console.log(dryRun ? "— DRY RUN (ไม่เขียนข้อมูล) —" : "— รันจริง —");
  console.log(JSON.stringify(result, null, 2));

  if (result.approvedRequestsUntouched > 0) {
    console.log(
      `\nหมายเหตุ: มีคำขอที่เคย APPROVED อยู่ ${result.approvedRequestsUntouched} รายการ — ไม่ถูกแก้โดยเจตนา` +
        "\n(การเขียนทับเป็น REJECTED คือการทำลายประวัติว่าคำขอนั้นถูกอนุมัติจริงในเวลานั้น" +
        " การเลิกใช้บทบาทแสดงผ่านการปิด UserRole แทน)",
    );
  }

  if (dryRun) {
    console.log("\nรันคำสั่งเดิมโดยไม่ใส่ --dry-run เพื่อเขียนข้อมูลจริง");
    return;
  }

  // ตรวจ postcondition เสมอ แม้ผลจะเป็น noop — เพื่อจับกรณีที่ฐานข้อมูลผิดคาด
  const check = await verifyFieldSurveyorRetired(prisma);
  console.log("\nตรวจหลังรัน:", JSON.stringify(check));
  if (!check.ok) {
    console.error(
      "! Postcondition ไม่ผ่าน — ยังเหลือบทบาทที่ใช้งานอยู่หรือคำขอค้าง ห้ามถือว่าเสร็จ",
    );
    process.exitCode = 1;
    return;
  }
  console.log("✓ Active FIELD_SURVEYOR = 0 และไม่มีคำขอ PENDING ค้าง");
}

void main().finally(() => prisma.$disconnect());
