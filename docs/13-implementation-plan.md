# 13 — Implementation Plan

> ตอบภารกิจที่ 12 — แผนพัฒนาตามลำดับ Dependency
> **ยังไม่เริ่มพัฒนา** — แผนนี้เริ่มได้เมื่อ Phase 0 เสร็จ

---

## แผนภาพ Dependency

```
Phase 0  Document & Requirement Validation      🔴 ต้องเสร็จก่อนทุกอย่าง
   │
   ├──────────────────┐
   ▼                  ▼
Phase 1            Phase 2                       (ทำขนานกันได้บางส่วน)
Foundation    →    Database & PostGIS
                        │
                        ▼
                   Phase 3  Auth & RBAC
                        │
                        ▼
                   Phase 4  Master Data & Area
                        │
                        ▼
                   Phase 5  Batch & Paper
                        │
                        ▼
                   Phase 6  Data Entry รอบ 1     ⭐ Feature แรกที่สร้างคุณค่า
                        │
                        ▼
                   Phase 7  Blind Entry รอบ 2
                        │
                        ▼
                   Phase 8  Discrepancy & Verify
                        │
                        ├──────────┐
                        ▼          ▼
                   Phase 9    Phase 10
                   Coverage   Risk Engine
                        │          │
                        └────┬─────┘
                             ▼
                        Phase 11  Officer Dashboard
                             │
                             ▼
                        Phase 12  GIS
                             │
                             ├──────────┐
                             ▼          ▼
                        Phase 13   Phase 15
                        Public     Reports
                             │
                             ▼
                        Phase 14  Incident & Rescue
                             │
                             ▼
                        Phase 16  Security, Perf, Deploy
```

> **⚠️ ข้อสังเกตเรื่องลำดับ:** เอกสาร v3.0 (S1) แนะนำว่า *"สร้าง Public Landing + Entry Console ก่อนอย่างอื่น"* และจัด M00 ไว้ Phase 1
> **แผนนี้ต่างออกไป** — จัด Public Portal ไว้ Phase 13 เพราะ:
> - Public Portal ต้องแสดง **จุดอพยพ** (ยังไม่มีข้อมูล), **สถิติ** (ต้องมีข้อมูลก่อน), **Heatmap** (ต้องมี Risk ก่อน)
> - ถ้าทำก่อนจะได้หน้าเปล่าที่ไม่มีข้อมูล
>
> **แต่มีทางออก:** ดู **Phase 13-Early** ด้านล่าง — แยกส่วนที่ทำได้ทันทีออกมา

---

## Phase 0 — Document and Requirement Validation

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | เคลียร์ BLOCKER ทั้งหมดและได้คำตอบจากเจ้าของระบบ ก่อนเขียนโค้ดบรรทัดแรก |
| **Scope** | ยืนยัน Requirement, กู้คืน Business Rule, ตัดสินใจเชิงออกแบบ, เคลียร์ PDPA |
| **Dependencies** | — |
| **Database Changes** | ❌ ไม่มี |
| **UI Pages** | ❌ ไม่มี |
| **API** | ❌ ไม่มี |

**งานที่ต้องทำ:**

| # | งาน | ผู้รับผิดชอบ | อ้างอิง |
|---|---|---|---|
| 1 | 🔴 **หาไฟล์เอกสาร v2.0/v1.0** หรือเขียน BR 38 ข้อขึ้นใหม่ → `docs/business-rules.md` | เจ้าของระบบ + ทีมพัฒนา | GAP-D01, Q-03 |
| 2 | 🔴 **เคลียร์ PDPA/Consent กับนิติกร** — กระดาษไม่มีช่อง Consent แต่เก็บข้อมูลสุขภาพ (ม.26) | นิติกร | GAP-R06, Q-04 |
| 3 | 🔴 **ตัดสินชื่อ Role** (`VOLUNTEER`) | เจ้าของระบบ | CONF-02, Q-19 |
| 4 | 🔴 **หา `totalHouseholds` จริงของ 5 ชุมชน** หรือยืนยันว่ายังไม่ทราบ | เจ้าของระบบ | COV-01, Q-01 |
| 5 | 🔴 **ยืนยันรหัสอำเภอ/ตำบล** (9001 vs 9011) | เจ้าของระบบ | SEED-03, Q-24 |
| 6 | 🔴 **ยืนยันตำบลหลักของควนสันติ** | เจ้าของระบบ | SCH-01, Q-17 |
| 7 | 🔴 **ยืนยันรหัสชุมชน** (จะพิมพ์ลงกระดาษ 3,000 ใบ — เปลี่ยนภายหลังไม่ได้) | เจ้าของระบบ | Q-21 |
| 8 | 🔴 **รับรองน้ำหนักความเสี่ยง 115** + Threshold + Hard Rules | เจ้าของระบบ + ผู้เชี่ยวชาญ | RISK-12, Q-26/29 |
| 9 | 🔴 **ตัดสิน Encryption Strategy** (ชื่อเข้ารหัสหรือไม่?) | เจ้าของระบบ + นิติกร | SCH-08, Q-20 |
| 10 | 🔴 **ตรึงเวอร์ชัน Better Auth** | ทีมพัฒนา | SCH-09, Q-19 |
| 11 | 🟠 **บรีฟผู้สำรวจ** — หน่วยอายุครรภ์, พ.ศ./ค.ศ., รูปแบบพิกัด, เขียนเกิน 5 แถว | เจ้าของระบบ | Q-08/10/14 |
| 12 | 🟠 **ยืนยัน Public Map** — Grid + k-anonymity | เจ้าของระบบ | AMB-01, Q-06 |
| 13 | 🟠 **ยืนยัน KPI Coverage** (85% vs 60%) | เจ้าของระบบ | CONF-03, Q-02 |
| 14 | 🟠 อัปเดตเอกสาร v3.0 — ลบสมมติฐาน 600/3,000 | ทีมพัฒนา | CONF-01 |
| 15 | 🟠 เขียน ADR 0001-0010 | ทีมพัฒนา | doc 12 |

