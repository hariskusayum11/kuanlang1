# 21 — First Migration Plan (แผน Migration แรก — Development)

> **สร้าง:** 2026-07-21
> **ฐานอ้างอิง:** `prisma/schema.prisma` (v3.1), [18-pre-migration-checklist.md](18-pre-migration-checklist.md), [19-current-project-status.md](19-current-project-status.md), [20-schema-conflict-resolution.md](20-schema-conflict-resolution.md)
> **สถานะ:** ✅ **ดำเนินการเสร็จ (2026-07-21)** — Migration `20260721153936_init_schema_v1` Apply แล้วบน Development DB (local Docker), Seed master+dev สำเร็จ, Unit tests 29/29 ผ่าน, ไม่มี drift · **Production ไม่ถูกแตะ** (ดู §10 ผลจริง)

---

## 1. วัตถุประสงค์

- สร้างฐานข้อมูล **Development** ครั้งแรกด้วย Docker (PostgreSQL 16 + PostGIS)
- เปิด Extensions `postgis` + `pg_trgm`
- สร้าง Prisma Migration แรกจาก Schema ปัจจุบัน แล้ว**ตรวจ SQL ก่อนใช้งาน**
- ทดสอบว่า Schema สร้างได้จริง ก่อนเริ่มพัฒนา UI / API / Server Actions

---

## 2. ขอบเขต

- **Development environment เท่านั้น** (local Docker)
- ❌ ไม่เชื่อม Production · ❌ ไม่ `prisma migrate deploy` · ❌ ไม่ `prisma db push`
- ❌ ไม่ใช้ข้อมูลจริงของประชาชน · ❌ ไม่ Seed จุดอพยพจริง · ❌ ไม่ Seed Secret/รหัสผ่านจริง

---

## 3. Extensions ที่ต้องมี

| Extension | ใช้ทำอะไร | ประกาศที่ |
|---|---|---|
| `postgis` | ชนิด `geography(Point/MultiPolygon, 4326)` (Household/EvacuationSite/CommunityBoundary) + spatial index | `datasource.extensions` + `00_extensions.sql` |
| `pg_trgm` | GIN trigram index สำหรับค้นหาชื่อ/สถานที่แบบ Fuzzy | `datasource.extensions` + `00_extensions.sql` |

> `schema.prisma` ประกาศ `extensions = [postgis, pg_trgm]` แล้ว (preview `postgresqlExtensions`) → Prisma จัดการเปิด extension ให้ใน Migration init

---

## 4. ตารางที่สร้าง (56 Models · 21 Enums)

> **หมายเหตุสำคัญ:** Migration แรก **สร้างทุกตาราง** (รวม Phase 2) แต่การจัดหมวดด้านล่างสะท้อน**ช่วงที่สร้าง UI/API/Business Logic** ไม่ใช่ช่วงที่ตารางถูกสร้าง — ตาราง Phase 2 ถูกสร้างไว้แต่ **ยังไม่ถูกใช้งานใน Phase 1**

### 4.1 System / Auth Models (15)

`User`, `Session`, `Account`, `Verification` (Better Auth) · `UserRole`, `UserCommunityScope`, `ConfidentialityAgreement` (RBAC/PDPA) · `AuditLog`, `SystemSetting`, `CriticalFieldConfig` · `NotificationTemplate`, `Notification` · `ExportJob`, `PdpaRequest` · `EntryStats`

### 4.2 Phase 1 Models (40)

