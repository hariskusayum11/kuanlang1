# 15 — Database Fix Plan

> แผนแก้ไข `prisma/schema.prisma`, `prisma/seed.ts` และ `database/drafts/00_postgis_extensions.sql`
> **🔴 รอบนี้ยังไม่ดำเนินการใดๆ — เป็นแผนเท่านั้น**
> ต้องได้รับคำตอบใน [14-open-questions.md](14-open-questions.md) ระดับ 🔴 ก่อนเริ่ม

---

## หลักการของแผนนี้

| # | หลักการ | เหตุผล |
|---|---|---|
| 1 | **แก้ทั้งหมดก่อนรัน Migration แรก** | ยังไม่มีข้อมูลจริง → เปลี่ยนได้ฟรี; ถ้าปล่อยไปจะต้อง Backfill + แก้ View/Trigger |
| 2 | **ห้ามเดาข้อมูลพื้นที่/จำนวนครัวเรือน** | คำสั่งผู้ใช้ — ใช้ `NULL` แทนการเดา |
| 3 | **Custom SQL อยู่ใน Prisma Migration** | ป้องกัน Drift (SQL-02) |
| 4 | **ทุก Migration ต้อง Idempotent** | SQL-03 |
| 5 | **Comment ต้องตรงกับสิ่งที่โค้ดทำจริง** | SCH-03 พิสูจน์แล้วว่า Comment ที่โกหกอันตรายกว่าไม่มี Comment |

---

## สรุปงานแก้ไข

| กลุ่ม | จำนวน FIX | ระดับ |
|---|---|---|
| Community & พื้นที่ | 3 | 🔴 BLOCKER |
| Coverage Model | 1 | 🔴 BLOCKER |
| Data Entry & Verification | 3 | 🔴 BLOCKER |
| Risk Model | 3 | 🔴 BLOCKER |
| Security & Privacy | 2 | 🔴 BLOCKER |
| ฟิลด์จากกระดาษที่ขาด | 7 | 🟠 HIGH |
| Model ที่ขาด | 4 | 🟠 HIGH |
| SQL & Migration | 6 | 🔴/🟠 |
| Seed | 4 | 🔴/🟠 |
| คุณภาพทั่วไป | 5 | 🟡 MEDIUM |

---

## ส่วนที่ 1: BLOCKER — ต้องแก้ก่อน Migration แรก

---

### FIX-01 🔴 — Community ↔ Tambon เป็น M:N

**ปัญหา:** SCH-01 — `Community.tambonId` เดี่ยว → ชุมชนควนสันติ (2 ตำบล) Seed ไม่ได้
**ไฟล์:** `prisma/schema.prisma:392-414`, `prisma/seed.ts:81-100`
**ต้องรู้ก่อน:** Q-17 (ตำบลหลัก), Q-21 (รหัสชุมชน)

**การเปลี่ยนแปลง:**
1. ลบ `Community.tambonId` + relation `tambon`
2. เพิ่ม `CommunityTambon` (communityId, tambonId, `isPrimary`, note)
3. เปลี่ยน `Tambon.communities` → `Tambon.communityTambons`
4. Partial Unique Index: `isPrimary = true` ได้เพียง 1 ต่อชุมชน

**ผลกระทบ:** `v_community_summary`, Seed, Dashboard filter, Area Scope resolver
**Module:** M04, M10, M11, M02
**รายละเอียด:** [05-community-area-design.md](05-community-area-design.md) หัวข้อ 4.1

---

### FIX-02 🔴 — Coverage Model

**ปัญหา:** SCH-04, COV-01/04 — `targetHouseholds Int @default(0)` แนวคิดผิด + หารศูนย์ + ไม่ Nullable
**ไฟล์:** `prisma/schema.prisma:398`, `seed.ts:82-86`, `00_postgis_extensions.sql:236,246-251`
**ต้องรู้ก่อน:** Q-01 (`totalHouseholds` จริง), Q-02 (เกณฑ์ 60/80/85)

**การเปลี่ยนแปลง:**
1. **ลบ** `targetHouseholds Int @default(0)`
2. **เพิ่ม:** `totalHouseholds Int?`, `targetCoveragePercent Float @default(60)`, `lastPopulationUpdatedAt DateTime?`, `populationDataSource String?`, `populationDataNote String?`, `populationUpdatedById String?`
3. CHECK: `totalHouseholds IS NULL OR > 0` (**ไม่ใช่ `>= 0`**), `targetCoveragePercent > 0 AND <= 100`
4. Seed: `totalHouseholds: null` ทั้ง 5 ชุมชน — **ห้ามเดา**

**⚠️ กฎที่ต้องบังคับ:** "ไม่ทราบ" = `NULL` เท่านั้น — **ห้ามใช้ 0 เด็ดขาด** (เพราะ `ELSE 0` ทำให้แสดง "0%" แทน "ยังคำนวณไม่ได้" — RK-C1)

**Module:** M11, M16, M06, M10
**รายละเอียด:** [06-coverage-model-review.md](06-coverage-model-review.md)

---

### FIX-03 🔴 — Role: `RESCUE_VOLUNTEER` → `VOLUNTEER`

**ปัญหา:** SCH-05, CONF-02
**ไฟล์:** `prisma/schema.prisma:158`
**ต้องรู้ก่อน:** Q-19