**Security Concerns:** 🔴 **PDPA คือ BLOCKER ทางกฎหมาย** — ห้ามเก็บข้อมูลสุขภาพเพิ่มจนกว่าจะเคลียร์

**Acceptance Criteria:**
- [ ] `docs/business-rules.md` มี BR ครบทุกข้อที่ถูกอ้างถึง และได้รับการรับรอง
- [ ] นิติกรให้ความเห็นเป็นลายลักษณ์อักษรเรื่อง Consent
- [ ] คำถามใน [14-open-questions.md](14-open-questions.md) ที่ระดับ 🔴 ได้คำตอบครบ
- [ ] ADR ทั้ง 10 ฉบับมีสถานะ "Accepted"

**Required Tests:** ❌ ไม่มี (ไม่มีโค้ด)

**Definition of Done:**
- ✅ ไม่มี BLOCKER ค้างในเอกสาร 01-15
- ✅ เจ้าของระบบลงนามรับรอง Requirement
- ✅ ทีมพัฒนาเข้าใจตรงกันว่าจะไม่มีการเปลี่ยน Requirement ใหญ่กลางทาง

---

## Phase 1 — Project Foundation

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | โครงสร้างโปรเจกต์ + Tooling + CI พร้อมใช้ |
| **Scope** | Next.js + TS strict + Tailwind + shadcn/ui + Vitest + Playwright + Docker + ESLint + Git |
| **Dependencies** | Phase 0 |
| **Database Changes** | ❌ (แค่ container ขึ้น) |
| **UI Pages** | Layout + Health check |
| **API** | `GET /api/health` |

**งานหลัก:**
1. `create-next-app` (App Router, TS strict)
2. โครงสร้างโฟลเดอร์ตาม [12-proposed-architecture.md](12-proposed-architecture.md)
3. **ESLint rules ที่บังคับ:** ห้าม `prisma.*` นอก `db/repositories/`, ห้าม `domain/` import จาก `features/`, ห้าม `any`
4. Docker Compose (app + db + cache) — `docker compose up` 1 คำสั่ง
5. CI: typecheck → lint → test → build
6. Thai font + PDF spike (**RK-11** — ทดสอบตั้งแต่ Sprint 1)
7. `.env.example` + `.gitignore` (**ห้าม commit `.env`**)

**Security Concerns:** `.gitignore` ต้องกัน `.env`, dump, ข้อมูลจริง

**Acceptance Criteria:**
- [ ] `docker compose up` → เปิด `/` ได้
- [ ] `npm run typecheck && lint && test` ผ่านหมด
- [ ] **PDF ภาษาไทย render ได้ ไม่มีสี่เหลี่ยม/สระลอย** (RK-11)
- [ ] ESLint จับได้เมื่อเรียก `prisma.*` นอก repository

**Required Tests:** Smoke test, PDF Thai render test

**DoD:** TS ไม่มี error · Lint ผ่าน · CI เขียว · Docker 1 คำสั่ง

---

## Phase 2 — Database and PostGIS

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Schema ที่แก้ BLOCKER แล้ว + Migration ที่รันซ้ำได้ + ไม่มี Drift |
| **Scope** | แก้ Schema ตาม [15-database-fix-plan.md](15-database-fix-plan.md) + Migration 0001-0006 |
| **Dependencies** | Phase 0 (ต้องรู้คำตอบก่อน), Phase 1 |
| **UI Pages** | ❌ |
| **API** | ❌ |

**Database Changes (ทั้งหมด — ดู doc 15):**

| # | การเปลี่ยนแปลง | แก้ปัญหา |
|---|---|---|
| 1 | `CommunityTambon` (M:N + `isPrimary`) + ลบ `Community.tambonId` | SCH-01 |
| 2 | `CommunityBoundary` (MultiPolygon + version) | SQL-08 |
| 3 | Coverage fields (`totalHouseholds Int?` ฯลฯ) + ลบ `targetHouseholds` | SCH-04, COV-01 |
| 4 | `UserRoleEnum`: `RESCUE_VOLUNTEER` → `VOLUNTEER` | SCH-05 |
| 5 | ลบ `@@unique([houseNo, mooId, tambonId])` | QM-03 |
| 6 | `CriticalFieldConfig` + `CompareMode` | GAP-R03 |
| 7 | `RiskWeightVersion` + `RiskHardRule` + Risk fields (raw/max/normalized/absolute) | RISK-01/07/09 |
| 8 | `VolunteerProfile` + `VolunteerProfileSkill` | GAP-R01 |
| 9 | `EmergencyContact` | GAP-R02 |
| 10 | `UserAreaScope` | SCH-10 |
| 11 | ฟิลด์จากกระดาษที่ขาด (`communityNameOnPaper`, `coordinateRawText`, `floodDepthMetersRaw/CmRaw`, `hasNoResources`, `volunteerNotAvailable`, `assistanceTotalPersonCount`, `pregnancyRawText/Unit`) | QM-01/04/07/08/09/12, QM-06 |
| 12 | `SurveyorRiskLevel` enum (3 ระดับ) | AMB-05 |
| 13 | `Unsupported("geography(...)")` columns | SQL-02 |
| 14 | `IncidentCommunity` (แทน `String[]`) | SCH-21 |
| 15 | Soft delete + FK ที่ขาด + Index ที่ขาด | SCH-02/07/16/20 |
| 16 | `extensions = [postgis, pg_trgm]` | SQL-14 |
| 17 | Trigger: `check_different_entry_person` ⭐ | **SCH-03** |
| 18 | Trigger: `update_batch_counts` (แก้ INSERT/DELETE/ย้าย + `receivedCount`) | SQL-04 |
| 19 | Function: `release_expired_locks` (แก้ Race + Audit) | SQL-05 |
| 20 | Constraint ทั้งหมดเป็น `DO $$ IF NOT EXISTS` | SQL-03 |
| 21 | แก้ `ck_member_count` (0-5000) + `ck_risk_score` (raw/normalized) | SQL-12, RISK-01 |
| 22 | View: `v_community_coverage`, `v_household_geo_internal`, `v_public_risk_grid` | COV-01/02, SQL-06 |