- **พื้นที่/ชุมชน:** `Province`, `District`, `Tambon`, `Moo`, `Community`, `CommunityTambon`, `CommunityBoundary`
- **Master Data (จากกระดาษ):** `BuildingType`, `OwnershipType`, `VulnerabilityType`, `AssistanceNeedType`, `ResourceType`, `AlertChannel`, `VolunteerSkillType`
- **กระบวนการคีย์กระดาษ:** `PaperBatch`, `PaperSheet`, `EntryAttempt`, `FieldStatus`, `Discrepancy`, `FieldQuery`
- **ครัวเรือน + ข้อมูลสำรวจ:** `Household`, `HouseholdVersion`, `ConsentRecord`, `VulnerablePerson`, `PersonVulnerability`, `AssistanceNeed`, `FloodRiskProfile`, `HouseholdResource`, `EvacuationVehicle`, `AlertChannelPref`, `DigitalReadiness`, `VolunteerInterest`
- **ความเสี่ยง (จัดเก็บเท่านั้น — ไม่มีสูตร Final):** `RiskWeightConfig`
- **อาสาสมัคร/ติดต่อฉุกเฉิน:** `EmergencyContact`, `VolunteerProfile`, `VolunteerProfileSkill`
- **Incident Command (schema พร้อม — UI/API ช่วง Phase หลัง):** `Incident`, `IncidentCommunity`, `RescueTask`, `TaskUpdate`

### 4.3 Phase 2 Future Models (1)

| Model | สถานะ |
|---|---|
| **`EvacuationSite`** | **Phase 2 Future Module** (เมนู "จัดการจุดอพยพ") — Schema ถูกสร้างไว้ แต่ **Phase 1 ยังไม่มี UI/API/Business Logic** และ **ไม่ Seed ข้อมูลจริง** · ใช้ enum `EvacuationSiteType?` (nullable) · แยกจาก `NearestEvacSiteType` (คำตอบครัวเรือน) ถาวร |

> ตาราง `evacuation_site` **อาจถูกสร้างใน Migration แรก** (Prisma สร้างทุกตารางที่ประกาศใน schema) แต่ **ยังไม่ถูกใช้งาน** — ไม่มี Seed, ไม่มี Route, ไม่มี Server Action

### 4.4 Enums (21)

`SheetStatus`, `BatchStatus`, `FieldStatusEnum`, `DiscrepancyResolution`, `FieldQueryStatus`, `ConsentStatus`, `FloorLevel`, `LastEvacuationPlace`, `NearestEvacSiteType`, **`EvacuationSiteType`** *(ใหม่ — Phase 2)*, `VehicleType`, `RiskLevel`, `TriageLevel`, `AuditAction`, `UserRoleEnum`, `SurveyorRiskLevel`, `PregnancyUnit`, `VolunteerApprovalStatus`, `CompareMode`, `IncidentStatus`, `TaskStatus`

---

## 5. Migration Strategy

- **ชื่อ Migration แรก:** `init_schema_v1`
- **คำสั่ง:** `npx prisma migrate dev --name init_schema_v1` (Development เท่านั้น)
- **ตรวจ SQL ก่อนสรุปงาน** — อ่าน `prisma/migrations/<ts>_init_schema_v1/migration.sql` ทั้งไฟล์
- ❌ **ห้ามแก้ SQL Migration ด้วยการเดา**
- 🔴 หาก Prisma จัดการ PostGIS index / SQL บางส่วนไม่ได้ (เช่น GIST spatial, GIN trigram บนคอลัมน์ Unsupported) → **HALT + รายงาน** (Custom SQL เหล่านี้อยู่ใน `database/migrations-draft/` และต้องแทรกเป็น migration แยก 0002–0006 ในลำดับถัดไป — ไม่ทำในรอบนี้ถ้าไม่จำเป็น)

> **หมายเหตุ:** Migration init ที่ Prisma generate จะครอบคลุมตาราง/enum/FK/index ปกติ + คอลัมน์ `Unsupported("geography(...)")`. ส่วน Custom SQL (trigger, spatial GIST, trigram GIN, view, constraint) ใน `database/migrations-draft/` เป็นขั้น formalize ถัดไป (Conflict E/F) — **นอกขอบเขตรอบนี้**

---

## 6. Seed Strategy

