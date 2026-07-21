# 04 — Schema Gap Analysis (`prisma/schema.prisma`)

> ตรวจสอบ `prisma/schema.prisma` (1,327 บรรทัด — 49 models, 16 enums) ตามภารกิจที่ 3 ทั้ง 24 ข้อ
> **รอบนี้ไม่มีการแก้ไข Schema** — แผนแก้ไขอยู่ใน [15-database-fix-plan.md](15-database-fix-plan.md)

## สรุประดับปัญหา

| ระดับ | จำนวน |
|---|---|
| 🔴 BLOCKER | 6 |
| 🟠 HIGH | 9 |
| 🟡 MEDIUM | 8 |
| 🟢 LOW | 6 |

---

## ตอบคำถามภารกิจที่ 3 ทีละข้อ

---

### ข้อ 1 — Model และ Field ครบตามแบบสอบถามหรือไม่?

**ไม่ครบ** — ขาด 5 ฟิลด์จากกระดาษ และมี 6 ฟิลด์ที่ไม่มีที่มาจากกระดาษ (รายละเอียดเต็มใน [03-questionnaire-database-mapping.md](03-questionnaire-database-mapping.md))

**สรุปสิ่งที่ขาด:** ชื่อชุมชนบนกระดาษ (QM-01), จำนวนคนที่ต้องการช่วยเหลือระดับครัวเรือน (QM-07), ช่อง "เมตร" ของระดับน้ำ (QM-08), "☐ ไม่มี" ของทรัพยากร (QM-09), "☐ ไม่สะดวก" ของอาสาสมัคร (QM-12), พิกัดค่าดิบ (QM-04)

**Model ระดับระบบที่ขาดทั้ง Model:**

| Model ที่ขาด | รองรับ Requirement | ระดับ |
|---|---|---|
| `VolunteerProfile` + `VolunteerProfileSkill` | FR-VOL-01..10, BR-68 | 🔴 BLOCKER |
| `EmergencyContact` | FR-PUB-03 | 🟠 HIGH |
| `CriticalFieldConfig` | FR-VER-01 | 🔴 BLOCKER |
| `CommunityTambon` | ชุมชนควนสันติ 2 ตำบล | 🔴 BLOCKER |
| `CommunityBoundary` | FR-GIS (ขอบเขตชุมชน) | 🟠 HIGH |
| `RiskWeightConfigVersion` / History | ภารกิจ 7 ข้อ 12 | 🟠 HIGH |
| `PublicStatsSnapshot` (Cache สำหรับ ISR) | NFR-PUB-02/03 | 🟡 MEDIUM |

---

### ข้อ 2 — Relation ถูกต้องหรือไม่?

**ส่วนใหญ่ถูกต้อง** — พบปัญหา 3 จุด

| Relation | สถานะ | หมายเหตุ |
|---|---|---|
| `PaperSheet` 1:1 `Household` | ✅ | `sheetId @unique` ถูกต้อง |
| `Household` 1:1 `FloodRiskProfile` | ✅ | `householdId @unique` + Cascade |
| `Household` 1:N `VulnerablePerson` | ✅ | |
| `VulnerablePerson` M:N `VulnerabilityType` ผ่าน `PersonVulnerability` | ✅ | มี `@@unique([personId, vulnerabilityTypeId])` |
| `PaperSheet` self-relation (`mergedSheets`) | ✅ | ออกแบบดี รองรับ M07 |
| **`Incident` ↔ `Community`** | ❌ | `affectedCommunities String[]` (schema.prisma:1133) — **ไม่มี FK** ดู SCH-12 |
| **`EntryStats` ↔ `User`** | ❌ | `userId String` แต่**ไม่มี relation** (schema.prisma:1316) → ไม่มี Referential Integrity |
| **`PdpaRequest` ↔ `Household`/`User`** | ❌ | `householdId`, `handledById` เป็น String เปล่า **ไม่มี FK** (schema.prisma:1262, 1268) |
| **`RiskWeightConfig.updatedBy`** | ❌ | String เปล่า ไม่มี FK (schema.prisma:1117) |
| **`SystemSetting.updatedBy`** | ❌ | String เปล่า ไม่มี FK (schema.prisma:1302) |
| **`UserRole.assignedBy`** | ❌ | String เปล่า ไม่มี FK (schema.prisma:295) |
| **`Household.surveyorUserId`** | ❌ | มี field แต่**ไม่มี relation** (schema.prisma:719) → FK ที่ประกาศแต่ไม่เชื่อม |

---

### ข้อ 3 — Cardinality ถูกต้องหรือไม่?

| ความสัมพันธ์ | Schema | ความจริง | สถานะ |
|---|---|---|---|
| Community ↔ Tambon | **N:1** (`Community.tambonId`) | **M:N** (ควนสันติ = 2 ตำบล) | 🔴 **SCH-01 — ผิด** |
| Household ↔ Tambon | N:1 | N:1 | ✅ |
| Community ↔ Household | 1:N | 1:N | ✅ |
| PaperBatch ↔ Community | N:1 | N:1 ("โดยปกติ") | ⚠️ ดู Q-09 |
| Household ↔ AssistanceNeed | 1:N | 1:N | ✅ |
| User ↔ Role | M:N (`UserRole`) | M:N | ✅ ออกแบบดี |
| User ↔ Community (Scope) | M:N (`UserCommunityScope`) | M:N | ✅ |

---

### 🔴 SCH-01 — BLOCKER: Community ผูกกับ Tambon เดียว แต่ชุมชนควนสันติครอบคลุม 2 ตำบล

**ปัญหาคืออะไร:** `Community.tambonId String` (NOT NULL, schema.prisma:394) → 1 ชุมชน = 1 ตำบล เท่านั้น

**พบในไฟล์ใด:** `prisma/schema.prisma:392-414`, `prisma/seed.ts:81-100`

**ข้อเท็จจริงที่ขัดแย้ง:** คำสั่งผู้ใช้ระบุชัด — *"ชุมชนควนสันติ — ครอบคลุมตำบลควนลังและตำบลหาดใหญ่"* และ CLAUDE.md — *"ชุมชนหนึ่งแห่งสามารถครอบคลุมมากกว่าหนึ่งตำบลได้"*, *"Community กับ Tambon ควรใช้ความสัมพันธ์ Many-to-Many ผ่านตารางเชื่อม"*

**ผลกระทบ:**
- **Seed ชุมชนควนสันติไม่ได้** ต้องเลือกตำบลใดตำบลหนึ่ง = ข้อมูลผิดตั้งแต่วันแรก
- Dashboard filter ตามตำบลจะนับครัวเรือนของควนสันติผิด (ครัวเรือนฝั่งหาดใหญ่จะถูกนับเป็นควนลัง หรือหายไป)
- GIS แสดงขอบเขตชุมชนผิด
- ผิด CLAUDE.md โดยตรง

**แนวทางแก้ไข:** ดู [05-community-area-design.md](05-community-area-design.md) — เสนอ `CommunityTambon` join table + `isPrimary`

**ต้องใช้ข้อมูลเพิ่มเติม:** ตำบลหลักของควนสันติคือตำบลใด (ควนลังหรือหาดใหญ่)? (ดู Q-17)

**Module ที่กระทบ:** M04 (Master Data), M10 (GIS), M11 (Dashboard), M16 (Report), M02

---

### ข้อ 4 — Foreign Key และ Delete Behavior เหมาะสมหรือไม่?

**ไม่สม่ำเสมอ — เป็นปัญหาที่พบมากที่สุดใน Schema นี้**

