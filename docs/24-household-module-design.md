# 24 — Household Survey Module: Architecture & UX Design

> รอบงาน: 2026-07-22 · บทบาท: Senior System Analyst / Senior UX Designer / Product Designer
> **เอกสารออกแบบเท่านั้น** — ไม่มี Production Code, ไม่แก้ Schema/Migration/Seed, ไม่ Commit
> แหล่งอ้างอิง: `prisma/schema.prisma` (v3.1), `docs/01`, `docs/03` (Data Dictionary ↔ กระดาษ), `docs/10` (RBAC), `docs/16` (Owner Decisions), `docs/23` (RBAC Foundation), `system-analysis.md` (FR-ENT-01..17)
>
> ⚠️ **Owner Decision (docs/26) แก้สมมติฐานการแจกงาน:** จุดที่เอกสารนี้ระบุว่า
> "ระบบเลือกใบถัดไปให้อัตโนมัติ / หยิบงาน" (§2.1 ขั้น 3, §10 Lock, Phase B)
> ถูกแทนที่ด้วย **Paper Batch Assignment** — หัวหน้าแจกปึกกระดาษ เจ้าหน้าที่พิมพ์รหัสใบ
> (Sheet ID) เพื่อเปิดฟอร์มเอง · Lock เป็นเพียงกลไกกันเปิดใบซ้อน ไม่ใช่แกนของ UX — ดู docs/26 §7–9

---

## 1. Module Overview

### 1.1 สรุปความเข้าใจระบบ (จากการอ่าน ไม่ใช่การเดา)

| หัวข้อ | ข้อเท็จจริง | แหล่ง |
|---|---|---|
| จุดประสงค์ | เปลี่ยนแบบสอบถามกระดาษเป็นข้อมูลตัดสินใจ "คืนนี้ต้องไปช่วยใครก่อน อยู่ตรงไหน ต้องใช้อะไร" | docs/01 §1.3 |
| โมเดลข้อมูล | **Paper-first** — ครัวเรือนเกิดจากการคีย์กระดาษ ไม่ใช่กรอกออนไลน์ | docs/01 §1.1 |
| Workflow | BP-01 รับปึก → BP-02 Entry 1 → BP-03 Blind Entry 2 (เฉพาะ Critical Fields) → Discrepancy → Verify → BP-04 Field Query → BP-05 ปิด Batch | docs/01 §3 |
| สถานะใบ | `PENDING → LOCKED → ENTERED_1 → ENTERED_2 → (VERIFIED \| DISCREPANCY)` + `NEEDS_FIELD_QUERY / UNRESOLVABLE / SHEET_LOST / MERGED_INTO` | schema `SheetStatus` |
| ข้อมูลที่ใช้ได้ | เฉพาะ **VERIFIED** เท่านั้นที่เข้า Risk/Dashboard/Report (FR-RSK-07) | docs/01 §3 |
| ผู้ใช้ | 9 Roles — DATA_ENTRY เห็นเฉพาะใบที่ Lock, ห้ามค้นหา/Export | docs/10, CLAUDE.md |

### 1.2 ข้อเท็จจริงเชิงโครงสร้างที่บังคับการออกแบบ

1. **`Household.sheetId String @unique` (NOT NULL)** — 1 ครัวเรือน = 1 ใบกระดาษเสมอ → **ไม่มี "เพิ่มครัวเรือนลอย ๆ"** ได้ การ "เพิ่มครัวเรือน" ในระบบนี้คือ "คีย์ใบกระดาษจาก Batch" เท่านั้น
2. **ทุกฟิลด์จากกระดาษ Nullable** + `FieldStatusEnum` 4 ค่า (HAS_VALUE / EXPLICIT_NONE / BLANK_IN_PAPER / ILLEGIBLE) — Required ในเอกสารนี้หมายถึง "ความคาดหวังเชิงธุรกิจ" ไม่ใช่ NOT NULL (docs/03 หมายเหตุหัวเอกสาร)
3. **Blind Double-entry** — Entry 2 ห้ามเห็นค่า Entry 1, คนคีย์ต้องไม่ใช่คนเดิม (BR-44 — มี DB trigger แล้ว), เทียบเฉพาะฟิลด์ใน `CriticalFieldConfig`
4. **ค่าดิบตามกระดาษ** — พิกัด (`coordinateRawText`), ระดับน้ำ (`floodDepthMetersRaw`+`floodDepthCmRaw`), อายุครรภ์ (`pregnancyRawText`) เก็บดิบ แล้ว Derive ทีหลัง — Double-entry เทียบที่ค่าดิบ
5. **Draft มีที่เก็บอยู่แล้ว** — `EntryAttempt.payload Json` + `submittedAt NULL` = ยังไม่ส่ง; Lock ใบ = `PaperSheet.lockedById/lockExpiresAt` (10 นาที)
6. **`lastFloodYear` ห้ามแสดงใน Entry Console** (Orphan field — QM-11) และ `riskLevelSurveyor` คีย์ตามกระดาษเท่านั้น (BR-54)

### 1.3 การจำแนกข้อมูล Household (ตามที่โจทย์ขอ)

| ประเภท | ตัวอย่างฟิลด์ | ที่เก็บ |
|---|---|---|
| **กรอกครั้งเดียว (จากกระดาษ)** | surveyNo, surveyorNameOnPaper, surveyedAt, houseNo, coordinateRawText, ทุกคำตอบส่วน 1–5 | `Household` + ตารางลูก |
| **เปลี่ยนบ่อย (หลัง Verify)** | VulnerablePerson.isActive/deactivatedReason (ย้ายออก/เสียชีวิต), consentStatus, hasDuplicateFlag | `Household`, `VulnerablePerson` + `HouseholdVersion` snapshot |
| **คำนวณ (Derived)** | latitude/longitude (จาก raw), maxFloodDepthCm (= m×100+cm), pregnancyWeeks, completenessScore, illegibleCount, blankCount, triageLevel, rawScore/normalizedScore (รอ BR) | คอลัมน์ Derived — ห้ามคีย์ตรง |
| **Lookup (Master Data)** | BuildingType(6), OwnershipType(4), VulnerabilityType(9), AssistanceNeedType(6), ResourceType(7), AlertChannel(8), VolunteerSkillType(8), Moo, Tambon, Community | ตาราง Master — Seed idempotent |
| **Auto Generate (ระบบ)** | id (cuid), sheetNo/batch code, enteredById/enteredAt, verifiedById/verifiedAt, lock fields, createdAt/updatedAt, versionNo | ระบบสร้าง — ผู้ใช้ไม่แตะ |

---

## 2. User Journey