**Security Concerns:**
- 🔴 **Encryption Strategy ต้องตัดสินก่อน** — กระทบโครงสร้างคอลัมน์ (SCH-08)
- RLS setup (household, vulnerable_person)
- Audit GRANT/REVOKE

**Acceptance Criteria:**
- [ ] `prisma format` + `prisma validate` ผ่าน
- [ ] `prisma migrate dev` → `prisma migrate dev` อีกครั้ง → **ไม่มี Drift**
- [ ] รัน Migration ซ้ำได้โดยไม่ Error (Idempotent)
- [ ] **`ck_risk_score` ยอมรับ rawScore = 115** (RISK-01)
- [ ] **`ck_member_count` ยอมรับ 500** (โรงเรียน — SQL-12)
- [ ] Trigger `check_different_entry_person` ปฏิเสธคนเดียวกันคีย์ 2 รอบ
- [ ] Batch Trigger ทำงานถูกต้องทั้ง INSERT/DELETE/UPDATE/ย้าย Batch
- [ ] `v_community_coverage` คืน **NULL** เมื่อ `totalHouseholds IS NULL` (ไม่ใช่ 0)

**Required Tests:**
- Integration: Migration idempotency
- Integration: ทุก Trigger (INSERT/UPDATE/DELETE/move)
- Integration: ทุก CHECK constraint (ค่าขอบเขต)
- Integration: `v_community_coverage` กับ `totalHouseholds = NULL`
- Integration: SQL ทุกไฟล์รันได้กับ DB จริงใน CI

**DoD:** Prisma validate ผ่าน · Migration idempotent · ไม่มี Drift · Trigger/Constraint มี Test ครบ

---

## Phase 3 — Authentication and RBAC

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Login ได้ + RBAC บังคับที่ Server ครบทุก Role |
| **Scope** | Better Auth + Policy + Scope Resolver + Audit + RLS |
| **Dependencies** | Phase 2 |
| **DB Changes** | Better Auth tables (2FA, lockout) |
| **UI** | `/(auth)/login`, `/forgot-password`, `/reset-password`, `/admin/users` |
| **API** | `POST /api/auth/[...all]` |

**งานหลัก:**
1. Better Auth config (เวอร์ชันที่ตรึงไว้) + `@better-auth/cli generate`
2. `buildAuthContext()` · `assertCan()` · `scope-resolver` (Community + **Area Scope**)
3. Policy ทุก Module (Pure Function)
4. Audit decorator (บังคับ)
5. RLS สำหรับ `household`, `vulnerable_person`
6. Seed ผู้ใช้ทดสอบครบ **9 Roles** (Dev-only)

**Security Concerns:** 🔴 **นี่คือ Phase ที่สำคัญที่สุดด้าน Security** — NFR-S-06/07 ขึ้นกับ Phase นี้ทั้งหมด

**Acceptance Criteria:**
- [ ] Login/Logout/Reset password ทำงาน
- [ ] Auto-logout 30 นาที + **ปลด Lock ใบ**
- [ ] Policy Unit Test ครบ **10 Roles × ทุก Action**
- [ ] Area Scope → Community resolution ถูกต้อง (**ควนสันติปรากฏเมื่อเลือกตำบลควนลัง *หรือ* หาดใหญ่**)
- [ ] RLS ทำงาน — แม้ Query ตรงก็ไม่เห็นข้ามชุมชน

**Required Tests:**
- 🔴 Security: Test 1-18 ใน [10-rbac-pdpa-matrix.md](10-rbac-pdpa-matrix.md) หัวข้อ 7
- Unit: Policy ทุก Role
- Integration: RLS bypass attempt

**DoD:** RBAC ตรวจ Server ทุกครั้ง · Security Test ผ่านหมด · ไม่มี High/Critical

---

## Phase 4 — Master Data and Area Management

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Master Data + พื้นที่จริง + **5 ชุมชนจริง** พร้อมใช้ |
| **Scope** | Seed (Production/Dev แยก) + Admin UI สำหรับ Community |
| **Dependencies** | Phase 2, 3 |
| **DB Changes** | ❌ (ใช้ที่สร้างใน Phase 2) |
| **UI** | `/admin/communities`, `/admin/master-data` (view + แก้ label) |
| **API** | Server Actions |

**งานหลัก:**
1. แยก Seed: `seeds/production/` + `seeds/development/`
2. Seed พื้นที่จริง (รหัสที่ยืนยันแล้ว — Q-24)
3. **Seed 5 ชุมชนจริง + `CommunityTambon`** (ควนสันติ 2 ตำบล)
4. Seed Master Data 7 ชุด (ตรงกระดาษ + เพิ่ม `hasNoResources`/`volunteerNotAvailable` handling)
5. Seed `CriticalFieldConfig`
6. **Admin UI: แก้ `totalHouseholds`** (⭐ สำคัญที่สุด — Coverage ขึ้นกับสิ่งนี้)
7. Guard: `NODE_ENV === 'production'` → ห้ามรัน dev seed
8. **ขั้นตอนลบชุมชนเก่า** (SEED-11)

**Security Concerns:** ⚠️ **ห้ามใช้ข้อมูลประชาชนจริงเป็น Seed** (CLAUDE.md)

**Acceptance Criteria:**
- [ ] Seed รันซ้ำได้ (Idempotent) — รัน 3 ครั้งได้ผลเหมือนเดิม
- [ ] **ชุมชนควนสันติมี 2 แถวใน `CommunityTambon`** และมี `isPrimary` เพียง 1
- [ ] `totalHouseholds` = NULL ทั้ง 5 ชุมชน (ยังไม่ทราบ)
- [ ] ไม่มี KL01/KL02/KL03/HY01/HY02 เหลืออยู่
- [ ] Master Data ตรงกระดาษ 100% (มี Test เทียบ)
- [ ] Dev seed รันใน production ไม่ได้

