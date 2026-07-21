# 20 — Schema Conflict Resolution (แก้ Conflict A, B, D)

> **วัตถุประสงค์:** บันทึกการแก้ Conflict **A (PostGIS Drift)**, **B (pg_trgm)**, **D (EvacuationSiteType)** ที่ระบุใน [19-current-project-status.md](19-current-project-status.md) §5
> **อัปเดต:** 2026-07-21
> **ขอบเขตรอบนี้:** แก้เฉพาะ A, B, D — **ไม่แตะ** C, E, F
> **⛔ ยังห้าม (ตามคำสั่ง):** สร้าง `prisma/migrations/` · `prisma migrate dev/deploy` · `prisma db push` · เชื่อม Production · Risk Final Logic · Encryption
> **ผลลัพธ์รวม:** A ✅ แก้แล้ว · B ✅ แก้แล้ว · **D ✅ แก้แล้ว** (เจ้าของยืนยันค่า enum 2026-07-21 — `EvacuationSiteType` เป็น Phase 2 Future Module)

---

## 1. Conflict เดิม (จาก `docs/19` §5)

| # | ปัญหา | ผลกระทบเดิม |
|---|---|---|
| **A** | คอลัมน์ PostGIS (`household.location`, `evacuation_site.location`, `community_boundary.geom`) อยู่ใน Custom SQL (`10_postgis_columns.sql`) เท่านั้น — `schema.prisma` ไม่รู้จัก | 🔴 **Prisma Drift** — `prisma migrate dev` จะเห็นคอลัมน์ที่ schema ไม่ประกาศ → รายงาน drift ทุกครั้ง |
| **B** | `pg_trgm` ไม่ประกาศใน `datasource extensions` (มีแค่ `postgis`) แต่ index ใน `40_indexes.sql` (GIN trigram) ต้องใช้ | 🟡 Prisma ไม่จัดการ extension นี้ · ถ้ารัน `40` ก่อน `00_extensions.sql` → error |
| **D** | `EvacuationSite.type` ใช้ `NearestEvacSiteType` (enum คำตอบครัวเรือน ส่วนที่ 3 ข้อ 8 — มี `UNKNOWN`/`OTHER` ซึ่งไร้สาระสำหรับจุดอพยพจริง) FIX-45 อนุมัติให้แยก `EvacuationSiteType` | 🟡 ชื่อ/ค่า enum ไม่ตรงเจตนาเชิงโดเมน → ✅ แก้แล้ว (เจ้าของยืนยันค่า enum, Phase 2 Module) |

---

## 2. วิธีแก้

### Conflict A — PostGIS Drift ✅
ประกาศคอลัมน์ PostGIS ใน `schema.prisma` ด้วย `Unsupported()` ให้ **ชื่อ field + ชนิดตรงกับ SQL draft จริง** (`10_postgis_columns.sql`):

| Model | Field | ชนิด (ตรงกับ SQL) | Optional |
|---|---|---|---|
| `Household` | `location` | `Unsupported("geography(Point, 4326)")` | `?` (nullable) |
| `EvacuationSite` | `location` | `Unsupported("geography(Point, 4326)")` | `?` (nullable) |
| `CommunityBoundary` | `geom` | `Unsupported("geography(MultiPolygon, 4326)")` | `?` (nullable) |

**หมายเหตุสำคัญ:**
- SQL draft ใช้ **`geography(MultiPolygon, 4326)`** (ไม่ใช่ `geometry(...)` ตามตัวอย่างในคำสั่ง) → ยึดตาม SQL จริงเพื่อกัน drift
- ชื่อ field = ชื่อคอลัมน์ (`location`, `geom`) จึง**ไม่ต้องใช้ `@map`** (Prisma ใช้ชื่อ field เป็นชื่อคอลัมน์เมื่อไม่มี `@map`)
- ตั้ง `?` เพราะ SQL `ADD COLUMN` ไม่มี `NOT NULL` + Prisma กำหนดให้ Unsupported field ต้อง optional หรือมี default
- **ไม่สร้างคอลัมน์ซ้ำ:** เพิ่มเฉพาะฟิลด์ที่ SQL มีจริง (3 คอลัมน์) — ไม่เพิ่มเกิน

### Conflict B — pg_trgm ✅
Prisma `5.22.0` เปิด preview `postgresqlExtensions` (มีอยู่แล้วใน `generator.previewFeatures`) → **รองรับ** การประกาศหลาย extension.
แก้ `datasource`:
```prisma
extensions = [postgis, pg_trgm]   // เดิม: [postgis]
```
ยืนยัน syntax ผ่าน `prisma validate` (ไม่เดา syntax) — ผ่าน 🚀

