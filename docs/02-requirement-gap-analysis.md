# 02 — Requirement Gap Analysis

> วิเคราะห์ Requirement ที่ **ขาด / ซ้ำ / ขัดแย้ง / ไม่ชัดเจน**
> แหล่งอ้างอิง: `docs/system-analysis.md` (v3.0), `docs/questionnaire.pdf`, `prisma/schema.prisma`, `prisma/seed.ts`, `database/drafts/00_postgis_extensions.sql`, `CLAUDE.md`, และคำสั่งผู้ใช้รอบนี้

## สรุประดับปัญหาในเอกสารฉบับนี้

| ระดับ | จำนวน |
|---|---|
| 🔴 BLOCKER | 4 |
| 🟠 HIGH | 7 |
| 🟡 MEDIUM | 6 |
| 🟢 LOW | 3 |

---

## ส่วนที่ 1: Requirement ที่ขัดแย้ง (Conflicts)

> **หลักการรายงาน:** เมื่อข้อมูลขัดกัน จะรายงาน **ทุกแหล่งที่ขัดกัน** พร้อมระบุว่าแหล่งใดควรเป็น Source of Truth ตามคำสั่งผู้ใช้

---

### 🔴 CONF-01 — BLOCKER: ปริมาณงานและเป้าหมายครัวเรือน (600/ชุมชน, 3,000 ใบ)

**ปัญหาคืออะไร:** สมมติฐาน "600 ครัวเรือน × 5 ชุมชน = 3,000 ใบ" ถูกยกเลิกโดยคำสั่งผู้ใช้และ `CLAUDE.md` แล้ว แต่ยังฝังอยู่ทั่วทั้งเอกสารและโค้ด

**พบในไฟล์ใด (ทุกแหล่งที่ขัดกัน):**

| แหล่ง | ตำแหน่ง | ข้อความ |
|---|---|---|
| ขัดแย้ง | `docs/system-analysis.md:11` | "ปริมาณงานตั้งต้น: **3,000 ชุด (600 ชุด × 5 ชุมชน)**" |
| ขัดแย้ง | `docs/system-analysis.md:65` | "แบบสอบถามกระดาษ 3,000 ใบ" |
| ขัดแย้ง | `docs/system-analysis.md:100` | "**3,000 ใบ (600×5 ชุมชน)** เข้ามาพร้อมกันเป็นก้อน" |
| ขัดแย้ง | `docs/system-analysis.md:185-193` | Workload Analysis คำนวณจาก 3,000 ใบ → 375 ชม.-คน |
| ขัดแย้ง | `docs/system-analysis.md:233` | "กระดาษพิมพ์แล้ว 3,000 ชุด แก้ไม่ได้" |
| ขัดแย้ง | `docs/system-analysis.md:359` | Coverage Badge ตัวอย่าง "28% (847/3,000)" |
| ขัดแย้ง | `docs/system-analysis.md:1076` | KPI "≥ 90% (2,700/3,000)" |
| ขัดแย้ง | `docs/system-analysis.md:1123` | Executive Summary "ข้อมูลชุมชน 3,000 ครัวเรือน" |
| ขัดแย้ง | `prisma/schema.prisma:398` | `targetHouseholds Int @default(0)` |
| ขัดแย้ง | `prisma/seed.ts:79` | Comment "ชุมชน 5 แห่ง (600 ชุด × 5 ชุมชน)" |
| ขัดแย้ง | `prisma/seed.ts:82-86` | `target: 600` ทั้ง 5 ชุมชน |
| ขัดแย้ง | `prisma/seed.ts:358` | log "ชุมชน 5 แห่ง (เป้าหมายรวม 3,000 ครัวเรือน)" |
| ✅ **ถูกต้อง** | `CLAUDE.md` + คำสั่งผู้ใช้ | "ยกเลิกสมมติฐานว่าแต่ละชุมชนมีเป้าหมาย 600 ครัวเรือน — เป้าหมายจริงคือสำรวจให้ได้ **มากกว่าร้อยละ 60** ของจำนวนครัวเรือนทั้งหมดในแต่ละชุมชน" |

**ผลกระทบ:** Coverage คำนวณผิดทั้งระบบ — `v_community_summary` หารด้วย 600 ที่เป็นค่าสมมติ ทำให้ Dashboard, Report, Export Watermark และ KPI แสดงตัวเลขที่ไม่มีความหมาย ผิด FR-CVG-03 (สถิติทุกตัวต้องมี Denominator ที่ถูกต้อง) และเสี่ยงต่อ RK-C1 (เจ้าหน้าที่เข้าใจผิดว่าข้อมูลครบ) โดยตรง

**แนวทางแก้ไข:** ใช้ Coverage Model ใหม่ (ดู [06-coverage-model-review.md](06-coverage-model-review.md)) — `totalHouseholds Int?` (Nullable) + `targetCoveragePercent Float @default(60)` และเงื่อนไขผ่านเป้าคือ `coveragePercent > 60`. ปรับเอกสาร v3.0 ทุกจุดข้างต้นให้เลิกอ้าง 3,000/600

**ต้องใช้ข้อมูลเพิ่มเติม:** จำนวนครัวเรือนทั้งหมดจริงของแต่ละชุมชน 5 แห่ง + แหล่งที่มา (ทะเบียนราษฎร์/เทศบาล/สำรวจเอง) + วันที่ของข้อมูล → **ปัจจุบันยังไม่ทราบ ต้องรองรับ NULL** (ดู [14-open-questions.md](14-open-questions.md) Q-01)

**Module ที่กระทบ:** M02 (Batch), M06 (Entry Dashboard), M11 (Dashboard), M16 (Report/Export), M10 (GIS Coverage Layer)

---

### 🔴 CONF-02 — BLOCKER: ชื่อ Role — `VOLUNTEER` vs `RESCUE_VOLUNTEER`

**ปัญหาคืออะไร:** ชื่อบทบาทไม่ตรงกันระหว่างเอกสาร Schema และ CLAUDE.md — และ Schema **ไม่มี** `VOLUNTEER` เลย

**พบในไฟล์ใด (ทุกแหล่งที่ขัดกัน):**