**Required Tests:**
- Integration: Seed idempotency (รัน 3 ครั้ง)
- Unit: Master Data ตรงกับรายการในกระดาษ
- Integration: Area Scope → Community (ควนสันติ)

**DoD:** Seed idempotent · ชุมชนจริง 5 แห่ง · ไม่มีข้อมูลสมมติ

---

## Phase 5 — Batch and Paper Management (M02)

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | รับปึก → สร้าง Batch → พิมพ์เลขใบ → ติดตาม |
| **Scope** | FR-BAT-01..08 |
| **Dependencies** | Phase 3, 4 |
| **UI** | `/batches`, `/batches/new`, `/batches/:id`, `/batches/:id/labels` |
| **API** | `POST /api/batches`, `GET /api/batches`, `POST /api/batches/:id/close` |

**งานหลัก:**
1. CRUD Batch (COORDINATOR)
2. Generate `sheetNo` (`SHEET-{ชุมชน}-{batch}-{ลำดับ}`) — **ใช้รหัสชุมชนที่ยืนยันแล้ว**
3. พิมพ์สติกเกอร์ (PDF ไทย)
4. ติดตามสถานะรายใบ (10 สถานะ)
5. **แสดงใบที่หาย** (`expectedCount - receivedCount`)
6. ปิด Batch + ตรวจเงื่อนไข BP-05
7. Lock mechanism + `release-expired-locks` job (BullMQ เริ่มใช้ที่นี่)
8. Upload สแกน (MinIO + Signed URL)

**Security Concerns:** สแกนกระดาษ = **L4** (BR-62) → เข้ารหัส + Signed URL + Audit

**Acceptance Criteria:**
- [ ] สร้าง Batch 600 ใบ → เกิด `PaperSheet` 600 แถว พร้อม `sheetNo` ไม่ซ้ำ
- [ ] **`receivedCount` คำนวณถูกต้อง** (SQL-04)
- [ ] ปิด Batch ไม่ได้เมื่อยังมีใบ LOCKED / Discrepancy ค้าง
- [ ] Lock หมดอายุ → ปลดอัตโนมัติ + **มี Audit**
- [ ] **ย้าย sheet ข้าม Batch → Count ทั้ง 2 Batch ถูกต้อง**

**Required Tests:**
- Integration: Batch counters ทุกกรณี (INSERT/DELETE/move/status)
- Integration: BP-05 เงื่อนไขปิด Batch
- Integration: Lock expiry + concurrent pickup
- E2E: สร้าง Batch → พิมพ์เลข → ปิด Batch

**DoD:** Counter ถูกต้องทุกกรณี · Lock ปลอดภัย · สแกนเข้ารหัส

---

## Phase 6 — Data Entry Round 1 (M03) ⭐

> **นี่คือ Feature แรกที่สร้างคุณค่าจริง** — และเป็น Module ที่สำคัญที่สุดของระบบ

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | คีย์ 1 ใบครบ ≤4 นาที ด้วยคีย์บอร์ดล้วน ไม่แตะเมาส์ |
| **Scope** | FR-ENT-01..17 |
| **Dependencies** | Phase 5 |
| **UI** | `/entry` (ปุ่มเดียว), `/entry/:sheetId` |
| **API** | `POST /api/entry/pickup`, `/entry/:id/submit`, `/entry/:id/draft`, `/entry/check-duplicate`, `/entry/validate-coord` |

**งานหลัก:**
1. **Pickup** — `FOR UPDATE SKIP LOCKED` (T7)
2. **ฟอร์มเรียงตรงกระดาษ 100%** — ส่วน 0→1→2→3→4→5 + ส่วนผู้สำรวจ
3. **Keyboard-only** — Tab order, 1-9/Space, Ctrl+Enter, F1
4. **F2 = ILLEGIBLE / F3 = BLANK_IN_PAPER** — ทุกช่อง
5. **Grid Mode** ตารางกลุ่มเปราะบาง (ไม่จำกัดแถว)
6. Skip Logic (ไม่มีเปราะบาง → ข้ามส่วน 2)
7. Auto-save Draft ทุก 10 วินาที (**ต้องไม่ทำให้ข้อมูลหาย**)
8. Mini map + Coordinate validation
9. ตรวจซ้ำ (Soft Check → `hasDuplicateFlag`)
10. **Domain Services:** coordinate parser (QM-04), flood depth (QM-08), pregnancy unit (QM-06), Buddhist date (QM-02)
11. `ConfidentialityAgreement` gate (BR-59)

**Security Concerns:**
- 🔴 **BR-58: DATA_ENTRY ห้าม Query** — ต้องผ่าน Security Test
- 🔴 Mini map ต้องไม่แสดงหมุดบ้านอื่น (CONF-06)

**Acceptance Criteria:**
- [ ] 🔴 **คีย์ครบ 1 ใบด้วยคีย์บอร์ดล้วน — แตะเมาส์ 0 ครั้ง** (NFR-E-03)
- [ ] 🔴 **เวลาคีย์ ≤4 นาที** (NFR-E-01)
- [ ] Tab latency ≤50ms (NFR-E-02)
- [ ] บันทึกใบ ≤1 วิ (NFR-P-03)
- [ ] **ฟอร์มเรียงตรงกระดาษ 100%** — ตรวจทีละข้อกับ PDF
- [ ] F2/F3 ใช้ได้ทุกช่อง + บันทึก `FieldStatus` ถูกต้อง
- [ ] **ไม่บังคับให้เดาค่าที่อ่านไม่ออก** — Submit ได้แม้มี ILLEGIBLE
- [ ] Draft ไม่หายเมื่อ Lock หมดอายุ
- [ ] `surveyedAt` ไม่ default เป็น now() (BR-47)
- [ ] 2 คนกด Pickup พร้อมกัน → ได้คนละใบ

