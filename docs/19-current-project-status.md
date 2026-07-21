# 19 — Current Project Status (สถานะจริงจาก Repository)

> **วัตถุประสงค์:** สรุป **สถานะจริง** ของโปรเจกต์ที่อ่านจากไฟล์ใน Repository โดยตรง (ไม่พึ่งเอกสารเก่าที่อาจล้าสมัย)
> **อัปเดต:** 2026-07-21 (รอบ Conflict A/B/D + **Apply Migration แรก** `init_schema_v1` บน Development DB — ดู `docs/20`, `docs/21`)
> **ที่มา:** อ่านจาก `schema.prisma` (v3.1), `package.json`, `domain/`, `tests/`, `prisma/migrations-draft/`, `database/migrations-draft/`, และผลรัน `npm test` / `tsc` / `prisma validate`
> **⚠️ หมายเหตุความล้าสมัย:** `docs/16`, `docs/17`, `docs/18` (เวอร์ชันเดิม) เขียนว่า "รอบนี้ยังไม่แก้ schema" — **ไม่ตรงกับความจริง** เพราะ schema v3.1 ถูกแก้และ commit แล้ว ไฟล์นี้คือสถานะจริงที่ยึดถือได้

---

## 1. สรุปหนึ่งบรรทัด

**Schema v3.1 แก้เสร็จ + validate ผ่าน + Unit tests 29/29 ผ่าน + tsc ผ่าน** · **Conflict A + B + D แก้แล้ว** (D ปิด 2026-07-21 — enum สร้างแล้ว, Phase 2 Module) · **Migration แรก `20260721153936_init_schema_v1` Apply แล้วบน Development DB (local Docker `postgis/postgis:16-3.4`, PostGIS 3.4.3, pg_trgm 1.6)** — 56 ตาราง (app) + 21 enum, ไม่มี drift, seed master+dev สำเร็จ · **Migration 2 `20260721231914_br44_check_different_entry_person` Apply แล้ว (BR-44 trigger)** · **Migration 3 `20260721234500_add_community_primary_tambon_partial_unique` Apply แล้ว (`ux_community_primary_tambon`)** — integration tests 15 ผ่าน, todo เหลือ 0, **constraints ชุดแรกครบแล้ว** · **Production ไม่ถูกแตะ**

---

## 2. สิ่งที่ทำเสร็จแล้ว (🟢 DONE)