### Conflict D — EvacuationSiteType ✅ **แก้แล้ว (2026-07-21)**
**เดิม HALT เพราะเอกสารไม่ลิสต์ค่า enum → เจ้าของระบบยืนยันคำตัดสินแล้ว (ดู `docs/16` §6.5 #EVAC):**

`EvacuationSite` = **Phase 2 Future Module** (เมนู "จัดการจุดอพยพ" ที่เจ้าหน้าที่เพิ่มโรงเรียน/มัสยิด/ศูนย์ชุมชน/อื่นๆ) — Phase 1 สร้าง**โครงสร้างเท่านั้น** ไม่มี UI/API/Seed จริง/การผูกกับคำตอบครัวเรือน/Business Logic

สร้าง enum (ห้ามเพิ่ม/ลบ/เปลี่ยนชื่อ):
```prisma
enum EvacuationSiteType {
  RELATIVE_HOME    // บ้านญาติ/บ้านพักพิง
  SCHOOL           // โรงเรียน
  TEMPLE_OR_MOSQUE // วัด/มัสยิด
  COMMUNITY_CENTER // ศูนย์ชุมชน
  MUNICIPAL_AREA   // พื้นที่/อาคารเทศบาล
  OTHER            // อื่นๆ
}
```
เปลี่ยน `EvacuationSite.type`: `NearestEvacSiteType` → **`EvacuationSiteType?`** (nullable)

**ข้อจำกัดที่บังคับ:**
- **ไม่มี `UNKNOWN`** โดยเจตนา — ไม่ทราบประเภท → `type = NULL`
- `NearestEvacSiteType` (คำตอบแบบสอบถาม ส่วนที่ 3 ข้อ 8) **คงไว้ครบ** รวม `UNKNOWN`/`OTHER` — **สอง enum แยกกันถาวร ห้ามรวม** (คนละความหมาย: คำตอบครัวเรือน vs. Master Data จุดอพยพจริง)
- **ห้าม Seed ตัวอย่างจุดอพยพใน Production** (ยืนยันแล้ว: `seed.ts` ไม่มี EvacuationSite)
- เพิ่ม comment ที่ model: *"Phase 2 Future Module — ยังไม่เปิดใช้งานใน Phase 1"*

---

## 3. ไฟล์ที่แก้

| ไฟล์ | การเปลี่ยน | Conflict |
|---|---|---|
| `prisma/schema.prisma` | `datasource.extensions = [postgis, pg_trgm]` | B |
| `prisma/schema.prisma` | `Household.location` = `Unsupported("geography(Point, 4326)")?` | A |
| `prisma/schema.prisma` | `EvacuationSite.location` = `Unsupported("geography(Point, 4326)")?` | A |
| `prisma/schema.prisma` | `CommunityBoundary.geom` = `Unsupported("geography(MultiPolygon, 4326)")?` | A |
| `database/migrations-draft/10_postgis_columns.sql` | เพิ่มหมายเหตุหัวไฟล์: คอลัมน์ประกาศใน schema แล้ว → ไฟล์นี้เป็น fallback idempotent (ไม่แก้ DDL) | A |
| `prisma/schema.prisma` | เพิ่ม enum `EvacuationSiteType` (6 ค่า) + comment; `EvacuationSite.type` → `EvacuationSiteType?` + comment "Phase 2 Future Module" | D |
| `tests/unit/schema-structure.test.ts` | describe `Conflict A/B resolution` — ตรวจ schema text (A/B) + **7 assertions ใหม่สำหรับ D** (enum 6 ค่า, ไม่มี UNKNOWN, type nullable, NearestEvacSiteType คงอยู่, สอง enum แยกกัน, Production Seed ไม่มี evac) | A/B/D |
| `docs/14`,`16`,`17`,`18`,`19` | อัปเดตสถานะ (Q-EVAC-TYPE ตอบแล้ว, #EVAC, Conflict D ปิด) | — |
| `docs/20` | ไฟล์นี้ | — |

**ไม่แก้:** `seed.ts`/`seed.dev.ts` (ยืนยันไม่มี EvacuationSite seed — ตรงคำตัดสิน #EVAC-5), `NearestEvacSiteType` (คงเดิมครบ), migration folders

---

## 4. ผลกระทบต่อ Draft Migration

| Draft | ผลกระทบ |
|---|---|
| `prisma/migrations-draft/0001_init_prisma_tables.sql` | เมื่อสร้าง migration init ใหม่ (ภายหลัง) Prisma จะรวม 3 คอลัมน์ PostGIS ไว้ใน CREATE TABLE เอง (เพราะ schema รู้จักแล้ว) — draft เดิมยังไม่มีคอลัมน์เหล่านี้ ต้อง regenerate เมื่อถึงเวลา |
| `database/migrations-draft/10_postgis_columns.sql` | **กลายเป็นซ้ำซ้อน (redundant/fallback)** — คอลัมน์จะถูกสร้างโดย Prisma init แล้ว · `ADD COLUMN IF NOT EXISTS` กัน error ไว้ (idempotent) · เมื่อ formalize migration จริงควรพิจารณาลบไฟล์นี้หรือคงเป็น safety |
| `database/migrations-draft/00_extensions.sql` | `pg_trgm` ยังคงอยู่เป็น fallback · เมื่อ Prisma จัดการ extension ผ่าน datasource แล้ว ไฟล์นี้เป็น safety net (idempotent) |
| `40_indexes.sql` (GIN trigram) | ตอนนี้ `pg_trgm` ถูกประกาศใน datasource → Prisma จะเปิด extension ให้ก่อน index ทำงาน (ลดความเสี่ยง ordering) |
| `20/30/50_*.sql` | ไม่กระทบ |

> **หมายเหตุ:** รอบนี้ **ไม่ได้สร้าง/แก้ migration จริง** — ผลกระทบข้างต้นคือสิ่งที่จะเกิดตอน formalize migration ในอนาคต

---

## 5. สิ่งที่ยังต้องทำก่อน Real Migration

1. ✅ ~~**Conflict D:** รับค่า enum `EvacuationSiteType`~~ — **ปิดแล้ว 2026-07-21** (enum สร้าง, type nullable, test ปรับแล้ว; โมดูลจริง = Phase 2 — ยังไม่สร้าง UI/API/Seed)
2. **Conflict E/F:** formalize `prisma/migrations/` จริง (layout `0001_init` → `0002_postgis_columns` → … → `0006_views`) พร้อม `migration_lock.toml`
3. ตัดสินใจว่าจะ**ลบ `10_postgis_columns.sql`** (เพราะ Prisma จัดการแล้ว) หรือคงเป็น fallback
4. ตั้ง Development DB (PG16 + PostGIS) + `.env` (`DATABASE_URL`)
5. `prisma migrate dev --create-only` → ตรวจว่า init รวม 3 คอลัมน์ PostGIS ถูกต้อง → แทรก Custom SQL 0003–0006 ตามลำดับ
6. รัน migration **2 ครั้งติดกัน** → ไม่ error (idempotent) + `prisma migrate dev` → **ไม่มี drift** (ยืนยันผล Conflict A)
7. Seed พื้นที่ยังบล็อก (รอรหัสพื้นที่ Q-24 — Conflict นอกขอบเขตรอบนี้)

---

## 6. สิ่งที่ยังรอ Legal / Risk Business Rule / เจ้าของ

### ✅ Conflict D — ปิดแล้ว (Q-EVAC-TYPE ตอบแล้ว 2026-07-21)

**ประวัติ:** เดิม HALT เพราะแบบสอบถาม (`docs/questionnaire.pdf` — แบบสำรวจครัวเรือน) **ไม่มีหัวข้อนิยาม "ประเภทสถานที่อพยพจริง"** (catalog ของ `EvacuationSite`). รายการเดียว (ส่วนที่ 3 ข้อ 8: บ้านญาติ/โรงเรียน/วัด-มัสยิด/ศูนย์ชุมชน/พื้นที่เทศบาล/ไม่ทราบ/อื่นๆ) คือ **คำตอบครัวเรือน** ที่ผูก `NearestEvacSiteType` อยู่แล้ว → จึงไม่เดา และรอเจ้าของ

**คำตัดสินเจ้าของ (ดู `docs/16` §6.5 #EVAC):** `EvacuationSite` = **Phase 2 Future Module**; ค่า enum `EvacuationSiteType` = `RELATIVE_HOME/SCHOOL/TEMPLE_OR_MOSQUE/COMMUNITY_CENTER/MUNICIPAL_AREA/OTHER` (ไม่มี `UNKNOWN`); `type` → nullable; `NearestEvacSiteType` คงไว้แยก → **ปิด Conflict D** (test ยืนยันสถานะใหม่ใน `tests/unit/schema-structure.test.ts`)

### 🔴 ยังรอ (นอก Conflict A/B/D — คงสถานะเดิม)
- **Risk Final Logic** (สูตร/จัดระดับ LOW/MEDIUM/HIGH/CRITICAL) — รอ Business Rule (Q-03/Q-25) · **ห้าม implement**
- **Encryption** (AES-256-GCM + Blind Index) — รอ Legal/PDPA + Key Management · **ห้าม implement**
- **Consent policy** — legal BLOCKER (Q-04)
- **รหัสพื้นที่จริง** (หาดใหญ่ ~9011) — UNVERIFIED (Q-24) · บล็อก Seed Production

---

## 7. Verification (รอบนี้)

| คำสั่ง | ผล |
|---|---|
| `npm test` | ✅ **29/29 ผ่าน** (integration 4 skipped — ไม่มี DB) · Conflict A/B/D covered (schema-structure 22 tests) |
| `npx tsc --noEmit` | ✅ ผ่าน (exit 0) |
| `npx prisma format` | ✅ ผ่าน |
| `npx prisma validate` | ✅ valid 🚀 (ยืนยัน `pg_trgm` + `Unsupported()` syntax ถูกต้อง) |

> **ยืนยัน:** ไม่มี migration/database ถูกสร้างหรือเปลี่ยน · ไม่มีการเชื่อม Production · ไม่มี Risk Final/Encryption logic · **โมดูลจุดอพยพยังไม่เปิดใช้ใน Phase 1** (ไม่มี UI/API/Production Seed — โครงสร้าง schema เท่านั้น)