**Required Tests:**
- 🔴 **E2E Keyboard:** คีย์ 1 ใบไม่แตะเมาส์ (100%)
- 🔴 **E2E Speed:** จับเวลา ≤4 นาที
- 🔴 **Security:** DATA_ENTRY Query ไม่ได้ / Export ไม่ได้ / เห็นเฉพาะใบที่ Lock
- Unit: coordinate parser (ทุกรูปแบบใน QM-04)
- Unit: flood depth (ม.+ซม. → ซม.)
- Unit: pregnancy unit conversion
- Unit: Buddhist date → Gregorian
- Integration: Concurrent pickup (2 คนไม่ได้ใบเดียวกัน)
- Integration: Auto-save + Lock expiry

**DoD:** Keyboard test 100% · Speed ≤4 นาที · Security ผ่าน · ฟอร์มตรงกระดาษ

---

## Phase 7 — Blind Entry Round 2

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Entry 2 แบบ Blind โดยคนละคน — บังคับได้จริง |
| **Scope** | FR-VER-01/02/03 |
| **Dependencies** | Phase 6 |
| **UI** | `/verify/:sheetId`, `/admin/critical-fields` |
| **API** | `POST /api/verify/pickup`, `/verify/:id/submit` |

**งานหลัก:**
1. `CriticalFieldConfig` CRUD (ADMIN) + Seed
2. **Blind Entry Form** — แสดงเฉพาะ Critical Fields
3. 🔴 **บังคับ SoD-01** — App (pickup query กรอง) + **DB Trigger**
4. **ห้ามส่ง payload ของ Entry 1 ไป Client** (Blind)
5. `isBlind = true`

**Security Concerns:**
- 🔴 **SCH-03 — นี่คือเหตุผลหลักของ Phase นี้**
- 🔴 Blind ต้องบังคับที่ Server (ห้ามส่งข้อมูลไป Client แล้วซ่อนใน UI)

**Acceptance Criteria:**
- [ ] 🔴 **คนเดียวกันคีย์ Entry 1+2 → ถูกปฏิเสธที่ App**
- [ ] 🔴 **คนเดียวกันคีย์ Entry 1+2 → ถูกปฏิเสธที่ DB (Trigger)** แม้เรียก SQL ตรง
- [ ] 🔴 **Response ของ `/verify/pickup` ต้องไม่มีค่าของ Entry 1 เลย** (ตรวจ network payload)
- [ ] Entry 2 แสดงเฉพาะ Critical Fields ตาม Config
- [ ] เวลาคีย์ Entry 2 ≤3 นาที
- [ ] เมื่อคนคีย์เหลือน้อยกว่า 2 คน → ระบบแจ้งชัดเจน (ไม่ใช่ error งงๆ)

**Required Tests:**
- 🔴 Security: SoD-01 (App + DB)
- 🔴 Security: Blind — inspect API response ไม่มีข้อมูล Entry 1
- Integration: Pickup กรองใบที่ตัวเองคีย์แล้ว
- Unit: Critical Field resolution

**DoD:** SoD บังคับ 2 ชั้น · Blind พิสูจน์ได้จาก network · Test ผ่าน

---

## Phase 8 — Discrepancy and Verification (M04, M05, M07)

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | เทียบ → ตัดสิน → VERIFIED |
| **Scope** | FR-VER-04..07 + Field Query + Merge |
| **Dependencies** | Phase 7 |
| **UI** | `/discrepancies`, `/discrepancies/:id`, `/field-queries`, `/duplicates` |
| **API** | `POST /api/discrepancies/:id/resolve` |

**งานหลัก:**
1. **Discrepancy Engine** (Pure) — เทียบตาม `CompareMode` + **Normalize Rule**
2. หน้าจอเทียบข้าง-ข้าง + เลือกค่า (Entry1/Entry2/ค่าที่ 3/ILLEGIBLE/UNRESOLVABLE)
3. 🔴 **บังคับ SoD-02** (ผู้ตัดสิน ≠ ผู้คีย์)
4. Field Query Loop (BP-04) + PDF ใบคำถาม
5. Duplicate Merge (M07)
6. Error Rate (FR-VER-07)
7. `HouseholdVersion` เมื่อแก้หลัง VERIFIED

**Acceptance Criteria:**
- [ ] Entry 1 = Entry 2 → **VERIFIED อัตโนมัติ**
- [ ] Entry 1 ≠ Entry 2 → `DISCREPANCY` + เข้าคิว
- [ ] **Normalize ทำงาน** — "081-234-5678" = "0812345678" → ไม่เป็น Discrepancy
- [ ] 🔴 ผู้คีย์ Resolve ใบตัวเองไม่ได้ (SoD-02)
- [ ] Merge → `MERGED_INTO` + `hasDuplicateFlag` + ไม่นับซ้ำใน Coverage

**Required Tests:**
- 🔴 Unit: Discrepancy Engine ทุก CompareMode
- 🔴 Unit: Normalize (phone/text/numeric tolerance/set)
- Security: SoD-02
- E2E: Double-entry ครบ flow → VERIFIED

**DoD:** Engine มี Unit Test ครบ · SoD บังคับ · Error rate ≤0.5% วัดได้

---

## Phase 9 — Coverage and Data Quality (M06)

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Coverage ที่ถูกต้อง + **"ยังคำนวณไม่ได้" ไม่ใช่ "0%"** |
| **Scope** | FR-CVG-01..05 |
| **Dependencies** | Phase 8, 4 |
| **UI** | `/entry-dashboard`, Coverage Badge ทุกหน้า |
| **API** | `GET /api/stats/coverage`, `/api/stats/entry-throughput` |