| หัวข้อ | สถานะ | หลักฐาน |
|---|---|---|
| `schema.prisma` v3.1 | 🟢 แก้เสร็จ | 1578 บรรทัด, commit `b62957a` |
| `prisma validate` | 🟢 ผ่าน | รันด้วย dummy `DATABASE_URL` (validate ไม่ต่อ DB) |
| Coverage Pure Function | 🟢 สร้างแล้ว | `domain/coverage/coverage.ts` (ตามคำตัดสิน #1, #2) |
| Unit tests | 🟢 29/29 ผ่าน | `tests/unit/coverage.test.ts` (7) + `schema-structure.test.ts` (22 — รวม Conflict A/B/D) |
| TypeScript strict check | 🟢 ผ่าน | `npx tsc --noEmit` ไม่มี error |
| Package ติดตั้ง | 🟢 แล้ว | `prisma 5.22.0`, `@prisma/client 5.22.0`, `better-auth 1.6.23`, `vitest 2.1.8`, `tsx 4.19.2` |
| SQL Drafts | 🟢 เขียนครบ 6 กลุ่ม | `database/migrations-draft/00→50`, `prisma/migrations-draft/0001` |

### รายละเอียด Schema v3.1 ที่ยืนยันแล้ว
- `UserRoleEnum` มี `VOLUNTEER` (ไม่มี `RESCUE_VOLUNTEER`)
- `Community`: `totalHouseholds Int?`, `targetCoveragePercent Float @default(60)`, ไม่มี `tambonId`/`targetHouseholds`
- `CommunityTambon` (M:N) มี `isPrimary Boolean @default(false)`
- `FloodRiskProfile`: มี `rawScore`/`maximumPossibleScore`/`normalizedScore`; **ไม่มี** `riskLevelAuto`/`riskLevelFinal`/`riskScoreAuto`/`absoluteScore`
- `Household`: ฟิลด์ดิบจากกระดาษครบ, ลบ unique `[houseNo,mooId,tambonId]` แล้ว, `latitude`/`longitude` เป็น Decimal
- `SurveyorRiskLevel {LOW MEDIUM HIGH}` — เก็บค่าได้แต่ไม่มี logic จัดระดับ

---

## 3. สิ่งที่ยังค้าง / บล็อก (🔴 BLOCKED / TODO)

| หัวข้อ | สถานะ | บล็อกโดย |
|---|---|---|
| Real `prisma/migrations/` | ✅ **สร้างแล้ว** | `20260721153936_init_schema_v1` (56 ตาราง, 21 enum, ไม่มี destructive SQL) |
| `.env` / `DATABASE_URL` จริง | ✅ **สร้างแล้ว** | local dev เท่านั้น (`localhost:5432/kuanlang_dev`) · `.env.example` committable, `.env` gitignored |
| Development Database (PG16+PostGIS) | ✅ **ตั้งแล้ว** | Docker `postgis/postgis:16-3.4` (port 5432) · PostGIS 3.4.3 · pg_trgm 1.6 |
| Apply Migration | ✅ **Apply แล้ว (Dev เท่านั้น)** | `migrate dev` → "up to date", ไม่มี drift · **Production ไม่ถูกแตะ** |
| Integration tests (DB) | ✅ **รันจริง + ผ่าน** | 15 tests ผ่าน, `it.todo` เหลือ 0 · แก้บั๊ก `skipIf` แล้ว → `describe.skipIf(!isLocalDevDb)` |
| **BR-44 Trigger (SCH-03)** | ✅ **Applied (Dev)** | `20260721231914_br44_check_different_entry_person` — `check_different_entry_person` + `trg_entry_different_person` (BEFORE INSERT OR UPDATE OF sheetId/enteredById/attemptNo) + advisory xact lock · ทดสอบจริง 4 ข้อผ่าน |
| **Partial Unique (BR-CT-02)** | ✅ **Applied (Dev)** | `20260721234500_add_community_primary_tambon_partial_unique` — `ux_community_primary_tambon` ON `community_tambon(communityId)` WHERE `"isPrimary" = true` (คำตัดสิน #8/Q-17, spec 🟢 A1) · ทดสอบจริง 7 ข้อผ่าน · **constraints ชุดแรกครบแล้ว** |
| Custom SQL formalize ที่เหลือ | 🔴 ยังไม่ทำ | location/batch/audit triggers, CHECK constraints อื่น, GIST/GIN (0005), views (0006) ยังเป็น draft (Conflict E/F) |
| `EvacuationSiteType` enum (FIX-45) | ✅ **แก้แล้ว** (Conflict D ปิด 2026-07-21) | เจ้าของยืนยัน 6 ค่า, ไม่มี `UNKNOWN`, `EvacuationSite.type` nullable, Phase 2 Module (ดู `docs/20`) |
| PostGIS columns ใน schema | ✅ **แก้แล้ว** (Conflict A) | ประกาศ `Unsupported("geography(...)")` แล้ว — ไม่ drift (ดู `docs/20`) |
| `pg_trgm` ใน datasource | ✅ **แก้แล้ว** (Conflict B) | `extensions = [postgis, pg_trgm]` — validate ผ่าน (ดู `docs/20`) |
| Risk Final formula/leveling | 🔴 รอ Business Rule (Q-03) | **ห้าม implement** |
| Encryption (AES-256-GCM/Blind Index) | 🔴 รอ Legal/PDPA (Q-04) | **ห้าม implement** |
| รหัสพื้นที่จริง (Hat Yai) | 🔴 UNVERIFIED (Q-24) | 9001 น่าจะผิด — บล็อก Seed Production |

---

## 4. โครงสร้าง SQL Drafts (2 โฟลเดอร์)

### `prisma/migrations-draft/`
- `0001_init_prisma_tables.sql` — ตารางที่ Prisma generate (ตรงกับ v3.1), บรรทัดแรก `CREATE EXTENSION IF NOT EXISTS "postgis";` — **ไม่** สร้าง location/geom

### `database/migrations-draft/` (custom SQL — ต้องรันหลัง Prisma สร้างตาราง)
| ไฟล์ | เนื้อหา | Extension ที่ต้องมีก่อน |
|---|---|---|
| `00_extensions.sql` | `CREATE EXTENSION IF NOT EXISTS postgis; pg_trgm;` | — |
| `10_postgis_columns.sql` | ADD COLUMN location/geom (geography) บน household/evacuation_site/community_boundary — **หมายเหตุ: หลังแก้ Conflict A คอลัมน์เหล่านี้ประกาศใน schema แล้ว → Prisma จัดการเอง; ไฟล์นี้เป็น fallback idempotent** | postgis |
| `20_functions_triggers.sql` | 6 ฟังก์ชัน/trigger: update_household_location, update_evac_site_location, ~~`check_different_entry_person` (BR-44)~~ **← formalize แล้วเป็น migration `20260721231914` (เพิ่ม UPDATE coverage + advisory lock)**, update_batch_counts, release_expired_locks, prevent_audit_modification (`RETURN OLD`) | — |
| `30_constraints.sql` | CHECK ทั้งหมดห่อ `DO $$ IF NOT EXISTS` + ~~`ux_community_primary_tambon` partial unique~~ **← formalize แล้วเป็น migration `20260721234500`** | — |
| `40_indexes.sql` | GIST spatial partial + GIN trigram บน respondentName/placeName/fullName | pg_trgm |
| `50_views.sql` | `v_community_coverage` (NULL-aware), `v_household_geo_internal` (VERIFIED only), `v_public_community_stats` (aggregate — ไม่มี PII) | postgis |

---

## 5. ความขัดแย้ง / ความต่าง (Conflict Report)

> เปรียบเทียบ `schema.prisma` ↔ `prisma/migrations-draft` ↔ `database/migrations-draft`

| # | ประเด็น | รายละเอียด | ผลกระทบ |
|---|---|---|---|
| **A** | ~~location/geom ไม่อยู่ใน schema.prisma~~ ✅ **แก้แล้ว** | ประกาศ `Unsupported("geography(Point, 4326)")` (household+evacuation_site) และ `Unsupported("geography(MultiPolygon, 4326)")` (community_boundary) ใน schema แล้ว | ✅ Prisma รับรู้ → ไม่ drift · `10_postgis_columns.sql` เป็น fallback idempotent |
| **B** | ~~`pg_trgm` ไม่ประกาศใน datasource~~ ✅ **แก้แล้ว** | `extensions = [postgis, pg_trgm]` (Prisma 5.22.0 + `postgresqlExtensions` preview) | ✅ validate ผ่าน · Prisma จัดการ extension ให้ |
| **C** | postgis extension สร้าง 2 ที่ | `0001_init` บรรทัด 1 + `00_extensions.sql` | 🟢 Idempotent (`IF NOT EXISTS`) — ซ้ำซ้อนแต่ไม่อันตราย |
| **D** | ~~`EvacuationSiteType` ไม่ถูกสร้าง~~ ✅ **แก้แล้ว** | เจ้าของยืนยันค่า enum (2026-07-21): 6 ค่า `RELATIVE_HOME/SCHOOL/TEMPLE_OR_MOSQUE/COMMUNITY_CENTER/MUNICIPAL_AREA/OTHER` ไม่มี `UNKNOWN`; `EvacuationSite.type` → `EvacuationSiteType?`; `NearestEvacSiteType` คงไว้ (สอง enum แยกกัน); Phase 2 Module | ✅ ปิด Conflict D — Prisma รับรู้ · ไม่มี Seed จุดอพยพ Production (ดู `docs/20`) |
| **E** | ไม่มี real `prisma/migrations/` + เลขไม่ตรงกัน | draft 2 โฟลเดอร์ใช้เลขคนละแบบ (prisma: `0001`; database: `00/10/20/30/40/50`) ยังไม่ merge เป็น layout เป้าหมาย `0001–0006` | 🔴 ต้อง formalize ก่อน apply |
| **F** | prisma draft เป็น `.sql` หลวม | ไม่ใช่ Prisma migration folder จริง (ขาด `migration.sql` + `migration_lock.toml`) | 🔴 รัน `prisma migrate` ไม่ได้ตรง ๆ |

### ยืนยันว่า "สอดคล้อง" (ไม่ใช่ conflict)
- `0001_init` ตรงกับ schema v3.1 (enum/ตาราง/FK ครบ)
- `release_expired_locks` INSERT เข้า audit_log ได้ (audit_log ไม่มีคอลัมน์ `updatedAt` — INSERT ไม่แตะ)
- ทุกคอลัมน์/ตารางที่ constraint/trigger/view อ้างถึง มีอยู่จริงใน v3.1

---

## 6. ลำดับ Migration เป้าหมาย (ยังไม่ได้สร้าง)

```
0001_init              (Prisma tables)
0002_postgis_columns   (custom — location/geom + Unsupported() ใน schema)
0003_functions_triggers
0004_constraints
0005_indexes           (ต้องมี pg_trgm ก่อน)
0006_views
```

---

## 7. ขั้นต่อไปที่แนะนำ (เมื่อได้รับอนุญาต)

1. ✅ ~~เพิ่ม `pg_trgm` + `Unsupported("geography(...)")`~~ — **ทำแล้ว** (Conflict A, B — ดู `docs/20`)
2. ✅ ~~`EvacuationSiteType` (FIX-45)~~ — **ทำแล้ว** (Conflict D ปิด 2026-07-21 — enum 6 ค่า, Phase 2 Module; `docs/20`)
3. ✅ ~~ตั้ง Development DB (Docker Compose) + `.env`~~ — **ทำแล้ว** (`postgis/postgis:16-3.4`, PostGIS 3.4.3, pg_trgm 1.6)
4. ✅ ~~สร้าง + Apply Migration แรก~~ — **ทำแล้ว** (`20260721153936_init_schema_v1` — 56 ตาราง, 21 enum, ไม่มี drift)
5. ✅ ~~แก้ integration tests ที่ skip เสมอ (`skipIf` timing)~~ — **ทำแล้ว** (`describe.skipIf(!isLocalDevDb)`, `npm run test:integration`)
6. ✅ ~~Formalize BR-44 trigger เป็น migration~~ — **ทำแล้ว** (`20260721231914_br44_check_different_entry_person` applied บน Dev · 4 tests BR-44 รันจริง+ผ่าน)
7. ✅ ~~Formalize `ux_community_primary_tambon` partial unique~~ — **ทำแล้ว** (`20260721234500_add_community_primary_tambon_partial_unique` applied บน Dev · 7 tests รันจริง+ผ่าน · รวม integration = 15 ผ่าน, todo เหลือ 0 · **งาน database constraints ชุดแรกครบแล้ว**)
8. Formalize Custom SQL ที่เหลือทีละ migration (location/batch/audit triggers → CHECK constraints อื่น → GIST/GIN 0005 → views 0006)
9. รัน migration 2 ครั้งติดกัน + ตรวจ idempotency

> **ยังห้าม:** Apply Production · `prisma db push` / `migrate deploy` / `migrate reset` · ลบ volume · Commit/Push · Risk Final logic · Encryption · แก้รหัสพื้นที่โดยเดา