**การเปลี่ยนแปลง:**
1. `UserRoleEnum`: `RESCUE_VOLUNTEER` → `VOLUNTEER`
2. แก้ Comment `DATA_ENTRY` — "อาสาคีย์ข้อมูล" → "**เจ้าหน้าที่**คีย์ข้อมูล" (v3.0 Change Log ข้อ 1)
3. แก้ Comment `ConfidentialityAgreement` (schema.prisma:319) — "อาสาสมัคร" → "เจ้าหน้าที่คีย์" (BR-59 ฉบับ v3.0)

**⚠️ ต้องทำก่อนมีข้อมูล** — `ALTER TYPE ... RENAME VALUE` ทำได้ (PG 10+) แต่ถ้ามี User จริงแล้วต้องอัปเดตข้อมูลด้วย

**Module:** M01, M19, M14

---

### FIX-04 🔴 — ป้องกันคนเดียวกันคีย์ Entry 1 และ Entry 2

**ปัญหา:** **SCH-03 — Comment อ้างว่าป้องกัน แต่ Constraint ทำคนละอย่าง**
**ไฟล์:** `prisma/schema.prisma:628-629`

```prisma
// ❌ ปัจจุบัน — Comment โกหก
// ⭐ ห้ามคนเดียวกันคีย์ทั้ง Entry 1 และ 2 (BR-44)
@@unique([sheetId, attemptNo])   // ← ไม่เกี่ยวกับตัวบุคคลเลย
```

**การเปลี่ยนแปลง:**
1. **แก้ Comment ให้ตรงความจริง:** `// กันคีย์ Entry เดียวกันซ้ำ (ไม่ได้กันคนเดียวกันคีย์ 2 รอบ — ดู trigger)`
2. **เพิ่ม DB Trigger** `check_different_entry_person` (BEFORE INSERT บน `entry_attempt`)
3. **บังคับที่ App** — `pickupForVerify()` กรอง `NOT EXISTS (entry_attempt WHERE enteredById = ctx.userId)`
4. เพิ่ม Test: App + DB

**ทำไมเป็น BLOCKER:** ถ้าไม่แก้ → คนเดียวคีย์ 2 รอบ → คีย์ผิดเหมือนเดิม → "ตรงกัน" → **VERIFIED** → **ข้อมูลผิดได้ตราประทับว่ายืนยันแล้ว** = PE2/RK-E2 (🔴 วิกฤต) และ KPI "Error rate ≤0.5%" กลายเป็นตัวเลขลวง

**Module:** M03, M04
**รายละเอียด:** [04-schema-gap-analysis.md](04-schema-gap-analysis.md) ข้อ 18

---

### FIX-05 🔴 — ลบ `@@unique([houseNo, mooId, tambonId])`

**ปัญหา:** QM-03 — (ก) Nullable → กันซ้ำไม่ได้จริง (NULL ≠ NULL) (ข) บล็อกอพาร์ทเมนต์ (กระดาษมีตัวเลือกนี้แต่ไม่มีช่องเลขห้อง) (ค) ไม่รู้จัก Soft Delete
**ไฟล์:** `prisma/schema.prisma:813`
**ต้องรู้ก่อน:** Q-12

**การเปลี่ยนแปลง:**
1. **ลบ** `@@unique([houseNo, mooId, tambonId])`
2. เพิ่ม `@@index([houseNo, mooId, tambonId])` (สำหรับ Soft Check)
3. ตรวจซ้ำที่ Application (FR-ENT-16) → เตือน → `hasDuplicateFlag` → M07 Merge

**Module:** M03, M07

---

### FIX-06 🔴 — Risk Score: แยก Raw / Max / Normalized / Absolute

**ปัญหา:** RISK-01 — น้ำหนัก 115 vs CHECK 0-100 → **Constraint จะปฏิเสธครัวเรือนที่เสี่ยงที่สุด**
**ไฟล์:** `prisma/schema.prisma:977-982`, `00_postgis_extensions.sql:284-286`
**ต้องรู้ก่อน:** Q-25, Q-26, Q-28

**การเปลี่ยนแปลง:**
1. **ลบ** `riskScoreAuto Float?`
2. **เพิ่ม:** `rawScore`, `maximumPossibleScore`, `normalizedScore`, `absoluteScore` (Float?)
3. **เพิ่ม Confidence 3 มิติ:** `riskDataCompleteness`, `riskVerificationLevel`, `riskConfidence`, `riskWeightAvailable`
4. **เพิ่ม Traceability:** `riskFormulaVersion`, `riskWeightVersionId`, `factorSnapshot Json?`, `appliedHardRules String[]`
5. `riskFactorsTotal` — **ลบ `@default(12)`** (อ่านจาก Version)
6. **แก้ CHECK:**
   ```sql
   ck_raw_score:        rawScore IS NULL OR rawScore >= 0
   ck_raw_le_max:       rawScore <= maximumPossibleScore
   ck_normalized_score: normalizedScore BETWEEN 0 AND 100
   ck_absolute_score:   absoluteScore BETWEEN 0 AND 100
   ```
   **⚠️ ห้าม Hardcode `<= 115`** — น้ำหนักปรับได้ (FR-RSK-05)

**Module:** M09, M11
**รายละเอียด:** [08-risk-model-review.md](08-risk-model-review.md)

---

### FIX-07 🔴 — RiskWeightVersion (แยกจาก RiskWeightConfig)