| Relation | onDelete ปัจจุบัน | ควรเป็น | เหตุผล |
|---|---|---|---|
| `Session → User` | `Cascade` | ✅ Cascade | ถูกต้อง |
| `Account → User` | `Cascade` | ✅ Cascade | ถูกต้อง |
| `UserRole → User` | `Cascade` | ✅ Cascade | ถูกต้อง |
| `UserCommunityScope → User` | `Cascade` | ✅ Cascade | ถูกต้อง |
| `UserCommunityScope → Community` | *(default: Restrict)* | ✅ Restrict | ถูกต้อง |
| `PersonVulnerability → VulnerablePerson` | `Cascade` | ✅ Cascade | ถูกต้อง |
| `AssistanceNeed → Household` | `Cascade` | ⚠️ **ขัดกับ Soft Delete** | ดูด้านล่าง |
| `HouseholdResource → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| `EvacuationVehicle → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| `AlertChannelPref → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| `DigitalReadiness → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| `VolunteerInterest → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| `FloodRiskProfile → Household` | `Cascade` | ⚠️ ขัดกับ Soft Delete | |
| **`VulnerablePerson → Household`** | *(default: Restrict)* | ❌ **ไม่สม่ำเสมอ** | ทำไมลูกคนอื่น Cascade แต่ตัวนี้ Restrict? |
| **`ConsentRecord → Household`** | *(default: Restrict)* | ✅ Restrict | ถูกต้อง — Consent ต้องไม่หายตาม |
| **`HouseholdVersion → Household`** | *(default: Restrict)* | ✅ Restrict | ถูกต้อง — ประวัติต้องอยู่ |
| **`AuditLog → User`** | *(default: Restrict)* | ✅ Restrict | ถูกต้อง — Audit ห้ามหาย |
| **`Household → PaperSheet`** | *(default: Restrict)* | ✅ Restrict | ถูกต้อง |
| **`RescueTask → Household`** | *(default: Restrict)* | ✅ Restrict | ถูกต้อง |

---

### 🟠 SCH-02 — HIGH: `onDelete: Cascade` ขัดแย้งกับนโยบาย Soft Delete

**ปัญหาคืออะไร:** `Household` ใช้ **Soft Delete** (`deletedAt`, schema.prisma:782 + BR-29 "ห้าม Hard Delete") แต่ลูก 7 ตัวใช้ `onDelete: Cascade` ซึ่งจะทำงาน**เฉพาะเมื่อ Hard Delete เท่านั้น**

**ผลกระทบ:**
1. **Cascade จะไม่มีวันทำงาน** ในการใช้งานปกติ (เพราะไม่มีการ Hard Delete) → เป็น Dead Configuration ที่สร้างความเข้าใจผิด
2. **เมื่อเกิด Hard Delete จริง (คำขอ PDPA ตาม BR-29)** → Cascade จะลบข้อมูลสุขภาพและกลุ่มเปราะบางทิ้งทันที **ซึ่งอาจถูกต้อง** แต่จะลบโดยไม่มีการบันทึกว่าลบอะไรไปบ้าง → ผิด BR-26 (ต้อง Audit) และไม่มีทางพิสูจน์ว่าทำตามคำขอครบถ้วน
3. **Soft Delete ของแม่ไม่ Cascade ไปลูก** → `household.deletedAt != null` แต่ `VulnerablePerson` ยังปรากฏใน Query ที่ไม่ได้ Join กลับไปเช็ค `deletedAt` ของแม่ → **ข้อมูลที่ "ลบแล้ว" ยังโผล่บน Dashboard/Map/Export ได้**

**หลักฐานว่าปัญหานี้เกิดจริงแล้ว:** `v_household_geo` (SQL:228) กรอง `WHERE h."deletedAt" IS NULL` ✅ แต่ `ix_vulnerable_search_name` (SQL:103-105) กรองด้วย `WHERE "isActive" = true` เท่านั้น — **ไม่ได้เช็ค `household.deletedAt`** → ค้นหาชื่อจะเจอคนในครัวเรือนที่ถูกลบไปแล้ว

**แนวทางแก้ไข:**
1. เปลี่ยน Cascade → `Restrict` ทั้ง 7 ตัว (ป้องกันการลบโดยไม่ตั้งใจ)
2. เพิ่ม `deletedAt` ให้ `VulnerablePerson` (ปัจจุบันใช้ `isActive` + `deactivatedAt` ซึ่งเป็นคนละความหมาย — "ย้ายออก/เสียชีวิต" ≠ "ลบข้อมูล")
3. เขียน Soft Delete Cascade ที่ Application Layer (Prisma Extension) + Query Helper ที่บังคับกรอง `deletedAt` เสมอ
4. Hard Delete ทำได้เฉพาะผ่าน PDPA Flow ที่มี Audit ครบ

**Module ที่กระทบ:** M08, M12, M16, M18

---

### ข้อ 5 — Unique Constraint และ Index เพียงพอหรือไม่?

**Unique Constraint ที่มี:**

| Constraint | สถานะ |
|---|---|
| `User.email @unique` | ✅ |
| `Session.token @unique` | ✅ |
| `PaperSheet.sheetNo @unique` | ✅ ตรง BR-40 |
| `PaperBatch.code @unique` | ✅ |
| `Household.sheetId @unique` | ✅ (บังคับ 1:1) |
| `FloodRiskProfile.householdId @unique` | ✅ |
| `DigitalReadiness.householdId @unique` | ✅ |
| `ConfidentialityAgreement.userId @unique` | ✅ |
| `Province/District/Tambon/Community.code @unique` | ⚠️ ดู SCH-13 |
| `Moo @@unique([tambonId, number])` | ✅ |
| `UserRole @@unique([userId, role])` | ✅ |
| `UserCommunityScope @@unique([userId, communityId])` | ✅ |
| `EntryAttempt @@unique([sheetId, attemptNo])` | ⚠️ **Comment ผิด** ดู SCH-03 |
| `PersonVulnerability @@unique([personId, vulnerabilityTypeId])` | ✅ |
| `AlertChannelPref @@unique([householdId, alertChannelId])` | ✅ |
| `VolunteerInterest @@unique([householdId, volunteerTypeId])` | ✅ |
| `EntryStats @@unique([userId, date])` | ✅ |
| `RiskWeightConfig.factorCode @unique` | ❌ **บล็อกการทำ Version** ดู SCH-08 |
| `Household @@unique([houseNo, mooId, tambonId])` | 🔴 **ผิด** ดู QM-03 |

**Unique Constraint ที่ขาด:**
- `Account` — Better Auth ต้องการ `@@unique([providerId, accountId])` ❌
- `Verification` — ควรมี index บน `identifier` ❌
- `VulnerablePerson` — ควรมี `@@unique([householdId, seq])` ❌ (ป้องกันลำดับซ้ำในใบเดียวกัน)
- `HouseholdResource` — ควรมี `@@unique([householdId, resourceTypeId])` ❌ (ปัจจุบันเพิ่มทรัพยากรประเภทเดียวกันซ้ำได้)
- `AssistanceNeed` — ควรมี `@@unique([householdId, needTypeId])` ❌
- `EvacuationVehicle` — ควรมี `@@unique([householdId, vehicleType])` ❌
- `ConsentRecord` — ไม่มี unique ใดๆ → 1 ครัวเรือนมีหลาย Consent ได้ (อาจตั้งใจ เพื่อรองรับหลายวัตถุประสงค์) ⚠️

**Index ที่มี (ดี):** `ix_sheet_pickup`, `ix_sheet_lock_expiry`, `ix_entry_throughput`, `ix_audit_entity`, `ix_task_incident_status`, `ix_vulnerable_triage`, `ix_risk_level`, `ix_household_exact_coord` ✅ — แสดงว่าผู้ออกแบบคิดเรื่อง Query Pattern มาแล้ว

**Index ที่ขาด:**

| Index ที่ควรมี | เหตุผล |
|---|---|
| `Household(deletedAt)` หรือ Partial Index `WHERE deletedAt IS NULL` | ทุก Query ต้องกรอง `deletedAt` แต่ไม่มี Index |
| `Household(communityId, deletedAt)` | Query หลักของ Dashboard |
| `Household(surveyedAt)` | คำนวณ Stale Data |
| `Household(consentStatus)` | กรอง Consent |
| `Household(hasDuplicateFlag)` | M07 Duplicate Merge |
| `Discrepancy(resolution)` / `(resolvedAt)` | คิว Verifier — มีแค่ `ix_discrepancy_sheet` |
| `Discrepancy(sheetId, resolution)` | คิวที่ยังไม่ตัดสิน |
| `VulnerablePerson(householdId, isActive)` | รายชื่อ P1 |
| `PaperBatch(status)` | รายการ Batch |
| `Notification(status)`, `ExportJob(status)`, `PdpaRequest(status)` | คิวงาน |
| `ConsentRecord(householdId)` | ❌ ไม่มี index เลย |
| `AssistanceNeed(householdId)` | ❌ ไม่มี index เลย |
| `HouseholdResource(householdId)` | ❌ ไม่มี index เลย |
| `EvacuationVehicle(householdId)` | ❌ ไม่มี index เลย |
| `HouseholdVersion(householdId)` | มี `@@index([householdId, versionNo])` ✅ |

> **หมายเหตุ:** Prisma สร้าง Index ให้ Foreign Key **โดยอัตโนมัติเฉพาะบน PostgreSQL ในบางกรณีเท่านั้น** — จริงๆ แล้ว **PostgreSQL ไม่สร้าง Index ให้ FK อัตโนมัติ** (ต่างจาก MySQL) → ตาราง M:N อย่าง `AssistanceNeed`, `HouseholdResource`, `EvacuationVehicle`, `ConsentRecord` ที่ไม่มี `@@index` เลย จะทำ Full Table Scan ทุกครั้งที่ Join → **สำคัญมากเมื่อถึง 50,000 ครัวเรือน (NFR-SC-01)**

---

### ข้อ 6 — Nullable และ Required ถูกต้องหรือไม่?

**ถูกต้องเป็นส่วนใหญ่ ✅** — เกือบทุกฟิลด์ที่มาจากกระดาษเป็น Nullable ซึ่งตรงกับหลักการ "ห้ามบังคับให้ผู้คีย์เดา"

**จุดที่ควรทบทวน:**

| Field | ปัจจุบัน | ปัญหา |
|---|---|---|
| `Household.communityId` | `String` (Required) | ถ้าชื่อชุมชนบนกระดาษอ่านไม่ออก จะบันทึกไม่ได้ (QM-01) |
| `Community.targetHouseholds` | `Int @default(0)` | ❌ **ต้องเป็น `totalHouseholds Int?`** — `@default(0)` ทำให้หารด้วยศูนย์ และ "0" กับ "ไม่ทราบ" แยกไม่ออก (ดู SCH-04) |
| `FloodRiskProfile.riskFactorsTotal` | `Int? @default(12)` | ⚠️ Nullable + default พร้อมกัน = สับสน และ hardcode 12 |
| `HouseholdResource.quantity` | `Int @default(1)` | ❌ กระดาษไม่มีช่องจำนวน → สร้างข้อมูลเท็จ |
| `HouseholdResource.isAvailableForCommunity` | `Boolean @default(false)` | ❌ กระดาษไม่ได้ถาม → `false` = "ไม่ยอมแบ่งปัน" ซึ่งเป็นการตีความที่ไม่มีหลักฐาน |
| `EvacuationSite.latitude/longitude` | `Decimal` (Required) | ✅ ถูกต้อง (ข้อมูลจากเทศบาล ไม่ใช่กระดาษ) |
| `Incident.severity` | `Int @default(1)` | ⚠️ ควรเป็น enum |

---

### 🔴 SCH-04 — BLOCKER: `targetHouseholds Int @default(0)` — แนวคิดผิดและอันตราย

**ปัญหาคืออะไร:** 3 ชั้น

1. **แนวคิดถูกยกเลิกแล้ว** — "จำนวนครัวเรือนเป้าหมาย" (600) ถูกยกเลิกโดยคำสั่งผู้ใช้ → ต้องเปลี่ยนเป็น "จำนวนครัวเรือนทั้งหมด" (`totalHouseholds`) + "เปอร์เซ็นต์เป้าหมาย" (`targetCoveragePercent`)
2. **`@default(0)` อันตราย** — `0` ไม่ได้แปลว่า "ไม่ทราบ" แต่แปลว่า "เป้าหมาย 0 ครัวเรือน" → `v_community_summary` (SQL:246-251) มี `CASE WHEN c."targetHouseholds" > 0 ... ELSE 0` ซึ่งจะคืน **Coverage = 0%** เมื่อไม่ทราบ Denominator → **ผิดร้ายแรง** เพราะ "0%" กับ "ยังคำนวณไม่ได้" ต่างกันสิ้นเชิง และจะทำให้ผู้บริหารเข้าใจว่ายังไม่ได้สำรวจเลย (ตรงกับความเสี่ยง RK-C1)
3. **Not Nullable** — คำสั่งระบุชัด: *"`totalHouseholds` ต้อง Nullable ได้"*

**แนวทางแก้ไข:** ดู [06-coverage-model-review.md](06-coverage-model-review.md)

**Module ที่กระทบ:** M11, M16, M06, M10

---

### ข้อ 7 — Enum มีค่าครบและใช้ชื่อสอดคล้องกันหรือไม่?

**16 Enums — ตรวจแล้วทีละตัว:**

| Enum | ค่า | ตรงกับกระดาษ/เอกสาร? |
|---|---|---|
| `SheetStatus` | 10 ค่า | ✅ ตรง FR-BAT-04 ("10 สถานะ") |
| `BatchStatus` | 4 ค่า | ✅ ตรง BP-01/BP-05 |
| `FieldStatusEnum` | 4 ค่า | ✅ ตรง T10 + CLAUDE.md 100% |
| `DiscrepancyResolution` | 5 ค่า | ✅ ตรง FR-VER-05/06 |
| `FieldQueryStatus` | 4 ค่า | ✅ ตรง BP-04 |
| `ConsentStatus` | 4 ค่า | ✅ ออกแบบดี (มี `UNKNOWN` + `LEGAL_BASIS`) |
| `FloorLevel` | 3 ค่า | ✅ ตรงกระดาษ ส่วนที่ 3 ข้อ 1 |
| `LastEvacuationPlace` | 4 ค่า | ✅ ตรงกระดาษ ส่วนที่ 3 ข้อ 7 |
| `NearestEvacSiteType` | 7 ค่า | ✅ ตรงกระดาษ ส่วนที่ 3 ข้อ 8 |
| `VehicleType` | 4 ค่า | ✅ ตรงกระดาษ ส่วนที่ 3 ข้อ 9 |
| `RiskLevel` | 4 ค่า | ⚠️ **ใช้ปนกัน 2 วัตถุประสงค์** ดู AMB-05 |
| `TriageLevel` | 3 ค่า (P1/P2/P3) | ⚠️ **ขัดกับ CLAUDE.md** ที่ระบุ "Priority P1–P4" |
| `AuditAction` | 14 ค่า | ✅ ครบดี |
| `UserRoleEnum` | 9 ค่า | 🔴 **ผิด** ดู SCH-05 |
| `IncidentStatus` | 2 ค่า | ⚠️ ขาด `DRAFT`/`STANDBY`? |
| `TaskStatus` | 6 ค่า | ✅ |

**Enum ที่ขาด (ควรมี):** `SurveyorRiskLevel` (3 ค่า), `PregnancyUnit`, `NotificationStatus`, `ExportStatus`, `PdpaRequestType`, `PdpaRequestStatus`, `IncidentType`, `IncidentSeverity`, `VolunteerApprovalStatus`

---

### 🔴 SCH-05 — BLOCKER: `UserRoleEnum` ไม่ตรงกับเอกสาร

**ปัญหา:**

| เอกสาร v3.0 (9 Roles) | Schema `UserRoleEnum` (9 ค่า) | ตรงกัน? |
|---|---|---|
| `ADMIN` | `ADMIN` | ✅ |
| `EXECUTIVE` | `EXECUTIVE` | ✅ |
| `OFFICER` | `OFFICER` | ✅ |
| `COORDINATOR` | `COORDINATOR` | ✅ |
| `VERIFIER` | `VERIFIER` | ✅ |
| **`VOLUNTEER`** | **`RESCUE_VOLUNTEER`** | ❌ **ชื่อไม่ตรง** |
| `DATA_ENTRY` | `DATA_ENTRY` | ⚠️ Comment ผิด: "อาสาคีย์ข้อมูล" — แต่ v3.0 เปลี่ยนเป็น **เจ้าหน้าที่** แล้ว (Change Log ข้อ 1) |
| `RESEARCHER` | `RESEARCHER` | ✅ |
| `FIELD_SURVEYOR` | `FIELD_SURVEYOR` | ✅ |

**นอกจากนี้:** `ConfidentialityAgreement` มี Comment ว่า *"**อาสาสมัคร**ต้องลงนามก่อนคีย์ใบแรก — BR-59"* (schema.prisma:319) แต่ BR-59 ฉบับ v3.0 เปลี่ยนเป็น *"**เจ้าหน้าที่คีย์** ลงนามข้อตกลงรักษาความลับก่อนคีย์"* (system-analysis.md:654) → **Comment ยังเป็น v2.0**

**ข้อเสนอ:** ใช้ `VOLUNTEER` (เหตุผลเต็มใน [02-requirement-gap-analysis.md](02-requirement-gap-analysis.md) CONF-02)

**⚠️ ข้อควรระวังทางเทคนิค:** การเปลี่ยนชื่อค่า Enum ใน PostgreSQL ทำได้ด้วย `ALTER TYPE ... RENAME VALUE` (PG 10+) ซึ่งง่าย **แต่ต้องทำก่อนมีข้อมูล** — ถ้าปล่อยไว้จนมี User จริงจะต้องอัปเดตข้อมูลด้วย → **ต้องตัดสินใจก่อนเริ่ม M01**

---

### 🟡 SCH-06 — MEDIUM: `TriageLevel` มี 3 ระดับ แต่ CLAUDE.md ระบุ P1–P4

**พบใน:** `prisma/schema.prisma:127-131` (P1, P2, P3) vs `CLAUDE.md` — *"Incident command … มี Priority **P1–P4**"*

**ผลกระทบ:** Incident Command ต้องการ 4 ระดับ แต่ Triage ของกลุ่มเปราะบางมี 3 ระดับ และ `RescueTask.priority` ใช้ `TriageLevel` (schema.prisma:1153) → **P4 สร้างไม่ได้**

**แนวทางแก้ไข:** แยก 2 แนวคิด — `TriageLevel` (P1–P3, ความเปราะบางของคน) กับ `TaskPriority` (P1–P4, ความเร่งด่วนของงาน) หรือขยาย `TriageLevel` เป็น P1–P4 → **ต้องยืนยัน** (ดู Q-18)

---

### ข้อ 8 — Naming Convention สม่ำเสมอหรือไม่?

**ส่วนใหญ่ดี** — Model = PascalCase, Field = camelCase, `@@map` = snake_case ✅ สม่ำเสมอทั้งไฟล์

**จุดที่ไม่สม่ำเสมอ:**

| ประเด็น | ตัวอย่าง |
|---|---|
| Enum ลงท้าย `Enum` ไม่สม่ำเสมอ | `FieldStatusEnum`, `UserRoleEnum` มี "Enum" ต่อท้าย แต่ `SheetStatus`, `BatchStatus`, `RiskLevel` ไม่มี |
| Model `FieldStatus` ชนกับ Enum `FieldStatusEnum` | สับสน — Model ชื่อ `FieldStatus` แต่ Enum ต้องเติม `Enum` เพราะชื่อชนกัน |
| "Type" ต่อท้ายไม่สม่ำเสมอ | `BuildingType`, `OwnershipType`, `VulnerabilityType`, `ResourceType`, `AssistanceNeedType`, `VolunteerSkillType` ✅ แต่ `AlertChannel` (ไม่มี "Type") |
| `nameTh`/`nameEn` vs `name` | Master Data ใช้ `nameTh`/`nameEn` แต่ `User.name`, `EvacuationSite.name`, `Incident.name` ใช้ `name` เฉยๆ |
| `xxxOther` vs `xxxOther` | `buildingTypeOther`, `ownershipOther` (ไม่ใช่ `ownershipTypeOther`) — ไม่สม่ำเสมอ |
| `id` ทุกตารางเป็น `cuid()` | ✅ สม่ำเสมอ |
| `createdAt`/`updatedAt` | ⚠️ ไม่ครบทุกตาราง — `AssistanceNeed`, `HouseholdResource`, `EvacuationVehicle`, `AlertChannelPref`, `DigitalReadiness`, `VolunteerInterest`, `PersonVulnerability` (มีแค่ `createdAt`), `RiskWeightConfig`, `UserRole` ไม่มี `updatedAt` |

---

### ข้อ 9 — Soft Delete รองรับครบหรือไม่?

**❌ ไม่ครบ — มีเพียง 1 ตารางจาก 49**

| Model | กลไก |
|---|---|
| `Household` | `deletedAt DateTime?` ✅ |
| `VulnerablePerson` | `isActive` + `deactivatedAt` + `deactivatedReason` ⚠️ **คนละความหมาย** ("ย้ายออก/เสียชีวิต" ไม่ใช่ "ลบข้อมูล") |
| Master Data (9 ตาราง) | `isActive Boolean` ⚠️ (Deactivate ≠ Delete) |
| `Community`, `EvacuationSite` | `isActive` ⚠️ |
| **ตารางที่เหลือ ~36 ตาราง** | ❌ **ไม่มีกลไกลบเลย** — `PaperBatch`, `PaperSheet`, `EntryAttempt`, `Discrepancy`, `FieldQuery`, `ConsentRecord`, `AssistanceNeed`, `HouseholdResource`, `EvacuationVehicle`, `AlertChannelPref`, `DigitalReadiness`, `VolunteerInterest`, `FloodRiskProfile`, `Incident`, `RescueTask`, `Notification`, ฯลฯ |

**ผลกระทบ:** ผิด CLAUDE.md — *"ใช้ Soft Delete เป็นค่าเริ่มต้น"* และเมื่อต้องลบ `HouseholdResource` 1 แถว (คีย์ผิด) จะไม่มีร่องรอยเลย

**แนวทางแก้ไข:** เพิ่ม `deletedAt DateTime?` ให้ตารางที่เก็บข้อมูลจากกระดาษทั้งหมด + Prisma Extension ที่กรอง `deletedAt: null` อัตโนมัติ + แยก `isActive` (สถานะทางธุรกิจ) ออกจาก `deletedAt` (การลบ) ให้ชัดเจน

**ระดับ:** 🟠 HIGH (SCH-07)

---

### ข้อ 10 — Audit Trail รองรับเพียงพอหรือไม่?

**พอในเชิงโครงสร้าง แต่ยังไม่พอในเชิงการบังคับใช้**

✅ **จุดแข็ง:**
- `AuditLog` มี `userId`, `action` (14 ค่า), `entityType`, `entityId`, `changes Json`, `reason`, `ipAddress`, `userAgent`, `createdAt` — ครบถ้วน
- Index `ix_audit_entity` (entityType, entityId, createdAt DESC) ✅ เหมาะกับ Query "ใครทำอะไรกับ record นี้บ้าง"
- Index `[userId, createdAt DESC]` ✅ เหมาะกับ "user นี้ทำอะไรบ้าง"
- มี Trigger ป้องกัน UPDATE/DELETE (SQL:117-129) ✅

⚠️ **จุดอ่อน:**

| ปัญหา | รายละเอียด |
|---|---|
| **ไม่มีอะไรบังคับให้เขียน Audit** | BR-26 บอก "ทุกครั้งที่ดู/Export ข้อมูลกลุ่มเปราะบาง ต้องบันทึก Audit Log" แต่ Schema บังคับไม่ได้ — ถ้าโปรแกรมเมอร์ลืมเรียก `createAuditLog()` ก็ไม่มีใครรู้ → ต้องบังคับที่ Architecture (Repository Layer เท่านั้นที่เข้าถึง DB ได้ + Middleware) |
| **`AuditAction` ไม่มี `READ` ที่แยกระดับ** | มี `READ` แต่การดู List กับดู Detail ต่างกันมากในเชิง PDPA |
| **ไม่มี `entityType` ที่เป็น Type-safe** | เป็น `String` → พิมพ์ "Houshold" ผิดก็ยังบันทึกได้ |
| **ขัดกับ BR-30 (เก็บ 5 ปี)** | Trigger ห้าม DELETE โดยสิ้นเชิง → ลบ Audit เก่าตาม Retention ไม่ได้ (ดู SQL-09) |
| **`HouseholdVersion` ไม่ครอบคลุมตารางลูก** | เก็บ snapshot ของ `Household` เท่านั้น — การแก้ `VulnerablePerson` หรือ `FloodRiskProfile` ไม่มี Version |

**ระดับ:** 🟡 MEDIUM

---

### ข้อ 11 — Household Versioning รองรับหรือไม่?

**รองรับบางส่วน ⚠️**

✅ `HouseholdVersion` มี `versionNo`, `snapshot Json`, `changedById`, `changedAt`, `changeReason` + index `[householdId, versionNo]`

❌ **ปัญหา:**
1. **`Household` ไม่มี `currentVersionNo`** → ต้อง `MAX(versionNo)` ทุกครั้ง (ช้า) และมี Race Condition เมื่อ 2 คนแก้พร้อมกัน → **ต้องใช้ Transaction** (ตาม CLAUDE.md: "Database Operations ที่มีการแข่งขันกันต้องใช้ Transaction")
2. **ไม่มี `@@unique([householdId, versionNo])`** → versionNo ซ้ำได้
3. **ครอบคลุมแค่ `Household`** — ไม่ครอบคลุม `VulnerablePerson`, `FloodRiskProfile`, `AssistanceNeed` ฯลฯ ซึ่งเป็นที่อยู่ของข้อมูลอ่อนไหวที่สุด
4. **`snapshot Json` 🔒** — ไม่มีการเข้ารหัสจริง และจะเก็บ PII/L4 ทั้งก้อน
5. **ไม่มีกฎว่าเมื่อไหร่ต้องสร้าง Version** — ทุกการแก้? เฉพาะหลัง VERIFIED? → ไม่ระบุ

**ระดับ:** 🟡 MEDIUM

---

### ข้อ 12 — Consent และ PDPA รองรับหรือไม่?

**รองรับในเชิงโครงสร้าง ✅ แต่ขาดการเชื่อมโยงเชิงบังคับ**

✅ **มี:** `ConsentRecord` (consentGivenBy, relationship, consentedAt, consentVersion, consentType, scanUrl, withdrawnAt), `Household.consentStatus` + `consentNote`, `ConsentStatus` enum ที่ออกแบบดี (มี `UNKNOWN` สำหรับกระดาษที่ไม่มีช่อง Consent และ `LEGAL_BASIS` สำหรับฐานกฎหมายอื่น), `PdpaRequest`

❌ **ขาด:**

| ปัญหา | ระดับ |
|---|---|
| `PdpaRequest` **ไม่มี FK** ไป `Household` และ `User` (schema.prisma:1262, 1268) | 🟡 |
| `PdpaRequest.requestType`/`status` เป็น `String` ไม่ใช่ enum | 🟢 |
| **ไม่มีกฎว่า `consentStatus = UNKNOWN` ทำอะไรได้บ้าง** — คำนวณ Risk ได้ไหม? Export ได้ไหม? แสดงบน Dashboard ได้ไหม? | 🟠 |
| **ไม่มี Retention Policy** (BR-30: 5 ปี) — ไม่มีฟิลด์ `retentionUntil` หรือ Job | 🟡 |
| **`withdrawnAt` ไม่มีผลอัตโนมัติ** — ถอน Consent แล้วข้อมูลยังอยู่และยังถูกใช้ต่อ ไม่มีกลไกเชื่อม | 🟠 |
| **ไม่มี `ConsentRecord` ↔ `PaperSheet`** — ใบ Consent เป็นกระดาษแยกที่แนบมากับแบบสอบถาม ควรตามรอยได้ว่าใบไหนมี/ไม่มี | 🟡 |
| **`Household.consentStatus` ซ้ำซ้อนกับ `ConsentRecord`** — 2 แหล่งความจริง อาจไม่ตรงกัน | 🟡 |

---

### ข้อ 13 — Better Auth Schema ตรงกับ Adapter และ Version ที่จะใช้หรือไม่?

**⚠️ ไม่ตรง — มีความเสี่ยงสูงที่จะพังตอน Integrate**

| ตาราง | Better Auth (Prisma Adapter) ต้องการ | Schema ปัจจุบัน | สถานะ |
|---|---|---|---|
| `User` | id, name, email, emailVerified, image, createdAt, updatedAt | ✅ ครบ + phone, isActive, lastLoginAt (custom) | ✅ (custom fields ต้องประกาศใน `additionalFields`) |
| `Session` | id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt | ✅ ครบ | ✅ |
| `Account` | id, userId, accountId, providerId, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, idToken, password, createdAt, updatedAt | ✅ ครบ | ⚠️ **ขาด `@@unique([providerId, accountId])`** |
| `Verification` | id, identifier, value, expiresAt, createdAt, updatedAt | ✅ ครบ | ⚠️ ขาด index บน `identifier` |
| **2FA (FR-AUTH-05)** | plugin `twoFactor` ต้องการตาราง `twoFactor` (userId, secret, backupCodes) | ❌ **ไม่มี** | ❌ |
| **Account Lockout (FR-AUTH-12)** | ต้องเก็บ failed attempts | ❌ **ไม่มี** | ❌ |
| **Admin plugin** (ถ้าใช้) | `user.role`, `user.banned`, `user.banReason`, `user.banExpires`, `session.impersonatedBy` | ❌ ไม่มี (ใช้ `UserRole` แยกแทน) | ⚠️ ต้องตัดสินใจ |

**ประเด็นสำคัญ:** Schema ประกาศ `@@map("user")`, `@@map("session")` ฯลฯ เป็น **singular lowercase** ซึ่งตรงกับ default ของ Better Auth ✅

**⚠️ ความเสี่ยงหลัก:** **เอกสารไม่ได้ระบุเวอร์ชันของ Better Auth** ที่จะใช้ → Schema requirement ต่างกันระหว่างเวอร์ชัน และ Better Auth ยังพัฒนาอยู่ตลอด

**แนวทางแก้ไข:**
1. **ตรึงเวอร์ชัน Better Auth ให้ชัดเจนก่อน** (ดู Q-19)
2. ใช้ `npx @better-auth/cli generate` สร้าง Schema ส่วน Auth **แทนการเขียนมือ** แล้ว Merge เข้า schema.prisma → ป้องกันความไม่ตรงกัน
3. เพิ่ม Integration Test ที่ทดสอบ Login/Session/Password Reset จริงตั้งแต่ Phase 3
4. ตัดสินใจว่าจะใช้ `UserRole` ของเราเอง (ยืดหยุ่นกว่า รองรับ M:N + scope) หรือ admin plugin ของ Better Auth → **แนะนำใช้ของเราเอง** เพราะระบบต้องการ Community Scope ที่ plugin ไม่รองรับ

**ระดับ:** 🟠 HIGH (SCH-09)

---

### ข้อ 14 — Role ระหว่าง `VOLUNTEER` และ `RESCUE_VOLUNTEER` ควรใช้ชื่อใด?

**ตอบ: `VOLUNTEER`** — เหตุผลเต็มใน [02-requirement-gap-analysis.md](02-requirement-gap-analysis.md) CONF-02

สรุปเหตุผล: (1) เอกสาร v3.0 ประกาศเปลี่ยนไว้ชัดใน BR-25, (2) ขอบเขตงานกว้างกว่าการกู้ภัย — กระดาษมีอาสา 8 ด้าน มีแค่ 1 ด้านที่เป็น "กู้ภัย", (3) Module ชื่อ M19 Volunteer Management

**⚠️ ต้องได้รับการยืนยันจากเจ้าของระบบก่อนเริ่ม M01**

---

### ข้อ 15 — Community Scope และ Area Scope รองรับหรือไม่?

**รองรับ Community Scope ✅ แต่ไม่รองรับ Area Scope ❌**

✅ `UserCommunityScope` (userId, communityId, canEdit) + `@@unique([userId, communityId])` — ใช้ได้ดีสำหรับ OFFICER/COORDINATOR ที่ดูแลชุมชนเฉพาะ

❌ **ปัญหา:**
1. **ไม่มี Area Scope** — CLAUDE.md ระบุ *"ทุก Role ต้องรองรับ Community Scope **หรือ Area Scope** ตามสิทธิ์ที่กำหนด"* แต่ไม่มีกลไกให้สิทธิ์ระดับ **ตำบล / อำเภอ / จังหวัด** → เจ้าหน้าที่เทศบาลที่ดูแลทั้งตำบลต้องเพิ่มทีละชุมชน และเมื่อมีชุมชนใหม่ต้องมาเพิ่มสิทธิ์ด้วยมือ (ลืมง่าย)
2. **ไม่รองรับ "ทั้งระบบ"** — ADMIN/EXECUTIVE เห็นทุกชุมชน แต่ต้องมีแถวใน `UserCommunityScope` ทุกชุมชนหรือไม่? → ไม่ระบุ (ต้องมี Bypass Logic ที่ชัดเจน)
3. **ไม่มี `expiresAt`** — สิทธิ์ชั่วคราว (เช่น อาสาสมัครช่วงเกิดเหตุ) ทำไม่ได้
4. **`canEdit Boolean`** หยาบเกินไป — VOLUNTEER ที่ได้รับมอบหมาย Task ต้องเห็น PII เฉพาะรายที่มอบหมาย (BR-65) ซึ่ง `canEdit` ตอบไม่ได้

**แนวทางแก้ไข:** เพิ่ม `UserAreaScope` (userId, scopeType: PROVINCE|DISTRICT|TAMBON, scopeId, canEdit, expiresAt) + Resolver ที่รวม Community Scope + Area Scope + Role → รายละเอียดใน [10-rbac-pdpa-matrix.md](10-rbac-pdpa-matrix.md)

**ระดับ:** 🟠 HIGH (SCH-10)

---

### ข้อ 16 — DATA_ENTRY สามารถถูกจำกัดให้เห็นเฉพาะ Paper Sheet ที่ได้รับมอบหมายได้หรือไม่?

**ได้ในเชิงเทคนิค ✅ แต่ Schema ไม่ได้ช่วยบังคับ**

✅ `PaperSheet` มี `lockedById`, `lockedAt`, `lockExpiresAt` → Query ได้ว่า `WHERE lockedById = currentUser.id AND lockExpiresAt > now()`

❌ **ปัญหาเชิงสถาปัตยกรรม:**
1. **การบังคับต้องอยู่ที่ Application 100%** — ไม่มี RLS (Row Level Security) ใน Schema → ถ้าโปรแกรมเมอร์เขียน `prisma.household.findMany()` โดยลืมกรอง DATA_ENTRY จะเห็นทุกใบทันที **นี่คือ NFR-S-06 ที่เป็นข้อกำหนดระดับ Security**
2. **`Household` ไม่มีทางรู้ว่าใคร Lock อยู่** — ต้อง Join กลับไป `PaperSheet` ทุกครั้ง
3. **Lock หมดอายุแล้วยังเห็นข้อมูลไหม?** — ถ้า Lock หมดอายุกลางคัน DATA_ENTRY ที่เปิดหน้าค้างไว้ยัง Submit ได้หรือไม่? → ไม่มีกฎ

**แนวทางแก้ไข (สำคัญมาก):**
- **แนะนำใช้ PostgreSQL Row Level Security (RLS)** เป็นชั้นป้องกันที่ 2 สำหรับ `household`, `vulnerable_person` — เพื่อให้แม้โค้ดพลาดก็ยังไม่รั่ว (Defense in Depth) — สอดคล้องกับ NFR-S-06 ที่เป็น Security Requirement
- หรืออย่างน้อย **บังคับให้ทุก Query ผ่าน Repository Layer** ที่รับ `AuthContext` เสมอ + ESLint rule ห้ามเรียก `prisma.*` นอก `db/repositories/`
- เพิ่ม Integration Test: "DATA_ENTRY เรียก API ทุกตัวแล้วต้องไม่เห็นใบที่ไม่ได้ Lock" (ตรงกับ Testing Strategy บรรทัด 1056)

**ระดับ:** 🟠 HIGH (SCH-11)

---

### ข้อ 17 — Blind Double-entry รองรับจริงหรือไม่?

**รองรับบางส่วน ⚠️**

✅ **มี:**
- `EntryAttempt.attemptNo` (1 หรือ 2)
- `EntryAttempt.isBlind Boolean @default(false)` — Flag ว่าเป็น Entry 2 ที่ไม่เห็นค่า Entry 1
- `EntryAttempt.payload Json` — เก็บค่าที่คีย์ทั้งก้อน → เทียบกันได้
- `@@unique([sheetId, attemptNo])` — กันคีย์ Entry เดียวกันซ้ำ

❌ **ปัญหา:**

1. **`isBlind` เป็นเพียง Flag ที่ไม่มีผลบังคับ** — ระบบต้องไม่ส่ง `payload` ของ Entry 1 ไปที่ Client ตอนคีย์ Entry 2 ซึ่ง **Schema บังคับไม่ได้เลย** ต้องพึ่ง Application 100% → ต้องมี Integration Test เฉพาะ
2. **ไม่มีการกำหนดว่า Entry 2 ต้องคีย์ฟิลด์ไหน** (GAP-R03) → `payload` ของ Entry 2 จะมีโครงสร้างอย่างไร?
3. **`payload Json` ไม่มี Schema Validation ที่ DB** → Entry 1 กับ Entry 2 อาจมีโครงสร้าง JSON ต่างกันจน Discrepancy Engine เทียบไม่ได้
4. **ไม่มี `EntryAttempt.status`** → แยกไม่ออกระหว่าง Draft (กำลังคีย์) กับ Submitted (`submittedAt` nullable ใช้แทนได้ แต่ไม่ชัดเจน) → เกี่ยวกับ AMB-03
5. **ไม่มีการป้องกันคนเดียวกันคีย์ 2 รอบ** → ดูข้อ 18

---

### ข้อ 18 — ป้องกันคนเดียวกันคีย์ Entry 1 และ Entry 2 หรือไม่?

## 🔴 SCH-03 — BLOCKER: **ไม่ป้องกัน** — Comment อ้างว่าป้องกัน แต่ Constraint ทำคนละอย่าง

**ปัญหาคืออะไร:** `schema.prisma:628-629` เขียนว่า

```prisma
// ⭐ ห้ามคนเดียวกันคีย์ทั้ง Entry 1 และ 2 (BR-44)
@@unique([sheetId, attemptNo])
```

**Comment กับ Constraint ไม่ตรงกันเลย** — `@@unique([sheetId, attemptNo])` บังคับเพียงว่า *"ใบหนึ่งมี Entry หมายเลข 1 ได้ครั้งเดียว และ Entry หมายเลข 2 ได้ครั้งเดียว"* ซึ่ง**ไม่เกี่ยวกับตัวบุคคลเลย** — `enteredById` ไม่ได้อยู่ใน Constraint นี้ด้วยซ้ำ

**ผลลัพธ์:** ผู้ใช้ A สามารถคีย์ทั้ง Entry 1 และ Entry 2 ของใบเดียวกันได้ — Database จะยอมรับอย่างสมบูรณ์

**ผลกระทบร้ายแรง:**
- **ทำลายคุณค่าทั้งหมดของ Double-entry** — ถ้าคนเดียวกันคีย์ 2 รอบ จะคีย์ผิดเหมือนเดิมทั้ง 2 ครั้ง (โดยเฉพาะถ้าอ่านลายมือผิดแบบเดียวกัน) → Discrepancy Engine จะบอกว่า "ตรงกัน" → `VERIFIED` → **ข้อมูลผิดเข้าสู่ระบบโดยมีตราประทับว่า "ยืนยันแล้ว"**
- นี่คือ **PE2 ("คีย์ผิดโดยไม่มีใครรู้")** ซึ่งเป็นความเสี่ยงระดับ 🔴 วิกฤต และ RK-E2 ที่มีมาตรการเดียวคือ Double-entry
- ผิด **FR-VER-03** (ระดับ M) และ **BR-44** โดยตรง
- **KPI "Error rate หลัง Double-entry ≤0.5%" จะเป็นตัวเลขลวง**

**ยิ่งอันตรายกว่า:** เพราะ Comment เขียนว่าป้องกันแล้ว → ผู้พัฒนาและผู้ตรวจสอบจะเชื่อว่ามีการป้องกัน และไม่ไปเขียน Logic เพิ่ม

**พบในไฟล์ใด:** `prisma/schema.prisma:628-629`

**แนวทางแก้ไข (ต้องทำทั้ง 2 ชั้น):**

1. **ชั้น Application (บังคับหลัก):** ตอน `POST /api/verify/pickup` ต้อง Query ว่า `EntryAttempt` ของใบนี้ที่ `attemptNo = 1` มี `enteredById = currentUser.id` หรือไม่ → ถ้าใช่ ห้ามหยิบ และต้องข้ามไปใบถัดไป (ใช้ร่วมกับ `FOR UPDATE SKIP LOCKED` ตาม T7)

2. **ชั้น Database (Defense in Depth):** Prisma ประกาศ Constraint แบบนี้ไม่ได้ → ต้องใช้ Custom SQL:

```sql
-- ตัวเลือก A: Exclusion Constraint ผ่าน Trigger (ตรวจก่อน INSERT)
CREATE OR REPLACE FUNCTION check_different_entry_person()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "entry_attempt"
    WHERE "sheetId" = NEW."sheetId"
      AND "enteredById" = NEW."enteredById"
      AND "attemptNo" <> NEW."attemptNo"
  ) THEN
    RAISE EXCEPTION 'BR-44: ผู้ใช้ % คีย์ใบ % ไปแล้ว ห้ามคีย์รอบที่ % ซ้ำ',
      NEW."enteredById", NEW."sheetId", NEW."attemptNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entry_different_person
  BEFORE INSERT ON "entry_attempt"
  FOR EACH ROW EXECUTE FUNCTION check_different_entry_person();