Journey หลักตามโจทย์ ปรับให้ตรงกับความจริงของระบบ Paper-first และ RBAC (DATA_ENTRY ห้ามค้นหาครัวเรือน — CLAUDE.md) จึงแยกเป็น **2 Journey ตาม Role**:

### 2.1 Journey A — DATA_ENTRY (คีย์แบบสอบถาม)

| # | ขั้น | รายละเอียด | สถานะระบบ |
|---|---|---|---|
| 1 | **Login** | อีเมล+รหัสผ่าน → ตรวจ session + isActive + role ฝั่ง server (มีแล้ว docs/22-23) | — |
| 2 | **Dashboard (ของฉัน)** | DATA_ENTRY ไม่มี `dashboard.view` ภาพรวม (docs/10 🔸) → เข้าหน้า "งานคีย์ของฉัน": ใบค้าง, สถิติวันนี้, ปุ่ม "หยิบงาน" | — |
| 3 | **หยิบงาน (ไม่ใช่ค้นหา)** | ระบบเลือกใบ `PENDING` ใบถัดไปจาก Batch ที่เปิดอยู่ให้อัตโนมัติ (Transaction กันหยิบชนกัน) — DATA_ENTRY **ไม่มีหน้าค้นหาครัวเรือน** | `PENDING → LOCKED` (10 นาที) |
| 4 | **กรอกแบบสอบถาม (Wizard)** | ฟอร์มเรียงตรงกระดาษ 100% (FR-ENT-01), คีย์บอร์ดล้วน, F2=ILLEGIBLE, F3=BLANK | `LOCKED` |
| 5 | **Save Draft** | Auto-save ทุก 10 วิ (FR-ENT-08) ลง `EntryAttempt.payload` (submittedAt=NULL) — ปิด browser แล้วกลับมาได้ | `LOCKED` (ต่ออายุ lock ทุก auto-save) |
| 6 | **กลับมาแก้ (Resume)** | หน้า "งานของฉัน" แสดงใบที่ Lock ค้าง → กดต่อ → ฟอร์ม hydrate จาก payload ล่าสุด | `LOCKED` |
| 7 | **Submit (Ctrl+Enter)** | Validate + Soft duplicate check (บ้านเลขที่+หมู่+ตำบล — FR-ENT-16 เตือน ไม่บล็อก) → สร้าง `Household` + ตารางลูก | `LOCKED → ENTERED_1` |
| 8 | **Entry 2 (คนที่สอง)** | อีกคนหยิบใบ ENTERED_1 → คีย์เฉพาะ Critical Fields แบบ Blind | `ENTERED_1 → ENTERED_2` |
| 9 | **Verification** | Engine เทียบ → ตรง = VERIFIED; ไม่ตรง = DISCREPANCY → Verifier ตัดสิน | `ENTERED_2 → VERIFIED / DISCREPANCY` |
| 10 | **Approved** | ใบ VERIFIED → เข้าคิวคำนวณ Risk/Triage (Phase หลัง มีสูตรแล้ว) | `VERIFIED` |
| 11 | **Reports** | ข้อมูล VERIFIED ปรากฏใน Dashboard/Coverage/Report (role ที่มีสิทธิ์) | — |

### 2.2 Journey B — OFFICER / ADMIN (จัดการครัวเรือน)

| # | ขั้น | รายละเอียด |
|---|---|---|
| 1 | Login → Dashboard | เห็นภาพรวมตาม Community Scope (OFFICER) หรือทั้งระบบ (ADMIN) — มีแล้ว |
| 2 | **ค้นหาครัวเรือน** | เมนู "ครัวเรือน" → Quick search (บ้านเลขที่/ชื่อ/เลขใบ) + Filter — จำกัดตาม `UserCommunityScope` เสมอ |
| 3 | **ไม่มีข้อมูล** | Empty state: "ไม่พบครัวเรือน" + คำอธิบาย + (ถ้ามีสิทธิ์) ทางลัด "ไปที่ Batch เพื่อคีย์ใบใหม่" — **ไม่มีปุ่ม "สร้างครัวเรือนเปล่า"** เพราะขัด `sheetId NOT NULL` |
| 4 | **เพิ่มครัวเรือน** | = สร้าง Batch (COORDINATOR) → คีย์ใบ (DATA_ENTRY) ตาม Journey A — Officer ดูความคืบหน้าผ่านหน้า Batch |
| 5 | **ดู Detail** | ข้อมูลเต็ม + สมาชิกเปราะบาง + ประวัติ (ตามสิทธิ์ PII) |
| 6 | **แก้ไขหลัง Verify** | เฉพาะฟิลด์สถานะปัจจุบัน (เช่น ย้ายออก/เสียชีวิต/consent) — ทุกครั้งบันทึก `HouseholdVersion` + เหตุผล + Audit Log |
| 7 | Reports | Coverage ต่อชุมชน, ทะเบียนเปราะบาง (ตามสิทธิ์) |

> **หมายเหตุ SA:** โจทย์เขียน "ค้นหา → ไม่มี → เพิ่มครัวเรือน" แบบระบบ CRUD ทั่วไป แต่ CLAUDE.md + schema บังคับ Paper-first + ห้าม DATA_ENTRY ค้นหา — เอกสารนี้จึง Map "เพิ่มครัวเรือน" = "คีย์ใบกระดาษใหม่จาก Batch" และให้การค้นหาเป็นสิทธิ์ของ OFFICER/ADMIN/COORDINATOR เท่านั้น หากเจ้าของระบบต้องการ "สร้างครัวเรือนโดยไม่มีกระดาษ" จริง ต้องตัดสินใจแก้ schema ก่อน (ดู §15 ความเสี่ยง R1)

---

## 3. Information Architecture

### 3.1 โครงเมนูหลัก (ต่อยอด `lib/navigation.ts` ปัจจุบัน — 7 เมนู)

```
ภาพรวม (Dashboard)          dashboard.view
ชุมชน (Communities)          community.view
ครัวเรือน (Households)       household.view
แบบสอบถาม (Surveys)          survey.entry
การตรวจสอบข้อมูล (Verification)  verification.view
รายงาน (Reports)             report.view
ตั้งค่าระบบ (Settings)        settings.view / user.manage
```

### 3.2 หน้าย่อยของแต่ละเมนู

