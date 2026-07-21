// =============================================================================
// SKL-FRIS: Production Seed — Master Data (ข้อมูลหลัก)
// ข้อมูลจากแบบสอบถามกระดาษ — ทุกค่าต้องตรงกับตัวเลือกในกระดาษ
// -----------------------------------------------------------------------------
// v3.1 (รอบ Implementation):
//   - รหัสพื้นที่: ตรวจสอบแล้ว (R2 คำตัดสิน) — สงขลา 90 / หาดใหญ่(อ.) 9011
//     ตำบลหาดใหญ่ 901101 / ตำบลควนลัง 901102
//   - ชุมชน: TK01/PM01/KS01/PW01/NK01 — ไม่ผูกรหัสตำบล (R2-#2)
//   - Community–Tambon = M:N ผ่าน CommunityTambon (ควนสันติ 2 ตำบล, isPrimary=false ทั้งคู่)
//   - totalHouseholds = null (ยังไม่ทราบ), targetCoveragePercent = 60
//   - ลบ Loop หมู่ตัวอย่างออกจาก Production (ย้ายไป seed.dev.ts)
//   - Risk Weight = DRAFT/UNAPPROVED (ย้ายไป seed.dev.ts, ห้ามเป็น Active Production)
//   - Idempotent + รองรับเปลี่ยนชื่อผ่าน update
// =============================================================================

