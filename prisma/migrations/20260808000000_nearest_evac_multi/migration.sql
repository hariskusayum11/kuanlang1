-- จุดอพยพใกล้ที่สุด (ส่วนที่ 3 ข้อ 8) เลือกได้หลายจุด (Owner 2026-08-08)
-- เพิ่มคอลัมน์ enum array; คง scalar เดิมไว้เพื่อความเข้ากันได้ย้อนหลัง (ไม่ลบข้อมูล)
ALTER TABLE "flood_risk_profile"
  ADD COLUMN "nearestEvacSiteTypes" "NearestEvacSiteType"[] NOT NULL DEFAULT ARRAY[]::"NearestEvacSiteType"[];

-- Backfill: ข้อมูลเดิมที่มีค่าเดี่ยว → ใส่เป็นสมาชิกตัวแรกของ array
UPDATE "flood_risk_profile"
  SET "nearestEvacSiteTypes" = ARRAY["nearestEvacSiteType"]
  WHERE "nearestEvacSiteType" IS NOT NULL;