| แหล่ง | ตำแหน่ง | ข้อความ |
|---|---|---|
| ✅ Source of Truth (Workflow/สิทธิ์) | `docs/system-analysis.md:565` | Role table ใช้ `VOLUNTEER` |
| ✅ | `docs/system-analysis.md:647` | BR-25: "~~RESCUE_VOLUNTEER~~ → **VOLUNTEER** เห็น PII เฉพาะ Incident" — **เอกสารประกาศเปลี่ยนชื่ออย่างชัดเจน** |
| ✅ | `docs/system-analysis.md:57, 512, 658-659` | v3.0 Change Log + NFR-S-07 + BR-64/65 ใช้ `VOLUNTEER` |
| ❌ ขัดแย้ง | `prisma/schema.prisma:158` | `RESCUE_VOLUNTEER // อาสากู้ภัย — รับงาน Incident` |
| ⚠️ กำกวม | `CLAUDE.md` | "VOLUNTEER หรือ RESCUE_VOLUNTEER" — **สั่งให้เลือกเอง** ("ก่อนเริ่มพัฒนา ต้องตรวจสอบและกำหนดชื่อ Role ให้เป็นมาตรฐานเดียวกันทั้งเอกสาร Schema และ Code") |

**ข้อเสนอแนะ (ต้องได้รับการยืนยัน):** ใช้ **`VOLUNTEER`**

**เหตุผล:**
1. เอกสาร v3.0 คือ Source of Truth สำหรับ Workflow และสิทธิ์ (ตามคำสั่งผู้ใช้) และประกาศเปลี่ยนจาก `RESCUE_VOLUNTEER` → `VOLUNTEER` ไว้ชัดเจนใน BR-25
2. ขอบเขตงานของบทบาทนี้กว้างกว่าการกู้ภัย — แบบสอบถามส่วนที่ 4 ข้อ 4 มีอาสาสมัคร 8 ด้าน ซึ่งมีเพียง "กู้ภัย" ด้านเดียวที่เป็น Rescue ส่วนที่เหลือคือ เตือนภัย/ครัวชุมชน/ดูแลผู้สูงอายุ/ฟื้นฟู/ช่างซ่อมรถ/ช่างไฟ/ช่างก่อสร้าง → ใช้ `RESCUE_VOLUNTEER` จะสื่อความหมายผิดและกีดกัน 7 ใน 8 ด้าน
3. M19 Volunteer Management (ไม่ใช่ "Rescue Volunteer Management")

**ผลกระทบ:** ถ้าไม่ตัดสินก่อนเริ่ม M01 → Policy, Guard, Seed, Test และ UI ทั้งหมดจะอ้างชื่อผิด ต้องแก้ Migration ของ Enum ภายหลัง (ซึ่งใน PostgreSQL การลบค่า enum ทำได้ยากและต้อง rewrite ตาราง)

**Module ที่กระทบ:** M01, M19, M14, ทุก Policy/RBAC

---

### 🟠 CONF-03 — HIGH: เป้าหมาย Coverage — ≥85% vs >60%

**พบในไฟล์ใด:**

| แหล่ง | ตำแหน่ง | ข้อความ |
|---|---|---|
| ขัดแย้ง | `docs/system-analysis.md:1086` | KPI Decision Zone: "Coverage **≥ 85%**" |
| ขัดแย้ง | `docs/system-analysis.md:474` | FR-CVG-04: "เตือนเมื่อ Export ข้อมูลที่ Coverage **<80%**" |
| ✅ ถูกต้อง | `CLAUDE.md` + คำสั่งผู้ใช้ | เป้าหมายจริง "**มากกว่าร้อยละ 60**" → `coveragePercent > 60`, `targetCoveragePercent` default = 60 |

**ผลกระทบ:** มี 3 เกณฑ์ในระบบเดียว (60 / 80 / 85) โดยไม่ระบุว่าเกณฑ์ไหนใช้ที่ไหน → Badge สีเขียว/เหลือง/แดงบน Dashboard จะไม่สอดคล้องกับ KPI และ Export Warning

**แนวทางแก้ไข:** แยกให้ชัดเป็น 3 ค่าที่ต่างวัตถุประสงค์และเก็บใน `SystemSetting`/`Community` ไม่ใช่ Hardcode:
- `targetCoveragePercent` = 60 → **เกณฑ์ผ่านเป้าหมายโครงการ** (`> 60`) ต่อชุมชน
- `exportWarningCoveragePercent` = 80 → เกณฑ์เตือนตอน Export (FR-CVG-04)
- KPI 85% → **ถือเป็น Stretch Goal ระดับโครงการ ไม่ใช่ Business Rule ของระบบ** (ต้องยืนยัน)

**ต้องใช้ข้อมูลเพิ่มเติม:** เจ้าของระบบต้องยืนยันว่า 85% ยังเป็น KPI หรือยกเลิกพร้อมกับสมมติฐาน 600 (ดู Q-02)

**Module ที่กระทบ:** M11, M16, M06

---

### 🟠 CONF-04 — HIGH: Permission Matrix ขาด 2 Role และให้สิทธิ์คีย์ข้อมูลแก่ VERIFIER

**พบในไฟล์ใด:** `docs/system-analysis.md:577-592` (ตาราง Permission Matrix ข้อ 9.2)

**ปัญหา 3 จุด:**

1. **ขาด Role:** ตาราง 9.1 นิยาม 9 Roles (รวม `FIELD_SURVEYOR`, `RESEARCHER`) แต่ตาราง 9.2 มีเพียง 8 คอลัมน์ + Public → **`FIELD_SURVEYOR` และ `RESEARCHER` ไม่มีสิทธิ์ระบุไว้เลย** ทั้งที่ FR-AUTH-04 บอก "RBAC 9 บทบาท + Public Zone"
2. **VERIFIER คีย์ข้อมูลได้:** แถว "คีย์ข้อมูล (Entry 1/2)" ให้ `VERIFIER = ✅` → ขัดกับหลัก Separation of Duties และ FR-VER-03/BR-44 ("ผู้คีย์ Entry 2 ต้องไม่ใช่คนเดิม") หาก Verifier คีย์เองแล้วมาตัดสิน Discrepancy ของตัวเอง = ตรวจงานตัวเอง
3. **OFFICER คีย์ข้อมูลได้ (`✅`) และตัดสิน Discrepancy ได้ (`✅`)** → ปัญหาเดียวกัน

**ผลกระทบ:** ออกแบบ Policy ไม่ได้ เพราะไม่รู้ว่า Field Surveyor เข้าถึงอะไรได้บ้าง (นอกจาก "ตอบคำถามกลับ") และไม่รู้ว่าจะบังคับ Separation of Duties ระดับไหน