| Seed | ไฟล์ | เนื้อหา |
|---|---|---|
| **Production** | `prisma/seed.ts` | Master Data คงที่ขั้นต่ำ: จังหวัด/อำเภอ/ตำบล, ชุมชน 5 แห่ง, ประเภท (อาคาร/กรรมสิทธิ์/เปราะบาง/ช่วยเหลือ/ทรัพยากร/เตือนภัย/อาสา), SystemSetting — **ไม่มี** EvacuationSite, ไม่มีข้อมูลบุคคล |
| **Development** | `prisma/seed.dev.ts` | ข้อมูลสังเคราะห์เท่านั้น: หมู่ตัวอย่าง (UNVERIFIED), RiskWeightConfig (DRAFT/UNAPPROVED) — มี guard กัน `NODE_ENV=production` |

**ข้อห้าม:** ❌ Seed จุดอพยพจริง · ❌ ข้อมูลส่วนบุคคลจริง (ชื่อ/เบอร์/ที่อยู่) · ❌ รหัสผ่าน/Secret จริง · ❌ แบบสอบถามจำนวนมาก · ✅ เฉพาะข้อมูลขั้นต่ำที่จำเป็นต่อการทดสอบ

---

## 7. Rollback (Development เท่านั้น)

```bash
docker compose down       # หยุด container (คงข้อมูลใน volume)
docker compose down -v    # ⚠️ ลบ Development Database ทั้งหมด (volume kuanlang_dev_data)
```

> **⚠️ คำเตือน:** `-v` จะ**ลบข้อมูลใน Development Database ทั้งหมดอย่างถาวร** — ใช้เฉพาะเมื่อต้องการเริ่มใหม่หมด · ห้ามใช้กับฐานข้อมูลที่ไม่ใช่ Development local

---

## 8. Acceptance Criteria

- [x] Docker container `kuanlang_dev_db` ทำงาน
- [x] PostgreSQL healthy (`pg_isready`) — health status `healthy`
- [x] PostGIS พร้อมใช้งาน — `PostGIS_Version()` = **3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1** (extension 3.4.3)
- [x] `pg_trgm` พร้อมใช้งาน — `similarity()` ทำงาน (extension 1.6)
- [x] Migration `init_schema_v1` สำเร็จ — folder `20260721153936_init_schema_v1`, "up to date"
- [x] Prisma Client generate สำเร็จ (v5.22.0)
- [x] Development Seed สำเร็จ — master (5 ชุมชน + master data) + dev (5 หมู่, 12 risk weight DRAFT)
- [x] Unit Tests ผ่าน — **29/29**
- [x] TypeScript (`tsc --noEmit`) ผ่าน — exit 0
- [x] Integration Tests ที่ต้องใช้ DB ผ่าน — **15 รันจริง + ผ่าน, `it.todo` เหลือ 0** · แก้บั๊ก `skipIf` timing แล้ว · BR-44 trigger applied (`20260721231914`) · Partial unique applied (`20260721234500`)

---

## 9. สถานะการดำเนินการ (อัปเดตระหว่างงาน)

| ขั้น | สถานะ |
|---|---|
| เอกสารแผน (ไฟล์นี้) | ✅ สร้างแล้ว |
| `docker-compose.yml` | ✅ สร้างแล้ว (`postgis/postgis:16-3.4`, port 5432) |
| `.env.example` / `.env` | ✅ สร้างแล้ว (`.env.example` committable, `.env` gitignored — local dev เท่านั้น) |
| Docker daemon | ✅ พร้อม (Server 29.2.1, OS linux) |
| Start DB + Extensions | ✅ healthy · PostGIS 3.4.3 · pg_trgm 1.6 |
| Migration `init_schema_v1` | ✅ Apply แล้ว (`20260721153936_init_schema_v1`) |
| Seed Master + Dev | ✅ สำเร็จ |

---

## 10. ผลจริง (Actual Results — 2026-07-21)

