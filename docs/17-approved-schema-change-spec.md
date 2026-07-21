# 17 — Approved Schema Change Spec (สเปกการเปลี่ยน Schema ที่อนุมัติแล้ว)

> **ฐานอ้างอิง:** [16-owner-decisions.md](16-owner-decisions.md) (คำตัดสินรอบ 1 = 16 ข้อ + รอบ 2 = R2-#1..9) + [15-database-fix-plan.md](15-database-fix-plan.md) (FIX-01..49)
> **🔴 รอบนี้:** สเปกพร้อมดำเนินการ — **ยังไม่แก้ `schema.prisma`, `seed.ts`, SQL และยังไม่สร้าง Migration + ยังไม่ติดตั้ง Package**
> **🆕 อัปเดตรอบ 2:** จัดกลุ่มใหม่เป็น **5 กลุ่ม** ตามที่เจ้าของกำหนด + เพิ่มรหัสชุมชน + Better Auth 1.6.23 + Encryption design + UNVERIFIED area codes

---

## 1. หลักการและขอบเขต

| หลักการ (จากคำตัดสิน) | ผล |
|---|---|
| ห้ามใช้ 0 แทน "ไม่ทราบ" (#1) | `totalHouseholds Int?` NULL; Coverage คืน NULL |
| เกณฑ์ผ่าน strict `> 60` (#2) | Unit Test ขอบเขต 60 พอดี = ไม่ผ่าน |
| `VOLUNTEER` เท่านั้น (#5) | ไม่มี `RESCUE_VOLUNTEER` เหลือ |
| Community-Tambon M:N + isPrimary รองรับ 0/1 (#6,8) | Partial Unique อนุญาต 0 ตำบลหลัก |
| เก็บข้อมูลกระดาษดิบ (#11,12) | Double-entry เทียบที่ raw |
| Risk เก็บได้ คำนวณไม่ได้ (#13,14,R2-#7,8,9) | คอลัมน์ NULL; ไม่มีสูตร/จัดระดับ |
| Custom SQL ใน Migration (#15) | `Unsupported()` + ลำดับถูกต้อง |
| **รหัสชุมชนไม่ผูกตำบล (R2-#1,2)** | **TK01/PM01/KS01/PW01/NK01** |
| **ห้ามเดารหัสพื้นที่ (R2-#3)** | **`UNVERIFIED`; ห้าม Seed Production พื้นที่จนกว่ายืนยัน** |
| **Better Auth `1.6.23` + Prisma Adapter (R2-#4)** | ล็อกใน `package.json`; RBAC ใช้ของระบบเอง |
| **Encryption: ได้ design แต่ยังห้าม implement (R2-#5)** | AES-256-GCM + Blind Index HMAC-SHA256; รอ Key Mgmt + PDPA; **เพิ่ม 🔒 พิกัดรายบ้าน** |
| **Public ห้ามคืน PII/สุขภาพ/พิกัด (R2-#5)** | View Public = Aggregate เท่านั้น |
| Consent = legal BLOCKER (#16,R2-#6) | คงโครง; ไม่กำหนดนโยบาย |

---

## 2. รายการแก้แยกตามความพร้อม — 5 กลุ่ม (ตามที่เจ้าของกำหนด)

> **`APPROVED_TO_IMPLEMENT`** · **`STRUCTURE_ONLY`** · **`WAITING_FOR_AREA_CODE`** · **`WAITING_FOR_BUSINESS_RULE`** · **`WAITING_FOR_LEGAL_DECISION`**
>
> เทียบกลุ่มเดิม (รอบ 1): A1/A2/A3(direct) → APPROVED · A3(derive)/Risk-3-score/new-models → STRUCTURE_ONLY · B(area) → WAITING_FOR_AREA_CODE · C → WAITING_FOR_BUSINESS_RULE · D → WAITING_FOR_LEGAL_DECISION

### 🟢 APPROVED_TO_IMPLEMENT — พร้อมแก้เต็ม (โครงสร้าง + ตรรกะที่เกี่ยวข้อง)

| รายการ | FIX | คำตัดสิน | ปิด |
|---|---|---|---|
| Rename `RESCUE_VOLUNTEER` → `VOLUNTEER` + แก้ Comment v2.0 | FIX-03 | #5 | CONF-02, SCH-05 |
| `CommunityTambon` M:N + `isPrimary` (รองรับ 0 ตำบลหลัก) + ลบ `Community.tambonId` + Partial Unique | FIX-01 | #6,7,8 | SCH-01 |
| Coverage fields (`totalHouseholds Int?`, `targetCoveragePercent Float @default(60)` + metadata) + ลบ `targetHouseholds` + CHECK `NULL OR >0` | FIX-02 | #1,2,3 | SCH-04, COV-01 |
| **Seed รหัสชุมชน `TK01/PM01/KS01/PW01/NK01`** + ลบ KL01–HY02 | FIX-32 | **R2-#1,2** | **SEED-01** |
| `Household.communityNameOnPaper String?` | FIX-11 | #11 | QM-01 |
| `Household.coordinateRawText String?` | FIX-12 | #12 | QM-04 |
| `Household.hasNoResources` / `volunteerNotAvailable` (+แก้ Comment seed 9→8) / `assistanceTotalPersonCount` | FIX-14,15,16 | ต่อยอด #11,12 | QM-07/09/12 |
| `riskLevelSurveyor` → `SurveyorRiskLevel?` (3 ค่า — เก็บ checkbox, ไม่ใช่สูตร) | FIX-18 | ต่อยอด #12 | AMB-05 |
| Trigger `check_different_entry_person` + แก้ Comment ที่โกหก | FIX-04 | — | **SCH-03** |
| ลบ `@@unique([houseNo, mooId, tambonId])` → `@@index` | FIX-05 | — | QM-03 |
| Constraint ทั้งหมด → `DO $$ IF NOT EXISTS` | FIX-25 | — | SQL-03 |
| `update_batch_counts` (INSERT/DELETE/ย้าย + RETURN COALESCE) | FIX-26 | — | SQL-04 |
| `release_expired_locks` (Race + Audit + lock_timeout) | FIX-27 | — | SQL-05 |
| `onDelete: Cascade` → `Restrict` (7 ตาราง) | FIX-37 | — | SCH-02 |
| `deletedAt` soft-delete + แยก `isActive` | FIX-38 | — | SCH-07 |
| FK relation ที่ขาด (6 จุด) | FIX-39 | — | SCH-20 |
| Unique ที่ขาด (`Account` ฯลฯ) | FIX-40 | — | SCH-22 |
| status String → enum + `EvacuationSiteType` | FIX-41,45 | — | SCH-26,25 |
| `createdAt`/`updatedAt` ครบ | FIX-44 | — | SCH-24 |
| Index ที่ขาด + Spatial Partial + แก้ `ix_vulnerable_search_name` (deletedAt) | FIX-30 | — | SCH-16, SQL-15/16 |
| View: `v_community_coverage` (NULL-aware) + `v_household_geo_internal` (VERIFIED) + DROP ก่อน CREATE | FIX-28 | #1,2 | COV-01/02, SQL-10 |
| `prevent_audit_modification` `RETURN NULL` → `RETURN OLD` (bugfix) | FIX-31 | — | SQL-09 |
| Comment v2.0 → v3.0 | FIX-48 | — | SCH-27 |
| `HouseholdResource.quantity/isAvailableForCommunity` → nullable | FIX-49 | — | doc 03 |
| `lastFloodYear` คง + Comment "Reserved" | FIX-46 | — | QM-11 |
| `ck_member_count` `1-50` → `0-5000` (ขอบบนชั่วคราว) | FIX-29 | — | SQL-12 |
| **เพิ่ม 🔒 ให้ `latitude`/`longitude` (จัดหมวด L3 — R2-#5)** | — | R2-#5 | จัดหมวด (ไม่ใช่ encryption) |
| Custom SQL → Prisma Migration + `Unsupported()` + ลำดับ | FIX-24 | #15 | SQL-01/02 |

> **หมายเหตุ:** ตรรกะแปลง/derive (พิกัด parse, พ.ศ./ค.ศ., dedup อพาร์ทเมนต์, นิยาม `receivedCount`) เป็น **App-layer** ที่รอบรีฟ (Q-08/10/12/30) — **ไม่ใช่ schema change** จึงไม่บล็อก DDL

### 🟡 STRUCTURE_ONLY — เพิ่มโครงสร้าง แต่ยังไม่เดินตรรกะ/seed/data

| รายการ | FIX | คำตัดสิน | เลื่อนอะไร |
|---|---|---|---|
| **Risk 3 คอลัมน์** (`rawScore`, `maximumPossibleScore`, `normalizedScore`) + ลบ `riskScoreAuto` + แก้ CHECK | FIX-06 (โครง) | **#13, R2-#8** | **ห้ามตรรกะคำนวณ/จัดระดับ (R2-#9)** |
| `floodDepthMetersRaw`/`floodDepthCmRaw` | FIX-13 | ต่อยอด #12 | derive `maxFloodDepthCm` → Q-10 |
| `pregnancyRawText`/`pregnancyUnit`/`pregnancyValue` + enum `PregnancyUnit` | FIX-17 | ต่อยอด #12 | derive `pregnancyWeeks` + ผ่อน CHECK → Q-14 |
| `VolunteerProfile` + `VolunteerProfileSkill` + `VolunteerApprovalStatus` | FIX-19 | #5 | Approval workflow logic (Phase 13) |
| `EmergencyContact` (isNationwide + พื้นที่) | FIX-20 | — | ข้อมูลเบอร์จริง (Phase 13) |
| `CommunityBoundary` (MultiPolygon + version) | FIX-21 | — | Geometry data (GIS) |
| `UserAreaScope` + `AreaScopeType` | FIX-22 | — | Resolver logic → Q-33 |
| `IncidentCommunity` (แทน `String[]`) | FIX-23 | — | — |
| `CriticalFieldConfig` + `CompareMode` | FIX-09 | — | Seed content → Q-13 |
| `HouseholdVersion` ครอบคลุมตารางลูก | FIX-47 | — | Trigger logic |

> **v_public_risk_grid:** โครง View ที่**ไม่คืน PII/พิกัด/สุขภาพ** = APPROVED (หลักการ R2-#5) แต่ค่า **k-anonymity + ขนาด Grid** รอ Q-06 → ดู `WAITING_FOR_LEGAL_DECISION`

### 🟠 WAITING_FOR_AREA_CODE — รอรหัสพื้นที่ (R2-#3)

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| Province `90` (สงขลา) | 🟡 UNVERIFIED (สอดคล้องมาตรฐาน) | ยังไม่ยืนยันจากแหล่งทางการ |
| District `9001` (หาดใหญ่) | 🔴 UNVERIFIED — **น่าจะผิด** (`9001`≈เมืองสงขลา; หาดใหญ่≈`9011`) | **ห้ามแก้เป็น 9011 โดยไม่ยืนยัน** |
| Tambon `900105`/`900101` | 🔴 UNVERIFIED | ผูกกับรหัสอำเภอที่น่าจะผิด |
| หมู่ (1-10/1-5) | 🔴 UNVERIFIED | Comment ยอมรับว่าตัวอย่าง |
| **Seed Production พื้นที่** | 🔴 **บล็อก** | ห้าม Seed จนกว่ายืนยันกับกรมการปกครอง (TIS-1099) |

> **สำคัญ:** รหัสพื้นที่ **ไม่บล็อก DDL Migration แรก** (สร้างตาราง) — บล็อกเฉพาะ **Seed Production พื้นที่**
> **รหัสชุมชน (TK01 ฯลฯ) ไม่อยู่กลุ่มนี้** — ตัดสินแล้ว และไม่ผูกกับรหัสพื้นที่ (R2-#2)

### 🔴 WAITING_FOR_BUSINESS_RULE — รอ Business Rule (#14, R2-#7,9)

| รายการ | FIX | รอ |
|---|---|---|
| การจัดระดับ LOW/MEDIUM/HIGH/CRITICAL + `absoluteScore` | FIX-06 (ที่เหลือ) | Q-25(สูตร), Q-26, GAP-D01 |
| `RiskWeightVersion` + `RiskVersionStatus` + `RiskHardRule` | FIX-07,08 | Q-29, GAP-D01 |
| Confidence 3 มิติ | — | Q-28 |
| Seed น้ำหนัก 12 ปัจจัย (115) | FIX-36 | Q-29 |
| การตีความ `NO_VEHICLE`/`NO_DIGITAL_CHANNEL` | — | Q-27 |
| Triage aging + `TriageLevel` P1-P3 vs P1-P4 | FIX-42 | GAP-D01, Q-18 |

> **ทำได้:** เพิ่ม 3 คอลัมน์คะแนน (STRUCTURE_ONLY) — **ห้ามเดินตรรกะคำนวณ/จัดระดับ (R2-#9)**

### 🔴 WAITING_FOR_LEGAL_DECISION — รอกฎหมาย/ความปลอดภัย (#16, R2-#5,6)

| รายการ | FIX | รอ | สถานะ design |
|---|---|---|---|
| **Encryption Implementation** (ciphertext cols, blind-index cols, Prisma Extension, Key mgmt) | FIX-10 | Key Management + PDPA | 🟡 **มี design** (AES-256-GCM + Blind Index HMAC-SHA256 — R2-#5) แต่**ยังห้าม implement** |
| **นโยบาย Consent** (`UNKNOWN` ใช้ทำอะไร, `withdrawnAt` มีผล) | — | Q-04, R2-#6 | 🔴 legal BLOCKER |
| **Audit Retention DELETE (5 ปี)** | FIX-31 (ที่เหลือ) | Q-04 (ผูก PDPA) | ทำเฉพาะ bugfix `RETURN OLD` แล้ว |
| **`AuditLog.changes` เก็บ PII หรือไม่** | — | Q-35 (ผูก Encryption) | — |
| **`v_public_risk_grid` k-anonymity + Grid size** | FIX-28 (Public) | Q-06 | หลักการ "ไม่คืน PII/พิกัด" = APPROVED; ค่า k รอ |

> **สิ่งที่ทำได้ระหว่างนี้:** คง 🔒; เพิ่ม 🔒 พิกัดรายบ้าน (จัดหมวด); ออกแบบ Public View ให้ไม่คืน PII; RBAC/RLS/Audit
> **ห้าม:** เพิ่มคอลัมน์ ciphertext/blind-index (= implement), ลบ 🔒, อ้างว่าเข้ารหัสแล้ว, เปิด Retention DELETE

---

## 3. รายการเปลี่ยนแปลงแยกตามประเภท

> **หมายเหตุ:** ตารางในส่วนนี้ยังใช้ป้ายเดิม (A1/A2/A3/B/C/D) — แปลงเป็น 5 กลุ่มใหม่ได้ดังนี้:
> **A1 + A2 + A3(direct: hasNoResources/volunteerNotAvailable/assistanceTotal/SurveyorRiskLevel) → `APPROVED_TO_IMPLEMENT`**
> **A3(derive: floodDepth/pregnancy) + Risk-3-score + Model ใหม่(VolunteerProfile/EmergencyContact/CommunityBoundary/UserAreaScope/IncidentCommunity/CriticalFieldConfig) → `STRUCTURE_ONLY`**
> **B(รหัสพื้นที่) → `WAITING_FOR_AREA_CODE`** · **C → `WAITING_FOR_BUSINESS_RULE`** · **D → `WAITING_FOR_LEGAL_DECISION`**
>
> ⚠️ **แก้จากรอบ 1:** Risk 3 คอลัมน์ (`rawScore`/`maximumPossibleScore`/`normalizedScore`) เดิมป้าย A1 → ที่ถูกคือ **`STRUCTURE_ONLY`** (ตาม R2-#8: แก้ได้เฉพาะโครงสร้างเก็บ ห้ามตรรกะ)

### 3.1 Enum

| Enum | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `UserRoleEnum` | `RESCUE_VOLUNTEER` → **`VOLUNTEER`** | 🟢 A1 |
| `SurveyorRiskLevel` *(ใหม่)* | `{ LOW, MEDIUM, HIGH }` — ตรงกระดาษ 3 ตัวเลือก | 🟢 A3 |
| `PregnancyUnit` *(ใหม่)* | `{ WEEKS, MONTHS, UNKNOWN }` | 🟢 A3 |
| `VolunteerApprovalStatus` *(ใหม่)* | `{ PENDING, APPROVED, REJECTED, SUSPENDED }` | 🟢 A2 |
| `AreaScopeType` *(ใหม่)* | `{ PROVINCE, DISTRICT, TAMBON }` | 🟢 A2 |
| `CompareMode` *(ใหม่)* | `{ EXACT, NORMALIZED_PHONE, NORMALIZED_TEXT, NUMERIC_TOLERANCE, SET_EQUALITY }` | 🟢 A2 |
| `NotificationStatus`/`ExportStatus`/`PdpaRequestType`/`PdpaRequestStatus`/`IncidentType`/`IncidentSeverity`/`EvacuationSiteType` *(ใหม่)* | แทน String | 🟢 A2 |
| `RiskVersionStatus` *(ใหม่)* | `{ DRAFT, ACTIVE, SUPERSEDED }` | 🔴 C |
| `TriageLevel` | P1-P3 → ? (แยก `TaskPriority` P1-P4?) | 🟡 B (Q-18) |

### 3.2 Model — เพิ่มใหม่

| Model | รองรับ | กลุ่ม |
|---|---|---|
| `CommunityTambon` (communityId, tambonId, isPrimary, note) | ควนสันติ 2 ตำบล | 🟢 A1 |
| `CommunityBoundary` (communityId, version, geom MultiPolygon, source, isApproved, effectiveFrom/To) | GIS ขอบเขต | 🟢 A2 (โครง) / 🟡 B (ข้อมูล) |
| `VolunteerProfile` (userId, communityId, status, approvedBy, pdpaAcceptedAt, equipment, deletedAt) | FR-VOL-01..10 | 🟢 A2 |
| `VolunteerProfileSkill` (M:N → VolunteerSkillType) | FR-VOL-03 | 🟢 A2 |
| `EmergencyContact` (code, nameTh, phone, category, isNationwide, communityId?, provinceId?) | FR-PUB-03 | 🟢 A2 |
| `UserAreaScope` (userId, scopeType, scopeId, canEdit, expiresAt) | Area Scope | 🟢 A2 |
| `IncidentCommunity` (incidentId, communityId) | แทน String[] | 🟢 A2 |
| `CriticalFieldConfig` (fieldPath, labelTh, section, compareMode, isCritical, version) | FR-VER-01 | 🟢 A2 (โครง) / 🟡 B (seed) |
| `RiskWeightVersion` (version, status, reason, effectiveFrom/To) | Risk versioning | 🔴 C |
| `RiskHardRule` (versionId, conditionType, effect, effectValue) | Hard Rules | 🔴 C |

### 3.3 Field — เปลี่ยนต่อ Model

**`Community`**

| Field | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `tambonId String` | **ลบ** (แทนด้วย CommunityTambon) | 🟢 A1 |
| `targetHouseholds Int @default(0)` | **ลบ** | 🟢 A1 |
| `totalHouseholds Int?` | **เพิ่ม** (NULL — ห้าม default 0) | 🟢 A1 |
| `targetCoveragePercent Float @default(60)` | **เพิ่ม** | 🟢 A1 |
| `lastPopulationUpdatedAt DateTime?` / `populationDataSource String?` / `populationDataNote String?` / `populationUpdatedById String?` | **เพิ่ม** | 🟢 A1 |
| `deletedAt DateTime?` | **เพิ่ม** | 🟢 A2 |
| relations `communityTambons` / `boundaries` / `incidentCommunities` | **เพิ่ม** | 🟢 A1/A2 |

**`Household`**

| Field | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `communityNameOnPaper String?` | **เพิ่ม** (📋 ดิบ) | 🟢 A1 |
| `coordinateRawText String?` | **เพิ่ม** (📋 ดิบ) | 🟢 A1 |
| `hasNoResources Boolean?` | **เพิ่ม** | 🟢 A3 |
| `volunteerNotAvailable Boolean?` | **เพิ่ม** | 🟢 A3 |
| `assistanceTotalPersonCount Int?` | **เพิ่ม** | 🟢 A3 |
| `@@unique([houseNo, mooId, tambonId])` | **ลบ** → `@@index` | 🟢 A2 |
| indexes: `deletedAt`, `[communityId, deletedAt]`, `surveyedAt`, `hasDuplicateFlag` | **เพิ่ม** | 🟢 A2 |
| `latitude`/`longitude` | คงไว้ (Derived จาก `coordinateRawText` — parse App-layer) | 🟡 B |

**`FloodRiskProfile`**

| Field | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `riskScoreAuto Float?` | **ลบ** | 🟢 A1 |
| `rawScore Float?` / `maximumPossibleScore Float?` / `normalizedScore Float?` | **เพิ่ม** | 🟢 A1 |
| `floodDepthMetersRaw Int?` / `floodDepthCmRaw Int?` | **เพิ่ม** (📋 ดิบ) | 🟢 A3 |
| `riskLevelSurveyor RiskLevel?` | → **`SurveyorRiskLevel?`** | 🟢 A3 |
| `absoluteScore`, `riskFormulaVersion`, `riskWeightVersionId`, `factorSnapshot`, Confidence 3 มิติ | **เพิ่ม** | 🔴 C |
| `riskLevelAuto`/`riskLevelFinal`/`riskConfidence`/`riskFactorsUsed`/`riskFactorsTotal` | คงไว้ (unused จนกว่าได้สูตร) | 🔴 C |
| `maxFloodDepthCm` | คงไว้ (Derived) | 🟡 B |

**`PersonVulnerability`**

| Field | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `pregnancyRawText String?` / `pregnancyUnit PregnancyUnit?` / `pregnancyValue Int?` | **เพิ่ม** (📋 ดิบ) | 🟢 A3 |
| `pregnancyWeeks Int?` | คงไว้ (Derived — conversion รอ Q-14) | 🟡 B |

**อื่นๆ:** `EntryAttempt` (แก้ Comment @@unique ให้ตรงจริง — A1); FK relations 6 จุด (A2); `deletedAt` ตารางลูก (A2); `createdAt`/`updatedAt` ที่ขาด (A2)

### 3.4 Index

| Index | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `ux_community_primary_tambon` — Partial `WHERE isPrimary = true` (อนุญาต 0 แถว) | **เพิ่ม** | 🟢 A1 |
| Spatial GIST → Partial `WHERE location IS NOT NULL AND deletedAt IS NULL` | **แก้** | 🟢 A2 |
| `ix_vulnerable_search_name` → เพิ่มเช็ค `household.deletedAt` | **แก้** | 🟢 A2 |
| `Household(deletedAt)`, `(communityId, deletedAt)`, `(surveyedAt)`, `(hasDuplicateFlag)` | **เพิ่ม** | 🟢 A2 |
| `Discrepancy(resolution)`, `ConsentRecord(householdId)`, `AssistanceNeed(householdId)`, `HouseholdResource(householdId)`, `EvacuationVehicle(householdId)`, `PaperBatch(status)` | **เพิ่ม** (FK ไม่มี index อัตโนมัติใน PG) | 🟢 A2 |
| `ix_community_boundary_geom` (GIST MultiPolygon) | **เพิ่ม** | 🟢 A2 |

### 3.5 Constraint (CHECK / Unique)

| Constraint | การเปลี่ยน | กลุ่ม |
|---|---|---|
| `ck_risk_score (riskScoreAuto 0-100)` | **ลบ** | 🟢 A1 |
| `ck_raw_score (rawScore >= 0)` | **เพิ่ม** (ไม่ hardcode 115) | 🟢 A1 |
| `ck_raw_le_max (rawScore <= maximumPossibleScore)` | **เพิ่ม** | 🟢 A1 |
| `ck_normalized_score (0-100)` | **เพิ่ม** | 🟢 A1 |
| `ck_community_total_households (NULL OR > 0)` | **เพิ่ม** (ห้าม 0) | 🟢 A1 |
| `ck_community_target_coverage (> 0 AND <= 100)` | **เพิ่ม** | 🟢 A1 |
| ทุก Constraint → `DO $$ IF NOT EXISTS` | **แก้** | 🟢 A2 |
| `ck_member_count (1-50)` → `(0-5000)` | **แก้** (ตัวเลขชั่วคราว) | 🟢 A2 / 🟡 B (Q-31) |
| Unique ที่ขาด (`Account [providerId, accountId]`, `VulnerablePerson [householdId, seq]`, `HouseholdResource [householdId, resourceTypeId]` ฯลฯ) | **เพิ่ม** | 🟢 A2 |
| `ck_pregnancy_weeks (1-42)` | ผ่อน → รอ | 🟡 B (Q-14) |
| Partial Unique `ux_risk_version_active` | **เพิ่ม** | 🔴 C |

### 3.6 SQL — Function / Trigger / View

| รายการ | การเปลี่ยน | กลุ่ม |
|---|---|---|
| PostGIS columns → `Unsupported("geography(...)")` + ลำดับ Migration 0002 | **แก้** | 🟢 A1 |
| `extensions = [postgis, pg_trgm]` | **เพิ่ม** | 🟢 A1 |
| Trigger `check_different_entry_person` | **เพิ่ม** | 🟢 A2 |
| `update_batch_counts` (INSERT/DELETE/ย้าย + RETURN COALESCE) | **แก้** | 🟢 A2 (นิยาม receivedCount 🟡 B) |
| `release_expired_locks` (Race + Audit + lock_timeout) | **แก้** | 🟢 A2 (Draft handling 🟡 B/Q-07) |
| `prevent_audit_modification` (`RETURN NULL` → `RETURN OLD`) | **แก้ (bugfix)** | 🟢 A2 |
| Retention DELETE (>5 ปี) | **เพิ่ม** | 🔴 D (ผูก PDPA) |
| `v_community_summary` → `v_community_coverage` (NULL-aware, Survey/Verified แยก, Subquery แก้ fan-out, DROP ก่อน CREATE) | **แก้** | 🟢 A1 |
| `v_household_geo` → `v_household_geo_internal` (filter VERIFIED + hasDuplicateFlag) | **แก้** | 🟢 A2 |
| `v_public_risk_grid` (Grid + k-anonymity) | **เพิ่ม** | 🟡 B (Q-06) |

---

## 4. ผลกระทบต่อ Seed, Dashboard, GIS, RBAC, Report

### 4.1 Seed (`seed.ts`)

| ผลกระทบ | รายละเอียด | กลุ่ม |
|---|---|---|
| ชุมชน 5 แห่ง | ชื่อจริง (ท่าเคียน/ประสานมิตร/ควนสันติ/ปลักหว้า/หน้าควน) + `CommunityTambon` (ควนสันติ 2 ตำบล `isPrimary=false`) | 🟢 A1 (โครง) / 🟡 B (`code` รอ Q-21) |
| ลบ KL01–HY02 | ต้องมีขั้นตอนลบ (upsert ไม่ลบให้) | 🟢 A1 |
| `totalHouseholds: null` ทั้ง 5 | ห้าม 600, ห้าม 0 | 🟢 A1 |
| `targetCoveragePercent: 60` | ค่าเริ่มต้น | 🟢 A1 |
| แก้ Comment "9 ประเภทอาสา" → 8 | บรรทัด 285 | 🟢 A2 |
| `exportWarningCoveragePercent: 80` เข้า SystemSetting | Config แยก | 🟢 A1 |
| ลบ `HAT_YAI_*` bbox → `COORD_BOUNDS_COUNTRY` | ไม่ผูกอำเภอ | 🟢 A2 |
| รหัสอำเภอ/ตำบล/หมู่ | รอตรวจสอบ | 🟡 B (Q-24) |
| แยก production/development seed + ผู้ใช้ทดสอบ 9 Roles | โครงสร้าง | 🟢 A2 |
| Seed น้ำหนัก Risk (115) | **ห้าม seed จนกว่ารับรอง** | 🔴 C |
| `CriticalFieldConfig` seed | โครงพร้อม, รายการรอ | 🟡 B (Q-13) |

### 4.2 Dashboard

| ผลกระทบ | รายละเอียด | กลุ่ม |
|---|---|---|
| Coverage NULL-aware | `totalHouseholds = NULL` → "ยังคำนวณไม่ได้" (ห้าม "0%") | 🟢 A1 |
| เกณฑ์ผ่าน `> 60` strict | Badge สีต้องใช้ `>` | 🟢 A1 |
| แยก Survey vs Verified Coverage | 2 ตัวชี้วัด | 🟢 A1 |
| 85% ห้ามฝังในตรรกะสถานะ | Badge/Alert ห้ามใช้ 85 | 🟢 A1 (#4) |
| Banner เตือนถาวรเมื่อ NULL | + ปุ่มไปกรอก totalHouseholds | 🟢 A2 |
| Role-based routing | `VOLUNTEER` แทน `RESCUE_VOLUNTEER` | 🟢 A1 |
| Risk count บน Dashboard | **ยังแสดงไม่ได้** (ไม่มีสูตรจัดระดับ) | 🔴 C |

### 4.3 GIS

| ผลกระทบ | รายละเอียด | กลุ่ม |
|---|---|---|
| PostGIS columns via `Unsupported()` | ไม่มี Drift; location คำนวณจาก Trigger | 🟢 A1 |
| `coordinateRawText` เก็บดิบ | lat/lng เป็น Derived (parse App-layer) | 🟢 A1 (คอลัมน์) / 🟡 B (parse) |
| `CommunityBoundary` MultiPolygon | ใช้ `ST_Covers` (ไม่ใช่ `ST_Contains`) | 🟢 A2 (โครง) / 🟡 B (geometry) |
| Spatial Index Partial | เร็วขึ้น (NFR-P-02) | 🟢 A2 |
| นับครัวเรือน/ตำบล = `Household.tambonId` | ห้าม Join CommunityTambon (นับควนสันติซ้ำ) | 🟢 A1 |
| โซนสีเทา (Coverage) | รอ Polygon | 🟡 B |
| Public Grid + k-anonymity | รอขนาด Grid/k | 🟡 B (Q-06) |

### 4.4 RBAC

| ผลกระทบ | รายละเอียด | กลุ่ม |
|---|---|---|
| `VOLUNTEER` ทุก Policy/Guard/Test | ปิด CONF-02 | 🟢 A1 |
| `VolunteerProfile` + approval (BR-68) | รออนุมัติก่อน Login | 🟢 A2 |
| `UserAreaScope` | Area Scope (resolver logic รอ Q-33) | 🟢 A2 (โครง) / 🟡 B |
| SoD: `check_different_entry_person` | Entry 2 ≠ Entry 1 (App + DB) | 🟢 A2 |
| RLS (household, vulnerable_person) | Defense in depth | 🟢 A2 (ออกแบบ) |
| **Encryption** | สงวนเจ้าของ — คง 🔒 | 🔴 D |
| **Consent policy** (UNKNOWN, withdrawal) | สงวนเจ้าของ | 🔴 D |
| VOLUNTEER PII หมดอายุหลัง Incident (VOL-EXP) | ออกแบบได้ (ไม่ใช่ encryption) | 🟢 A2 (Phase 14) |

### 4.5 Report

| ผลกระทบ | รายละเอียด | กลุ่ม |
|---|---|---|
| Coverage Watermark NULL-aware | "ยังคำนวณไม่ได้ — ไม่ทราบจำนวนครัวเรือน" | 🟢 A1 |
| Export Warning 80% (Config แยก) | ไม่ใช่ค่าเดียวกับเกณฑ์ผ่าน | 🟢 A1 |
| 85% ไม่ใช้ตัดสิน Pass ในรายงาน | — | 🟢 A1 (#4) |
| PDF ไทย (Puppeteer) | ไม่กระทบจากคำตัดสิน | 🟢 A2 |
| RESEARCHER Anonymize | โครงสร้างพร้อม; encryption รอ | 🟢 A2 / 🔴 D |
| Report ที่มี Risk Level | **ยังออกไม่ได้** (ไม่มีสูตร) | 🔴 C |

---

## 5. สรุปและ Checklist

### 5.1 นับรายการตามความพร้อม

| กลุ่ม (5 กลุ่มใหม่) | จำนวนรายการหลัก |
|---|---|
| 🟢 **APPROVED_TO_IMPLEMENT** | ~27 |
| 🟡 **STRUCTURE_ONLY** | ~10 |
| 🟠 **WAITING_FOR_AREA_CODE** | 5 (province/district/tambon/moo + seed พื้นที่) |
| 🔴 **WAITING_FOR_BUSINESS_RULE** | 6 |
| 🔴 **WAITING_FOR_LEGAL_DECISION** | 5 |

### 5.2 ลำดับที่แนะนำ (เมื่อได้อนุมัติให้แก้ — ยังไม่ทำรอบนี้)

1. `git commit` สำรอง (CLAUDE.md บังคับก่อนแก้ Schema)
2. แก้ `schema.prisma` — APPROVED_TO_IMPLEMENT → STRUCTURE_ONLY
3. สร้าง Migration 0001-0006 (ลำดับตาม #15) — **DDL ไม่ต้องรอรหัสพื้นที่**
4. ทดสอบ: รัน Migration 2 ครั้ง → ไม่ Error + ไม่มี Drift
5. แก้ `seed.ts` — รหัสชุมชน TK01 ฯลฯ (พร้อม) + Master Data; **เว้น Seed พื้นที่ (รอ Q-24) และน้ำหนัก Risk (รอ BR)**
6. เขียน Test: Trigger, Constraint, View(NULL), Seed idempotency

### 5.3 Checklist ยืนยันความถูกต้อง (เมื่อแก้จริง)

- [ ] ไม่มี `RESCUE_VOLUNTEER` เหลือ
- [ ] ไม่มี `targetHouseholds` / 600 / 3,000 เหลือ
- [ ] `totalHouseholds Int?` (ไม่มี default 0)
- [ ] `ck_community_total_households` = `NULL OR > 0`
- [ ] Coverage View คืน **NULL** เมื่อ `totalHouseholds IS NULL`
- [ ] เกณฑ์ผ่านใช้ `>` (60 พอดี = ไม่ผ่าน)
- [ ] รหัสชุมชน = `TK01/PM01/KS01/PW01/NK01` (ไม่ผูกตำบล) + ไม่มี KL01–HY02 เหลือ
- [ ] ควนสันติมี 2 แถว `CommunityTambon`, `isPrimary` เป็น false ทั้งคู่ (รองรับ 0 ตำบลหลัก)
- [ ] รหัสพื้นที่ทำเครื่องหมาย `UNVERIFIED` — **ไม่แก้ 9001 โดยเดา** + ไม่ Seed Production พื้นที่
- [ ] `rawScore = 115` บันทึกได้ (ck ไม่ปฏิเสธ)
- [ ] Trigger `check_different_entry_person` ปฏิเสธคนเดียวกันคีย์ 2 รอบ
- [ ] 🔒 ยังอยู่ครบ + เพิ่ม 🔒 พิกัดรายบ้าน (ไม่มีการอ้างว่าเข้ารหัสแล้ว)
- [ ] ไม่มีสูตร Risk Final / จัดระดับ / Hard Rule ในโค้ด (R2-#9)
- [ ] Better Auth `1.6.23` ล็อกใน `package.json` (ไม่มี `latest`) — เมื่อสร้างโปรเจกต์

### 5.4 ยืนยันขอบเขตรอบนี้

- ✅ อัปเดต `docs/16-owner-decisions.md` (เพิ่มคำตัดสินรอบ 2 = R2-#1..9)
- ✅ อัปเดต `docs/14-open-questions.md` (ปิด Q-19, Q-21; Q-20 ได้แนวทาง; Q-24 UNVERIFIED)
- ✅ อัปเดต `docs/17-approved-schema-change-spec.md` (5 กลุ่มใหม่ — เอกสารนี้)
- ✅ สร้าง `docs/18-pre-migration-checklist.md`
- 🔴 **ไม่แก้** `schema.prisma`, `seed.ts`, `00_postgis_extensions.sql`
- 🔴 **ไม่สร้าง** Migration · 🔴 **ไม่ติดตั้ง Package**