**แนวทางแก้ไข:** ใช้ Permission Matrix ฉบับสมบูรณ์ใน [10-rbac-pdpa-matrix.md](10-rbac-pdpa-matrix.md) ซึ่งเติม `FIELD_SURVEYOR` + `RESEARCHER` และเสนอกฎ **"ผู้ที่คีย์ใบใดก็ตาม ห้ามตัดสิน Discrepancy ของใบนั้น"** (ตรวจที่ Server + DB Constraint)

**Module ที่กระทบ:** M01, M03, M04

---

### 🟡 CONF-05 — MEDIUM: จำนวน Entity และ Enum ไม่ตรงกับ Schema จริง

**พบในไฟล์ใด:**

| แหล่ง | ตำแหน่ง | ข้อความ | ค่าจริง |
|---|---|---|---|
| ขัดแย้ง | `docs/system-analysis.md:679` | "สรุป Entity (**35 ตาราง**)" | **49 models** |
| ขัดแย้ง | `docs/system-analysis.md:955` | "Schema ครบ **35 Entity + 18 Enums**" | **49 models + 16 enums** |

**ผลกระทบ:** เอกสารกับ Schema ไม่ Sync — ผู้พัฒนาใหม่จะเชื่อเอกสารแล้วหา Entity ไม่ครบ และไม่รู้ว่ามี Entity ใดถูกเพิ่มโดยไม่ผ่านการทบทวน

**แนวทางแก้ไข:** สร้าง Entity List อัตโนมัติจาก Schema และอัปเดตเอกสาร (ดู [04-schema-gap-analysis.md](04-schema-gap-analysis.md) ภาคผนวก ก) — ไม่ใช่แก้ตัวเลขด้วยมือ

**Module ที่กระทบ:** เอกสารเท่านั้น

---

### 🟡 CONF-06 — MEDIUM: DATA_ENTRY "ดูแผนที่ ❌" แต่ต้องมี Mini Map

**พบในไฟล์ใด:**
- `docs/system-analysis.md:585` — Permission Matrix: "ดูแผนที่ | DATA_ENTRY = ❌"
- `docs/system-analysis.md:450` — FR-ENT-14: "**Mini map ข้างช่องพิกัด — แสดงทันทีเมื่อคีย์ครบ**" (ระดับ M)
- `docs/system-analysis.md:881` — T9: "Static Map API สำหรับ mini map ตอนคีย์"

**ผลกระทบ:** กำกวมว่า DATA_ENTRY เห็นแผนที่ได้หรือไม่ → หากตีความตรงตัวจะทำ FR-ENT-14 ไม่ได้ ซึ่งเป็นมาตรการหลักของ RK-E13 (พิกัดผิด)

**แนวทางแก้ไข:** แยกนิยามให้ชัด — "ดูแผนที่" ในความหมายของ Permission Matrix = **แผนที่ครัวเรือน/ความเสี่ยงของระบบ (M10)** ซึ่ง DATA_ENTRY ห้ามเข้า ส่วน Mini Map ใน Entry Console = **ภาพ Static ของพิกัดใบที่ตัวเองกำลัง Lock อยู่เท่านั้น** ไม่ใช่ Query Layer และต้องไม่แสดงหมุดบ้านอื่น → สอดคล้องกับ BR-58

**Module ที่กระทบ:** M03, M10

---

### 🟢 CONF-07 — LOW: เวอร์ชัน Schema ใน Comment ไม่ตรงกับเอกสาร

**พบในไฟล์ใด:** `prisma/schema.prisma:4` — "Prisma Schema **v2.0** — Paper-first, Back-office Entry Model" ขณะที่เอกสารเป็น v3.0 และ Schema **ไม่มี** Entity ของ v3.0 (Volunteer Management, Public Portal)

**ผลกระทบ:** ยืนยันว่า Schema ยังไม่ได้รับการปรับให้รองรับ v3.0 → เป็นสาเหตุรากของ GAP-R01/R02 ด้านล่าง

**แนวทางแก้ไข:** อัปเดต Header + เพิ่ม Entity ที่ขาด

---

## ส่วนที่ 2: Requirement ที่ขาด (Missing)

---

### 🔴 GAP-D01 — BLOCKER: Business Rule ส่วนใหญ่ "ไม่มีข้อความ" ในโปรเจกต์

**ปัญหาคืออะไร:** เอกสาร v3.0 อ้างถึง Business Rule ที่สำคัญที่สุดของระบบ แต่เขียนเพียงว่า "(เหมือนเดิม — ดูรายละเอียดใน v2.0)" โดยที่ **ไม่มีไฟล์ v2.0 หรือ v1.0 อยู่ในโปรเจกต์**

**พบในไฟล์ใด:**

| ตำแหน่ง | ข้อความ | BR ที่หายไป |
|---|---|---|
| `docs/system-analysis.md:629-631` | "11.1 กฎการจัดเก็บข้อมูล (BR-01 ถึง BR-14) — จาก v2.0 / (เหมือนเดิม — ดูรายละเอียดใน v2.0)" | **BR-01..BR-14 (14 ข้อ)** |
| `docs/system-analysis.md:633-635` | "11.2 กฎการคีย์ข้อมูล (BR-40 ถึง BR-55) — จาก v2.0 / (เหมือนเดิม)" | **BR-40..BR-55 (16 ข้อ)** |
| `docs/system-analysis.md:637-639` | "11.3 กฎการคำนวณความเสี่ยง (BR-15 ถึง BR-22) — จาก v2.0 / (เหมือนเดิม)" | **BR-15..BR-22 (8 ข้อ)** |
| `docs/system-analysis.md:479` | "6.8 … (รายละเอียดเดิมทั้งหมดยังใช้ได้ ดู v2.0 sections 6.3-6.12)" | **FR-VUL, FR-RSK, FR-GIS, FR-DSH, FR-SRC, FR-RES, FR-INC, FR-NOT, FR-RPT, FR-ADM ทั้งหมด** |
| `docs/system-analysis.md:775` | "15-17. Dashboard / Reports / GIS — (รายละเอียดจาก v2.0 ยังใช้ได้ทั้งหมด)" | Dashboard/Report/GIS spec |
| `docs/system-analysis.md:949` | "(รายละเอียดใน เอกสาร Sitemap แยก — ดู `sitemap-navigation.md`)" | **ไฟล์ไม่มีในโปรเจกต์** |
| `docs/system-analysis.md:1099` | "(รายละเอียดจาก v2.0 Appendix ก — ยังใช้ได้ทั้งหมด)" | **Mapping แบบสอบถาม → Entity/Field** |
| `docs/system-analysis.md:631` (BR-56, BR-57) | ถูกอ้างใน Schema แต่ไม่มีในเอกสาร | BR-56 (Confidence), BR-57 (Triage date) |

