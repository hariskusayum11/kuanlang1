# Custom SQL — Migration Draft (ยังไม่ Apply)

> ⚠️ **DRAFT — ยังไม่ Apply กับ Production** และ **ยังไม่มี Database สำหรับ Development ในรอบนี้**
> ไฟล์เหล่านี้คือ Custom SQL ที่ Prisma จัดการไม่ได้ (PostGIS, Trigger, Constraint, View)
> เมื่อสร้าง Migration จริง ให้ผนวก SQL เหล่านี้เข้า `prisma/migrations/*/migration.sql` ตามลำดับ

## ลำดับการรัน (ตามคำตัดสิน #15 — Custom SQL อยู่ในลำดับ Migration ที่ถูกต้อง)

```
Prisma tables (0001_init)                 ← Prisma สร้างตารางทั้งหมด
  │
00_extensions.sql       postgis, pg_trgm  (รันก่อน/อิสระได้)
10_postgis_columns.sql  geography columns (หลังตาราง)
20_functions_triggers.sql
30_constraints.sql
40_indexes.sql
50_views.sql
```

## หมายเหตุขอบเขต (v3.1)

- **ไม่มี** Risk Final Trigger / Risk Level logic → `WAITING_FOR_BUSINESS_RULE`
- **ไม่มี** Encryption SQL → `WAITING_FOR_LEGAL_DECISION`
- **ไม่มี** Retention DELETE ของ Audit Log → รอ PDPA (ปัจจุบัน block ทั้ง UPDATE/DELETE)
- Public View (`v_public_community_stats`) = Aggregate ล้วน — ไม่มี PII/สุขภาพ/พิกัด
- ทุกไฟล์ Idempotent (IF NOT EXISTS / DROP...IF EXISTS / DO $$ เช็ค pg_constraint)

## ทดสอบไวยากรณ์

รอบนี้ยังไม่มี PostgreSQL/PostGIS สำหรับรัน — ตรวจไวยากรณ์ด้วยตาและ diff กับ schema
เมื่อมี Dev DB: `psql -f 00_extensions.sql` … ตามลำดับ (หลัง `prisma migrate`)