**ปัญหา:** RISK-07 — `factorCode @unique` → เก็บหลาย Version ไม่ได้ → `effectiveFrom` ถูกทับ → ประวัติหายถาวร
**ไฟล์:** `prisma/schema.prisma:1109-1120`, `seed.ts:309-330`
**ต้องรู้ก่อน:** Q-29 (น้ำหนักมาจากไหน?)

**การเปลี่ยนแปลง:**
1. เพิ่ม `RiskWeightVersion` (version, name, reason, formulaVersion, status, effectiveFrom/To, createdBy, approvedBy)
2. เพิ่ม `RiskVersionStatus` enum (DRAFT/ACTIVE/SUPERSEDED)
3. `RiskWeightConfig`: ลบ `@unique` จาก `factorCode` → `@@unique([versionId, factorCode])`
4. **ลบ `maxScore`** (ซ้ำกับ `weight` 100% ทุกแถว)
5. เพิ่ม `sourceSection`, `sourceQuestion`, `requiresGis`
6. Partial Unique: `status = 'ACTIVE'` ได้เพียง Version เดียว

**Module:** M09, M17

---

### FIX-08 🔴 — Risk Hard Rules

**ปัญหา:** RISK-09 — กฎ "ติดเตียง/ฟอกไต → ≥HIGH" และ "≥32 สัปดาห์ → P1" **อยู่ใน Comment เท่านั้น**
**ไฟล์:** `system-analysis.md:892`, `seed.ts:168`

**การเปลี่ยนแปลง:** เพิ่ม `RiskHardRule` (versionId, code, nameTh, conditionType, conditionValue Json, effect, effectValue, reason, isActive)

**Module:** M09

---

### FIX-09 🔴 — CriticalFieldConfig

**ปัญหา:** GAP-R03 — FR-VER-01 บอก "ตั้งค่าได้" แต่มีเพียง ⭐ ใน Comment ซึ่งระบบอ่านไม่ได้
**ต้องรู้ก่อน:** Q-13 (`age` เป็น Critical หรือไม่?)

**การเปลี่ยนแปลง:**
1. เพิ่ม `CriticalFieldConfig` (fieldPath, labelTh, section, questionNo, isCritical, **compareMode**, tolerance, isRepeating, sortOrder, version, effectiveFrom/To, isActive)
2. เพิ่ม `CompareMode` enum (EXACT / NORMALIZED_PHONE / NORMALIZED_TEXT / NUMERIC_TOLERANCE / **SET_EQUALITY**)
3. `EntryAttempt.criticalFieldVersion Int`
4. Seed ตามรายการในเอกสาร + **เพิ่มที่ขาด** (ประเภทความเปราะบาง — เอกสารระบุแต่ Schema ไม่มี ⭐)

**⚠️ สำคัญ:** ต้องมี **Normalize Rule** — ไม่งั้น "081-234-5678" vs "0812345678" จะเป็น Discrepancy เท็จจำนวนมาก

**Module:** M03, M04, M17

---

### FIX-10 🔴 — Encryption จริง (ไม่ใช่ Comment)

**ปัญหา:** SCH-08 — 🔒 มี 20 จุด แต่**ไม่มีการเข้ารหัสจริง** → ผิด CLAUDE.md + NFR-S-02
**ต้องรู้ก่อน:** Q-20 (ชื่อเข้ารหัสหรือไม่?)

**การเปลี่ยนแปลง (ขึ้นกับคำตอบ Q-20):**
1. Prisma Extension สำหรับ Column Encryption (AES-256-GCM)
2. Blind Index (HMAC-SHA256) สำหรับ `respondentPhone`, `houseNo`
3. Key Management + `ENCRYPTION_KEY`
4. ปรับ Type/ความยาวคอลัมน์ที่เข้ารหัส
5. **เพิ่ม 🔒 ที่ขาด:** `PersonVulnerability.vulnerabilityTypeId` (FK ชี้ DIALYSIS/PSYCHIATRIC = เปิดเผยโรค), `TaskUpdate.latitude/longitude/photoUrl`, `Household.latitude/longitude/houseNo` (L3), `DigitalReadiness.lineUserId`
6. **ลบ 🔒 ที่ตัดสินว่าไม่เข้ารหัส** — และเขียน ADR อธิบายเหตุผล

**⚠️ ผลข้างเคียงที่ต้องจัดการ:** `ix_household_search_name` (GIN trgm) จะไร้ประโยชน์ถ้าเข้ารหัสชื่อ (SQL-17)

**Module:** ทุก Module

---

## ส่วนที่ 2: HIGH — ฟิลด์จากกระดาษที่ขาด

> **ทั้งหมดนี้คือข้อมูลที่มีอยู่บนกระดาษแต่ไม่มีที่เก็บ → ข้อมูลจะหายถาวร**

| FIX | ฟิลด์ที่เพิ่ม | Model | ปัญหา | กระดาษ |
|---|---|---|---|---|
| **FIX-11** | `communityNameOnPaper String?` | Household | QM-01 | ส่วน 0 |
| **FIX-12** | `coordinateRawText String?` | Household | QM-04 | ส่วน 1 ข้อ 3 |
| **FIX-13** | `floodDepthMetersRaw Int?`, `floodDepthCmRaw Int?` | FloodRiskProfile | QM-08 | ส่วน 3 ข้อ 3 |
| **FIX-14** | `hasNoResources Boolean?` | Household | QM-09 | ส่วน 3 ข้อ 11 |
| **FIX-15** | `volunteerNotAvailable Boolean?` | Household | QM-12 | ส่วน 4 ข้อ 4 |
| **FIX-16** | `assistanceTotalPersonCount Int?` | Household | QM-07 | ส่วน 2 ข้อ 3 |
| **FIX-17** | `pregnancyRawText String?`, `pregnancyUnit PregnancyUnit?`, `pregnancyValue Int?` | PersonVulnerability | QM-06 | ส่วน 2 ข้อ 2 |