**การตรวจสอบ:** ทั้งโปรเจกต์มีเพียง 5 ไฟล์ (`CLAUDE.md`, `docs/system-analysis.md`, `docs/questionnaire.pdf`, `prisma/schema.prisma`, `prisma/seed.ts`, `database/drafts/00_postgis_extensions.sql`) — **ไม่มี v1.0/v2.0/sitemap-navigation.md**

**ผลกระทบ:** **นี่คือ BLOCKER ที่ใหญ่ที่สุดของรอบนี้** — Business Rule คือสิ่งที่ต้องเขียนเป็น Pure Function + Unit Test (ตาม CLAUDE.md) แต่เราไม่มีข้อความจริงของกฎ 38 ข้อ ทำให้:
- เขียน Risk Engine ไม่ได้ (BR-15..BR-22 หาย)
- เขียน Validation Rule ไม่ได้ (BR-01..BR-14 หาย)
- เขียน Entry/Verify Logic ไม่ได้ครบ (BR-40..BR-55 หาย)
- **ห้ามเดา** ตามคำสั่งผู้ใช้ ("อย่าเปลี่ยน Requirement โดยไม่ระบุเหตุผล")

**แนวทางแก้ไข:**
1. ขอไฟล์เอกสาร v1.0 และ v2.0 จากเจ้าของระบบ **(ทางเลือกที่ดีที่สุด)**
2. หากไม่มีแล้ว → จัด Workshop เขียน BR ทั้ง 38 ข้อขึ้นใหม่ โดยใช้ **Comment ใน Schema/SQL เป็นจุดตั้งต้น** (ดูรายการ BR ที่กู้คืนได้ใน [01-system-summary.md](01-system-summary.md) หัวข้อ 6.3) แล้วให้เจ้าของระบบรับรอง
3. รวม BR ทั้งหมดไว้ในไฟล์เดียว `docs/business-rules.md` เป็น Source of Truth เดียว

**ต้องใช้ข้อมูลเพิ่มเติม:** ไฟล์ v2.0 หรือการยืนยัน BR ทั้ง 38 ข้อ (ดู Q-03)

**Module ที่กระทบ:** **ทุก Module** — โดยเฉพาะ M03, M04, M09

---

### 🔴 GAP-R01 — BLOCKER: Schema ไม่รองรับ Volunteer Management (M19) เลย

**ปัญหาคืออะไร:** FR-VOL-01..10 กำหนดการสมัครอาสาสมัครสาธารณะ + อนุมัติ + โปรไฟล์ + ทะเบียน แต่ Schema **ไม่มี Model ใดรองรับ**

**พบในไฟล์ใด:** `prisma/schema.prisma` (ไม่มี), `docs/system-analysis.md:392-401` (FR-VOL-01..10)

**สิ่งที่ขาด:**

| Requirement | สิ่งที่ต้องมี | Schema ปัจจุบัน |
|---|---|---|
| FR-VOL-01/02 | หน้าสมัคร + ชื่อ/เบอร์/อีเมล/ชุมชน/รหัสผ่าน | ❌ ไม่มี `VolunteerProfile` |
| FR-VOL-03 | เลือกความเชี่ยวชาญหลายข้อจาก 8 ด้าน | ⚠️ มี `VolunteerSkillType` แต่ผูกกับ `VolunteerInterest` ซึ่งผูกกับ **Household** (มาจากกระดาษ) ไม่ใช่ **User** (สมัครออนไลน์) |
| FR-VOL-04 | ระบุอุปกรณ์ที่มี | ❌ ไม่มี |
| FR-VOL-05 | ยอมรับ PDPA + ข้อตกลง | ❌ ไม่มี (มีแต่ `ConfidentialityAgreement` สำหรับคนคีย์) |
| FR-VOL-06 | **รอ Admin อนุมัติก่อน Login** (BR-68) | ❌ ไม่มีสถานะ PENDING/APPROVED/REJECTED |
| FR-VOL-07 | แจ้งผลอนุมัติทางอีเมล | ❌ ไม่มี |
| FR-VOL-09 | โปรไฟล์แก้ไขได้ | ❌ ไม่มี |
| FR-VOL-10 | ทะเบียนอาสาสมัคร แยกตามด้าน/ชุมชน | ❌ ไม่มี |

**ผลกระทบ:** M19 (Phase 2) เริ่มไม่ได้ + BR-68 บังคับไม่ได้ + RK-V1 (อาสาสมัครปลอมสมัครเพื่อดูข้อมูล) ไม่มีมาตรการรองรับ

**แนวทางแก้ไข:** เพิ่ม `VolunteerProfile` (userId, communityId, status, approvedBy, approvedAt, rejectedReason, pdpaAcceptedAt, pdpaVersion) + `VolunteerProfileSkill` (M:N → `VolunteerSkillType`) + `VolunteerEquipment` — รายละเอียดใน [15-database-fix-plan.md](15-database-fix-plan.md) FIX-13

**⚠️ ประเด็นสำคัญ:** ต้องแยกให้ชัดระหว่าง 2 แนวคิดที่ Schema ปัจจุบันปนกัน:
- **`VolunteerInterest`** = "ครัวเรือนนี้แจ้งบนกระดาษว่าสนใจเป็นอาสา" (ส่วนที่ 4 ข้อ 4) → ข้อมูลสำรวจ
- **`VolunteerProfile`** = "คนนี้สมัครเป็นอาสาผ่านเว็บและได้รับอนุมัติแล้ว" (BP-06) → ข้อมูลผู้ใช้ระบบ
ทั้งสองไม่ใช่สิ่งเดียวกัน และเชื่อมกันได้ (เอกสาร:1102 "ส่วนที่ 4 ข้อ 4 → เชื่อมกับ VolunteerInterest **และ** VOLUNTEER Role (ถ้าสมัครผ่านระบบ)")

**Module ที่กระทบ:** M19, M00, M01, M14

---

### 🟠 GAP-R02 — HIGH: ไม่มี Entity สำหรับเบอร์ฉุกเฉิน (FR-PUB-03)

