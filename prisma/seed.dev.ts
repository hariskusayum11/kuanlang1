// =============================================================================
// SKL-FRIS: Development Seed — ข้อมูลทดสอบเท่านั้น
// ⚠️ ห้ามรันใน Production — ข้อมูลในไฟล์นี้ "ยังไม่ยืนยัน" (UNVERIFIED) / DRAFT
// -----------------------------------------------------------------------------
//   - เลขหมู่: ตัวอย่างเพื่อทดสอบเท่านั้น (ยังไม่ได้รับการยืนยัน — R2 คำตัดสิน)
//   - Risk Weight: DRAFT/UNAPPROVED — ยังไม่รับรอง ห้ามใช้เป็น Active Production Formula
//   - ห้ามใช้ข้อมูลประชาชนจริง (CLAUDE.md) — ทุกอย่างในไฟล์นี้เป็นข้อมูลสังเคราะห์
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("❌ ห้ามรัน Development Seed ใน Production");
  }
  console.log("🧪 เริ่ม Development Seed (ข้อมูลทดสอบ — UNVERIFIED/DRAFT)...");

  // =========================================================================
  // 1. เลขหมู่ตัวอย่าง (UNVERIFIED) — เพื่อทดสอบเท่านั้น
  //    ⚠️ ยังไม่ได้รับการยืนยันจำนวนหมู่จริง (Q-24) — Household.mooId รองรับ NULL
  // =========================================================================
  const khuanLang = await prisma.tambon.findUnique({ where: { code: "901102" } });
  const hatyaiTambon = await prisma.tambon.findUnique({ where: { code: "901101" } });

  if (khuanLang && hatyaiTambon) {
    for (const { tambonId, moos } of [
      { tambonId: khuanLang.id, moos: [1, 2, 3] }, // ตัวอย่างทดสอบเท่านั้น
      { tambonId: hatyaiTambon.id, moos: [1, 2] },
    ]) {
      for (const num of moos) {
        await prisma.moo.upsert({
          where: { tambonId_number: { tambonId, number: num } },
          update: {},
          create: { tambonId, number: num },
        });
      }
    }
    console.log("   - หมู่ตัวอย่าง (UNVERIFIED) สำหรับทดสอบ");
  }

  // =========================================================================
  // 2. Risk Weight — DRAFT/UNAPPROVED
  //    ⚠️ น้ำหนักรวม 115 ยังไม่มีที่มา/ไม่รับรอง (Q-29) — ห้ามใช้ตัดสินความเสี่ยงจริง
  //    ⚠️ ยังไม่มีสูตร Risk Final (WAITING_FOR_BUSINESS_RULE)
  // =========================================================================
  const riskWeights = [
    { factorCode: "FLOOR_LEVEL", factorNameTh: "ระดับพื้นเทียบถนน", weight: 20 },
    { factorCode: "HAS_FLOODED", factorNameTh: "ประวัติน้ำท่วม", weight: 15 },
    { factorCode: "FLOOD_DEPTH", factorNameTh: "ระดับน้ำสูงสุด", weight: 15 },
    { factorCode: "FLOOD_DURATION", factorNameTh: "ระยะเวลาน้ำท่วม", weight: 5 },
    { factorCode: "HAS_P1", factorNameTh: "มีกลุ่มเปราะบาง P1", weight: 20 },
    { factorCode: "HAS_P2", factorNameTh: "มีกลุ่มเปราะบาง P2", weight: 10 },
    { factorCode: "NO_VEHICLE", factorNameTh: "ไม่มีพาหนะอพยพ", weight: 8 },
    { factorCode: "NO_SURVIVAL_KIT", factorNameTh: "ไม่มีถุงยังชีพ", weight: 4 },
    { factorCode: "NO_RESOURCES", factorNameTh: "ไม่มีทรัพยากรรับมือ", weight: 3 },
    { factorCode: "UNKNOWN_EVAC_SITE", factorNameTh: "ไม่รู้จุดอพยพ", weight: 5 },
    { factorCode: "NO_DIGITAL_CHANNEL", factorNameTh: "ไม่มีช่องทางรับข่าวดิจิทัล", weight: 4 },
    { factorCode: "FAR_FROM_EVAC", factorNameTh: "ระยะห่างจุดอพยพ >1 กม.", weight: 6 },
  ];
  for (const rw of riskWeights) {
    await prisma.riskWeightConfig.upsert({
      where: { factorCode: rw.factorCode },
      update: { description: "DRAFT/UNAPPROVED — ยังไม่รับรอง ห้ามใช้เป็น Active Production Formula" },
      create: {
        factorCode: rw.factorCode,
        factorNameTh: rw.factorNameTh,
        weight: rw.weight,
        maxScore: rw.weight,
        description: "DRAFT/UNAPPROVED — ยังไม่รับรอง ห้ามใช้เป็น Active Production Formula",
      },
    });
  }
  console.log("   - Risk Weight 12 ปัจจัย = DRAFT/UNAPPROVED (ห้าม Active)");

  console.log("✅ Development Seed เสร็จสิ้น (ข้อมูลทดสอบเท่านั้น)");
}

main()
  .catch((e) => {
    console.error("❌ Dev Seed ผิดพลาด:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