| เมนู | หน้าย่อย | Route (เสนอ) | ใครเห็น |
|---|---|---|---|
| **ภาพรวม** | Dashboard ตาม scope (มีแล้ว) · Coverage ต่อชุมชน (Phase G) | `/dashboard` | ตาม docs/23 |
| **ชุมชน** | รายการชุมชน · รายละเอียด+Coverage | `/communities`, `/communities/[id]` | ADMIN, EXECUTIVE, OFFICER, COORDINATOR |
| **ครัวเรือน** | Household List · Household Detail (+แท็บย่อย §5) | `/households`, `/households/[id]` | OFFICER, ADMIN (เต็ม) — ดู Permission Matrix §10 |
| **แบบสอบถาม** | งานคีย์ของฉัน (คิว+Resume) · Batch List · Batch Detail (ใบในปึก) · Entry Console (Wizard) | `/surveys`, `/surveys/batches`, `/surveys/batches/[id]`, `/surveys/entry/[sheetId]` | DATA_ENTRY (เฉพาะงานตน), COORDINATOR (จัดการ Batch), ADMIN |
| **การตรวจสอบข้อมูล** | คิว Discrepancy · หน้าตัดสินรายใบ · คิว Field Query · สร้างใบคำถาม PDF | `/verification`, `/verification/[sheetId]`, `/verification/field-queries` | VERIFIER, ADMIN |
| **รายงาน** | Coverage Report · ทะเบียนกลุ่มเปราะบาง · Export (มี Audit) | `/reports`, `/reports/coverage`, `/reports/vulnerable` | ตาม matrix docs/10 |
| **ตั้งค่าระบบ** | Master Data · Critical Field Config · ผู้ใช้/บทบาท | `/settings/*` | ADMIN เท่านั้น |

หลักการ: เมนูกรองด้วย permission ฝั่ง server ผ่าน `visibleNavItems()` (กลไกมีแล้ว docs/23) — หน้าที่ยังไม่สร้างแสดง "เร็ว ๆ นี้"

---

## 4. Navigation (พฤติกรรม)

- **Sidebar คงที่** (Back-office desktop-first — CLAUDE.md UI principles) · มือถือ = drawer (มีแล้ว)
- Breadcrumb ในหน้าลึก: `ครัวเรือน › บ้านเลขที่ 99/1 หมู่ 3 › ประวัติ`
- Entry Console เป็นโหมด **เต็มจอ ไร้สิ่งรบกวน** (ซ่อน sidebar) — เพราะเป้าหมายคือความเร็วคีย์ต่อใบ; ESC = กลับพร้อม confirm ถ้ามี unsaved
- เลขใบ (`sheetNo`) ค้างบนจอตลอดใน Entry Console (FR-ENT-12)
- ทุกหน้าลึกมี state URL ชัดเจน (`/surveys/entry/[sheetId]?step=3`) เพื่อ resume/refresh ได้

---

## 5. Household Module — รายการหน้าจอและหน้าที่

| หน้า | หน้าที่ | ข้อมูลหลัก | สิทธิ์เขียน |
|---|---|---|---|
| **Household List** | ค้นหา/กรอง/เรียกดูครัวเรือนใน scope | ตาราง (ดู §8) | — (read) |
| **Household Detail** | ภาพเต็ม 1 ครัวเรือน (ดู §9) | Household + ลูกทุกตาราง | — |
| **Create Household** | **ไม่มีหน้านี้โดยตรง** — ครัวเรือนเกิดจาก Entry Console (§2.2 ข้อ 3-4) | — | — |
| **Edit Household (หลัง Verify)** | แก้สถานะปัจจุบันเท่านั้น (ย้ายออก/เสียชีวิต/consent/duplicate flag) — ไม่ใช่แก้คำตอบกระดาษ | ฟิลด์สถานะ + เหตุผลบังคับ | OFFICER (scope), ADMIN |
| **Draft (งานของฉัน)** | ใบที่ Lock ค้าง + Draft ยังไม่ส่ง ของผู้คีย์คนนั้น | PaperSheet LOCKED + EntryAttempt ค้าง | DATA_ENTRY (ของตน) |
| **Submitted (ใบที่คีย์แล้ว)** | รายการใบที่ตนคีย์ + สถานะปัจจุบัน (ENTERED_1/2, DISCREPANCY, VERIFIED) — ดูสถิติตนเอง | EntryAttempt ของตน + SheetStatus | — |
| **History / Version** | รายการ `HouseholdVersion` — ใครแก้อะไรเมื่อไหร่เพราะอะไร + diff ระหว่าง version | snapshot Json | — (append-only) |
| **Attachment** | ภาพสแกนใบ (`PaperSheet.scanImageUrl`), สแกน Consent (`ConsentRecord.scanUrl`), PDF ใบคำถาม | URL (MinIO — เปิดใช้เมื่อจำเป็น) | COORDINATOR/ADMIN |
| **Timeline** | เหตุการณ์ของใบ: รับปึก → Lock → Entry1 → Entry2 → Discrepancy → ตัดสิน → Verified → แก้ไขหลัง verify | รวมจาก EntryAttempt/Discrepancy/FieldQuery/Version/AuditLog | — |
| **Verification (ต่อใบ)** | Verifier เห็น value1/value2 ต่อฟิลด์ → เลือก CHOSE_ENTRY_1/2/OTHER/ILLEGIBLE/UNRESOLVABLE | `Discrepancy` | VERIFIER, ADMIN |
| **Approval** | ผลของ Verification — ใบเปลี่ยนเป็น VERIFIED เมื่อ Discrepancy ตัดสินครบ + ไม่มี Field Query ค้าง (ไม่มีปุ่ม approve แยก — เป็นผลอัตโนมัติของกติกา) | SheetStatus | ระบบ |

---

## 6. Wizard Design (Entry Console)

### 6.1 หลักการ (จาก FR-ENT-01..17 — ไม่ใช่ความรู้ทั่วไป)

1. **เรียงตรงกระดาษ 100%** — step = ส่วนของกระดาษ, ลำดับข้อ/ตัวเลือกตรงกระดาษ (รวมข้อ 6 ส่วน 3 ที่กระดาษเรียง "ไม่มี" ก่อน "มี")
2. **คีย์บอร์ดล้วน**: Tab ตามลำดับกระดาษ, เลข 1-9/Space เลือก checkbox/radio, **F2=ILLEGIBLE, F3=BLANK_IN_PAPER**, Ctrl+Enter=ส่ง, F1=ช่วยเหลือ
3. ห้ามบังคับเดา — ทุกช่องออกจากได้ด้วย F2/F3 · ห้ามแสดง `lastFloodYear` · `riskLevelSurveyor` มี label "คีย์ตามที่ผู้สำรวจติ๊กเท่านั้น"
4. Entry 2 = ฟอร์มเดียวกันแต่ **render เฉพาะฟิลด์ critical จาก `CriticalFieldConfig`** และไม่ fetch ค่า Entry 1 มาที่ client เด็ดขาด

### 6.2 Step Breakdown (ยึด Data Dictionary docs/03 + schema)

