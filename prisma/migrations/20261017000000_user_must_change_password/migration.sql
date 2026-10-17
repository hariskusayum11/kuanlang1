-- รองรับ "ADMIN ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้" (Owner Decision 2026-10-17)
-- ใช้เมื่อระบบอีเมลถูกปิด (EMAIL_ENABLED=false) จึงไม่มีลิงก์ "ลืมรหัสผ่าน" ให้ผู้ใช้ทำเอง
--
-- true = รหัสผ่านปัจจุบันเป็นรหัสชั่วคราวที่คนอื่นตั้งให้และรู้ค่าอยู่
--        → ผู้ใช้ต้องเปลี่ยนก่อนใช้งานหน้าอื่น (บังคับฝั่ง server ที่ dashboard layout)
--
-- Default false และ NOT NULL — แถวเดิมทั้งหมดได้ false ทันทีโดยไม่ต้อง backfill
-- (ไม่มีใครถูกบังคับเปลี่ยนรหัสจากการ migrate ครั้งนี้)
ALTER TABLE "user"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