**งานหลัก:**
1. `domain/coverage/coverage.ts` (Pure — ห้ามหารศูนย์)
2. `v_community_coverage`
3. **Coverage Badge Component** (ใช้ทุกหน้า)
4. Entry Dashboard (Throughput + ETA)
5. **Banner เตือนถาวรเมื่อ `totalHouseholds` = NULL**
6. `EntryStats` job

**Acceptance Criteria:**
- [ ] 🔴 **`totalHouseholds = NULL` → แสดง "ยังคำนวณไม่ได้"** (ไม่ใช่ 0%)
- [ ] 🔴 **`coveragePercent > 60` → ผ่าน; = 60 พอดี → ไม่ผ่าน**
- [ ] Survey Coverage แยกจาก Verified Coverage
- [ ] **ไม่นับซ้ำ / ไม่นับ Duplicate / Merged / Draft**
- [ ] **`totalPopulation` ไม่เพี้ยนจาก fan-out** (COV-02)
- [ ] ทุก Dashboard มี Badge + Denominator

**Required Tests:**
- 🔴 Unit: Coverage ทุกกรณีในตาราง [06](06-coverage-model-review.md) หัวข้อ 3.5 (รวม NULL, 0, ขอบเขต 60)
- Integration: ไม่นับซ้ำ (ครัวเรือนมีเปราะบาง 3 คน → นับ 1)

**DoD:** Coverage ถูกต้อง · NULL แสดงถูก · Badge ทุกหน้า

---

## Phase 10 — Risk Engine (M09, M08)

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | Risk ที่ปลอดภัย มี Version อธิบายได้ ใช้เฉพาะ VERIFIED |
| **Scope** | FR-RSK-05/07/08 + Triage + Vulnerable Registry |
| **Dependencies** | Phase 8, 9 |
| **UI** | `/vulnerable`, `/households/:id`, `/admin/risk-config` |
| **API** | Server Actions |

