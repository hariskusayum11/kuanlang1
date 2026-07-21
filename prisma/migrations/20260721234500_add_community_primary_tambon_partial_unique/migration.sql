-- =============================================================================
-- SKL-FRIS Custom SQL Migration — BR-CT-02 / คำตัดสิน #8 / Q-17
-- Partial Unique Index: ux_community_primary_tambon บน "community_tambon"
-- กติกา: ชุมชนหนึ่งแห่งมีตำบลหลัก (isPrimary = true) ได้ไม่เกิน 1 ตำบล
--        อนุญาตให้ไม่มีตำบลหลักเลย (0 แถว) — เช่น KS01 ควนสันติ (2 ตำบล ไม่มีหลัก)
--        แถว isPrimary = false ไม่ถูกจำกัดจำนวน (อยู่นอก WHERE ของ index)
-- ขอบเขต: Partial Unique นี้เท่านั้น — ไม่มี GIST / GIN / Views / CHECK อื่น
--         (ux_risk_version_active อยู่นอกขอบเขต — สถานะ 🔴 C รอ Risk Q-03, docs/17)
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS
-- ต้องรันหลัง init_schema_v1 (ตาราง community_tambon ต้องมีแล้ว) — docs/16 คำตัดสิน #15
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_community_primary_tambon
  ON "community_tambon" ("communityId")
  WHERE "isPrimary" = true;