**รายละเอียดสำคัญ:**

**FIX-12 (พิกัด):** `latitude`/`longitude` กลายเป็น **Derived** — **Double-entry ต้องเทียบที่ `coordinateRawText`** ไม่ใช่ค่าที่ผ่านการตีความ (ไม่งั้นจะเกิด Discrepancy เท็จ)

**FIX-13 (ระดับน้ำ):** `maxFloodDepthCm` กลายเป็น **Derived** = `(metersRaw × 100) + cmRaw` — **Double-entry เทียบที่ 2 ช่องดิบ**
⚠️ กรณีอันตราย: ผู้สำรวจเขียน `2` ในช่องเมตร เว้นช่อง ซม. → ถ้าคีย์เป็น `2` ระบบอ่านเป็น 2 **ซม.** แทน 200 → Risk ผิดร้ายแรง (FLOOD_DEPTH น้ำหนัก 15)

**FIX-17 (อายุครรภ์):** เพิ่ม `PregnancyUnit` enum (WEEKS/MONTHS/UNKNOWN) — `pregnancyWeeks` กลายเป็น Derived + **ผ่อน CHECK 1-42 → 1-45 หรือย้ายไป App**
⚠️ ถ้า `unit = UNKNOWN` → **ห้ามเดา** → `FieldStatus = ILLEGIBLE` → Field Query Loop

---

### FIX-18 🟠 — `SurveyorRiskLevel` enum (3 ระดับ)

**ปัญหา:** AMB-05 — กระดาษมี ☐ ต่ำ ☐ ปานกลาง ☐ สูง (**3 ตัวเลือก**) แต่ `riskLevelSurveyor` ใช้ `RiskLevel` (**4 ค่า** — มี CRITICAL ที่กระดาษไม่มี)
**ไฟล์:** `prisma/schema.prisma:985`

**การเปลี่ยนแปลง:**
```prisma
enum SurveyorRiskLevel { LOW  MEDIUM  HIGH }   // ⭐ ใหม่ — ตรงกระดาษ

model FloodRiskProfile {
  riskLevelSurveyor SurveyorRiskLevel?   // แทน RiskLevel?
  riskLevelAuto     RiskLevel?           // คงเดิม 4 ระดับ
  riskLevelFinal    RiskLevel?           // คงเดิม
}
```
**เหตุผล:** ถ้าใช้ enum เดียวกัน ผู้คีย์จะเห็น 4 ตัวเลือกบนจอ แต่กระดาษมี 3 → ผิด FR-ENT-01 + BR-54

---

## ส่วนที่ 3: HIGH — Model ที่ขาด

| FIX | Model | รองรับ | ปัญหา |
|---|---|---|---|
| **FIX-19** | `VolunteerProfile` + `VolunteerProfileSkill` + `VolunteerApprovalStatus` | FR-VOL-01..10, BR-68 | GAP-R01 |
| **FIX-20** | `EmergencyContact` | FR-PUB-03 | GAP-R02 |
| **FIX-21** | `CommunityBoundary` (MultiPolygon + version) | FR-GIS, FR-CVG-02 | SQL-08 |
| **FIX-22** | `UserAreaScope` + `AreaScopeType` | Area Scope | SCH-10 |
| **FIX-23** | `IncidentCommunity` (แทน `String[]`) | Referential Integrity | SCH-21 |

**FIX-19 รายละเอียด:**
```prisma
model VolunteerProfile {
  id, userId @unique, communityId
  status VolunteerApprovalStatus @default(PENDING)   // ⭐ BR-68
  approvedById, approvedAt, rejectedReason
  pdpaAcceptedAt, pdpaVersion                        // ⭐ FR-VOL-05
  equipment String?                                  // ⭐ FR-VOL-04
  deletedAt
}
enum VolunteerApprovalStatus { PENDING  APPROVED  REJECTED  SUSPENDED }
```
> **⚠️ ต้องแยกให้ชัด:** `VolunteerInterest` = "ครัวเรือนแจ้งบนกระดาษว่าสนใจ" (ข้อมูลสำรวจ) ≠ `VolunteerProfile` = "คนสมัครผ่านเว็บและได้รับอนุมัติ" (ผู้ใช้ระบบ) — **คนละแนวคิด** (เอกสาร:1102 ยืนยัน)

**FIX-20 รายละเอียด:** ต้องรองรับทั้งเบอร์ระดับชาติ (1784, 191) และเฉพาะพื้นที่ (เทศบาล/รพ.) → `isNationwide Boolean` + `communityId?` / `provinceId?` — **ห้าม Hardcode พื้นที่**

---

## ส่วนที่ 4: SQL & Migration

---

### FIX-24 🔴 — ย้าย Custom SQL เข้า Prisma Migration

**ปัญหา:** SQL-01 (ชื่อไฟล์ `00_` ขัดลำดับ), **SQL-02 (Drift → Prisma เสนอ Reset DB)**