**งานหลัก:**
1. `domain/risk/risk-engine.ts` (Pure) — raw/max/normalized/**absolute**
2. `domain/risk/confidence.ts` — **weight-based + verification level**
3. `domain/risk/hard-rules.ts` — ติดเตียง/ฟอกไต → ≥HIGH
4. `domain/triage/triage.ts` — **อิง `surveyedAt`** (BR-48/57)
5. `RiskWeightVersion` CRUD + Preview ผลกระทบ
6. Recalculation job
7. `flag-stale-triage` job
8. Vulnerable Registry + Priority List (P1)

**Security Concerns:** ข้อมูล L4 → RBAC + Audit ทุกการเปิดดู

**Acceptance Criteria:**
- [ ] 🔴 **ไม่คำนวณ Risk จนกว่า VERIFIED** (FR-RSK-07) — บังคับที่ Type + Runtime
- [ ] 🔴 **rawScore = 115 บันทึกได้** (ไม่ติด CHECK)
- [ ] 🔴 **ข้อมูลขาด → Confidence ต่ำ ไม่ใช่คะแนนพุ่ง 100** (RISK-02)
- [ ] `riskConfidence < 0.6` → แสดง "ข้อมูลไม่พอประเมิน"
- [ ] Threshold ไม่มีช่องว่าง (25.5 มีระดับ)
- [ ] Hard Rule: ติดเตียง → ≥HIGH
- [ ] เปลี่ยนน้ำหนัก → Version ใหม่ + คะแนนเก่ายังอธิบายได้
- [ ] อายุครรภ์คำนวณจาก `surveyedAt` ไม่ใช่ now()

**Required Tests:**
- 🔴 Unit: Risk Engine ≥90% coverage (Testing Strategy)
- 🔴 Unit: กรณี B/C ใน RISK-02 (ข้อมูลขาด 1 ปัจจัย)
- 🔴 Unit: Threshold ขอบเขต (25, 25.5, 26, 50, 75, 75.1)
- 🔴 Unit: Hard Rules
- Unit: Confidence (กรณี X/Y ใน RISK-05)
- Integration: Risk ไม่ถูกคำนวณเมื่อ ≠ VERIFIED

**DoD:** Pure + Unit Test ≥90% · มี Version · ไม่คำนวณจาก Unverified

---

## Phase 11 — Officer Dashboard (M11, M12)

| หัวข้อ | รายละเอียด |
|---|---|
| **เป้าหมาย** | ตอบได้ว่า "ต้องช่วยใครก่อน" |
| **Dependencies** | Phase 9, 10 |
| **UI** | `/dashboard`, `/dashboard/officer`, `/households`, `/vulnerable` |
| **API** | `GET /api/stats/overview` |

**Acceptance:** Dashboard ≤2 วิ P95 · **Coverage Badge + Denominator ทุกตัว** · ค้นหา P1 ≤10 วิ · EXECUTIVE ไม่เห็น PII

**Tests:** Perf(P95) · Security(EXEC/RESEARCHER) · E2E

---

## Phase 12 — GIS (M10, M13)

| หัวข้อ | รายละเอียด |
|---|---|
| **Dependencies** | Phase 11 |
| **UI** | `/map`, `/resources` |
| **API** | `GET /api/gis/households.geojson`, `/gis/coverage.geojson`, `POST /api/gis/spatial-query` |

**งานหลัก:** MapLibre + bbox query (`&&`) + `ST_DWithin` + **`ST_Covers`** (ไม่ใช่ ST_Contains) + `CommunityBoundary` + **โซนสีเทา** + EvacuationSite CRUD

**Acceptance:** Map 5,000 หมุด ≤3 วิ · โซนไม่มีข้อมูลเป็นสีเทา · ขอบเขตชุมชนแสดงถูก · **`FAR_FROM_EVAC` คำนวณได้** (ต้องมี EvacuationSite ก่อน)

**Tests:** Perf(5,000) · Integration(spatial)

---

## Phase 13 — Public Portal (M00, M19)

| หัวข้อ | รายละเอียด |
|---|---|
| **Dependencies** | Phase 12 (Heatmap), Phase 3 (Volunteer auth) |
| **UI** | `/(public)/*`, `/admin/volunteers`, `/volunteer/community`, `/my-tasks` |
| **API** | `GET /api/public/*`, `POST /api/public/volunteer/register` |

### ⭐ Phase 13-Early (ทำได้ตั้งแต่หลัง Phase 4)

> เพื่อตอบ S1 (*"สร้าง Public Landing ก่อนอย่างอื่น"*) และ PP1/RK-P2 ซึ่งเป็นความเสี่ยง 🔴 วิกฤต
> **ส่วนที่ไม่ต้องพึ่งข้อมูลครัวเรือน ทำได้ทันที:**

| ส่วน | Dependency | ทำได้เมื่อ |
|---|---|---|
| Landing + Layout + Mobile-first | — | Phase 1 |
| **เบอร์ฉุกเฉิน** (FR-PUB-03) | `EmergencyContact` | **Phase 4** ⭐ |
| **จุดอพยพ + แผนที่** (FR-PUB-02) | `EvacuationSite` | **Phase 4** ⭐ (ถ้าได้ข้อมูลจากเทศบาล) |
| หน้าคำแนะนำฉุกเฉิน (FR-PUB-07) | — | Phase 1 |
| ISR + CDN | — | Phase 1 |
| สถานะเหตุการณ์ (FR-PUB-04) | `Incident` | Phase 14 |
| สถิติรวม (FR-PUB-05) | ข้อมูล VERIFIED | Phase 9 |
| **Heatmap Grid** (FR-PUB-06) | Risk + GIS | Phase 12 |
| สมัครอาสาสมัคร (FR-VOL-01) | `VolunteerProfile` + Auth | Phase 3 |

> **ข้อเสนอ:** ทำ **Phase 13-Early หลัง Phase 4** → ได้หน้าที่ช่วยชีวิตได้จริง (จุดอพยพ + เบอร์ฉุกเฉิน) เร็วที่สุด
> แล้วเติม Heatmap/สถิติภายหลังเมื่อมีข้อมูล → **ตรงกับเจตนาของ S1 โดยไม่ต้องรอข้อมูลครบ**

**Security Concerns:** 🔴 **FR-PUB-11 (ห้าม PII)** + BR-66/67 + k-anonymity + RK-V1 (อาสาปลอม)

**Acceptance:**
- [ ] 🔴 โหลด ≤2 วิ บน 3G (NFR-PUB-01)
- [ ] 🔴 **ไม่มี PII ใน Response ใดๆ** — ตรวจทุก endpoint
- [ ] 🔴 **Grid cell < 5 ครัวเรือน ไม่ปรากฏ** (k-anonymity)
- [ ] เบอร์ฉุกเฉิน**กดโทรได้**
- [ ] ใช้ได้เมื่อ Origin ล่ม (CDN stale)
- [ ] อาสาสมัครต้องรออนุมัติก่อน Login (BR-68)

**Tests:** 🔴 Perf(3G) · 🔴 Security(no-PII, k≥5) · E2E(mobile 320px)

---

## Phase 14 — Incident and Rescue Task (M14, M15)

| หัวข้อ | รายละเอียด |
|---|---|
| **Dependencies** | Phase 13 (Volunteer), Phase 10 (Triage) |
| **UI** | `/incidents`, `/incidents/:id`, `/my-tasks` |

**Security Concerns:** 🔴 **BR-65 + VOL-EXP-01..05** — VOLUNTEER เห็น PII เฉพาะ Task ที่มอบหมาย + Incident ACTIVE

**Acceptance:**
- [ ] 🔴 **Incident CLOSED → VOLUNTEER ไม่เห็น PII ทันที** (VOL-EXP-03)
- [ ] 🔴 Task COMPLETED → ไม่เห็น PII (VOL-EXP-02)
- [ ] 🔴 ดู Task ที่ไม่ได้มอบหมาย → 403
- [ ] ส่งเฉพาะข้อมูลที่จำเป็นต่อภารกิจ (VOL-EXP-05)
- [ ] ทุกการดู PII → Audit
- [ ] Priority P1-P4 (ถ้ายืนยัน SCH-15)

**Tests:** 🔴 Security(VOL-EXP ทุกข้อ) · E2E(incident flow)

---

## Phase 15 — Reports and Exports (M16)

| หัวข้อ | รายละเอียด |
|---|---|
| **Dependencies** | Phase 11 |
| **UI** | `/reports` |
| **API** | `POST /api/exports`, `GET /api/exports/:jobId/download` |

**Acceptance:**
- [ ] 🔴 **Coverage Watermark ทุกฉบับ** (FR-CVG-05) — รวมกรณี "ยังคำนวณไม่ได้"
- [ ] 🔴 PDF ไทยไม่มีสี่เหลี่ยม/สระลอย
- [ ] 🔴 RESEARCHER Export → Anonymized ทุกแถว
- [ ] 🔴 DATA_ENTRY/VERIFIER Export ไม่ได้
- [ ] เตือนเมื่อ Coverage <80% หรือ NULL
- [ ] Export หมดอายุ 7 วัน

**Tests:** 🔴 Security(Export RBAC, Anonymize) · E2E(PDF Thai)

---

## Phase 16 — Security, Performance and Deployment

| หัวข้อ | รายละเอียด |
|---|---|
| **Dependencies** | ทุก Phase |

**งานหลัก:**
1. 🔴 **Encryption implementation** (SCH-08) — ถ้ายังไม่ทำใน Phase 2
2. 2FA (ADMIN) + Account lockout
3. **PDPA:** `PdpaRequest` flow + Retention job (BR-30) + Anonymize + **ถอน Consent มีผลจริง**
4. RoPA + Incident Response Plan
5. Performance tuning (NFR-P-01..04)
6. Load test (**≥10,000 concurrent** Public, ≥50 ระบบหลัก)
7. Backup + **Restore test**
8. Monitoring + Alert + **PII redaction ใน log**
9. Security audit (OWASP)
10. Production deploy + Runbook

**Acceptance:**
- [ ] 🔴 ข้อมูล L4 เข้ารหัสจริง (ตรวจจาก DB dump)
- [ ] 🔴 ไม่มีช่องโหว่ High/Critical
- [ ] 🔴 **Restore จาก Backup สำเร็จ** (RTO ≤4 ชม.)
- [ ] 🔴 **ไม่มี PII ใน Application Log**
- [ ] NFR ทุกข้อผ่าน
- [ ] Retention job ลบข้อมูลเกิน 5 ปีได้ (Audit Trigger ไม่บล็อก)

**Tests:** 🔴 Security(OWASP เต็ม) · 🔴 Load · 🔴 Restore · Perf(NFR ทุกข้อ)

---

## สรุปตาราง Phase

| Phase | ชื่อ | Dependencies | Module | ความเสี่ยง |
|---|---|---|---|---|
| **0** | Document & Requirement Validation | — | — | 🔴 **PDPA + BR หาย** |
| 1 | Project Foundation | 0 | — | 🟡 PDF ไทย |
| **2** | Database & PostGIS | 0, 1 | — | 🔴 **Encryption + Drift** |
| **3** | Auth & RBAC | 2 | M01 | 🔴 **NFR-S-06/07** |
| 4 | Master Data & Area | 2, 3 | M04, M17 | 🟠 รหัสพื้นที่ |
| 5 | Batch & Paper | 3, 4 | M02 | 🟠 Trigger + Lock |
| **6** | **Data Entry รอบ 1** ⭐ | 5 | M03 | 🔴 **≤4 นาที + Keyboard** |
| **7** | Blind Entry รอบ 2 | 6 | M03 | 🔴 **SoD-01** |
| 8 | Discrepancy & Verify | 7 | M04, M05, M07 | 🟠 Normalize |
| 9 | Coverage & Quality | 8, 4 | M06 | 🔴 **RK-C1** |
| 10 | Risk Engine | 8, 9 | M09, M08 | 🔴 **RISK-01/02** |
| 11 | Officer Dashboard | 9, 10 | M11, M12 | 🟡 Perf |
| 12 | GIS | 11 | M10, M13 | 🟡 Perf |
| **13** | Public Portal (+ **13-Early** หลัง Ph.4) | 12 / 4 | M00, M19 | 🔴 **PII + Traffic** |
| 14 | Incident & Rescue | 13, 10 | M14, M15 | 🔴 **BR-65** |
| 15 | Reports & Exports | 11 | M16 | 🟠 PDF ไทย |
| 16 | Security, Perf, Deploy | ทั้งหมด | M18 | 🔴 **Encryption + PDPA** |

---

## เปรียบเทียบกับแผนในเอกสาร v3.0

| ประเด็น | เอกสาร v3.0 | แผนนี้ | เหตุผล |
|---|---|---|---|
| **Public Portal** | Phase 1 (เดือน 1-2) | Phase 13 + **13-Early หลัง Ph.4** | ต้องมีข้อมูลจุดอพยพ/สถิติ/Risk ก่อน — แต่แยกส่วนที่ทำได้ทันทีออกมาเป็น 13-Early |
| **Phase 0** | "เคลียร์ PDPA + พิมพ์ใบ Consent" | **+ กู้คืน BR 38 ข้อ + ตัดสิน 10 ประเด็น** | GAP-D01 คือ BLOCKER ที่เอกสารไม่ได้ระบุ |
| **Database** | ไม่มี Phase แยก | **Phase 2 แยกชัด** | ต้องแก้ BLOCKER 10 ข้อก่อน |
| **Coverage** | ไม่มี Phase | **Phase 9** | FR-CVG-01..05 เป็นระดับ M แต่ไม่มี Module (GAP-R05) |
| **จำนวน Phase** | 5 (0, 1, 1.5, 2, 3, 4) | 17 | ละเอียดกว่า เพื่อให้ Dependency ชัด |

---

## Feature แรกที่ควรเริ่มพัฒนา

> ## **Phase 6 — Data Entry Console (M03)**

**เหตุผล:**
1. **เป็น Module ที่เอกสารระบุว่า "⭐ สำคัญที่สุด"** (system-analysis.md:727)
2. **แก้ปัญหาวิกฤตที่สุด** — PE1 (คีย์ไม่เสร็จ/ค้างเป็นปี) + PE2 (คีย์ผิดโดยไม่มีใครรู้) เป็น 🔴 วิกฤต
3. **เป็นคอขวดของทั้งระบบ** — Dashboard/Map/Risk/Report/Incident **ทั้งหมดต้องรอข้อมูล**
4. **S2:** *"เริ่มคีย์ทันทีที่ปึกแรกมาถึง อย่ารอครบ 3,000"* → ยิ่งเริ่มช้า ยิ่งเสี่ยง
5. **ตรวจสอบสมมติฐานได้เร็ว** — NFR-E-01 (≤4 นาที) และ NFR-E-03 (แตะเมาส์ 0 ครั้ง) เป็นสมมติฐานที่ยังไม่พิสูจน์ → ถ้าทำไม่ได้จริง แผนงาน 375 ชม.-คน จะพัง

**⚠️ แต่ต้องผ่าน Phase 0-5 ก่อน** — โดยเฉพาะ:
- **Phase 0** (BR-40..BR-55 คือกฎการคีย์ที่ **ยังไม่มีข้อความ**)
- **Phase 2** (แก้ QM-01/04/06/08/09/12 — ฟิลด์ที่ขาดจากกระดาษ)

**ถ้าต้องการ Quick Win ที่เร็วกว่า:** **Phase 13-Early** (เบอร์ฉุกเฉิน + จุดอพยพ) — ทำได้หลัง Phase 4 และ**ช่วยชีวิตได้ทันที**แม้ยังไม่มีข้อมูลครัวเรือนเลย
