# 19 — Current Project Status (สถานะจริงจาก Repository)

> **วัตถุประสงค์:** สรุป **สถานะจริง** ของโปรเจกต์ที่อ่านจากไฟล์ใน Repository โดยตรง (ไม่พึ่งเอกสารเก่าที่อาจล้าสมัย)
> **อัปเดต:** 2026-07-21 (รอบ Conflict A/B/D — ดู `docs/20`)
> **ที่มา:** อ่านจาก `schema.prisma` (v3.1), `package.json`, `domain/`, `tests/`, `prisma/migrations-draft/`, `database/migrations-draft/`, และผลรัน `npm test` / `tsc` / `prisma validate`
> **⚠️ หมายเหตุความล้าสมัย:** `docs/16`, `docs/17`, `docs/18` (เวอร์ชันเดิม) เขียนว่า "รอบนี้ยังไม่แก้ schema" — **ไม่ตรงกับความจริง** เพราะ schema v3.1 ถูกแก้และ commit แล้ว ไฟล์นี้คือสถานะจริงที่ยึดถือได้

---

## 1. สรุปหนึ่งบรรทัด

**Schema v3.1 แก้เสร็จ + validate ผ่าน + Unit tests 23/23 ผ่าน + tsc ผ่าน** · **Conflict A (PostGIS Unsupported) + B (pg_trgm) แก้แล้ว** · **Conflict D (EvacuationSiteType) HALT — รอค่า enum** แต่ **ยังไม่มี real migration / ไม่มี `.env` / ไม่มี Database** — พร้อมสร้าง DDL Migration แต่ยังไม่ได้ทำ

---

## 2. สิ่งที่ทำเสร็จแล้ว (🟢 DONE)

| หัวข้อ | สถานะ | หลักฐาน |
|---|---|---|
| `schema.prisma` v3.1 | 🟢 แก้เสร็จ | 1578 บรรทัด, commit `b62957a` |
| `prisma validate` | 🟢 ผ่าน | รันด้วย dummy `DATABASE_URL` (validate ไม่ต่อ DB) |
| Coverage Pure Function | 🟢 สร้างแล้ว | `domain/coverage/coverage.ts` (ตามคำตัดสิน #1, #2) |
| Unit tests | 🟢 17/17 ผ่าน | `tests/unit/coverage.test.ts` (7) + `schema-structure.test.ts` (10) |
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
| Real `prisma/migrations/` | 🔴 ยังไม่มี | มีแค่ draft (ยังไม่ formalize) |
| `.env` / `DATABASE_URL` จริง | 🔴 ยังไม่มี | ต้องมี Development DB ก่อน |
| Development Database (PG16+PostGIS) | 🔴 ยังไม่ตั้ง | Docker Compose ยังไม่รัน |
| Apply Migration | 🔴 ยังไม่ทำ | ตามคำสั่ง — ห้าม apply Production |
| `EvacuationSiteType` enum (FIX-45) | 🔴 **HALT** (Conflict D) | อนุมัติให้สร้าง แต่**ไม่มีเอกสารระบุค่า enum** → ห้ามเดา (ดู `docs/20`) |
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
| `20_functions_triggers.sql` | 6 ฟังก์ชัน/trigger: update_household_location, update_evac_site_location, `check_different_entry_person` (BR-44), update_batch_counts, release_expired_locks, prevent_audit_modification (`RETURN OLD`) | — |
| `30_constraints.sql` | CHECK ทั้งหมดห่อ `DO $$ IF NOT EXISTS` + `ux_community_primary_tambon` partial unique (WHERE isPrimary=true) | — |
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
| **D** | `EvacuationSiteType` ไม่ถูกสร้าง | 🔴 **HALT** — FIX-45/doc17 อนุมัติให้สร้าง แต่**ไม่มีเอกสารใดระบุค่า enum**; instruction ห้ามเดา | 🔴 รอเจ้าของยืนยันค่า enum (ดู `docs/20` §6) — `EvacuationSite.type` คง `NearestEvacSiteType` ไว้ก่อน |
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
2. 🔴 `EvacuationSiteType` (FIX-45) — **HALT** รอเจ้าของยืนยันค่า enum (Conflict D — `docs/20` §6)
3. ตั้ง Development DB (Docker Compose) + `.env` (`DATABASE_URL`)
4. `prisma migrate dev --create-only` เพื่อสร้าง migration แรก แล้วแทรก custom SQL ตามลำดับ 0002–0006
5. รัน migration 2 ครั้งติดกัน → ต้องไม่ error (Idempotent)
6. ตรวจ drift ด้วย `prisma migrate dev` → ต้องไม่มี drift

> **ยังห้าม:** Apply Production · `prisma db push` · Risk Final logic · Encryption · แก้รหัสพื้นที่โดยเดา
