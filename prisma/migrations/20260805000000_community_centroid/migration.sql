-- จุดศูนย์กลางชุมชนโดยประมาณ (Owner request 2026-08-05) — วางหมุดบนแผนที่ภาพรวม
--
-- ก่อนมีขอบเขต GIS จริง (CommunityBoundary) ระบบยังต้องแสดงชุมชนบนแผนที่ได้
-- เก็บจุดศูนย์กลางโดยประมาณระดับชุมชน (ไม่ใช่พิกัดรายบ้าน → ไม่ใช่ PII อ่อนไหว)
-- Nullable: ชุมชนที่ยังไม่ได้กำหนดตำแหน่งจะไม่ขึ้นบนแผนที่ (ไม่ default 0,0)
ALTER TABLE "community" ADD COLUMN "centroidLat" DECIMAL(10,7);
ALTER TABLE "community" ADD COLUMN "centroidLng" DECIMAL(10,7);

-- พิกัดต้องอยู่ในกรอบที่สมเหตุผล (ละติจูด -90..90, ลองจิจูด -180..180)
ALTER TABLE "community" ADD CONSTRAINT "community_centroid_lat_range"
  CHECK ("centroidLat" IS NULL OR ("centroidLat" >= -90 AND "centroidLat" <= 90));
ALTER TABLE "community" ADD CONSTRAINT "community_centroid_lng_range"
  CHECK ("centroidLng" IS NULL OR ("centroidLng" >= -180 AND "centroidLng" <= 180));