**Step 1 — ส่วนที่ 0: ข้อมูลการสำรวจ**
- วัตถุประสงค์: ยึดใบเข้ากับบริบทการสำรวจ
- Fields: `surveyNo`, `communityNameOnPaper` (ดิบ — เตือนถ้าไม่ตรง community ของ Batch แต่ไม่บล็อก → ธง Verifier), `surveyorNameOnPaper`, `surveyorPhoneOnPaper`, `surveyedAt`
- Validation: เบอร์ 9-10 หลักขึ้นต้น 0 (warning) · **วันที่รับ พ.ศ. → แปลง ค.ศ. ก่อนเก็บ** (กฎ QM-02: ปี > 2400 ให้ −543; แสดงกลับเป็น พ.ศ.) · ห้าม default วันนี้ (BR-47)
- Required (ธุรกิจ): surveyorName, วันที่ · ทุกช่องรับ F2/F3
- Dependencies: ไม่มี

**Step 2 — ส่วนที่ 1: ข้อมูลพื้นฐาน (ข้อ 1-2)**
- Fields: `buildingTypeId` (radio 6 — Master), `buildingTypeOther`, `placeName`, `respondentName` 🔒, `respondentPhone` 🔒⭐
- Validation: เลือก OTHER → เปิดช่อง Other (skip logic) · เบอร์ warning format
- Required: buildingType, respondentName, respondentPhone

**Step 3 — ส่วนที่ 1: ที่ตั้งและพิกัด (ข้อ 3-4)**
- Fields: `houseNo`⭐, `mooId`⭐ (dropdown จาก Master Moo ของตำบล), `soi`, `road`, `tambonId` (radio จาก CommunityTambon ของ Batch — ไม่ hardcode), `coordinateRawText`⭐ (📋 พิมพ์ตามกระดาษตัวอักษรต่อตัวอักษร), `memberCount`, `ownershipTypeId` (radio 4), `ownershipOther`
- Derived (แสดงอ่านอย่างเดียว): lat/lng ที่ parse ได้ + **mini map โผล่ทันทีที่ parse สำเร็จ** (FR-ENT-14)
- Validation: parser พิกัด (pure function — รับ decimal/สลับ lat-lng/DMS/ลิงก์ Google Maps) → ถ้า parse ไม่ได้ = ช่องดิบยังเก็บได้ ธง ILLEGIBLE ที่ derived · เตือนนอกขอบเขต/สลับ/ซ้ำเป๊ะ (FR-ENT-15 — warning) · memberCount 1–50 warning เกินได้เมื่อ buildingType เป็นสถานประกอบการ (SQL-12 ผ่อนใน DB แล้ว 0-5000)
- Submit-time: soft duplicate check บ้านเลขที่+หมู่+ตำบล (FR-ENT-16 — เตือน+ตั้ง `hasDuplicateFlag` ไม่บล็อก เพราะอพาร์ทเมนต์ถูกกฎหมาย — QM-03)

**Step 4 — ส่วนที่ 2: กลุ่มเปราะบาง (Grid Mode)**
- Gate คำถามแรก: ☑ "ไม่มีกลุ่มเปราะบาง" → `hasVulnerable=false` → **ข้าม step 4-5 ไป step 6** (Skip Logic FR-ENT-13; ไม่ติ๊กและไม่มีแถว = NULL = BLANK)
- Grid เหมือน Excel (FR-ENT-10): แถวละคน ไม่จำกัดแถว (FR-ENT-11) — คอลัมน์: seq (auto), `fullName`⭐🔒, `age`, `phone`⭐🔒, checkbox เปราะบาง 9 ช่อง (M:N — เลือกได้หลายข้อ), `detail` ต่อ checkbox ที่ requiresDetail (PREGNANT→`pregnancyRawText` ดิบ+หน่วย, POSTPARTUM→เดือน, REGULAR_MEDICATION/OTHER→ข้อความ 🔒L4)
- Validation: age 0–120 (BR-06) · pregnancy เก็บดิบ+unit — unit UNKNOWN = ILLEGIBLE ไม่เดา (QM-06) · ทุก cell รองรับ F2/F3 (per-cell FieldStatus)
- Dependencies: แสดงเมื่อ `hasVulnerable != false`

**Step 5 — ส่วนที่ 2 ข้อ 3: ความต้องการช่วยเหลือ**
- Fields: `assistanceTotalPersonCount` (📋 ช่องรวม), รายการ 6 ประเภท (checkbox + `personCount` เมื่อ requiresCount / `detail` 🔒 เมื่อ requiresDetail)
- Validation: **Cross-check ผลรวมรายข้อ vs ช่องรวม — Warning ไม่ใช่ Error** (QM-07 กระดาษขัดกันเองได้)
- Dependencies: แสดงเมื่อ `hasVulnerable = true` (กระดาษ: "กรณีมีกลุ่มเปราะบาง")

**Step 6 — ส่วนที่ 3: ความเสี่ยงอุทกภัย (12 ข้อ)**
- Fields: `floorLevelVsRoad` (radio 3), `hasFloodedBefore`, `floodDepthMetersRaw` + `floodDepthCmRaw` (**2 ช่องตรงกระดาษ** — derived รวมเป็น cm; QM-08), `lastFloodDurationDays`, `hasSafeParking`, `hasAlternateParking`+`alternateParkingLocation` (เรียง "ไม่มี" ก่อน "มี" ตามกระดาษ), `lastEvacuationPlace`+other, `nearestEvacSiteType`+other, ยานพาหนะ (checkbox M:N + detail), `hasSurvivalKit`, ทรัพยากร: ☐ **ไม่มี** (`hasNoResources`) + 6 รายการ + อื่นๆ (M:N), `canBeHostHouse`
- Validation: cmRaw 0–99 warning · รวม ≤1000 (BR-10) · duration 1–365 (BR-12) · เตือน (ไม่ข้ามอัตโนมัติ) ถ้า `hasFloodedBefore=false` แต่กรอกระดับน้ำ (Q-15 — กระดาษไม่มี skip จึงห้ามบังคับข้าม) · เตือนถ้าติ๊ก "ไม่มี" พร้อมรายการทรัพยากรอื่น
- **ไม่แสดง** `lastFloodYear` (QM-11)

**Step 7 — ส่วนที่ 4: การเตือนภัยและการมีส่วนร่วม (6 ข้อ)**
- Fields: ช่องทางเตือนภัย (checkbox 8 — M:N), `usesSmartphone`, `canScanQR`, อาสาสมัคร: ☐ ไม่สะดวก (`volunteerNotAvailable`) + ทักษะ 8 ด้าน (M:N + ชื่อ/เบอร์ผู้ติดต่อ), `mentalHealthSupport` 🔒L4, `suggestion`
- Validation: เตือนถ้าติ๊ก "ไม่สะดวก" พร้อมทักษะ (QM-12) — เก็บทั้งคู่ตามกระดาษ ธงให้ Verifier
- **ไม่แสดง** `lineUserId` (ไม่ได้มาจากกระดาษ)