```

> **หมายเหตุ:** ต้องระวัง Race Condition — 2 transaction พร้อมกันอาจผ่าน Trigger ทั้งคู่
> → ต้องใช้ `SELECT ... FOR UPDATE` บน `paper_sheet` ในระดับ Transaction ของการ Pickup (ซึ่งมีอยู่แล้วตาม T7)
> หรือใช้ Unique Index แบบ `@@unique([sheetId, enteredById])` ซึ่ง**แรงเกินไป** เพราะจะห้ามคนเดิมแก้ Draft ของตัวเอง

3. **เพิ่ม Test:** Unit Test + Integration Test ที่พยายามให้คนเดียวกันคีย์ 2 รอบ แล้วต้องถูกปฏิเสธทั้งที่ API และที่ DB

**Module ที่กระทบ:** M03, M04 — **ต้องแก้ก่อนเริ่ม Phase 7 (Blind Entry รอบ 2)**

---

### ข้อ 19 — Critical Fields สำหรับ Entry 2 ถูกออกแบบอย่างไร?

**ตอบ: ยังไม่ได้ออกแบบ — มีเพียงสัญลักษณ์ ⭐ ใน Comment**

**ปัจจุบัน:** ⭐ ปรากฏใน Comment ที่ 8 ฟิลด์ — `Household.respondentPhone`, `.houseNo`, `.mooId`, `.latitude`, `.longitude`, `VulnerablePerson.fullName`, `.phone`, `FloodRiskProfile.maxFloodDepthCm`

**ปัญหา:**
1. **Comment ไม่ใช่ Configuration** — ระบบอ่านไม่ได้ → FR-VER-01 ("ตั้งค่าได้") ทำไม่ได้
2. **ไม่ครบตามเอกสาร** — เอกสารบรรทัด 204 ระบุ "ประเภทความเปราะบาง (9 ช่อง) ⭐" แต่ `PersonVulnerability` ไม่มี ⭐
3. **"เบอร์โทรศัพท์ (ทุกเบอร์) ⭐"** — แต่ `surveyorPhoneOnPaper` และ `VolunteerInterest.contactPhone` ไม่มี ⭐
4. **ไม่มีการกำหนดวิธีเปรียบเทียบ** — เบอร์โทร "081-234-5678" vs "0812345678" ต่างกันไหม? พิกัด 7.00860 vs 7.0086 ต่างกันไหม? ชื่อ "นาย สมชาย" vs "นายสมชาย"? → **ต้องมี Normalize Rule ต่อฟิลด์** ไม่งั้นจะเกิด Discrepancy เท็จจำนวนมาก
5. **ไม่มี Version** — ถ้าเปลี่ยนรายการฟิลด์วิกฤตกลางคัน ใบที่ Verify ไปแล้วจะมีความหมายต่างจากใบใหม่

**ข้อเสนอการออกแบบ:**

```prisma
model CriticalFieldConfig {
  id            String   @id @default(cuid())
  fieldPath     String   /// เช่น "respondentPhone", "vulnerable[].fullName"
  labelTh       String   /// Label ภาษาไทยตามกระดาษ
  section       String   /// "0" | "1" | "2" | "3" | "4" | "5"
  questionNo    String?  /// เลขข้อบนกระดาษ เช่น "2.3"
  isCritical    Boolean  @default(true)
  compareMode   CompareMode @default(EXACT) /// EXACT | NORMALIZED_PHONE | NUMERIC_TOLERANCE | NORMALIZED_TEXT
  tolerance     Float?   /// สำหรับ NUMERIC_TOLERANCE เช่น พิกัด ±0.00001
  isRepeating   Boolean  @default(false) /// true = อยู่ในตาราง (กลุ่มเปราะบาง)
  sortOrder     Int      @default(0)
  version       Int      @default(1)
  effectiveFrom DateTime @default(now())
  effectiveTo   DateTime?
  isActive      Boolean  @default(true)

  @@unique([fieldPath, version])
  @@index([isActive, isCritical, sortOrder])
  @@map("critical_field_config")
}