import { PrismaClient, TriageLevel } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 เริ่ม Seed ข้อมูลหลัก (Production)...");

  // =========================================================================
  // 1. จังหวัด → อำเภอ → ตำบล  (รหัสตรวจสอบแล้ว — R2 คำตัดสินรหัสพื้นที่)
  //    ⚠️ หมู่บ้าน/เลขหมู่ยังไม่ยืนยัน → ไม่ Seed ที่นี่ (ดู seed.dev.ts)
  // =========================================================================
  const songkhla = await prisma.province.upsert({
    where: { code: "90" },
    update: { nameTh: "สงขลา", nameEn: "Songkhla" },
    create: { code: "90", nameTh: "สงขลา", nameEn: "Songkhla" },
  });

  const hatyai = await prisma.district.upsert({
    where: { code: "9011" }, // อำเภอหาดใหญ่ (แก้จาก 9001 ที่เป็นเมืองสงขลา)
    update: { nameTh: "หาดใหญ่", nameEn: "Hat Yai" },
    create: { code: "9011", nameTh: "หาดใหญ่", nameEn: "Hat Yai", provinceId: songkhla.id },
  });

  const khuanLang = await prisma.tambon.upsert({
    where: { code: "901102" }, // ตำบลควนลัง (แก้จาก 900105)
    update: { nameTh: "ควนลัง", nameEn: "Khuan Lang" },
    create: { code: "901102", nameTh: "ควนลัง", nameEn: "Khuan Lang", districtId: hatyai.id },
  });

  const hatyaiTambon = await prisma.tambon.upsert({
    where: { code: "901101" }, // ตำบลหาดใหญ่ (แก้จาก 900101)
    update: { nameTh: "หาดใหญ่", nameEn: "Hat Yai" },
    create: { code: "901101", nameTh: "หาดใหญ่", nameEn: "Hat Yai", districtId: hatyai.id },
  });

  // =========================================================================
  // 2. ลบชุมชนตัวอย่างเดิม (KL01/KL02/KL03/HY01/HY02) — upsert ไม่ลบให้
  // =========================================================================
  await prisma.communityTambon.deleteMany({
    where: { community: { code: { in: ["KL01", "KL02", "KL03", "HY01", "HY02"] } } },
  });
  await prisma.community.deleteMany({
    where: { code: { in: ["KL01", "KL02", "KL03", "HY01", "HY02"] } },
  });

  // =========================================================================
  // 3. ชุมชน 5 แห่ง (รหัสไม่ผูกตำบล) + CommunityTambon (M:N)
  // =========================================================================
  const communities: {
    code: string;
    nameTh: string;
    tambons: { tambonId: string; isPrimary: boolean }[];
  }[] = [
    { code: "TK01", nameTh: "ชุมชนท่าเคียน", tambons: [{ tambonId: khuanLang.id, isPrimary: true }] },
    { code: "PM01", nameTh: "ชุมชนประสานมิตร", tambons: [{ tambonId: khuanLang.id, isPrimary: true }] },
    {
      code: "KS01",
      nameTh: "ชุมชนควนสันติ",
      // ควนสันติครอบคลุม 2 ตำบล — ยังไม่มีตำบลหลักที่ยืนยัน → isPrimary=false ทั้งคู่ (คำตัดสิน #8)
      tambons: [
        { tambonId: khuanLang.id, isPrimary: false },
        { tambonId: hatyaiTambon.id, isPrimary: false },
      ],
    },
    { code: "PW01", nameTh: "ชุมชนปลักหว้า", tambons: [{ tambonId: khuanLang.id, isPrimary: true }] },
    { code: "NK01", nameTh: "ชุมชนหน้าควน", tambons: [{ tambonId: khuanLang.id, isPrimary: true }] },
  ];

  for (const c of communities) {
    const community = await prisma.community.upsert({
      where: { code: c.code },
      update: { nameTh: c.nameTh }, // รองรับเปลี่ยนชื่อ (Idempotent)
      create: {
        code: c.code,
        nameTh: c.nameTh,
        totalHouseholds: null, // ยังไม่ทราบ — ห้ามใช้ 0
        targetCoveragePercent: 60,
      },
    });

    for (const t of c.tambons) {
      await prisma.communityTambon.upsert({
        where: { communityId_tambonId: { communityId: community.id, tambonId: t.tambonId } },
        update: { isPrimary: t.isPrimary },
        create: { communityId: community.id, tambonId: t.tambonId, isPrimary: t.isPrimary },
      });
    }
  }

  // =========================================================================
  // 4. ประเภทสิ่งปลูกสร้าง (ส่วนที่ 1 ข้อ 1) — 6 ตัวเลือก
  // =========================================================================
  const buildingTypes = [
    { code: "HOUSE", nameTh: "บ้านพักอาศัยทั่วไป", sortOrder: 1 },
    { code: "APARTMENT", nameTh: "อพาร์ทเมนต์ / แมนชั่น / ห้องเช่า", sortOrder: 2 },
    { code: "SCHOOL", nameTh: "โรงเรียน / สถานศึกษา", sortOrder: 3 },
    { code: "RELIGIOUS", nameTh: "วัด / มัสยิด / ศาสนสถาน", sortOrder: 4 },
    { code: "COMMERCIAL", nameTh: "ร้านค้า / บริษัท / โรงงาน", sortOrder: 5 },
    { code: "OTHER", nameTh: "อื่นๆ", sortOrder: 6 },
  ];
  for (const bt of buildingTypes) {
    await prisma.buildingType.upsert({
      where: { code: bt.code },
      update: { nameTh: bt.nameTh, sortOrder: bt.sortOrder },
      create: bt,
    });
  }

  // =========================================================================
  // 5. ประเภทกรรมสิทธิ์ (ส่วนที่ 1 ข้อ 4) — 4 ตัวเลือก
  // =========================================================================
  const ownershipTypes = [
    { code: "OWNED", nameTh: "ของตนเอง (เอกชน)", sortOrder: 1 },
    { code: "RENTED", nameTh: "เช่า / เช่าซื้อ", sortOrder: 2 },
    { code: "PUBLIC", nameTh: "พื้นที่ส่วนรวม / ที่สาธารณะ / ที่ดินของรัฐ", sortOrder: 3 },
    { code: "OTHER", nameTh: "อื่นๆ", sortOrder: 4 },
  ];
  for (const ot of ownershipTypes) {
    await prisma.ownershipType.upsert({
      where: { code: ot.code },
      update: { nameTh: ot.nameTh, sortOrder: ot.sortOrder },
      create: ot,
    });
  }

  // =========================================================================
  // 6. ประเภทความเปราะบาง 9 ประเภท (ส่วนที่ 2)
  //    ⚠️ basePriority ยังไม่รับรอง (ไม่มีในกระดาษ) — ค่าตั้งต้นรอ BR (Q-29/GAP-D01)
  // =========================================================================
  const vulnTypes = [
    { code: "ELDERLY_DEPENDENT", nameTh: "ผู้สูงอายุ 60 ปีขึ้นไป ที่ต้องมีผู้ดูแล", basePriority: TriageLevel.P2, requiresDetail: false, detailLabel: null as string | null, sortOrder: 1 },
    { code: "BEDRIDDEN", nameTh: "ผู้ป่วยติดเตียง / พิการ", basePriority: TriageLevel.P1, requiresDetail: false, detailLabel: null, sortOrder: 2 },
    { code: "CHILD_UNDER_5", nameTh: "เด็กต่ำกว่า 5 ปี", basePriority: TriageLevel.P3, requiresDetail: false, detailLabel: null, sortOrder: 3 },
    // กระดาษไม่ระบุหน่วยอายุครรภ์ — เก็บดิบผ่าน pregnancyRawText/Unit (QM-06); label ไม่ระบุหน่วย
    { code: "PREGNANT", nameTh: "หญิงตั้งครรภ์", basePriority: TriageLevel.P2, requiresDetail: true, detailLabel: "ระบุอายุครรภ์ (ตามที่เขียนบนกระดาษ)", sortOrder: 4 },
    { code: "POSTPARTUM", nameTh: "มารดาหลังคลอด", basePriority: TriageLevel.P2, requiresDetail: true, detailLabel: "ระบุอายุเดือนของเด็ก", sortOrder: 5 },
    { code: "REGULAR_MEDICATION", nameTh: "ต้องกินยาประจำ / ตรงเวลา", basePriority: TriageLevel.P2, requiresDetail: true, detailLabel: "ระบุชื่อยา เช่น ยาลิ่มเลือด, ยาต้าน", sortOrder: 6 },
    { code: "DIALYSIS", nameTh: "ผู้ป่วยโรคไตที่ต้องฟอกไต", basePriority: TriageLevel.P1, requiresDetail: false, detailLabel: null, sortOrder: 7 },
    { code: "PSYCHIATRIC", nameTh: "ผู้ป่วยโรคจิตเวช", basePriority: TriageLevel.P2, requiresDetail: false, detailLabel: null, sortOrder: 8 },
    { code: "OTHER", nameTh: "อื่นๆ", basePriority: TriageLevel.P3, requiresDetail: true, detailLabel: "ระบุ เช่น โรคหัวใจ, ตาบอด", sortOrder: 9 },
  ];
  for (const vt of vulnTypes) {
    await prisma.vulnerabilityType.upsert({
      where: { code: vt.code },
      update: { nameTh: vt.nameTh, detailLabel: vt.detailLabel ?? undefined, sortOrder: vt.sortOrder },
      create: { code: vt.code, nameTh: vt.nameTh, basePriority: vt.basePriority, requiresDetail: vt.requiresDetail, detailLabel: vt.detailLabel ?? undefined, sortOrder: vt.sortOrder },
    });
  }

  // =========================================================================
  // 7. ประเภทความต้องการช่วยเหลือ (ส่วนที่ 2 ข้อ 3) — 6 ประเภท
  // =========================================================================
  const assistanceTypes = [
    { code: "VEHICLE_EVAC", nameTh: "ต้องใช้รถ/เรือช่วยอพยพ", requiresCount: true, requiresDetail: false, sortOrder: 1 },
    { code: "MANPOWER", nameTh: "ต้องการแรงคนช่วยเคลื่อนย้ายอพยพ", requiresCount: true, requiresDetail: false, sortOrder: 2 },
    { code: "MEDICAL_EQUIP", nameTh: "ต้องการเคลื่อนย้ายอุปกรณ์การแพทย์", requiresCount: true, requiresDetail: false, sortOrder: 3 },
    { code: "RESERVE_MEDICINE", nameTh: "ต้องการยาสำรอง", requiresCount: false, requiresDetail: true, sortOrder: 4 },
    { code: "ESSENTIAL_ITEMS", nameTh: "ต้องการของใช้ที่จำเป็น / สิ่งที่เปลี่ยนประจำ", requiresCount: false, requiresDetail: true, sortOrder: 5 },
    { code: "OTHER", nameTh: "อื่นๆ", requiresCount: false, requiresDetail: true, sortOrder: 6 },
  ];
  for (const at of assistanceTypes) {
    await prisma.assistanceNeedType.upsert({
      where: { code: at.code },
      update: { nameTh: at.nameTh, sortOrder: at.sortOrder },
      create: at,
    });
  }

  // =========================================================================
  // 8. ประเภททรัพยากรชุมชน (ส่วนที่ 3 ข้อ 11) — 7 ประเภท
  //    "ไม่มี" ไม่ใช่ประเภททรัพยากร → เก็บที่ Household.hasNoResources (QM-09)
  // =========================================================================
  const resourceTypes = [
    { code: "BOAT", nameTh: "เรือ", icon: "ship", sortOrder: 1 },
    { code: "TOOLS", nameTh: "เครื่องมือช่าง", icon: "wrench", sortOrder: 2 },
    { code: "GENERATOR", nameTh: "เครื่องปั่นไฟ", icon: "zap", sortOrder: 3 },
    { code: "ROPE", nameTh: "เชือก", icon: "link", sortOrder: 4 },
    { code: "LIFE_JACKET", nameTh: "เสื้อชูชีพ", icon: "shield", sortOrder: 5 },
    { code: "WHISTLE", nameTh: "นกหวีด", icon: "volume-2", sortOrder: 6 },
    { code: "OTHER", nameTh: "อื่นๆ", icon: "package", sortOrder: 7 },
  ];
  for (const rt of resourceTypes) {
    await prisma.resourceType.upsert({
      where: { code: rt.code },
      update: { nameTh: rt.nameTh, sortOrder: rt.sortOrder },
      create: rt,
    });
  }

  // =========================================================================
  // 9. ช่องทางเตือนภัย (ส่วนที่ 4 ข้อ 1) — 8 ช่องทาง
  // =========================================================================
  const alertChannels = [
    { code: "LINE", nameTh: "LINE", isDigital: true, sortOrder: 1 },
    { code: "FACEBOOK", nameTh: "Facebook", isDigital: true, sortOrder: 2 },
    { code: "SMS", nameTh: "SMS", isDigital: true, sortOrder: 3 },
    { code: "TV", nameTh: "ทีวี", isDigital: false, sortOrder: 4 },
    { code: "COMMUNITY_LEADER", nameTh: "ผู้นำชุมชน", isDigital: false, sortOrder: 5 },
    { code: "MUNICIPALITY", nameTh: "ประกาศจากเทศบาล", isDigital: false, sortOrder: 6 },
    { code: "FLAG", nameTh: "ธงสี", isDigital: false, sortOrder: 7 },
    { code: "NEIGHBOR", nameTh: "เพื่อนบ้าน", isDigital: false, sortOrder: 8 },
  ];
  for (const ac of alertChannels) {
    await prisma.alertChannel.upsert({
      where: { code: ac.code },
      update: { nameTh: ac.nameTh, sortOrder: ac.sortOrder },
      create: ac,
    });
  }

  // =========================================================================
  // 10. ประเภทอาสาสมัคร (ส่วนที่ 4 ข้อ 4) — 8 ประเภท (ทักษะ)
  //     "ไม่สะดวก" ไม่ใช่ทักษะ → เก็บที่ Household.volunteerNotAvailable (QM-12)
  // =========================================================================
  const volunteerTypes = [
    { code: "EARLY_WARNING", nameTh: "เตือนภัย", skillCategory: "การเตือน", sortOrder: 1 },
    { code: "RESCUE", nameTh: "กู้ภัย", skillCategory: "การกู้ภัย", sortOrder: 2 },
    { code: "KITCHEN", nameTh: "ช่วยครัวชุมชน", skillCategory: "การสนับสนุน", sortOrder: 3 },
    { code: "ELDERLY_CARE", nameTh: "ดูแลผู้สูงอายุ", skillCategory: "การดูแล", sortOrder: 4 },
    { code: "RECOVERY", nameTh: "ฟื้นฟูหลังน้ำลด", skillCategory: "การฟื้นฟู", sortOrder: 5 },
    { code: "MECHANIC", nameTh: "ช่างซ่อมรถ", skillCategory: "ช่าง", sortOrder: 6 },
    { code: "ELECTRICIAN", nameTh: "ช่างไฟ", skillCategory: "ช่าง", sortOrder: 7 },
    { code: "CONSTRUCTION", nameTh: "ช่างก่อสร้าง", skillCategory: "ช่าง", sortOrder: 8 },
  ];
  for (const vt of volunteerTypes) {
    await prisma.volunteerSkillType.upsert({
      where: { code: vt.code },
      update: { nameTh: vt.nameTh, sortOrder: vt.sortOrder },
      create: vt,
    });
  }

  // =========================================================================
  // 11. System Settings (นโยบายที่ Admin ปรับได้)
  //     ⚠️ ห้าม Seed สูตร Risk Final / Risk Weight ที่ Active (รอ BR)
  //     ⚠️ Bounding Box เดิม (HAT_YAI_*) เป็นการ hardcode พื้นที่ — ทำ COORD ระดับประเทศแทน
  // =========================================================================
  const settings = [
    { key: "LOCK_TIMEOUT_MINUTES", value: 10, description: "เวลา Lock ใบ (นาที)" },
    { key: "DOUBLE_ENTRY_ENABLED", value: true, description: "เปิด Double-entry หรือไม่" },
    { key: "MIN_ENTRY_DURATION_SEC", value: 90, description: "เวลาขั้นต่ำต่อใบ (วินาที) ถ้าน้อยกว่านี้ Flag" },
    { key: "STALE_DATA_MONTHS", value: 12, description: "จำนวนเดือนก่อน Flag ว่าข้อมูลเก่า" },
    { key: "EXPORT_EXPIRY_DAYS", value: 7, description: "จำนวนวันก่อนลบไฟล์ Export" },
    // Coverage (คำตัดสิน #2,#3): เกณฑ์ผ่าน 60 อยู่ที่ Community.targetCoveragePercent; เตือน Export แยก
    { key: "EXPORT_WARNING_COVERAGE_PERCENT", value: 80, description: "เกณฑ์เตือนเมื่อ Export Coverage ต่ำกว่า (แยกจากเกณฑ์ผ่าน 60)" },
    // Bounding Box ระดับประเทศ (ไม่ผูกอำเภอ) — จับ lat/lng สลับ/พิกัดขยะ (SEED-08)
    { key: "COORD_BOUNDS_TH_LAT_MIN", value: 5.5, description: "ขอบเขตพิกัดประเทศไทย ละติจูดต่ำสุด" },
    { key: "COORD_BOUNDS_TH_LAT_MAX", value: 20.5, description: "ขอบเขตพิกัดประเทศไทย ละติจูดสูงสุด" },
    { key: "COORD_BOUNDS_TH_LNG_MIN", value: 97.3, description: "ขอบเขตพิกัดประเทศไทย ลองจิจูดต่ำสุด" },
    { key: "COORD_BOUNDS_TH_LNG_MAX", value: 105.7, description: "ขอบเขตพิกัดประเทศไทย ลองจิจูดสูงสุด" },
    { key: "RISK_MIN_CONFIDENCE", value: 0.6, description: "ความเชื่อมั่นขั้นต่ำที่จะแสดงระดับความเสี่ยง (ใช้เมื่อมี BR)" },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: { key: s.key, value: s.value, description: s.description },
    });
  }

  console.log("✅ Production Seed เสร็จสิ้น");
  console.log("   - จังหวัดสงขลา(90)/อำเภอหาดใหญ่(9011)/ตำบลหาดใหญ่(901101)/ตำบลควนลัง(901102)");
  console.log("   - ชุมชน 5 แห่ง: TK01/PM01/KS01(2 ตำบล)/PW01/NK01 — totalHouseholds=null");
  console.log("   - Master Data: อาคาร 6 / กรรมสิทธิ์ 4 / เปราะบาง 9 / ช่วยเหลือ 6 / ทรัพยากร 7 / เตือนภัย 8 / อาสา 8");
  console.log("   - ⚠️ ไม่ Seed: หมู่ (รอยืนยัน), Risk Weight (รอ BR — ดู seed.dev.ts), Risk Formula");
}

main()
  .catch((e) => {
    console.error("❌ Seed ผิดพลาด:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