**ปัญหาคืออะไร:** FR-PUB-03 (ระดับ M) บังคับให้แสดงเบอร์ฉุกเฉิน (เทศบาล, ปภ., ตำรวจ, 1784, โรงพยาบาล) และ PP2 เป็นปัญหาระดับ 🟠 สูง แต่ไม่มี Model รองรับ

**พบในไฟล์ใด:** `prisma/schema.prisma` (ไม่มี), `docs/system-analysis.md:374` (FR-PUB-03), `docs/system-analysis.md:967` (`GET /api/public/emergency-contacts`)

**ผลกระทบ:** ต้อง Hardcode เบอร์ฉุกเฉินใน UI → ผิด CLAUDE.md ("ห้าม Hardcode Master Data ที่สามารถเก็บในฐานข้อมูลได้") และแก้เบอร์ไม่ได้โดยไม่ Deploy ใหม่ ซึ่งอันตรายมากในสถานการณ์ฉุกเฉิน

**แนวทางแก้ไข:** เพิ่ม `EmergencyContact` (code, nameTh, phone, category, communityId?, provinceId?, sortOrder, isActive, isNationwide) — ต้องรองรับทั้งเบอร์ระดับชาติ (1784, 191) และเบอร์เฉพาะพื้นที่ (เทศบาล/รพ.) เพื่อไม่ Hardcode พื้นที่ (ดู FIX-14)

**Module ที่กระทบ:** M00, M17

---

### 🟠 GAP-R03 — HIGH: ไม่มีการกำหนด "Critical Field" สำหรับ Entry 2

**ปัญหาคืออะไร:** FR-VER-01 บอก "Double-entry เฉพาะฟิลด์วิกฤต (**ตั้งค่าได้**)" แต่ไม่มีที่เก็บว่า field ไหนคือ critical

**พบในไฟล์ใด:** `docs/system-analysis.md:459` (FR-VER-01), `docs/system-analysis.md:201-209` (รายการฟิลด์วิกฤต 6 กลุ่ม), `prisma/schema.prisma` (ไม่มี Model), `prisma/schema.prisma:734,737,738,744,745,867,871,954` (มี ⭐ ใน Comment เท่านั้น)

**เปรียบเทียบรายการฟิลด์วิกฤต:**

| เอกสาร (`system-analysis.md:202-207`) | Schema (⭐ ใน Comment) | ตรงกัน? |
|---|---|---|
| ชื่อ-นามสกุลกลุ่มเปราะบาง | `VulnerablePerson.fullName` ⭐ | ✅ |
| เบอร์โทรศัพท์ (ทุกเบอร์) | `Household.respondentPhone` ⭐, `VulnerablePerson.phone` ⭐ | ⚠️ **ขาด** `surveyorPhoneOnPaper`, `VolunteerInterest.contactPhone` — เอกสารบอก "ทุกเบอร์" |
| ประเภทความเปราะบาง (9 ช่อง) | ❌ **ไม่มี ⭐** ที่ `PersonVulnerability` | ❌ |
| พิกัด GPS | `latitude` ⭐, `longitude` ⭐ | ✅ |
| บ้านเลขที่ + หมู่ | `houseNo` ⭐, `mooId` ⭐ | ✅ |
| ระดับน้ำสูงสุด | `maxFloodDepthCm` ⭐ | ✅ |
| — | `VulnerablePerson.age` — **ไม่มี ⭐** | ⚠️ อายุมีผลต่อ Triage (เด็ก <5, ผู้สูงอายุ ≥60) แต่ไม่ใช่ฟิลด์วิกฤต? |

**ผลกระทบ:** Comment ไม่ใช่ Configuration — ระบบอ่าน ⭐ ไม่ได้ → Entry 2 ไม่รู้ว่าต้องแสดงช่องไหน, Discrepancy Engine ไม่รู้ว่าต้องเทียบอะไร, และ FR-VER-01 ("ตั้งค่าได้") ทำไม่ได้

**แนวทางแก้ไข:** เพิ่ม `CriticalFieldConfig` (fieldPath, labelTh, section, isCritical, compareMode, normalizeRule, sortOrder, version, isActive) เป็น Master Data ที่ Seed ได้และแก้ผ่าน Admin UI (ดู FIX-09)

**Module ที่กระทบ:** M03, M04

---

### 🟠 GAP-R04 — HIGH: Coverage Model ไม่มีฟิลด์ใดเลยใน Schema

รายละเอียดเต็มใน [06-coverage-model-review.md](06-coverage-model-review.md) — สรุป: จาก 9 ฟิลด์ที่คำสั่งกำหนด (`totalHouseholds`, `targetCoveragePercent`, `receivedSurveyCount`, `enteredSurveyCount`, `verifiedHouseholdCount`, `surveyCoveragePercent`, `verifiedCoveragePercent`, `lastPopulationUpdatedAt`, `populationDataSource`) — Schema มี **0 จาก 9** (มีเพียง `targetHouseholds` ซึ่งเป็นแนวคิดที่ถูกยกเลิกแล้ว)

---

### 🟡 GAP-R05 — MEDIUM: ไม่มี Module/Requirement สำหรับ Coverage โดยตรง

FR-CVG-01..05 มีอยู่ แต่ไม่มี Module ในผัง (M00–M19 ไม่มี Coverage) ทั้งที่ Coverage ถูกอ้างในเกือบทุก Dashboard/Report → ควรยกเป็น Domain Service ที่มีเจ้าของชัดเจน

**แนวทางแก้ไข:** กำหนดเป็น `features/coverage` + `domain/coverage` service ที่ M06/M11/M16/M10 เรียกใช้ร่วมกัน (ดู [12-proposed-architecture.md](12-proposed-architecture.md))

---

### 🟡 GAP-R06 — MEDIUM: กระดาษไม่มีช่อง Consent แต่ยังไม่มีข้อสรุปเชิงปฏิบัติ

**พบในไฟล์ใด:** `docs/system-analysis.md:104, 170 (PE10), 234, 812 (RK-E5), 1105-1119 (Appendix B)`