**Step 8 — ส่วนที่ 5 + ท้ายเล่ม + Consent**
- Fields: `povertyProgramInterest`, `riskLevelSurveyor` (radio 3 ตามกระดาษ — BR-54), `surveyorNote`, `consentStatus` + `consentNote`
- Validation: riskLevel = คีย์ตามติ๊กเท่านั้น (helper text ชัดเจน)

**Step 9 — ตรวจทานและส่ง (Review)**
- สรุปทุก step + จำนวนช่อง ILLEGIBLE/BLANK + warnings ค้าง (duplicate, cross-check, พิกัด) → Ctrl+Enter ส่งจริง
- ส่งแล้ว: `ENTERED_1` + คำนวณ completenessScore/illegibleCount/blankCount + **Auto-lock ใบถัดไปทันที** (BP-02) พร้อม toast "ส่งใบ …-024 แล้ว → ใบ …-025"

**Auto-save ทุก step**: ทุก 10 วินาที + ทุกครั้งเปลี่ยน step → upsert `EntryAttempt.payload` (ไม่สร้าง Household จนกด Submit)

---

## 7. Validation Strategy

| ชั้น | ตรวจอะไร | ตัวอย่าง | เครื่องมือ |
|---|---|---|---|
| **Client (Zod + RHF)** | รูปแบบทันที ไม่บล็อกการเก็บดิบ | เบอร์โทร format, ตัวเลขช่วง, required-ทางธุรกิจ (แสดงเหลืองไม่ใช่แดง — เพราะ BLANK ถูกกฎ) | Zod schema เดียวกัน client/server |
| **Server (Zod ซ้ำ)** | ทุกอย่างจาก client ซ้ำ — ห้ามเชื่อ client | payload ทั้งก้อนก่อนเขียน DB | Server Action + Zod |
| **Business Rules** | BR-05 (1-50 warn), BR-06 (0-120), BR-10 (≤1000cm), BR-12 (1-365), BR-44 (คนคีย์ต่างกัน — DB trigger มีแล้ว), BR-47 (ห้าม default วันนี้), BR-54 | ฝั่ง server + DB CHECK ที่มีอยู่ |
| **Cross Validation** | ความสอดคล้องภายในใบ → **Warning + ธง ไม่บล็อก** | ผลรวมคนช่วยเหลือ vs ช่องรวม (QM-07) · hasFlooded=false แต่มีระดับน้ำ · ไม่สะดวก+ทักษะ · communityNameOnPaper ≠ Batch community · hasVulnerable=false แต่มี AssistanceNeed |
| **Submit-time** | Duplicate soft check (FR-ENT-16), lock ยังเป็นของตน, sheet ยังสถานะถูกต้อง (Transaction) | server เท่านั้น |

หลักการใหญ่: **Error = ข้อมูลผิดรูปจนระบบรับไม่ได้** (น้อยมาก) / **Warning = กระดาษอาจขัดกันเอง — เก็บตามจริง + ธงให้ Verifier** (ส่วนใหญ่) — สอดคล้อง "ห้ามบังคับให้ผู้คีย์เดา"

---

## 8. Household List (สำหรับ Role ที่มี `household.view`)

- **Columns (default)**: บ้านเลขที่ · หมู่/ตำบล · ชุมชน · ประเภทอาคาร · สมาชิก (คน) · เปราะบาง (คน + จุดสี triage เมื่อมีสูตร) · สถานะใบ (badge ตาม SheetStatus) · Consent · วันที่สำรวจ · duplicate flag ⚑
- **Quick Search**: ช่องเดียวค้น บ้านเลขที่ / placeName / sheetNo (ค้นชื่อบุคคล 🔒 เฉพาะ role ที่เห็น PII + ลง Audit READ)
- **Advanced Search**: ชุมชน (จำกัดตาม scope), ตำบล/หมู่, สถานะใบ, ประเภทอาคาร, มี/ไม่มีเปราะบาง, ช่วงวันที่สำรวจ, consent, duplicate flag
- **Filter bar คงที่**: Community Filter (dropdown จาก scope — global เห็นทั้งหมด) + Verification Filter (All / VERIFIED / รอตรวจ / DISCREPANCY / FIELD_QUERY / ปัญหา)
- **Sort**: วันที่สำรวจ (default ล่าสุด), บ้านเลขที่, ชุมชน, สถานะ
- **Pagination**: Server-side, 25/50/100 ต่อหน้า (cursor-based เพราะข้อมูลโตเรื่อย ๆ)
- **Bulk Action**: จำกัดมาก — เฉพาะ "Export ที่เลือก" (role มีสิทธิ์ + Audit EXPORT) และ "ธง duplicate เพื่อส่ง Merge (M07)" — **ไม่มี bulk delete/edit** (Soft delete เป็นงาน PDPA เท่านั้น)
- **Status badges**: เขียว=VERIFIED · น้ำเงิน=ENTERED_1/2 · เหลือง=DISCREPANCY/NEEDS_FIELD_QUERY (ตามกติกาสี: เหลือง=warning) · เทา=PENDING/ไม่มีข้อมูล · แดง=UNRESOLVABLE/SHEET_LOST เท่านั้น
- แถวทั้งหมดกรองด้วย `UserCommunityScope` ฝั่ง server เสมอ — ไม่มีทาง query ข้าม scope

## 9. Household Detail

เลย์เอาต์: Header + แท็บ (desktop = แท็บบน, mobile = accordion)

- **Header**: บ้านเลขที่ หมู่ ตำบล ชุมชน · badge สถานะใบ · consent badge · duplicate ⚑ · ปุ่มตามสิทธิ์ (แก้สถานะ / ดูใบสแกน / Export)
- **General Info**: ส่วน 0-1 ทั้งหมด + FieldStatus ต่อช่อง (icon เหลือง ILLEGIBLE / เทา BLANK)
- **Members (เปราะบาง)**: ตาราง VulnerablePerson + vulnerabilities + triage (เมื่อมีสูตร) + สถานะ isActive — ข้อมูลสุขภาพ (detail L4) แสดงเฉพาะ role ที่มีสิทธิ์ + Audit READ
- **Location**: ที่อยู่ + coordinateRawText (ดิบ) + lat/lng (derived) + mini map — พิกัดเห็นเฉพาะ role ภายใน ไม่มีใน public
- **Housing**: floorLevel, ownership, buildingType
- **Economy**: povertyProgramInterest (+ future)
- **Disaster**: FloodRiskProfile ทั้งหมด + ทรัพยากร + ยานพาหนะ + ช่องทางเตือนภัย + อาสาสมัคร
- **Attachments**: scan ใบ, scan consent, PDF field query
- **History**: HouseholdVersion list + diff + เหตุผล
- **Timeline**: เหตุการณ์ตั้งแต่รับปึกถึงปัจจุบัน (§5)
- **Audit**: รายการ AuditLog ของ record นี้ (ADMIN เท่านั้น)