**การเปลี่ยนแปลง:**
1. **ประกาศ PostGIS columns ด้วย `Unsupported()`** ใน schema.prisma:
   ```prisma
   location Unsupported("geography(Point, 4326)")?
   ```
   > **⚠️ แก้ความเข้าใจผิดใน Schema:** `schema.prisma:747` เขียนว่า *"ใช้ Unsupported ไม่ได้"* — **ถูกครึ่งเดียว**: ใช้ใน **relation** ไม่ได้ แต่เป็น **คอลัมน์ธรรมดาได้** และเราไม่ต้องการ relation → **การหลีกเลี่ยง `Unsupported()` คือสาเหตุของปัญหา Drift ทั้งหมด**
2. `extensions = [postgis, pg_trgm]` (SQL-14)
3. แยก Migration: `0001_init` → `0002_postgis_columns` → `0003_functions_triggers` → `0004_constraints` → `0005_indexes` → `0006_views`
4. `database/` → **เอกสารประกอบเท่านั้น** + `README.md` เตือน "ห้ามรันด้วยมือ"
5. `database/drafts/00_postgis_extensions.sql` → เก็บไว้อ้างอิง **ห้ามรัน**

---

### FIX-25 🔴 — Constraint ทั้งหมดเป็น Idempotent

**ปัญหา:** SQL-03 — `ADD CONSTRAINT` ไม่มี `IF NOT EXISTS` ใน PostgreSQL → รันซ้ำ Error → **Constraint ที่เหลือไม่ถูกสร้าง**

**การเปลี่ยนแปลง:** ห่อทุก Constraint ด้วย:
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ck_xxx' AND conrelid = '"table"'::regclass) THEN
    ALTER TABLE "table" ADD CONSTRAINT ck_xxx CHECK (...);
  END IF;
