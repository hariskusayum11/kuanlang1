/**
 * สร้าง Synthetic PaperBatch + PaperSheet สำหรับทดลอง Entry Workflow (idempotent)
 * ใช้เฉพาะ local development เท่านั้น — ห้ามใช้กับ Production
 * ไม่ใช่ Business Seed — เป็นข้อมูลทดสอบสังเคราะห์ล้วน (รหัสขึ้นต้น BATCH-DEV / SHEET-DEV)
 *
 * รัน: npm run dev:create-batch
 * env: DEV_AUTH_EMAIL (ผู้รับปึก — ต้องมีอยู่แล้ว), DEV_BATCH_COMMUNITY (รหัสชุมชน เช่น TK01),
 *      DEV_BATCH_SHEETS (จำนวนใบ 1-50, default 5)
 */
import { BatchStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

const LOCAL_HOST_RE = /localhost|127\.0\.0\.1/;

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const email = process.env.DEV_AUTH_EMAIL ?? "";
  const communityCode = process.env.DEV_BATCH_COMMUNITY ?? "TK01";
  const sheetCount = Number(process.env.DEV_BATCH_SHEETS ?? "5");

  if (!LOCAL_HOST_RE.test(dbUrl)) {
    throw new Error("DATABASE_URL ไม่ใช่ localhost — ห้ามรัน script นี้กับฐานข้อมูลอื่น");
  }
  if (!email.endsWith("@test.invalid")) {
    throw new Error("DEV_AUTH_EMAIL ต้องใช้ domain @test.invalid (บัญชี synthetic เท่านั้น)");
  }
  if (!Number.isInteger(sheetCount) || sheetCount < 1 || sheetCount > 50) {
    throw new Error("DEV_BATCH_SHEETS ต้องเป็นจำนวนเต็ม 1-50");
  }

  const receiver = await prisma.user.findUnique({ where: { email } });
  if (!receiver) {
    throw new Error(`ไม่พบผู้ใช้ ${email} — รัน npm run auth:create-dev-user ก่อน`);
  }
  const community = await prisma.community.findUnique({
    where: { code: communityCode },
  });
  if (!community) {
    throw new Error(`ไม่พบชุมชนรหัส "${communityCode}" — ตรวจ DEV_BATCH_COMMUNITY`);
  }

  const batchCode = `BATCH-DEV-${communityCode}-001`;
  const batch = await prisma.paperBatch.upsert({
    where: { code: batchCode },
    update: { status: BatchStatus.READY_FOR_ENTRY },
    create: {
      code: batchCode,
      communityId: community.id,
      expectedCount: sheetCount,
      receivedAt: new Date(),
      receivedById: receiver.id,
      status: BatchStatus.READY_FOR_ENTRY,
      note: "Synthetic dev batch — ข้อมูลทดสอบเท่านั้น",
    },
  });

  for (let i = 1; i <= sheetCount; i += 1) {
    const sheetNo = `SHEET-DEV-${communityCode}-001-${String(i).padStart(3, "0")}`;
    await prisma.paperSheet.upsert({
      where: { sheetNo },
      update: {},
      create: { batchId: batch.id, sheetNo, sequence: i },
    });
  }

  console.log(
    `[create-dev-batch] ${batchCode} (${community.nameTh}) พร้อมใบทดสอบ ${sheetCount} ใบ — READY_FOR_ENTRY`,
  );
  console.log("[create-dev-batch] idempotent — รันซ้ำได้ ไม่สร้างซ้ำ");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