เอกสารระบุปัญหาชัดเจนและเสนอ "พิมพ์ใบ Consent 1 หน้าแนบทุกชุด" แต่:
- ยังเป็น "ร่างเริ่มต้น" ที่ **ต้องปรึกษานิติกรก่อนใช้** (บรรทัด 1119)
- ไม่ระบุว่าถ้ากระดาษที่**เก็บมาแล้ว**ไม่มี Consent จะทำอย่างไร → `ConsentStatus.UNKNOWN` และ `LEGAL_BASIS` มีใน Schema แต่ไม่มีกฎว่าจะใช้เมื่อไหร่
- KPI บอก "% ใบที่มี Consent ครบ = 100%" (บรรทัด 1080) ซึ่ง**เป็นไปไม่ได้**หากกระดาษบางส่วนเก็บไปแล้วโดยไม่มีใบ Consent

**ผลกระทบ:** เสี่ยงผิด PDPA ม.26 (ข้อมูลสุขภาพ) — และไม่ชัดว่าข้อมูลที่ `consentStatus = UNKNOWN` จะนำไปคำนวณ Risk / แสดงบน Dashboard / Export ได้หรือไม่

**แนวทางแก้ไข:** ต้องได้คำตอบจากนิติกร (ดู Q-04) และกำหนด Business Rule ว่า `UNKNOWN` → ใช้ได้เพื่อวัตถุประสงค์ใดบ้าง

**Module ที่กระทบ:** M18, M09, M16

---

### 🟢 GAP-R07 — LOW: ไม่มี Requirement เรื่องการเก็บ/ลบข้อมูลตาม BR-30 (5 ปี)

BR-30 "เก็บได้ไม่เกิน 5 ปี" มีอยู่ แต่ไม่มี FR รองรับ (ไม่มี Retention Job, ไม่มีหน้าจัดการ) และ **ขัดกับ Trigger `prevent_audit_modification`** ที่ห้าม DELETE บน `audit_log` โดยสิ้นเชิง (ดู [09-postgis-sql-review.md](09-postgis-sql-review.md) SQL-09)

---

## ส่วนที่ 3: Requirement ที่ซ้ำซ้อน (Duplicated)

---

### 🟡 DUP-01 — MEDIUM: Coverage ถูกระบุซ้ำใน 4 ที่ ด้วยเกณฑ์ต่างกัน

| ตำแหน่ง | ข้อความ |
|---|---|
| `system-analysis.md:471` | FR-CVG-01 "Dashboard ทุกหน้าต้องแสดง Coverage Badge" |
| `system-analysis.md:817` | RK-C1 มาตรการ "Coverage Badge ทุกหน้า ทุก KPI" |
| `system-analysis.md:853` | S7 "ออกแบบให้ใช้ได้แม้ข้อมูลไม่ครบ — Coverage Badge ทุกที่" |
| `system-analysis.md:775` | "เพิ่ม Coverage Badge ทุกหน้า + Coverage Layer บนแผนที่" |

**ผลกระทบ:** ไม่ใช่ปัญหาร้ายแรง (ย้ำเรื่องเดียวกัน) แต่ทำให้ไม่ชัดว่า "ทุกหน้า" หมายรวมหน้า Public ด้วยหรือไม่ — ซึ่งสำคัญ เพราะหน้า Public แสดง Aggregate และการโชว์ "Coverage 28%" ต่อสาธารณะอาจกระทบความเชื่อมั่น

**แนวทางแก้ไข:** ยืนยันว่า Coverage Badge บังคับเฉพาะ Back-office หรือรวม Public ด้วย (ดู Q-05)

---

### 🟢 DUP-02 — LOW: NFR-S-06 กับ FR-AUTH-08 กับ BR-58 เป็นกฎเดียวกัน

ทั้งสามข้อคือ "DATA_ENTRY เห็นเฉพาะใบที่ Lock — ห้าม Query" (บรรทัด 414, 511, 653) → ควรรวมเป็นกฎเดียวและอ้างอิงข้ามกัน เพื่อไม่ให้แก้ที่เดียวแล้วลืมอีกสองที่

---

### 🟢 DUP-03 — LOW: FR-PUB-11/12 กับ BR-66/67 กับ NFR-S-08 ซ้ำกัน

"ห้าม PII บนหน้า Public + Jitter ±50m" ปรากฏ 5 ครั้ง (บรรทัด 382, 383, 513, 660, 661)

---

## ส่วนที่ 4: Requirement ที่ไม่ชัดเจน (Ambiguous)

---

### 🟠 AMB-01 — HIGH: "Jitter ±50m" กับ "Grid" — เลือกอันไหน หรือทั้งคู่?

**พบในไฟล์ใด:**
- `system-analysis.md:383` FR-PUB-12: "พิกัดในหน้า Public ต้อง Jitter ±50m **หรือ** แสดงเป็น Grid"
- `system-analysis.md:660` BR-66: "หน้า Public ต้อง Jitter พิกัด ±50m **+** แสดงเป็น Grid เท่านั้น"
- `system-analysis.md:377` FR-PUB-06: "Heatmap ความเสี่ยงระดับ Grid (ไม่เจาะรายบ้าน)"

**ปัญหา:** FR บอก "หรือ" (เลือกอย่างใดอย่างหนึ่ง) แต่ BR บอก "+ … เท่านั้น" (ต้องทำทั้งคู่) → ต่างกันในเชิงความปลอดภัยอย่างมาก

**ผลกระทบสำคัญ:** **Jitter ±50m เพียงอย่างเดียวไม่ปลอดภัย** — หากผู้โจมตีเรียก API ซ้ำๆ และแต่ละครั้ง Jitter ใหม่ ค่าเฉลี่ยจะลู่เข้าพิกัดจริง (averaging attack) และถึงแม้ Jitter คงที่ ±50m ก็ยังระบุบ้านได้ในพื้นที่ที่บ้านห่างกัน >100m → เสี่ยงต่อ RK-P1 ("หน้า Public ถูกใช้หาข้อมูลบ้านเป้าหมาย") โดยตรง

**แนวทางแก้ไข (ข้อเสนอ):** ใช้ **Grid Aggregation เท่านั้น** สำหรับหน้า Public — ไม่ส่งพิกัดรายบ้านออกจาก Server เลย แม้จะ Jitter แล้ว และกำหนด **k-anonymity** (เช่น Grid cell ที่มีครัวเรือน < k=5 ต้องไม่แสดง หรือรวมกับ cell ข้างเคียง) ซึ่งปลอดภัยกว่าและตรงกับ FR-PUB-06/BR-67 (แสดงเฉพาะข้อมูล L1)

**ต้องใช้ข้อมูลเพิ่มเติม:** ยืนยันขนาด Grid และค่า k (ดู Q-06)