END $$;
```
> ⚠️ **ห้ามใช้ `DROP CONSTRAINT IF EXISTS` + `ADD`** — จะ re-validate ทั้งตารางทุกครั้ง + `ACCESS EXCLUSIVE LOCK` → ไม่เหมาะกับ Production

---

### FIX-26 🔴 — Batch Count Trigger

**ปัญหา:** SQL-04 — รองรับเพียง `UPDATE OF status`; **ย้าย Batch/INSERT/DELETE ไม่ทำงาน** + **`receivedCount` ไม่คำนวณเลย**
**ต้องรู้ก่อน:** Q-30 (นิยาม `receivedCount`)

**การเปลี่ยนแปลง:**
1. `AFTER INSERT OR DELETE OR UPDATE OF status, "batchId"`
2. อัปเดต **ทั้ง Batch เก่าและใหม่** (ปัจจุบัน `COALESCE(NEW, OLD)` อัปเดตแค่ Batch ใหม่ → Batch เก่าผิดถาวร)
3. **เพิ่มการคำนวณ `receivedCount`**
4. `RETURN COALESCE(NEW, OLD)`
5. **พิจารณาเลิกใช้ Trigger** → คำนวณจาก Query แทน (เหมือน Coverage) เพื่อลด Lock contention (600 sheets/batch → `COUNT(*)` เร็วมาก)

---

### FIX-27 🟠 — `release_expired_locks()`

**ปัญหา:** SQL-05 — Race Condition + ไม่มี lock_timeout + ไม่มี Audit + ไม่จัดการ Draft
**ต้องรู้ก่อน:** Q-07 (Draft)

**การเปลี่ยนแปลง:**
1. `SET LOCAL lock_timeout = '2s'`
2. **แก้ Race ที่ Submit:** `WHERE status = 'LOCKED' AND lockedById = $userId AND lockExpiresAt > NOW()` → ถ้า ROW_COUNT = 0 → แจ้ง "Lock หมดอายุ"
3. เขียน `AuditLog` (`AuditAction.UNLOCK` มีอยู่แล้ว)
4. **ไม่ลบ Draft**
5. พิจารณาต่ออายุ Lock อัตโนมัติเมื่อมี activity

---

### FIX-28 🟠 — Views

**ปัญหา:** SQL-06 (v_household_geo เปิด L3/L4), SQL-10 (CREATE OR REPLACE เปลี่ยน column ไม่ได้), COV-01/02

**การเปลี่ยนแปลง:**
1. **`DROP VIEW IF EXISTS` ก่อน CREATE เสมอ**
2. `v_household_geo` → **`v_household_geo_internal`** + กรอง `ps.status = 'VERIFIED'` + `hasDuplicateFlag = false`
3. `v_community_summary` → **`v_community_coverage`** (แก้ fan-out ด้วย Subquery + แยก Survey/Verified + คืน NULL)
4. **เพิ่ม `v_public_risk_grid`** (Grid + k≥5 + ไม่มี P1 count)
5. **เพิ่ม `v_public_community_stats`** (Aggregate ล้วน)

---

### FIX-29 🟠 — Constraint ที่ต้องแก้ค่า

| Constraint | ปัจจุบัน | ควรเป็น | เหตุผล |
|---|---|---|---|
| `ck_member_count` | `1-50` | **`0-5000`** | SQL-12 — โรงเรียน/โรงงานมีคนเกิน 50; บ้านร้าง = 0 |
| `ck_pregnancy_weeks` | `1-42` | `1-45` หรือย้ายไป App | QM-06 — หน่วยไม่ชัด |
| `ck_risk_score` | `0-100` | แยกเป็น raw/normalized/absolute | RISK-01 |
| `ck_postpartum_months` | ❌ ไม่มี | เพิ่ม `0-24`? | Q-16 |

---

### FIX-30 🟠 — Index

**ปัญหา:** SCH-16, SQL-15, SQL-16

**การเปลี่ยนแปลง:**
1. **Spatial Index เป็น Partial:** `WHERE location IS NOT NULL AND "deletedAt" IS NULL`
2. **แก้ `ix_vulnerable_search_name`** — เพิ่มการเช็ค `household.deletedAt` (ปัจจุบันค้นเจอคนในบ้านที่ลบแล้ว)
3. **เพิ่ม Index ที่ขาด:** `Household(deletedAt)`, `(communityId, deletedAt)`, `(surveyedAt)`, `(hasDuplicateFlag)`, `Discrepancy(resolution)`, `ConsentRecord(householdId)`, `AssistanceNeed(householdId)`, `HouseholdResource(householdId)`, `EvacuationVehicle(householdId)`, `PaperBatch(status)`
   > ⚠️ **PostgreSQL ไม่สร้าง Index ให้ FK อัตโนมัติ** (ต่างจาก MySQL) → ตาราง M:N ที่ไม่มี `@@index` จะ Full Scan ทุกครั้งที่ Join → สำคัญมากเมื่อถึง 50,000 ครัวเรือน (NFR-SC-01)
4. `CREATE INDEX CONCURRENTLY` สำหรับ Production (ต้องแยกไฟล์ — รันใน Transaction ไม่ได้)

---

### FIX-31 🟡 — Audit Trigger

**ปัญหา:** SQL-09 — ห้าม DELETE โดยสิ้นเชิง → **BR-30 (เก็บ 5 ปี) ทำไม่ได้** + `RETURN NULL` เป็นกับดัก

**การเปลี่ยนแปลง:**
1. **เปิดใช้ GRANT/REVOKE เป็นหลัก** (ปัจจุบัน comment ไว้ที่บรรทัด 113-114 แต่ไม่ได้เปิด):
   ```sql
   REVOKE UPDATE, DELETE ON "audit_log" FROM app_user;
   GRANT INSERT, SELECT ON "audit_log" TO app_user;
   ```
2. แก้ Trigger ให้อนุญาต DELETE เฉพาะแถวเกิน 5 ปี
3. **แก้ `RETURN NULL` → `RETURN OLD`**
   > ⚠️ **กับดัก:** `RETURN NULL` ใน `BEFORE DELETE` = **ยกเลิกการลบเงียบๆ โดยไม่มี Error** → Retention Job จะรายงาน "ลบสำเร็จ 0 แถว" ตลอดไปโดยไม่มีใครรู้ว่าทำไม
   > ปัจจุบันเป็น dead code (เพราะ RAISE หยุดก่อน) แต่จะระเบิดทันทีที่มีคนแก้ให้ไม่ RAISE

---

## ส่วนที่ 5: Seed

---

### FIX-32 🔴 — Seed ชุมชนจริง 5 แห่ง

**ปัญหา:** SEED-01, SEED-02
**ต้องรู้ก่อน:** Q-17, Q-21, Q-01

```typescript
// ⚠️ ตัวอย่าง — รอยืนยัน Q-21 (รหัส) และ Q-17 (ตำบลหลัก)
const communities = [
  { code: "???", nameTh: "ชุมชนท่าเคียน",   tambons: [{ t: khuanLang, isPrimary: true }] },
  { code: "???", nameTh: "ชุมชนประสานมิตร", tambons: [{ t: khuanLang, isPrimary: true }] },
  { code: "???", nameTh: "ชุมชนควนสันติ",   tambons: [
      { t: khuanLang,    isPrimary: /* ??? Q-17 */ },
      { t: hatyaiTambon, isPrimary: /* ??? */ },
  ]},
  { code: "???", nameTh: "ชุมชนปลักหว้า",   tambons: [{ t: khuanLang, isPrimary: true }] },
  { code: "???", nameTh: "ชุมชนหน้าควน",    tambons: [{ t: khuanLang, isPrimary: true }] },
];
// totalHouseholds: null  ← ห้ามเดา (Q-01)
// targetCoveragePercent: 60
```

**⚠️ ต้องเพิ่มขั้นตอนลบชุมชนเก่า** — `upsert` ไม่ลบแถวที่ถอดออกจาก array → ถ้าเคยรัน seed เดิมแล้ว จะได้ **10 ชุมชน** (SEED-11)

**⚠️ ข้อสังเกต:** ข้อมูลจริงมี **4 ชุมชนในควนลัง + 1 ชุมชนคร่อม 2 ตำบล** → **ไม่มีชุมชนใดอยู่ในตำบลหาดใหญ่เพียงตำบลเดียว** (ต่างจาก Seed เดิมที่สมมติว่ามี 2 ชุมชนในหาดใหญ่)

---

### FIX-33 🟠 — รหัสพื้นที่

**ปัญหา:** SEED-03 — รหัสอำเภอ `9001` น่าจะผิด (หาดใหญ่ ≈ `9011`; `9001` ≈ เมืองสงขลา)
**ต้องรู้ก่อน:** Q-24

**การเปลี่ยนแปลง:**
1. แก้รหัสอำเภอ/ตำบลตามที่ยืนยัน
2. **พิจารณาใช้ Dataset รหัสพื้นที่ไทยมาตรฐาน** แทนการพิมพ์เอง
3. เพิ่ม Validation: `Tambon.code` ต้องขึ้นต้นด้วย `District.code`; `District.code` ต้องขึ้นต้นด้วย `Province.code`
4. หมู่ที่จริง (Q-24)

**⚠️ ระวัง:** `upsert({ where: { code } })` → **แก้รหัสแล้วจะสร้างแถวใหม่** ไม่ใช่อัปเดต → ได้อำเภอ 2 แถว

---

### FIX-34 🟠 — Bounding Box

**ปัญหา:** SEED-08 — `HAT_YAI_*` Hardcode ชื่ออำเภอใน Key → บล็อกการขยายพื้นที่

**การเปลี่ยนแปลง:**
1. **ลบ** `HAT_YAI_LAT_MIN/MAX`, `HAT_YAI_LNG_MIN/MAX`
2. **เพิ่ม** `COORD_BOUNDS_COUNTRY` (ประเทศไทย: lat 5.5-20.5, lng 97.3-105.7) — Sanity check ที่ไม่ผูกพื้นที่ → **จับ lat/lng สลับได้ทันที**
3. **เพิ่ม** Bounding Box ต่อชุมชน (`Community.bboxLatMin/Max/LngMin/Max`) หรือคำนวณจาก `CommunityBoundary`
4. ระยะยาว: `ST_Covers(boundary, point)` + Buffer

---

### FIX-35 🟠 — แยก Production / Development Seed

**ปัญหา:** SEED-10 — ไม่แยกเลย + ไม่มีผู้ใช้ทดสอบ → ทดสอบ RBAC ไม่ได้

**การเปลี่ยนแปลง:**
```
prisma/seeds/
├── production/   01-areas · 02-communities · 03-master-data
│                 04-risk-weights · 05-settings · 06-critical-fields
└── development/  01-users (9 Roles) · 02-batches · 03-households
                  ⚠️ ข้อมูลสังเคราะห์เท่านั้น