| รายการ | ผลจริง |
|---|---|
| Docker image | `postgis/postgis:16-3.4` (container `kuanlang_dev_db`) |
| Database port | `5432` (localhost) |
| PostgreSQL | 16 |
| PostGIS | `PostGIS_Version()` = 3.4 (extension 3.4.3) |
| pg_trgm | 1.6 (`similarity()` ทำงาน) |
| Migration name / folder | `init_schema_v1` / `prisma/migrations/20260721153936_init_schema_v1/` |
| จำนวน Tables (app) | **56** (DB มี 58 = 56 app + `spatial_ref_sys` + `_prisma_migrations`) |
| จำนวน Enums | **21** |
| migration.sql | 56 `CREATE TABLE`, 21 `CREATE TYPE`, **ไม่มี** DROP/TRUNCATE/DELETE/destructive · ไม่มีชื่อ/URL Production · `EvacuationSiteType` 6 ค่า (nullable บน `evacuation_site.type`) · `NearestEvacSiteType` แยกอยู่ (7 ค่า, มี UNKNOWN) · geography 3 จุด (community_boundary.geom MultiPolygon/4326, household.location + evacuation_site.location Point/4326) |
| Development Seed | master: 5 ชุมชน (TK01/PM01/KS01/PW01/NK01, totalHouseholds=null), 2 ตำบล, master data 7 ชุด · dev: 5 หมู่ (UNVERIFIED), 12 risk weight (DRAFT/UNAPPROVED) · **evacuation_site = 0 · household = 0** (ไม่มีข้อมูลบุคคลจริง) |
| Unit Tests | 29/29 ผ่าน |
| Integration Tests | ✅ **15 รันจริง + ผ่าน, `it.todo` เหลือ 0** · แก้บั๊ก `it.skipIf(!dbReady)` (ประเมินก่อน `beforeAll`) → `describe.skipIf(!isLocalDevDb)` (จาก `DATABASE_URL` local), `beforeAll` `$connect()` throw เมื่อต่อไม่ได้, `afterAll` `$disconnect()` · assert: 5 ชุมชนครบ, ไม่มี KL01/HY01, KS01 2 ตำบล isPrimary=false, **household=0**, **evacuation_site=0**, BR-44 4 ข้อ (fixtures `TEST-BR44-*`), partial unique 7 ข้อ (fixtures `TEST-PU-*` — ชุมชน synthetic, ตำบลใช้ของ Seed แบบ read-only) · fixtures สร้าง/ลบใน suite · script `npm run test:integration` |
| **Migration 2 (BR-44)** | ✅ `20260721231914_br44_check_different_entry_person` — `check_different_entry_person()` + `trg_entry_different_person` BEFORE INSERT OR UPDATE OF `sheetId`/`enteredById`/`attemptNo` บน `entry_attempt` · `pg_advisory_xact_lock` ต่อ sheetId กัน race · `id <> NEW.id` กัน UPDATE ชนตัวเอง · ไม่มี destructive SQL · Apply โดยเจ้าของผ่าน `migrate dev` (interactive) |
| **Migration 3 (Partial Unique)** | ✅ `20260721234500_add_community_primary_tambon_partial_unique` — `ux_community_primary_tambon` ON `community_tambon("communityId")` WHERE `"isPrimary" = true` (BR-CT-02/คำตัดสิน #8/Q-17, spec 🟢 A1) · `IF NOT EXISTS` idempotent · ไม่มี destructive SQL/CONCURRENTLY/GIST/GIN/View · Apply โดยเจ้าของผ่าน `migrate dev` (interactive) · **งาน database constraints ชุดแรกครบแล้ว — GIST/GIN/Views เป็นงานถัดไป** |
| TypeScript | `tsc --noEmit` ผ่าน (exit 0) |
| Drift | ไม่มี — `migrate status` "up to date" · `db pull --print` เตือนเฉพาะ 3 geography Unsupported ที่คาดไว้ |
| Phase 2 Models (ยังไม่เปิด) | `EvacuationSite` (ตารางสร้าง แต่ไม่มี Seed/UI/API/Business Logic) |
| Production | **ไม่ถูกแตะ** — ดำเนินการบน local Docker dev เท่านั้น · ไม่ commit/push |