---

## 10. Draft Strategy

| กลไก | การออกแบบ | ที่เก็บ (มีอยู่แล้วใน schema) |
|---|---|---|
| **Draft** | payload ของฟอร์มทั้งใบ (รวม FieldStatus ต่อช่อง + step ปัจจุบัน) — ยังไม่เป็น Household | `EntryAttempt` (submittedAt=NULL) |
| **Auto Save** | ทุก 10 วิ (FR-ENT-08) + on step change + on blur ช่องสำคัญ — debounce, ห้ามทำข้อมูลหาย: เขียนสำเร็จค่อยอัปเดต indicator "บันทึกล่าสุด 14:32:05" | เดียวกัน |
| **Resume** | หน้า "งานของฉัน" list ใบ LOCKED ของตน → เปิดที่ step ล่าสุด | `PaperSheet.lockedById` + payload.step |
| **Lock** | หยิบงาน = `PENDING→LOCKED` ใน transaction (กันสองคนหยิบใบเดียว — CLAUDE.md) · lockExpiresAt = +10 นาที · auto-save ต่ออายุ · Cron ปลด lock หมดอายุ → PENDING (draft ยังอยู่) | `lockedById/lockedAt/lockExpiresAt` + `ix_sheet_lock_expiry` |
| **Conflict** | lock หมดอายุแล้วมีคนอื่นหยิบ: คนเดิมกด save → server ตรวจ lockedById ≠ ตน → แจ้ง "ใบนี้ถูกผู้อื่นหยิบไปแล้ว" + เก็บ payload ตนเป็น draft ประวัติ (ไม่ทับ) — first-committed wins | server ตรวจทุก write |
| **Version** | หลัง VERIFIED ทุกการแก้สร้าง `HouseholdVersion` (snapshot + เหตุผลบังคับ) — Draft ก่อน submit ไม่นับเป็น version | `HouseholdVersion` |
| **Recovery** | (ก) browser crash → draft server ครบถึง 10 วิสุดท้าย (ข) localStorage buffer ระหว่าง 10 วิ — เปิดใหม่เจอ diff เสนอกู้ (ค) submit fail → payload ยังอยู่ retry ได้ | server + localStorage เสริม |

---

## 11. Permission Matrix (จาก docs/10 + docs/23 — ไม่สร้างสิทธิ์ใหม่นอกเอกสาร)

| Action | DATA_ENTRY | VERIFIER | COORDINATOR | OFFICER | EXECUTIVE | ADMIN | VOLUNTEER | RESEARCHER | FIELD_SURVEYOR |
|---|---|---|---|---|---|---|---|---|---|
| เห็นเมนูครัวเรือน (List) | ❌ | ❌ | ⚠️ ดูสถานะใบ ไม่เห็น PII เต็ม | ✅ scope | ✅ aggregate เท่านั้น (ไม่เจาะ PII รายคน — docs/10 ⚠️16) | ✅ | ❌ (เห็น aggregate ชุมชนตน) | ❌ (anonymized ผ่าน Reports) | ❌ |
| Quick/Advanced Search | ❌ (**ห้าม** — CLAUDE.md) | เฉพาะใบในคิวตน | ⚠️ ตามใบใน Batch | ✅ scope | ❌ | ✅ | ❌ | ❌ | ❌ |
| Household Detail + PII | ❌ | ✅ เฉพาะใบที่ตรวจ | ⚠️ จำกัด | ✅ scope + Audit READ | ❌ | ✅ + Audit | ❌ | ❌ | ❌ |
| หยิบงานคีย์ / Wizard Entry 1-2 | ✅ (ใบที่ระบบมอบ) | ❌ | ❌ | ❌ | ❌ | ✅ (ฉุกเฉิน — ควรเลี่ยง) | ❌ | ❌ | ❌ |
| Save Draft / Submit | ✅ ใบของตน | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| สร้าง/ปิด Batch | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| ตัดสิน Discrepancy | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| สร้าง/ตอบ Field Query | ❌ | ✅ สร้าง | ✅ คีย์คำตอบ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ ตอบ (ผ่านช่องทางที่กำหนด) |
| แก้หลัง Verify (สถานะปัจจุบัน) | ❌ | ❌ | ❌ | ✅ scope + version + เหตุผล | ❌ | ✅ | ❌ | ❌ | ❌ |
| Export | ❌ (**ห้าม**) | ❌ | ⚠️ รายงาน Batch | ✅ scope + Audit | ⚠️ aggregate | ✅ + Audit | ❌ | ✅ anonymized เท่านั้น | ❌ |
| ดูสถิติการคีย์ของตน | ✅ | ✅ | ✅ ทีม | — | — | ✅ | — | — | — |

กติกาเชิงระบบ: ทุก action ตรวจ permission + community scope **ฝั่ง server** (`requirePermission` / `requireCommunityAccess` — มีแล้ว docs/23) · ปุ่มที่ไม่มีสิทธิ์ = ไม่ render (แต่ไม่ใช่การป้องกันหลัก) · การเปิด PII/สุขภาพ/พิกัด ลง `AuditLog` (READ/EXPORT) ทุกครั้ง
> ⚠️ สิทธิ์ระดับ permission string ปัจจุบันมี 8 ตัว (docs/23) — Module นี้จะต้องเพิ่มความละเอียด (เช่น `household.edit`, `batch.manage`, `verification.resolve`, `report.export`) **ต้องขออนุมัติชุด permission เพิ่มก่อน Phase A** (ดู §15)

---

## 12. UX Guidelines & Responsive Design

### 12.1 องค์ประกอบ UX ของ Wizard