```
+ Guard: `if (NODE_ENV === 'production') throw new Error('ห้ามรัน dev seed ใน production')`
+ **ห้ามใช้ข้อมูลประชาชนจริง** (CLAUDE.md)

---

### FIX-36 🟡 — Seed คุณภาพ

| # | ปัญหา | แก้ |
|---|---|---|
| SEED-06 | Comment บรรทัด 285 บอก "9 ประเภท" แต่ Array มี 8 และ Log บอก 8 | **แก้ Comment เป็น 8** |
| SEED-13 | `update: {}` ว่าง → แก้ seed แล้วรันใหม่ไม่มีผล | แยกฟิลด์ที่ Seed เป็นเจ้าของ (update ได้) กับ Admin เป็นเจ้าของ (ไม่ update) |
| SEED-14 | ไม่มี Transaction ครอบ → ล้มกลางคันได้ข้อมูลครึ่งๆ | ห่อด้วย `$transaction` |
| SEED-15 | `detailLabel` เพิ่ม "(สัปดาห์)" ที่กระดาษไม่มี | แก้ให้ตรงกระดาษ + จัดการหน่วยที่ FIX-17 |
| SEED-18 | `description: "น้ำหนัก X คะแนน"` ไม่มีสาระ | ใส่คำอธิบายจริงว่าปัจจัยคืออะไร มาจากข้อไหน |

---

## ส่วนที่ 6: MEDIUM — คุณภาพ Schema

| FIX | ปัญหา | การแก้ |
|---|---|---|
| **FIX-37** | SCH-02 — `onDelete: Cascade` ขัด Soft Delete (7 ตาราง) | เปลี่ยนเป็น `Restrict` + Soft Delete Cascade ที่ App |
| **FIX-38** | SCH-07 — Soft Delete มี 1/49 ตาราง | เพิ่ม `deletedAt` ให้ตารางที่เก็บข้อมูลจากกระดาษ + Prisma Extension กรองอัตโนมัติ + **แยก `isActive` (สถานะธุรกิจ) จาก `deletedAt` (การลบ)** |
| **FIX-39** | SCH-20 — FK ที่ประกาศแต่ไม่มี relation (6 จุด) | เพิ่ม relation: `UserRole.assignedBy`, `Household.surveyorUserId`, `RiskWeightConfig.updatedBy`, `SystemSetting.updatedBy`, `PdpaRequest.householdId/handledById`, `EntryStats.userId` |
| **FIX-40** | SCH-22 — Unique ที่ขาด | `Account @@unique([providerId, accountId])`, `VulnerablePerson @@unique([householdId, seq])`, `HouseholdResource @@unique([householdId, resourceTypeId])`, `AssistanceNeed`, `EvacuationVehicle`, `HouseholdVersion @@unique([householdId, versionNo])` |
| **FIX-41** | SCH-26 — status เป็น String | เพิ่ม enum: `NotificationStatus`, `ExportStatus`, `PdpaRequestType/Status`, `IncidentType`, `IncidentSeverity` |
| **FIX-42** | SCH-15 — TriageLevel P1-P3 vs P1-P4 (Q-18) | แยก `TaskPriority` (P1-P4) หรือขยาย `TriageLevel` |
| **FIX-43** | SCH-09 — Better Auth ไม่ครบ (Q-19) | `@better-auth/cli generate` + ตาราง `twoFactor` + lockout |
| **FIX-44** | SCH-24 — `createdAt`/`updatedAt` ไม่ครบ | เพิ่มให้ครบทุกตาราง |
| **FIX-45** | SCH-25 — `EvacuationSite.type` ใช้ `NearestEvacSiteType` (มี UNKNOWN/OTHER ซึ่งไร้สาระสำหรับจุดอพยพจริง) | สร้าง `EvacuationSiteType` แยก |
| **FIX-46** | QM-11 — `lastFloodYear` ไม่มีในกระดาษ (Q-36) | คงไว้ + Comment "Reserved — ห้ามแสดงใน Entry Console" |
| **FIX-47** | SCH-18 — HouseholdVersion ไม่ครอบคลุมตารางลูก | ขยาย snapshot หรือเพิ่ม Version ให้ตารางลูก |
| **FIX-48** | SCH-27 — Comment ยังเป็น v2.0 | อัปเดต Header + Comment ทั้งไฟล์ |
| **FIX-49** | Q-2/3 — `HouseholdResource.quantity @default(1)` + `isAvailableForCommunity @default(false)` สร้างข้อมูลเท็จ (กระดาษไม่ได้ถาม) | เปลี่ยนเป็น `Int?` / `Boolean?` (ไม่มี default) |

---

## ลำดับการดำเนินการ

```
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 0: ได้คำตอบ Q-01,02,03,04,17,19,20,21,24,25,26,29  │  🔴 บังคับ
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 1: Git commit สำรอง (CLAUDE.md บังคับก่อนแก้ Schema)│
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 2: แก้ schema.prisma                                │
│   FIX-01..10 (BLOCKER) → FIX-11..23 (HIGH) → FIX-37..49    │
│   → prisma format → prisma validate                        │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 3: สร้าง Migration 0001-0006 (FIX-24..31)           │
│   → ทดสอบ: รัน 2 ครั้ง ต้องไม่ Error + ไม่มี Drift          │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 4: แก้ seed.ts (FIX-32..36)                         │
│   → ทดสอบ: รัน 3 ครั้ง ผลลัพธ์ต้องเหมือนเดิม               │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ ขั้นที่ 5: เขียน Test                                       │
│   Trigger · Constraint · View(NULL) · Seed idempotency     │
└────────────────────────────────────────────────────────────┘
```

**⚠️ Git Rules (CLAUDE.md):**
- ทำทีละ Feature — **ห้ามรวมหลาย Module ใน Commit เดียว**
- **ก่อนแก้ Schema ครั้งใหญ่ต้องสร้าง Git Commit สำรอง**
- Conventional Commits

**ข้อเสนอลำดับ Commit:**
```
chore(db): backup before schema overhaul
fix(db)!: community-tambon many-to-many (FIX-01)
fix(db)!: coverage model — totalHouseholds nullable (FIX-02)
fix(db)!: rename RESCUE_VOLUNTEER to VOLUNTEER (FIX-03)
fix(db): enforce different person for entry 1 and 2 (FIX-04)
fix(db)!: remove household address unique constraint (FIX-05)
feat(db): risk score raw/max/normalized/absolute (FIX-06)
feat(db): risk weight versioning (FIX-07, FIX-08)
feat(db): critical field config (FIX-09)
feat(db): add missing paper fields (FIX-11..18)
feat(db): volunteer profile & emergency contact (FIX-19, FIX-20)
...
```

---

## Checklist ก่อนถือว่าเสร็จ

**Schema:**
- [ ] `prisma format` + `prisma validate` ผ่าน
- [ ] ไม่มี `RESCUE_VOLUNTEER` เหลือ
- [ ] ไม่มี `targetHouseholds` เหลือ
- [ ] `totalHouseholds` เป็น `Int?`
- [ ] Comment ทุกจุด**ตรงกับสิ่งที่โค้ดทำจริง** (โดยเฉพาะ FIX-04)
- [ ] ไม่มี 🔒 ที่ไม่มีการเข้ารหัสจริง (หรือมี ADR อธิบาย)

**Migration:**
- [ ] รัน 2 ครั้งติดกัน → ไม่ Error
- [ ] `prisma migrate dev` หลัง migrate → **ไม่มี Drift**
- [ ] `rawScore = 115` บันทึกได้
- [ ] `memberCount = 500` บันทึกได้
- [ ] Trigger `check_different_entry_person` ปฏิเสธคนเดียวกัน
- [ ] Batch Trigger ถูกต้องทั้ง INSERT/DELETE/UPDATE/ย้าย
- [ ] `v_community_coverage` คืน **NULL** เมื่อ `totalHouseholds IS NULL`

**Seed:**
- [ ] รัน 3 ครั้ง → ผลเหมือนเดิม
- [ ] 5 ชุมชนจริง — ไม่มี KL01-HY02 เหลือ
- [ ] ควนสันติมี 2 แถวใน `CommunityTambon`, `isPrimary` เพียง 1
- [ ] `totalHouseholds = null` ทั้ง 5
- [ ] ไม่มี 600 / 3,000 เหลือในโค้ดหรือ log
- [ ] Master Data ตรงกระดาษ 100%
- [ ] Dev seed รันใน production ไม่ได้

**เอกสาร:**
- [ ] ADR 0001-0010 มีสถานะ Accepted
- [ ] `docs/business-rules.md` มี BR ครบ
- [ ] อัปเดต doc 01-15 ตามผลการตัดสินใจ