enum CompareMode {
  EXACT              // เทียบตรงตัว
  NORMALIZED_PHONE   // ลบ -, เว้นวรรค, +66 → 0
  NORMALIZED_TEXT    // trim, ยุบช่องว่าง, ตัดคำนำหน้า
  NUMERIC_TOLERANCE  // เทียบตัวเลขด้วย tolerance
  SET_EQUALITY       // เทียบเซ็ต (เช่น ประเภทความเปราะบาง 9 ช่อง)
}
```

**และ `EntryAttempt` ควรเพิ่ม `criticalFieldVersion Int` เพื่อบันทึกว่าคีย์ตาม Config เวอร์ชันไหน**

**Module ที่กระทบ:** M03, M04, M17

---

### ข้อ 20 — Discrepancy Resolution รองรับการเลือก Entry 1, Entry 2 หรือ Final Value หรือไม่?

**รองรับครบ ✅ — เป็นส่วนที่ออกแบบดีที่สุดส่วนหนึ่ง**

| ความต้องการ | Schema | สถานะ |
|---|---|---|
| เลือกค่าจาก Entry 1 | `DiscrepancyResolution.CHOSE_ENTRY_1` + `value1` | ✅ |
| เลือกค่าจาก Entry 2 | `CHOSE_ENTRY_2` + `value2` | ✅ |
| ใส่ค่าที่ 3 (FR-VER-06) | `CHOSE_OTHER` + `resolvedValue` | ✅ |
| อ่านไม่ออกจริงๆ | `MARKED_ILLEGIBLE` | ✅ |
| แก้ไม่ได้ | `UNRESOLVABLE` | ✅ (สอดคล้องกับ `SheetStatus.UNRESOLVABLE`) |
| ใครตัดสิน / เมื่อไหร่ / หมายเหตุ | `resolvedById`, `resolvedAt`, `note` | ✅ |

⚠️ **จุดที่ควรปรับ:**
1. **ไม่มี Index สำหรับคิวงาน** — Verifier ต้อง Query "Discrepancy ที่ยังไม่ตัดสิน" → มีแค่ `ix_discrepancy_sheet` → ควรเพิ่ม `@@index([resolution])` หรือ Partial Index `WHERE resolution IS NULL`
2. **`value1`/`value2`/`resolvedValue` เป็น `String?`** — แต่ค่าจริงอาจเป็นตัวเลข/บูลีน/เซ็ต (ประเภทความเปราะบาง 9 ช่อง) → การเก็บเป็น String ทำให้เทียบและแสดงผลยาก และ **เซ็ตของ checkbox จะเก็บอย่างไร?** ("1,2,6"?) → ควรพิจารณา `Json`
3. **ไม่มี `fieldLabel`** — UI ต้อง Join กลับไปหา Label ภาษาไทยเอง (จะได้จาก `CriticalFieldConfig` เมื่อมี)
4. **`value1`/`value2` 🔒** — ข้อมูล PII/L4 ที่ยังไม่เข้ารหัสจริง
5. **ไม่มีการบังคับว่า `resolvedValue` ต้องมีค่าเมื่อ `resolution = CHOSE_OTHER`** → ต้องเป็น CHECK constraint หรือ Zod

---

### ข้อ 21 — Risk Calculation ใช้เฉพาะข้อมูล VERIFIED ได้หรือไม่?

**ได้ในเชิงเทคนิค ✅ แต่ไม่มีอะไรบังคับ ❌**

**สิ่งที่มี:**
- `PaperSheet.status = VERIFIED` → Query กรองได้
- `Household.verifiedAt` / `verifiedById` → เช็คได้
- `FloodRiskProfile.computedAt` → รู้ว่าคำนวณเมื่อไหร่
- Comment: *"Risk Score (คำนวณอัตโนมัติ — BR-15, **เมื่อ VERIFIED เท่านั้น** — BR-46)"* (schema.prisma:977)

**ปัญหา:**
1. **ไม่มี Constraint** ที่ห้ามเขียน `riskScoreAuto` เมื่อ sheet ยังไม่ VERIFIED → ต้องพึ่ง Application 100%
2. **`FloodRiskProfile` ไม่รู้สถานะของ Sheet** — ต้อง Join `Household → PaperSheet` (2 hops) ทุกครั้ง
3. **ไม่มีการบันทึกว่า "คำนวณจากข้อมูลเวอร์ชันไหน"** — ถ้า Verifier แก้ค่าหลังคำนวณ Risk แล้ว จะรู้ได้อย่างไรว่าต้องคำนวณใหม่? → ควรมี `computedFromVersionNo` หรือ `inputHash`
4. **ไม่มี `riskFormulaVersion`** → ดู [08-risk-model-review.md](08-risk-model-review.md)
5. **`v_household_geo` (SQL:195-228) ดึง `riskLevelFinal` โดยไม่กรอง `ps.status = 'VERIFIED'`** → **View นี้จะแสดง Risk ของใบที่ยังไม่ VERIFIED** ถ้ามีการเขียนค่าลงไป → ผิด FR-RSK-07 (ดู SQL-08)

**แนวทางแก้ไข:** เพิ่ม CHECK Constraint หรือ Trigger ที่ปฏิเสธการเขียน `riskScoreAuto` เมื่อ sheet ไม่ VERIFIED + ให้ Risk Engine เป็น Pure Function ที่รับเฉพาะ `VerifiedHouseholdData` type (บังคับที่ TypeScript ด้วย)

**ระดับ:** 🟠 HIGH

---

### ข้อ 22 — Incident และ Rescue Task เชื่อมกับ Household อย่างปลอดภัยหรือไม่?

**⚠️ ไม่ปลอดภัยพอ**

✅ **สิ่งที่ดี:** `RescueTask` มี FK ไป `Household` และ `VulnerablePerson` (nullable — รองรับทั้งงานระดับครัวเรือนและรายบุคคล) + `@@index([incidentId, status, priority])` ✅ เหมาะกับ Task Board

❌ **ปัญหาด้านความปลอดภัย:**

1. **BR-65 บังคับไม่ได้** — *"VOLUNTEER เห็น PII ได้เฉพาะเมื่อ Incident Mode + **เฉพาะรายที่มอบหมาย**"* — Schema มี `RescueTask.assignedToId` ✅ แต่ไม่มีอะไรกัน VOLUNTEER จาก Query `Household` ตรงๆ → ต้องพึ่ง Application 100% (ปัญหาเดียวกับ SCH-11)
2. **ไม่มี `Incident` ↔ `Community` FK** — `affectedCommunities String[]` (schema.prisma:1133) → **ไม่มี Referential Integrity** + Query "Incident ของชุมชนนี้" ต้องใช้ Array Contains ซึ่งช้าและไม่มี Index
3. **`TaskUpdate` เก็บพิกัด (`latitude`/`longitude`) และ `photoUrl`** — เป็น PII/L3 แต่ไม่มี 🔒 และไม่มีการควบคุมว่าใครดูได้
4. **ไม่มี `RescueTask.expiresAt` หรือกลไกเพิกถอนสิทธิ์** — เมื่อ Incident ปิด (`IncidentStatus.CLOSED`) VOLUNTEER ยังเห็น PII ของ Task เก่าอยู่ไหม? → **ไม่มีกฎ** → นี่คือช่องโหว่ (RK-V1: อาสาสมัครปลอมสมัครเพื่อดูข้อมูล — สมัคร → รอ Incident → รับงาน → ได้ PII → เก็บไว้ตลอดกาล)
5. **ไม่มี Audit บังคับ** — BR-26 บอกทุกครั้งที่ดูข้อมูลกลุ่มเปราะบางต้อง Audit แต่ VOLUNTEER ดู Task = ดู PII → ต้อง Audit ทุกครั้ง
6. **`RescueTask` ไม่มี Soft Delete**

**แนวทางแก้ไข:**
- เพิ่ม `IncidentCommunity` join table (FK จริง)
- เพิ่มกฎ: VOLUNTEER เห็น PII ของ Task **เฉพาะเมื่อ** `incident.status = ACTIVE` **และ** `task.assignedToId = currentUser.id` **และ** `task.status IN (ASSIGNED, IN_PROGRESS)` → เมื่อ Incident ปิด สิทธิ์หายทันที
- Audit ทุกการเปิดดู Task ที่มี PII
- พิจารณา `RescueTask` ที่ **ไม่ส่ง PII เต็ม** — ส่งเฉพาะที่จำเป็นต่อภารกิจ (ชื่อ + ที่อยู่ + สิ่งที่ต้องช่วย) ตาม CLAUDE.md *"Volunteer เห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ"* — ไม่ใช่ทั้ง record

**ระดับ:** 🟠 HIGH (SCH-12)

---

### ข้อ 23 — ข้อมูลที่ Comment ว่าเข้ารหัส มีการออกแบบ Encryption จริงหรือไม่?

## 🔴 SCH-08 — BLOCKER: **ไม่มี** — 🔒 เป็นเพียง Comment

**ปัญหาคืออะไร:** Schema ประกาศไว้ชัดเจนที่บรรทัด 9 ว่า *"🔒 = ต้องเข้ารหัส AES-256 ที่ Application Layer (Prisma Middleware)"* และมี 🔒 อยู่ **20 จุด** ทั่วไฟล์ แต่:

- ❌ ไม่มี Prisma Middleware/Extension ในโปรเจกต์ (ไม่มีโค้ดเลย นอกจาก schema/seed)
- ❌ ไม่มี Key Management
- ❌ ไม่มี `pgcrypto` extension ใน SQL (มีแต่ `postgis`, `pg_trgm`)
- ❌ `ENCRYPTION_KEY` ถูกกล่าวถึงเพียงใน Docker env (system-analysis.md:1021) แต่ไม่มีการใช้งาน
- ❌ ทุกฟิลด์ 🔒 ประกาศเป็น `String?` / `Json` ธรรมดา — ถ้าเข้ารหัสจริงต้องพิจารณาความยาว (ciphertext ยาวกว่า plaintext) และ Type

**ผิด CLAUDE.md โดยตรง:** *"ข้อมูลที่ระบุว่าเข้ารหัสต้องมีการเข้ารหัสจริง ไม่ใช่เพียง Comment ใน Schema"*
**ผิด NFR-S-02:** "เข้ารหัสข้อมูลอ่อนไหว — AES-256 at rest"

**รายการฟิลด์ที่ประกาศ 🔒 (20 จุด):**
`PaperBatch.scanPdfUrl`, `PaperSheet.scanImageUrl`, `EntryAttempt.payload`, `Discrepancy.value1/value2/resolvedValue`, `FieldQuery.answer`, `Household.respondentName/respondentPhone/mentalHealthSupport`, `HouseholdVersion.snapshot`, `ConsentRecord.consentGivenBy/scanUrl`, `VulnerablePerson.fullName/phone`, `PersonVulnerability.detail/pregnancyWeeks/postpartumMonths`, `AssistanceNeed.detail`, `VolunteerInterest.contactPhone`, `PdpaRequest.requesterName/requesterPhone`

**ฟิลด์ที่ควรมี 🔒 แต่ไม่มี:** `PersonVulnerability.vulnerabilityTypeId` (FK ชี้ไป DIALYSIS/PSYCHIATRIC = เปิดเผยโรคโดยตรง), `TaskUpdate.latitude/longitude/photoUrl`, `Household.latitude/longitude` (L3 ตาม Data Categories), `Household.houseNo`, `DigitalReadiness.lineUserId`

**⚠️ ความขัดแย้งเชิงเทคนิคที่ต้องแก้ก่อนตัดสินใจ:**

การเข้ารหัสระดับฟิลด์จะ**ทำลายความสามารถ 4 อย่างที่ระบบต้องการ**:

| ความสามารถ | ขัดแย้งอย่างไร |
|---|---|
| **Full-text Search** | `ix_household_search_name` (GIN trgm บน `respondentName`, SQL:91-93) จะไร้ประโยชน์ — ค้นหาชื่อไม่ได้ (FR-SRC) |
| **Unique Constraint** | ถ้าเข้ารหัสแบบ Randomized (มี IV ต่างกัน) ค่าเดียวกันจะได้ ciphertext ต่างกัน → unique/index ใช้ไม่ได้ |
| **Discrepancy Compare** | ถ้า `value1`/`value2` เข้ารหัสแบบ Randomized จะเทียบใน SQL ไม่ได้ ต้อง Decrypt ทั้งหมดมาเทียบใน App |
| **Duplicate Check (BR-01)** | ตรวจซ้ำจากบ้านเลขที่ต้อง Query ได้ |

**แนวทางแก้ไขที่เสนอ (แบ่งชั้นตามความจำเป็น):**

| ชั้น | วิธี | ใช้กับ |
|---|---|---|
| **1. Storage Encryption** | Volume/Disk Encryption + Backup Encryption | ทุกอย่าง (baseline) |
| **2. Column Encryption (Randomized AES-256-GCM)** | Prisma Extension | ข้อมูลที่**ไม่ต้องค้นหา**: `PersonVulnerability.detail`, `AssistanceNeed.detail`, `pregnancyWeeks`, `EntryAttempt.payload`, `HouseholdVersion.snapshot`, `FieldQuery.answer`, `Discrepancy.*` |
| **3. Deterministic Encryption / Blind Index** | HMAC-SHA256 ของค่า Normalize แล้ว เก็บใน column แยก (`respondentNameHash`) | ข้อมูลที่**ต้องค้นหาแบบ Exact**: `respondentPhone`, `houseNo` |
| **4. ไม่เข้ารหัส แต่ควบคุมด้วย RBAC + Audit + RLS** | — | ข้อมูลที่**ต้องค้นหาแบบ Fuzzy**: `respondentName`, `VulnerablePerson.fullName` — เพราะ FR-SRC ต้องการ trigram search |
| **5. Object Storage Encryption** | S3/MinIO SSE + Signed URL อายุสั้น | `scanPdfUrl`, `scanImageUrl`, `ConsentRecord.scanUrl` |

**⚠️ ต้องได้รับการตัดสินใจ:** ชั้นที่ 4 หมายถึง**ยอมรับว่าชื่อจะไม่ถูกเข้ารหัสใน DB** เพื่อแลกกับความสามารถในการค้นหา ซึ่ง**ขัดกับ NFR-S-02 ตามตัวอักษร** → ต้องให้เจ้าของระบบ/นิติกรตัดสิน (ดู Q-20)

**Module ที่กระทบ:** ทุก Module ที่แตะข้อมูลอ่อนไหว — M03, M04, M08, M12, M16, M18

---

### ข้อ 24 — Schema รองรับการขยายไปยังจังหวัดและพื้นที่อื่นหรือไม่?

**รองรับบางส่วน ⚠️**

✅ **จุดแข็ง:**
- ลำดับชั้น `Province → District → Tambon → Moo` ครบถ้วน และเป็น FK ทั้งหมด → เพิ่มจังหวัด/อำเภอ/ตำบลใหม่ได้โดยไม่แก้โค้ด ✅
- `Household.tambonId` เป็น FK (ไม่ใช่ enum) → รองรับตำบลใดก็ได้ ✅
- Master Data ทั้ง 9 ตารางไม่ผูกกับพื้นที่ ✅
- ไม่มี Enum ที่ Hardcode ชื่อจังหวัด/อำเภอ ✅

❌ **จุดที่ยังบล็อกการขยาย:**

| ปัญหา | ตำแหน่ง | ผลกระทบ |
|---|---|---|
| **`Community.tambonId` เดี่ยว** | schema.prisma:394 | ชุมชนข้ามตำบลไม่ได้ (SCH-01) |
| **Bounding Box Hardcode หาดใหญ่** | seed.ts:341-344 (`HAT_YAI_LAT_MIN` ฯลฯ) | ครัวเรือนนอกหาดใหญ่จะถูกเตือนว่า "พิกัดผิด" ตลอด → ดู SEED-08 |
| **`Community.code` เช่น "KL01"** | seed.ts:82 | รหัสสื่อถึงตำบล (KL = ควนลัง) → ชุมชนข้ามตำบลจะตั้งรหัสอย่างไร? |
| **ไม่มี Area Scope** | schema.prisma:306-317 | ให้สิทธิ์ระดับจังหวัด/อำเภอไม่ได้ (SCH-10) |
| **`Community.boundary` เป็น `Polygon`** | SQL:80-81 | ชุมชนที่มีพื้นที่ไม่ต่อเนื่องแทนไม่ได้ → ต้อง MultiPolygon |
| **ไม่มี Multi-tenant** | — | เอกสารระบุเป็น Future ปี 1 — ปัจจุบันไม่มี `tenantId` ที่ไหนเลย → ถ้าจะทำภายหลังต้องแก้ทุกตาราง |
| **`Tambon.code @unique` (global)** | schema.prisma:366 | ✅ ถูกต้อง (รหัสตำบลไทยไม่ซ้ำทั้งประเทศ) |
| **`Moo @@unique([tambonId, number])`** | schema.prisma:387 | ✅ ถูกต้อง |

**สรุป:** โครงสร้างพื้นที่ **รองรับการขยายได้ดี** ✅ แต่ **Community Model และ Seed ยังผูกกับหาดใหญ่** ❌

---

## สรุปตารางปัญหาทั้งหมด (Schema)

| ID | ระดับ | ปัญหา | บรรทัด | Module |
|---|---|---|---|---|
| SCH-01 | 🔴 BLOCKER | `Community.tambonId` เดี่ยว — ควนสันติ 2 ตำบลไม่ได้ | 392-414 | M04, M10, M11 |
| SCH-03 | 🔴 BLOCKER | ไม่ป้องกันคนเดียวกันคีย์ Entry 1+2 (Comment อ้างว่าป้องกัน) | 628-629 | M03, M04 |
| SCH-04 | 🔴 BLOCKER | `targetHouseholds Int @default(0)` — แนวคิดผิด + หารศูนย์ | 398 | M11, M16 |
| SCH-05 | 🔴 BLOCKER | `UserRoleEnum` ใช้ `RESCUE_VOLUNTEER` ไม่ตรงเอกสาร | 158 | M01, M19 |
| SCH-08 | 🔴 BLOCKER | 🔒 เป็น Comment — ไม่มี Encryption จริง (20 จุด) | ทั้งไฟล์ | ทุก Module |
| QM-03 | 🔴 BLOCKER | `@@unique([houseNo, mooId, tambonId])` กันซ้ำไม่ได้ + บล็อกอพาร์ทเมนต์ | 813 | M03, M07 |
| SCH-02 | 🟠 HIGH | `onDelete: Cascade` ขัดกับ Soft Delete (7 ตาราง) | หลายจุด | M08, M18 |
| SCH-06 | 🟠 HIGH | ไม่มี `CriticalFieldConfig` (GAP-R03) | — | M03, M04 |
| SCH-07 | 🟠 HIGH | Soft Delete มีเพียง 1/49 ตาราง | 782 | ทุก Module |
| SCH-09 | 🟠 HIGH | Better Auth ไม่ครบ (2FA, unique, lockout) + ไม่ระบุเวอร์ชัน | 187-284 | M01 |
| SCH-10 | 🟠 HIGH | ไม่มี Area Scope (มีแค่ Community Scope) | 306-317 | M01, M11 |
| SCH-11 | 🟠 HIGH | DATA_ENTRY จำกัดได้แค่ที่ App — ไม่มี RLS | 556-600 | M01, M03 |
| SCH-12 | 🟠 HIGH | Incident/RescueTask — ไม่มี FK + VOLUNTEER เห็น PII ตลอดกาล | 1127-1191 | M14, M19 |
| SCH-13 | 🟠 HIGH | Risk คำนวณจาก Unverified ได้ (ไม่มี Constraint) | 977-991 | M09 |
| SCH-14 | 🟠 HIGH | ไม่มี `VolunteerProfile` (GAP-R01) | — | M19 |
| SCH-15 | 🟡 MEDIUM | `TriageLevel` P1-P3 vs CLAUDE.md P1-P4 | 127-131 | M14 |
| SCH-16 | 🟡 MEDIUM | Index ขาดหลายตัว (FK ไม่มี index อัตโนมัติใน PG) | หลายจุด | ทุก Module |
| SCH-17 | 🟡 MEDIUM | Audit Trail ไม่มีอะไรบังคับให้เขียน | 1239-1257 | M18 |
| SCH-18 | 🟡 MEDIUM | HouseholdVersion ไม่ครอบคลุมตารางลูก + ไม่มี unique | 822-835 | M08 |
| SCH-19 | 🟡 MEDIUM | Consent — `UNKNOWN` ไม่มีกฎ + `withdrawnAt` ไม่มีผล | 838-854 | M18 |
| SCH-20 | 🟡 MEDIUM | FK ที่ประกาศแต่ไม่มี relation (6 จุด) | 295, 719, 1117, 1262, 1302, 1316 | ทุก Module |
| SCH-21 | 🟡 MEDIUM | `Incident.affectedCommunities String[]` ไม่มี FK | 1133 | M14 |
| SCH-22 | 🟡 MEDIUM | Unique constraint ขาด (Account, VulnerablePerson.seq ฯลฯ) | หลายจุด | M01, M03 |
| SCH-23 | 🟢 LOW | Naming ไม่สม่ำเสมอ (Enum suffix, nameTh vs name) | ทั้งไฟล์ | — |
| SCH-24 | 🟢 LOW | `createdAt`/`updatedAt` ไม่ครบทุกตาราง | หลายจุด | — |
| SCH-25 | 🟢 LOW | `EvacuationSite.type` ใช้ `NearestEvacSiteType` (มี UNKNOWN/OTHER) | 1085 | M13 |
| SCH-26 | 🟢 LOW | `Notification/ExportJob/PdpaRequest.status` เป็น String | 1220, 1281, 1267 | M15, M16 |
| SCH-27 | 🟢 LOW | Comment ยังเป็น v2.0 (`ConfidentialityAgreement`, `DATA_ENTRY`) | 4, 159, 319 | — |
| SCH-28 | 🟢 LOW | `Household.surveyNo` ไม่ unique | 715 | M03 |

---

## ภาคผนวก ก — รายชื่อ Model ทั้ง 49 ตัว (ค่าจริงจาก Schema)

**Auth (4):** User, Session, Account, Verification
**RBAC (3):** UserRole, UserCommunityScope, ConfidentialityAgreement
**Master Data (12):** Province, District, Tambon, Moo, Community, BuildingType, OwnershipType, VulnerabilityType, AssistanceNeedType, ResourceType, AlertChannel, VolunteerSkillType
**Paper/Batch (2):** PaperBatch, PaperSheet
**Data Entry (4):** EntryAttempt, FieldStatus, Discrepancy, FieldQuery
**Household (3):** Household, HouseholdVersion, ConsentRecord
**Vulnerable (3):** VulnerablePerson, PersonVulnerability, AssistanceNeed
**Flood Risk (3):** FloodRiskProfile, HouseholdResource, EvacuationVehicle
**Communication (3):** AlertChannelPref, DigitalReadiness, VolunteerInterest
**Planning (2):** EvacuationSite, RiskWeightConfig
**Incident (3):** Incident, RescueTask, TaskUpdate
**Notification (2):** NotificationTemplate, Notification
**System (5):** AuditLog, PdpaRequest, ExportJob, SystemSetting, EntryStats

**รวม 49 models** (เอกสารระบุ 35 — ดู CONF-05)
**16 enums** (เอกสารระบุ 18 — ดู CONF-05)