- **Progress**: แถบบน "ส่วนที่ 2/5 · ใบ SHEET-KL01-001-024" + step indicator คลิกย้อนได้ (ไปหน้าไม่ได้ถ้า step ปัจจุบันมี error จริง) — ตรงเลขส่วนบนกระดาษให้ผู้คีย์เทียบเร็ว
- **Sidebar ใน wizard**: ยุบเหลือแถบแคบ (เลขใบ + ปุ่มออก) — โฟกัสงานคีย์
- **ปุ่ม**: Next (Enter จากช่องสุดท้าย/ปุ่ม) · Back · Save Draft (manual เสริม auto) · Submit (Ctrl+Enter — เฉพาะ step Review) · Cancel/ออก (คืน lock พร้อม confirm)
- **Success**: toast + auto-advance ใบถัดไป (โหมด "คีย์ต่อเนื่อง" — ค่า default) หรือกลับคิว (toggle ได้)
- **Error**: inline แดงใต้ช่อง + focus กลับช่องแรกที่ผิด (FR-ENT-09) · error ระดับใบ (lock หลุด/สถานะเปลี่ยน) = modal อธิบาย + ทางไป
- **Validation warning**: เหลือง ไม่บล็อก — สรุปรวมอีกครั้งใน Review
- **Loading**: skeleton ตอนเปิดใบ · ปุ่ม submit spinner + disabled กันกดซ้ำ · optimistic ไม่ใช้กับ submit (ต้องรอ transaction)
- **Offline**: ตรวจ `navigator.onLine` + fetch fail → banner เหลือง "ออฟไลน์ — บันทึกลงเครื่องชั่วคราว" → buffer localStorage → sync เมื่อกลับ online → ถ้า lock หมดอายุระหว่างนั้น เข้าเส้นทาง Conflict (§10)
- **Unsaved changes**: `beforeunload` + in-app guard เมื่อมี diff จาก save ล่าสุด — "มีข้อมูลยังไม่บันทึก (12 วิที่แล้ว) — ออก/บันทึกก่อนออก"
- **FieldStatus affordance**: ทุกช่องมี hint icon F2/F3 · ช่องที่ตั้ง ILLEGIBLE = พื้นเหลืองอ่อน + label "อ่านไม่ออก" · BLANK = พื้นเทา — เปลี่ยนกลับได้ด้วยการพิมพ์ทับ

### 12.2 Responsive

| อุปกรณ์ | การใช้งานจริง | การปรับ |
|---|---|---|
| **Desktop ≥1280** | เป้าหมายหลักของ Entry Console + Back-office (docs/01: Data Entry ใช้ Desktop) | Layout เต็ม, grid mode เต็มตาราง, mini map ข้างช่อง |
| **Notebook 1024-1280** | ผู้ประสาน/Verifier | ตารางลด column รอง (ซ่อนใน expand row), wizard เท่าเดิม |
| **Tablet 768-1024** | Officer ภาคสนาม (ดูข้อมูล) | List = card hybrid, Detail = accordion, **Entry Console ไม่ optimize ให้** (คีย์บอร์ดจริงคือ requirement — แจ้งเตือนถ้าเปิดบน touch ล้วน) |
| **Mobile <768** | ผู้บริหารดูสรุป / อนาคต public | เฉพาะ Dashboard/Detail read-only แบบ stack — **ไม่รองรับ wizard** (ประกาศชัดเป็น non-goal Phase นี้) |

### 12.3 สี/ภาษา
ตาม CLAUDE.md: ไทยทั้งระบบ · แดง=Error/Critical เท่านั้น · เหลือง=Warning/ILLEGIBLE · เทา=Missing/BLANK · ทุก Dashboard แสดง Coverage + Denominator

---

## 13. Performance Notes

| เทคนิค | ใช้ที่ไหน | เหตุผล |
|---|---|---|
| **Server-side pagination (cursor)** | Household List, Batch List, คิว Verifier | ข้อมูลโตต่อเนื่อง — ห้าม fetch ทั้งตาราง |
| **Server Components + Server Actions** | ทุกหน้า list/detail (RSC) · mutation ทั้งหมดเป็น Server Action + Zod | สถาปัตยกรรมที่ CLAUDE.md กำหนด — ลด JS ฝั่ง client |
| **Client Components เฉพาะจุด** | Wizard form, grid เปราะบาง, mini map (dynamic import — Leaflet หนัก), search box | เฉพาะที่ต้อง interaction |
| **Lazy loading** | mini map, แท็บ Detail (History/Timeline/Audit โหลดเมื่อเปิดแท็บ), scan image | เปิดหน้าไว |
| **Virtual list** | ยังไม่จำเป็น Phase แรก (page size ≤100) — พิจารณาเมื่อ grid เปราะบาง >100 แถว/คิว >1000 | อย่า optimize ก่อนเวลา |
| **Index ที่มีอยู่** | `ix_sheet_pickup` (หยิบงาน — ถูกเรียกบ่อยสุด), `ix_household_address_dup` (dup check), `ix_discrepancy` | schema เตรียมไว้แล้ว — query ต้องเขียนให้ตรง index |
| **Cache** | Master Data (BuildingType ฯลฯ) cache ระดับ request/`unstable_cache` สั้น ๆ — ข้อมูลใบ/ครัวเรือน **ไม่ cache** (ความถูกต้อง > ความเร็ว) | Master แทบไม่เปลี่ยน |
| **Transaction** | หยิบงาน (lock), submit (สร้าง Household+ลูกทั้งหมด atomic), ตัดสิน discrepancy → update สถานะใบ | CLAUDE.md บังคับ |
| **Debounced autosave** | payload เดียวต่อ 10 วิ ไม่ยิงถี่ | ลด load |

---

## 14. Development Roadmap

> ทุก Phase: ทำตาม Development Workflow ใน CLAUDE.md (อ่านก่อน-เสนอแผน-รอคำสั่ง) · ไม่มี Phase ใดแตะ schema (ถ้าพบว่าจำเป็น → HALT ขออนุมัติ)