**Module ที่กระทบ:** M00, M10

---

### 🟠 AMB-02 — HIGH: "Entry 2 คีย์เฉพาะฟิลด์วิกฤต" — แล้ว Discrepancy ของฟิลด์ที่ไม่วิกฤตล่ะ?

**ปัญหา:** ถ้า Entry 2 คีย์เฉพาะฟิลด์วิกฤต แสดงว่าฟิลด์ที่เหลือ (ข้อเสนอแนะ, ทรัพยากร, ช่องทางรับข่าว) **ไม่มีการตรวจสอบเลย** — เอกสารบรรทัด 209 ยอมรับว่า "Single entry พอ"

**แต่:** `SheetStatus.VERIFIED` มีความหมายว่า "ยืนยันแล้ว → คำนวณ Risk/Triage ได้" (schema:37) ซึ่งจะทำให้เข้าใจผิดว่า**ทั้งใบ**ผ่านการตรวจสอบ ทั้งที่จริงมีเพียงฟิลด์วิกฤตที่ผ่าน Double-entry

**ผลกระทบ:** Risk Engine ใช้ปัจจัยที่**ไม่ได้ผ่าน Double-entry** หลายตัว เช่น `NO_SURVIVAL_KIT` (ส่วนที่ 3 ข้อ 10), `NO_RESOURCES` (ข้อ 11), `UNKNOWN_EVAC_SITE` (ข้อ 8), `NO_DIGITAL_CHANNEL` (ส่วนที่ 4 ข้อ 1) — รวมน้ำหนัก 16/115 คะแนน — โดยไม่มีการยืนยัน แต่ Confidence Score จะรายงานว่า "มีข้อมูลครบ" ทั้งที่ความน่าเชื่อถือต่างกัน

**แนวทางแก้ไข:** แยกแนวคิด **"Verified" (ผ่าน Double-entry)** ออกจาก **"Entered" (คีย์แล้วรอบเดียว)** ในระดับฟิลด์ และให้ Confidence Score สะท้อนว่าปัจจัยนั้นผ่าน Double-entry หรือไม่ (ดู [08-risk-model-review.md](08-risk-model-review.md) หัวข้อ 8)

**Module ที่กระทบ:** M04, M09

---

### 🟡 AMB-03 — MEDIUM: "Auto-save Draft ทุก 10 วินาที" กับ Lock 10 นาที

**พบในไฟล์ใด:** FR-ENT-08 (บรรทัด 444) "Auto-save Draft ทุก 10 วินาที" + FR-BAT-08 (บรรทัด 431) "Lock ใบ 10 นาที + ปลดอัตโนมัติ"

**ปัญหา:** ถ้าคีย์ 1 ใบใช้เวลา ≤4 นาที (NFR-E-01) แต่ Lock หมดอายุใน 10 นาที — เกิดอะไรขึ้นกับ Draft ที่ Auto-save ไว้ เมื่อ Lock ถูกปลดโดย `release_expired_locks()` แล้วคนอื่นหยิบใบไปคี้?

- CLAUDE.md บอก "Auto-save ต้องไม่ทำให้ข้อมูลสูญหาย"
- แต่ `release_expired_locks()` (SQL:168-186) reset `status = 'PENDING'` โดยไม่แตะ Draft และไม่มีที่เก็บ Draft ใน Schema เลย (`EntryAttempt` มี `submittedAt` nullable → อาจใช้เป็น Draft ได้ แต่ไม่มีระบุ)

**ผลกระทบ:** ข้อมูลที่คีย์ค้างไว้อาจหาย หรือเกิดสภาวะ 2 คนคีย์ใบเดียวกัน

**แนวทางแก้ไข:** กำหนดให้ชัดว่า Draft เก็บที่ `EntryAttempt` (submittedAt = null) และ `release_expired_locks()` ต้อง**ไม่ลบ Draft** + เมื่อคนเดิมกลับมาต้อง Resume ได้ + ถ้าคนใหม่หยิบใบที่มี Draft ค้างของคนอื่น ต้องเริ่มใหม่และเก็บ Draft เดิมไว้เป็นหลักฐาน (ดู Q-07)

**Module ที่กระทบ:** M03, M02

---

### 🟡 AMB-04 — MEDIUM: "ตารางกลุ่มเปราะบางเพิ่มแถวไม่จำกัด" vs กระดาษมี 5 แถว

**พบในไฟล์ใด:** FR-ENT-11 (บรรทัด 447) "เพิ่มแถวกลุ่มเปราะบางไม่จำกัด" vs `questionnaire.pdf` หน้า 2 — ตารางมีแถวตัวอย่าง 1 แถว + แถวว่าง **5 แถว** (ลำดับ 1–5)

**ปัญหา:** ถ้าครัวเรือนมีกลุ่มเปราะบาง 7 คน ผู้สำรวจจะเขียนที่ไหน? (เขียนต่อหลังกระดาษ? ใช้ใบที่ 2? เขียนเบียดในช่อง?)

**ผลกระทบ:** ผู้คีย์ไม่รู้จะจัดการอย่างไร → ข้อมูลอาจตกหล่น (สอดคล้องกับ RK-18 "อคติในข้อมูล")

**แนวทางแก้ไข:** ระบบควรรองรับไม่จำกัด (ตาม FR-ENT-11) แต่ต้องมีคู่มือผู้คีย์ว่าจะทำอย่างไรเมื่อกระดาษเขียนเกิน 5 แถว และต้องบันทึกไว้ที่ `surveyorNote` หรือ `FieldStatus.note` (ดู Q-08)

**Module ที่กระทบ:** M03

---

### 🟡 AMB-05 — MEDIUM: "ระดับความเสี่ยงจากผู้สำรวจ" มี 3 ระดับบนกระดาษ แต่ Schema ใช้ 4 ระดับ