| Phase | เป้าหมาย | งานหลัก | Dependency | Test | Definition of Done |
|---|---|---|---|---|---|
| **A — Household List** | Role ที่มีสิทธิ์ค้น/ดูครัวเรือนใน scope ได้ | permission เพิ่ม (อนุมัติก่อน), `/households` list + filters + pagination, Detail read-only (General/Members/Location), Audit READ สำหรับ PII | RBAC foundation (มีแล้ว) · **อนุมัติชุด permission** | unit: query builder scope/filter · integration: scope กรองจริง, audit เขียนจริง · E2E: ค้นหา+เปิด detail | list+detail ใช้ได้จริงตาม scope, PII มี audit, 86 เทสต์เดิมผ่าน, tsc/build ผ่าน |
| **B — Wizard UI** | Entry Console คีย์ได้ครบ 9 step (ยังไม่ save) | Batch/Sheet list (COORDINATOR สร้าง Batch), หยิบงาน+lock (transaction), ฟอร์ม 9 step + keyboard (F2/F3/Tab/เลข) + grid เปราะบาง + FieldStatus ต่อช่อง + parser พิกัด (pure fn) | A (โครง route/permission) · Master Data seed (มีแล้ว) | unit: parser พิกัด/แปลง พ.ศ./derived น้ำท่วม (pure) · integration: lock กันชนกัน (2 คนหยิบพร้อมกัน) · E2E keyboard: Tab order, F2/F3 | คีย์ครบทุก step ด้วยคีย์บอร์ดล้วน, lock ปลอดภัย, ฟอร์มตรงกระดาษ (ทวนกับ docs/03) |
| **C — Save Draft** | ไม่มีข้อมูลหายระหว่างคีย์ | auto-save 10 วิ → EntryAttempt.payload, resume + step restore, ต่ออายุ lock, cron ปลด lock, localStorage recovery, conflict path | B | integration: save/resume/lock expiry/conflict · unit: serializer payload | ปิด browser กลับมาคีย์ต่อได้ ≤10 วิสูญหาย, lock หมดอายุปลดจริง, draft ไม่ทับกัน |
| **D — Validation** | กติกาครบโดยไม่บังคับเดา | Zod schemas client+server (แชร์), BR ทั้งหมด (§7), cross-validation warnings, duplicate soft check, mini map + เตือนพิกัด | B, C | unit: ทุก Zod rule + ทุก cross-rule · integration: dup check กับข้อมูลจริง | ทุก rule มีเทสต์, warning ไม่บล็อกการเก็บดิบ, ILLEGIBLE/BLANK ไปถึง DB ถูกช่อง |
| **E — Submit** | Entry 1 สร้าง Household จริง / Entry 2 blind | submit transaction (Household+ลูกทุกตาราง+FieldStatus+สถานะใบ), Entry 2 mode (critical fields จาก CriticalFieldConfig — **ต้อง seed config ก่อน: ขออนุมัติ**), Discrepancy engine เทียบ raw, quality counters | C, D · อนุมัติ seed CriticalFieldConfig | integration: submit ครบทุกตาราง atomic, Entry2 ไม่รั่วค่า Entry1 (ตรวจ payload API), engine สร้าง discrepancy ถูกฟิลด์ · BR-44 trigger | ใบไหลครบ PENDING→ENTERED_2, blind จริง (พิสูจน์ด้วยเทสต์), rollback เมื่อ fail |
| **F — Verification** | ปิดวงจรถึง VERIFIED | คิว Verifier, หน้าตัดสินต่อฟิลด์ (value1/2/other/illegible), เขียน resolvedValue กลับ Household, Field Query CRUD + PDF, สถานะใบครบ 10 ค่า, Timeline | E | integration: ตัดสินครบ→VERIFIED, บางส่วน→ค้าง, field query loop · E2E: verifier ตัดสินจริง | ใบถึง VERIFIED ได้จริงตามกติกา, ไม่มีทางลัดข้ามสถานะ, audit ครบ |
| **G — Reports** | ข้อมูล VERIFIED ใช้งานได้ | Coverage ต่อชุมชน (สูตร docs/06: `>60%` strict, denominator nullable), ทะเบียนเปราะบาง (ตามสิทธิ์), Export + Audit, Dashboard การ์ดเพิ่ม | F (ต้องมี VERIFIED จริง) | unit: สูตร coverage (pure) · integration: นับเฉพาะ VERIFIED (ไม่นับ draft/dup/cancelled) | ตัวเลขตรง query อิสระ, ไม่มี PII รั่วใน export ที่ไม่มีสิทธิ์, coverage แสดง denominator |

---

## 15. ความเสี่ยงและข้อเสนอแนะ (ต้องตัดสินใจก่อน/ระหว่างพัฒนา)

| # | ประเด็น | สถานะ (อัปเดต 2026-07-22 — Owner Decision รอบเริ่มพัฒนา) | ข้อเสนอ/ผล |
|---|---|---|---|
| R1 | "เพิ่มครัวเรือน" โดยไม่มีใบกระดาษ ทำไม่ได้ (`sheetId` NOT NULL) | ✅ **ตัดสินแล้ว** — ระบบเป็น Paper-first, Household ต้องมีต้นกำเนิดจาก PaperSheet, ห้ามสร้างลอย ๆ | ออกแบบตามนี้ทุก Phase |
| R2 | ชุด permission ละเอียดยังไม่ได้อนุมัติ | ✅ **ตัดสินแล้ว** — ปรับ Permission Model ใน source code ได้เมื่อจำเป็นต่อ Entry Workflow แต่ห้ามขยายสิทธิ์ role โดยไม่มีหลักฐานเอกสาร; role ที่ไม่ชัดใช้ Least Privilege | ทำได้เท่าที่จำเป็นรายรอบ |
| R3 | `CriticalFieldConfig` ยังไม่มี seed + คำถามค้าง Q-13 เรื่อง age | ⏳ **ยังค้าง** — Blind Entry 2 / Discrepancy / Verification ไม่ใช่เป้าหมายรอบพัฒนาแรก แต่สถาปัตยกรรมต้องไม่ปิดทาง | รอ Owner Decision ก่อน Phase E |
| R4 | กฎแปลง พ.ศ./ค.ศ. (QM-02) และหน่วยอายุครรภ์ (Q-14) ยังไม่ถูกยืนยันกับผู้สำรวจ | ⏳ ยังค้าง | กำหนดกฎใน Phase D + สอบถามทีมสนาม |
| R5 | Encryption ของ payload/PII (`EntryAttempt.payload` 🔒) | ✅ **ตัดสินแล้ว** — **ยังไม่อนุมัติ** บันทึกข้อมูลละเอียดอ่อนใน payload แบบ plaintext และห้ามสร้าง encryption ชั่วคราวที่ไม่เหมาะกับ Production → ฟีเจอร์ Draft ที่ต้องเก็บคำตอบถูก Block จนกว่ามีกลไกที่อนุมัติ | แยกส่วนที่ทำได้โดยไม่เก็บ payload |
| R6 | MinIO/S3 สำหรับ scan (Attachment) ยังไม่ตั้ง | แท็บ Attachment เป็น URL เปล่า | เลื่อน Attachment ไปหลัง Phase F ได้ — ไม่บล็อกเส้นหลัก |
| R7 | Risk/Triage ยังไม่มีสูตร (WAITING_FOR_BUSINESS_RULE) | คอลัมน์ triage/risk ใน List ว่าง | แสดง "รอสูตร" — ห้าม mock ค่า |
| R8 | Verifier role กับหน้า Verification: docs/10 ให้เห็น PII เฉพาะใบที่ตรวจ — ต้องออกแบบ query จำกัดเป็นรายใบ | PII รั่วเกินสิทธิ์ | ใช้ pattern "assigned queue" — verifier เห็นเฉพาะใบสถานะ DISCREPANCY ที่เปิดดูอยู่ + audit |

---

*เอกสารนี้คือ Deliverable เดียวของรอบ (ไม่มีการแก้โค้ด/schema/commit) — พร้อมใช้เป็นข้อกำหนดตั้งต้นของ Phase A เมื่อ Owner อนุมัติ R2*