**พบในไฟล์ใด:**
- `questionnaire.pdf` หน้า 4: "สำหรับผู้สำรวจ — ระดับความเสี่ยงครัวเรือน ☐ **ต่ำ** ☐ **ปานกลาง** ☐ **สูง**" (3 ตัวเลือก)
- `prisma/schema.prisma:985`: `riskLevelSurveyor RiskLevel?` → enum มี 4 ค่า (LOW/MEDIUM/HIGH/**CRITICAL**)

**ปัญหา:** กระดาษ **ไม่มี** ตัวเลือก "สูงมาก" → ค่า `CRITICAL` จะไม่มีทางถูกคีย์จากกระดาษได้เลย

**ผลกระทบ:** ผู้คีย์อาจสับสน (เห็น 4 ตัวเลือกบนจอ แต่กระดาษมี 3) → เสี่ยงคีย์ผิด และผิด FR-ENT-01 ("ฟอร์มเรียงตรงกระดาษ 100%") + BR-54 ("ห้ามให้คนคีย์ประเมินเอง")

**แนวทางแก้ไข:** สร้าง enum แยก `SurveyorRiskLevel { LOW, MEDIUM, HIGH }` สำหรับ `riskLevelSurveyor` และคง `RiskLevel` 4 ระดับไว้สำหรับค่าที่ระบบคำนวณ (`riskLevelAuto`) — **ห้ามใช้ enum เดียวกัน** (ดู FIX-11)

**Module ที่กระทบ:** M03, M09

---

### 🟢 AMB-06 — LOW: "อำเภอ: หาดใหญ่ / จังหวัด: สงขลา" พิมพ์ตายตัวบนกระดาษ

**พบในไฟล์ใด:** `questionnaire.pdf` หน้า 1 ข้อ 3 — "ตำบล ☐ ควนลัง ☐ หาดใหญ่ **อำเภอ: หาดใหญ่ จังหวัด: สงขลา**"

**ปัญหา:** กระดาษ Hardcode อำเภอ/จังหวัดไว้แล้ว (ไม่มีช่องกรอก) และตำบลเป็น checkbox 2 ตัวเลือก

**ผลกระทบ:** ไม่กระทบระบบ (ระบบยังต้องรองรับหลายจังหวัดตาม CLAUDE.md) แต่กระดาษ**รอบนี้**ใช้ได้เฉพาะ อ.หาดใหญ่ จ.สงขลา → เมื่อขยายพื้นที่ต้องพิมพ์กระดาษใหม่ (สอดคล้องกับ BP-10)

**สิ่งที่ต้องระวัง:** **ห้ามให้ข้อจำกัดของกระดาษกลายเป็นข้อจำกัดของ Schema** — `Household.tambonId` ต้องเป็น FK ที่ชี้ไปตำบลใดก็ได้ ไม่ใช่ enum 2 ค่า (ปัจจุบัน Schema ทำถูกแล้ว ✅)

---

## ส่วนที่ 5: สรุปตารางปัญหา

| ID | ระดับ | ปัญหา | ไฟล์หลัก | Module |
|---|---|---|---|---|
| CONF-01 | 🔴 BLOCKER | สมมติฐาน 600/3,000 ยังฝังทั่วระบบ | system-analysis.md, schema.prisma:398, seed.ts:82-86 | M02, M06, M11, M16, M10 |
| CONF-02 | 🔴 BLOCKER | Role `VOLUNTEER` vs `RESCUE_VOLUNTEER` | schema.prisma:158 | M01, M19, M14 |
| GAP-D01 | 🔴 BLOCKER | BR 38 ข้อ "ไม่มีข้อความ" (อ้าง v2.0 ที่ไม่มีไฟล์) | system-analysis.md:629-639, 479 | ทุก Module |
| GAP-R01 | 🔴 BLOCKER | Schema ไม่รองรับ Volunteer Management | schema.prisma | M19, M00, M01 |
| CONF-03 | 🟠 HIGH | Coverage 85% vs 80% vs 60% | system-analysis.md:1086, 474 | M11, M16 |
| CONF-04 | 🟠 HIGH | Permission Matrix ขาด 2 Role + VERIFIER คีย์ได้ | system-analysis.md:577-592 | M01, M03, M04 |
| GAP-R02 | 🟠 HIGH | ไม่มี `EmergencyContact` | schema.prisma | M00, M17 |
| GAP-R03 | 🟠 HIGH | ไม่มี Critical Field Config | schema.prisma | M03, M04 |
| GAP-R04 | 🟠 HIGH | Coverage Model 0/9 ฟิลด์ | schema.prisma:398 | M11, M16 |
| AMB-01 | 🟠 HIGH | Jitter "หรือ" Grid vs "และ" Grid | system-analysis.md:383 vs 660 | M00, M10 |
| AMB-02 | 🟠 HIGH | VERIFIED ไม่ได้แปลว่าทั้งใบถูกตรวจ | system-analysis.md:209 | M04, M09 |
| CONF-05 | 🟡 MEDIUM | 35 Entity/18 Enum vs จริง 49/16 | system-analysis.md:679, 955 | เอกสาร |
| CONF-06 | 🟡 MEDIUM | DATA_ENTRY ดูแผนที่ ❌ แต่ต้องมี Mini Map | system-analysis.md:585 vs 450 | M03, M10 |
| GAP-R05 | 🟡 MEDIUM | ไม่มี Module Coverage | system-analysis.md:714-758 | M06, M11 |
| GAP-R06 | 🟡 MEDIUM | Consent — ไม่มีข้อสรุปเชิงปฏิบัติ | system-analysis.md:1105-1119 | M18, M09 |
| DUP-01 | 🟡 MEDIUM | Coverage ระบุซ้ำ 4 ที่ | system-analysis.md:471, 817, 853, 775 | M11 |
| AMB-03 | 🟡 MEDIUM | Auto-save Draft vs Lock หมดอายุ | system-analysis.md:444, 431 | M03, M02 |
| AMB-04 | 🟡 MEDIUM | ตารางเปราะบาง "ไม่จำกัด" vs กระดาษ 5 แถว | system-analysis.md:447 vs PDF p.2 | M03 |
| AMB-05 | 🟡 MEDIUM | Surveyor Risk 3 ระดับ vs enum 4 ระดับ | PDF p.4 vs schema.prisma:985 | M03, M09 |
| CONF-07 | 🟢 LOW | Schema comment v2.0 vs เอกสาร v3.0 | schema.prisma:4 | — |
| GAP-R07 | 🟢 LOW | BR-30 (5 ปี) ไม่มี FR รองรับ + ขัด Audit Trigger | system-analysis.md:652 | M18 |
| DUP-02 | 🟢 LOW | NFR-S-06 = FR-AUTH-08 = BR-58 | system-analysis.md:414, 511, 653 | M01 |
| DUP-03 | 🟢 LOW | FR-PUB-11/12 = BR-66/67 = NFR-S-08 | system-analysis.md:382-383, 513, 660-661 | M00 |
