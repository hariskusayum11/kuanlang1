# 16 — Owner Decisions Record (บันทึกคำตัดสินของเจ้าของระบบ)

> **สถานะ:** เป็นบันทึกอ้างอิงที่มีผลผูกพัน (Authoritative) — ใช้เป็นฐานของ [17-approved-schema-change-spec.md](17-approved-schema-change-spec.md)
> **รอบนี้:** เตรียม Decision Record + แผนแก้ไข — **ยังไม่แก้ `schema.prisma`, `seed.ts`, SQL และยังไม่สร้าง Migration**
> **แหล่งคำตัดสิน:** เจ้าของระบบ — **รอบที่ 1 (16 ข้อ)** + **รอบที่ 2 (9 ข้อ)** ดูส่วนที่ 6

---

## 0. สรุปผลของคำตัดสินต่อ Blocker (อัปเดตหลังรอบที่ 2)

| ประเภท | จำนวน | รายการ |
|---|---|---|
| ✅ **ปิดแล้วด้วยคำตัดสิน** | 8 | CONF-01, CONF-02/SCH-05, SCH-01, SCH-04/COV-01, RISK-01 (จัดเก็บ), SQL-01/SQL-02, **SEED-01 (รหัสชุมชน — รอบ 2)**, **Q-19 Version (Better Auth 1.6.23 — รอบ 2)** |
| 🟢 **ปลดล็อกแล้ว — พร้อมแก้ (ไม่ต้องรอคำตัดสิน)** | 4 | SCH-03, QM-03 (การลบ constraint), SQL-03, SQL-04 |
| 🟡 **ได้แนวทางแล้ว — ยังรอเงื่อนไขก่อน Implement** | 1 | **SCH-08 (Encryption — ได้ design AES-256-GCM/Blind Index; รอ Key Management + PDPA)** |
| 🔴 **ยังเปิดอยู่ — สงวนให้เจ้าของ/รอ Business Rule/รอกฎหมาย** | 3 | GAP-D01 (BR หาย), GAP-R06 (PDPA/Consent — legal BLOCKER), RISK-02/RISK-07 (สูตร + Versioning) |

> **หลักการที่คำตัดสินสร้างขึ้น:** คำตัดสินชุดนี้ยืนยัน **โครงสร้างการเก็บข้อมูล** ที่ปลอดภัยได้แล้ว แต่**สงวนตรรกะที่กระทบสิทธิเจ้าของข้อมูลและการตัดสินความเสี่ยง** (Consent, Encryption Implementation, สูตร Risk Final) ไว้จนกว่าจะได้คำยืนยัน — สอดคล้องกับ CLAUDE.md ที่ห้ามเดา Requirement และห้าม Comment ว่าเข้ารหัสโดยไม่เข้ารหัสจริง
>
> **รอบที่ 2 เพิ่ม:** ปิดรหัสชุมชน (SEED-01) + เวอร์ชัน Better Auth + ให้ **แนวทาง Encryption เบื้องต้น** (ยังไม่ implement) + ยืนยันห้ามเดารหัสพื้นที่ (ใช้ `UNVERIFIED`)

---

## 1. ตารางคำตัดสินทั้ง 16 ข้อ

| # | คำตัดสิน | ประเภท | ปิด/กระทบ | ข้อจำกัดที่เกิดขึ้น |
|---|---|---|---|---|
| 1 | `totalHouseholds` ยังไม่ทราบ → ใช้ **NULL** ห้ามใช้ 0 → แสดง "ยังคำนวณไม่ได้" | ✅ Confirmed | ปิด COV-01, SCH-04 บางส่วน; ตอบ Q-01 | ทุก Coverage query ต้อง NULL-aware; ห้าม `default(0)` |
| 2 | เป้าหมายสำรวจ **> ร้อยละ 60** — `targetCoveragePercent` default 60; ผ่าน = `coveragePercent > targetCoveragePercent` | ✅ Confirmed | ปิด CONF-01, SEED-02; ตอบ Q-02 บางส่วน | ใช้ `>` (strict) ไม่ใช่ `>=`; ต้องมี Unit Test ขอบเขต 60 พอดี |
| 3 | เกณฑ์เตือน Export **80%** → เก็บเป็น **Config แยก** | ✅ Confirmed | ตอบ Q-02, CONF-03 | ห้าม Hardcode; แยกจาก `targetCoveragePercent` |
| 4 | **KPI 85% ยังไม่ยืนยัน** — ห้ามใช้ตัดสินสถานะ | ✅ Confirmed | ปิด CONF-03 บางส่วน | ห้ามนำ 85 มาเป็นเกณฑ์ Badge/Pass ในโค้ด |
| 5 | ใช้ชื่อ Role **`VOLUNTEER`** | ✅ Confirmed | **ปิด CONF-02, SCH-05, RBAC-01**; ตอบ Q-19(1) | เปลี่ยน enum ก่อน Migration แรก |
| 6 | Community ↔ Tambon = **Many-to-Many ผ่าน `CommunityTambon`** | ✅ Confirmed | **ปิด SCH-01**; ตอบ Q-17 บางส่วน | ลบ `Community.tambonId`; นับครัวเรือน/ตำบลต้องใช้ `Household.tambonId` |
| 7 | ชุมชนควนสันติครอบคลุม **ควนลัง + หาดใหญ่** | ✅ Confirmed | ปิด SEED-01 บางส่วน | ต้องมี 2 แถวใน `CommunityTambon` |
| 8 | **ยังไม่กำหนดตำบลหลัก** — `isPrimary` ต้องรองรับกรณี**ไม่มีตำบลหลัก** | ✅ Confirmed | ปิด Q-17 (ในเชิงโครงสร้าง) | Partial Unique Index ต้องอนุญาต 0 หรือ 1 ตำบลหลัก (ไม่ใช่บังคับ 1) |
| 9 | ชื่อชุมชนเริ่มต้น 5 แห่ง (ท่าเคียน/ประสานมิตร/ควนสันติ/ปลักหว้า/หน้าควน) | ✅ Confirmed | ปิด SEED-01 บางส่วน | Seed ต้องใช้ชื่อจริง; **รหัส (`code`) ยังไม่ตัดสิน → รอ Q-21** |
| 10 | ลบชุมชนตัวอย่าง **KL01, KL02, KL03, HY01, HY02** | ✅ Confirmed | ปิด SEED-01, SEED-11 | Seed ต้องมีขั้นตอนลบแถวเก่า (upsert ไม่ลบให้) |
| 11 | เพิ่ม **`communityNameOnPaper`** เก็บข้อความดิบจากกระดาษ | ✅ Confirmed | **ปิด QM-01** | ตั้งค่าจากกระดาษ ห้าม default = ชื่อชุมชนของ Batch |
| 12 | เพิ่ม **`coordinateRawText`** เก็บพิกัดดิบจากกระดาษ | ✅ Confirmed | **ปิด QM-04 (เชิงจัดเก็บ)** | Double-entry เทียบที่ raw; `lat/lng` เป็น Derived (ตรรกะ parse = รอบรีฟ Q-10 ไม่รวมรอบนี้) |
| 13 | Risk Score ต้องแยก **`rawScore`, `maximumPossibleScore`, `normalizedScore`** | ✅ Confirmed | **ปิด RISK-01 (เชิงจัดเก็บ)**; ตอบ Q-25(จัดเก็บ) | ลบ `riskScoreAuto`; แก้ CHECK 0-100; **การจัดระดับ/absoluteScore = เลื่อน (ดู #14)** |
| 14 | **ห้ามสร้างสูตร Risk Final** จนกว่าได้ Business Rule ที่ยืนยัน | 🟡 Deferred | สงวน RISK-02, RISK-03, RISK-05, RISK-06, RISK-09; Q-25(สูตร), Q-26, Q-27, Q-28, Q-29 | ห้ามเขียน: การจัดระดับ, Hard Rules, Threshold, Confidence formula, seed น้ำหนักจริง |
| 15 | Custom PostGIS SQL ต้องอยู่ใน **ลำดับ Migration ที่ถูกต้อง** | ✅ Confirmed | **ปิด SQL-01, SQL-02 (ทิศทาง)** | ใช้ Prisma Migration + `Unsupported()`; ห้ามไฟล์รันมือ |
| 16 | **ห้ามตัดสินใจ Consent และ Encryption แทนเจ้าของระบบ** | 🔴 Reserved | สงวน SCH-08, GAP-R06, RBAC-03, RBAC-04; Q-04, Q-20 | ห้าม implement Encryption/Consent logic; คง 🔒 เป็น "รอตัดสิน" |

---

## 2. รายละเอียดคำตัดสินและผลผูกพัน

### กลุ่ม A — Coverage Model (คำตัดสิน 1–4)

**คำตัดสิน 1–2 กำหนดพฤติกรรมบังคับ:**

```
coverage(count, totalHouseholds, targetCoveragePercent):
  if totalHouseholds is NULL or <= 0:
      return "ยังคำนวณไม่ได้"        ← ห้ามคืน 0% (คำตัดสิน 1)
  percent = count / totalHouseholds * 100
  meetsTarget = percent > targetCoveragePercent   ← ใช้ > ไม่ใช่ >= (คำตัดสิน 2)
```

- **คำตัดสิน 1** ปิดช่องโหว่ RK-C1 ที่ร้ายแรงที่สุด: ปัจจุบัน `v_community_summary` มี `ELSE 0` ทำให้ "ไม่ทราบ Denominator" แสดงเป็น "0%" (= บอกผู้บริหารว่ายังไม่ได้สำรวจเลย) → ต้องเปลี่ยนเป็น `NULL`
- **คำตัดสิน 2** ยืนยันเกณฑ์ผ่านเป็น strict `>` — ครัวเรือน 60% พอดี = **ไม่ผ่าน**
- **คำตัดสิน 3** แยก `exportWarningCoveragePercent = 80` เป็น Config อิสระ (ไม่ใช่ค่าเดียวกับเกณฑ์ผ่าน)
- **คำตัดสิน 4** — 85% เป็น "ความมุ่งหมายเชิงโครงการ" เท่านั้น **ห้ามฝังในตรรกะการตัดสินสถานะ** ใดๆ (Badge สี, Pass/Fail, Alert)

> **ผลต่อ Q-01:** เปลี่ยนจาก BLOCKER → **"ดำเนินการได้โดยใช้ NULL"** — จำนวนครัวเรือนจริงยังต้องการภายหลังเพื่อ "ปลดล็อก" การคำนวณ แต่**ไม่บล็อกการพัฒนา** อีกต่อไป

---

### กลุ่ม B — Role (คำตัดสิน 5)

**`VOLUNTEER`** เป็นชื่อที่ยืนยันแล้ว → ปิด CONF-02 / SCH-05 / RBAC-01

- แก้ `UserRoleEnum.RESCUE_VOLUNTEER` → `VOLUNTEER` (schema.prisma:158)
- ต้องแก้ Comment ที่เกี่ยวข้องที่ยังเป็น v2.0: `DATA_ENTRY` ("อาสาคีย์" → "เจ้าหน้าที่คีย์"), `ConfidentialityAgreement` (schema.prisma:319)

> **ยังเปิด:** Q-19(2) เวอร์ชัน Better Auth และ Q-19(3) admin plugin vs UserRole เอง — **ไม่ใช่ BLOCKER ของ enum** แต่ต้องตัดสินก่อน Phase 3

---

### กลุ่ม C — Community & Area (คำตัดสิน 6–10)

**โครงสร้างที่ยืนยัน:**

```
Community ──< CommunityTambon >── Tambon
                (isPrimary: รองรับ 0 หรือ 1 ตำบลหลัก)

ชุมชนควนสันติ:
  CommunityTambon → ควนลัง  (isPrimary = false)   ← คำตัดสิน 8: ยังไม่มีตำบลหลัก
  CommunityTambon → หาดใหญ่ (isPrimary = false)
```

- **คำตัดสิน 8 มีผลต่อ Constraint:** Partial Unique Index `WHERE isPrimary = true` **อนุญาตให้มี 0 แถวได้** (ป้องกันเฉพาะ 2 ตำบลหลัก) → รองรับกรณี "ยังไม่มีตำบลหลัก" โดยไม่ต้องแก้อะไรเพิ่ม ✅
- **คำตัดสิน 9:** ข้อมูลจริงคือ **4 ชุมชนในควนลัง + 1 ชุมชนคร่อม 2 ตำบล** — ไม่มีชุมชนใดอยู่ในตำบลหาดใหญ่เพียงตำบลเดียว (ต่างจาก Seed เดิมที่สมมติว่ามี 2 ชุมชนในหาดใหญ่)
- **คำตัดสิน 10:** `upsert({where:{code}})` ไม่ลบแถวที่ถอดออก → ต้องเพิ่มขั้นตอนลบ KL01–HY02 อย่างชัดเจน มิฉะนั้นจะได้ 10 ชุมชน

> **ยังเปิด (รอข้อมูล ไม่ใช่รอตัดสิน):**
> - **รหัสชุมชน `code`** (Q-21) — เจ้าของให้ชื่อแล้วแต่ยังไม่ให้รหัส → **จำเป็นก่อนพิมพ์สติกเกอร์ 3,000 ใบ** เพราะ `sheetNo` ฝังรหัสนี้
> - **รหัสอำเภอ/ตำบล** (Q-24) — `9001` น่าจะเป็นเมืองสงขลา ไม่ใช่หาดใหญ่
> - **จำนวนหมู่จริง** (Q-24)

---

### กลุ่ม D — Paper Capture (คำตัดสิน 11–12)

เจ้าของยืนยันหลักการ **"เก็บข้อความดิบจากกระดาษเสมอ"**:

| ฟิลด์ | เก็บอะไร | ฟิลด์ Derived ที่เดิมมี |
|---|---|---|
| `communityNameOnPaper` | ชื่อชุมชนที่ผู้สำรวจเขียน | `communityId` (Map จาก Batch + ชื่อ) |
| `coordinateRawText` | พิกัดตามตัวอักษรบนกระดาษ | `latitude` / `longitude` (Parse — ตรรกะเลื่อน) |

- **คำตัดสิน 12 มีผลต่อ Double-entry:** ต้องเทียบที่ `coordinateRawText` ไม่ใช่ที่ค่าที่ตีความแล้ว → ป้องกัน Discrepancy เท็จ
- **ตรรกะ Parse พิกัด และการแปลง พ.ศ./ค.ศ.** เป็น **ตรรกะ App-layer** ที่ขึ้นกับการบรีฟผู้สำรวจ (Q-10) → **ไม่รวมในรอบนี้** เพิ่มเฉพาะคอลัมน์เก็บดิบ

> **ผลข้างเคียงเชิงสถาปัตยกรรม:** คำตัดสิน 11–12 สร้าง **"pattern การเก็บดิบ"** ที่ควรขยายไปยังฟิลด์อื่นที่มีปัญหาเดียวกัน (ระดับน้ำ ม.+ซม., อายุครรภ์หน่วยไม่ชัด, "ไม่มี"/"ไม่สะดวก") → ดู [17](17-approved-schema-change-spec.md) กลุ่ม "รอเจ้าของยืนยันการขยาย Pattern"

---

### กลุ่ม E — Risk (คำตัดสิน 13–14) ⚠️ สำคัญ

**คำตัดสิน 13 (ยืนยัน) — เก็บ 3 คะแนน:**

```prisma
model FloodRiskProfile {
  rawScore              Float?   // Σ(Factor × Weight) — สูงสุด 115
  maximumPossibleScore  Float?   // Σ(Weight ของปัจจัยที่มีข้อมูล)
  normalizedScore       Float?   // rawScore / maximumPossibleScore × 100
  // ลบ: riskScoreAuto Float?
}
```

+ แก้ CHECK: `ck_risk_score (0-100 บน riskScoreAuto)` → `ck_raw_score (rawScore >= 0)` + `ck_raw_le_max (rawScore <= maximumPossibleScore)` + `ck_normalized_score (0-100)`
→ **ปิด RISK-01** (Constraint จะไม่ปฏิเสธ rawScore = 115 อีกต่อไป)

**คำตัดสิน 14 (เลื่อน) — สิ่งที่ห้ามทำจนกว่าได้ BR ยืนยัน:**

| ห้ามทำในรอบนี้ | เหตุผล | รอ Q |
|---|---|---|
| การจัดระดับ LOW/MEDIUM/HIGH/CRITICAL | ต้องมี Threshold ที่รับรอง | Q-26 |
| การเลือก `absoluteScore` vs `normalizedScore` จัดระดับ | เป็นส่วนของสูตร Final | Q-25(สูตร) |
| Hard Rules (ติดเตียง/ฟอกไต → ≥HIGH) | ยังไม่มีข้อความ BR | Q-29, GAP-D01 |
| สูตร Confidence | ยังไม่รับรอง | Q-28 |
| Seed น้ำหนัก 12 ปัจจัย (115) | ไม่มีที่มา/ไม่รับรอง | Q-29 |
| `RiskWeightVersion` / `RiskHardRule` structure | ผูกกับสูตรที่เลื่อน | Q-29 |

> **การตีความ #13 + #14 ร่วมกัน:** เพิ่ม**คอลัมน์เก็บองค์ประกอบคะแนน**ได้ทันที (โครงสร้าง) แต่**ห้ามเดินสายตรรกะคำนวณ/จัดระดับ** จนกว่าได้ BR → คอลัมน์จะเป็น NULL ไว้ก่อน
> **ข้อสังเกตที่ต้องยกเมื่อทบทวน BR:** RISK-02 พิสูจน์ว่า `normalizedScore` เพียงอย่างเดียวทำให้ "ข้อมูลขาด 1 ปัจจัย → คะแนนพุ่ง 100" → ควรเสนอ `absoluteScore` (÷115) เพิ่มตอนยืนยันสูตร (บันทึกไว้ใน Q-25)

---

### กลุ่ม F — Migration Order (คำตัดสิน 15)

ยืนยันว่า Custom PostGIS SQL ต้องอยู่ในลำดับ Migration ที่ถูกต้อง → **ปิด SQL-01, SQL-02 (ทิศทาง)**

**ลำดับที่ยืนยัน:**
```
0001_init (Prisma: tables + extensions=[postgis,pg_trgm])
0002_postgis_columns (Unsupported geography → ไม่มี Drift)
0003_functions_triggers
0004_constraints (DO $$ IF NOT EXISTS)
0005_indexes
0006_views
```
- แก้ความเข้าใจผิดใน schema.prisma:747 — `Unsupported()` ใช้เป็น**คอลัมน์**ได้ (ใช้ใน relation ไม่ได้เท่านั้น)
- `database/drafts/00_postgis_extensions.sql` → เก็บอ้างอิง **ห้ามรันมือ**

---

### กลุ่ม G — สงวนให้เจ้าของ (คำตัดสิน 16) 🔴

**ห้ามตัดสินใจแทนในเรื่อง Consent และ Encryption** → คงเปิด:

| เรื่อง | Q | สิ่งที่ห้ามทำ | สิ่งที่ทำได้ |
|---|---|---|---|
| **Consent / PDPA** | Q-04 | ห้ามกำหนดว่า `UNKNOWN` ใช้ทำอะไรได้; ห้ามออกแบบ Consent flow ที่ผูกกฎ | คง enum `ConsentStatus` ที่มีอยู่; เตรียมโครง `ConsentRecord`/`PdpaRequest` ไว้ (โครงสร้างไม่ตัดสินนโยบาย) |
| **Encryption** | Q-20 | ห้าม implement Prisma Extension เข้ารหัส; ห้ามตัดสินว่าชื่อเข้ารหัสหรือไม่ | คง 🔒 เป็นเครื่องหมาย "รอตัดสิน"; **ห้ามลบ 🔒 และห้ามอ้างว่าเข้ารหัสแล้ว** |

> ⚠️ **นี่หมายความว่า SCH-08 (Encryption ไม่จริง) และ GAP-R06 (Consent) ยังเป็น BLOCKER ที่เปิดอยู่** — และเป็น BLOCKER ที่ต้องปิด**ก่อนเก็บข้อมูลจริง** (ไม่ใช่แค่ก่อนเขียนโค้ด) โดยเฉพาะ PDPA ม.26

---

## 3. สรุปสถานะ Blocker หลังคำตัดสิน

### ✅ ปิดแล้ว (พร้อมแก้ Schema)

| Blocker | ปิดด้วย | การแก้ที่ตามมา |
|---|---|---|
| CONF-01 (600/3,000) | #1, #2 | Coverage Model ใหม่ |
| CONF-02 / SCH-05 / RBAC-01 (VOLUNTEER) | #5 | Rename enum |
| SCH-01 / SEED-01 (Community-Tambon) | #6, #7, #8, #9, #10 | CommunityTambon M:N |
| SCH-04 / COV-01 (targetHouseholds) | #1, #2, #3 | ลบ targetHouseholds, เพิ่ม Coverage fields |
| RISK-01 (115 vs CHECK 100) | #13 | แยก 3 คะแนน + แก้ CHECK |
| SQL-01 / SQL-02 (ลำดับ/Drift) | #15 | Migration ordering + Unsupported() |
| **SEED-01 (รหัสชุมชน)** | **R2-#1,#2** | TK01/PM01/KS01/PW01/NK01 |
| **Q-19 Version (Better Auth)** | **R2-#4** | ล็อก `1.6.23` + Prisma Adapter |

### 🟢 ปลดล็อกแล้ว — พร้อมแก้ (ไม่ต้องรอคำตัดสินเพิ่ม)

| Blocker | เหตุผล |
|---|---|
| SCH-03 (คนเดียวคีย์ 2 รอบ) | Pure fix — เพิ่ม Trigger + App logic; ไม่ต้องอาศัยคำตัดสินใด |
| QM-03 (unique address — ลบ constraint) | ปลอดภัยเสมอ; ส่วน semantics อพาร์ทเมนต์รอ Q-12 แต่ไม่บล็อกการลบ |
| SQL-03 (Constraint Idempotent) | Pure fix |
| SQL-04 (Batch Trigger) | Pure fix (นิยาม receivedCount รอ Q-30 แต่ไม่บล็อกโครงสร้าง Trigger) |

### 🟡 ได้แนวทางแล้ว — ยังรอเงื่อนไข (อัปเดตรอบ 2)

| Blocker | สถานะ | เหตุผล |
|---|---|---|
| **SCH-08 / RBAC-03** (Encryption) | 🟡 ได้ design | รอบ 2 ให้แนวทาง AES-256-GCM + Blind Index HMAC-SHA256; **ยังห้าม implement จนกว่ามี Key Management + ยืนยัน PDPA** (ดู R2-#5) |

### 🔴 ยังเปิด — ต้องปิดก่อน Migration แรก หรือก่อนเก็บข้อมูล

| Blocker | สถานะ | เหตุผลที่ยังเปิด |
|---|---|---|
| **GAP-D01** (BR 38 ข้อหาย) | 🔴 เปิด | ยังไม่ได้ไฟล์ v2.0 / ยังไม่เขียน BR ใหม่ (Q-03) — **บล็อก Risk formula (#14)** |
| **GAP-R06 / RBAC-04** (Consent/PDPA) | 🔴 เปิด — legal BLOCKER | สงวนให้เจ้าของ + นิติกร (#16, Q-04, R2-#6) |
| **RISK-02 / RISK-07** (สูตร + Versioning) | 🔴 เปิด | เลื่อนตาม #14 จนกว่าได้ BR (R2-#7,9) |

---

## 4. ข้อจำกัดที่คำตัดสินสร้างขึ้น (บังคับใช้กับทุกงานต่อไป)

1. **ห้ามใช้ 0 แทน "ไม่ทราบ"** — `totalHouseholds` และ Coverage ที่ไม่มี Denominator ต้องเป็น `NULL` เสมอ
2. **เกณฑ์ผ่าน Coverage ใช้ `>` strict** — 60% พอดี = ไม่ผ่าน
3. **85% ห้ามปรากฏในตรรกะการตัดสินสถานะ** — เป็นเป้าหมายอ้างอิงเท่านั้น
4. **`VOLUNTEER` เท่านั้น** — ห้ามมี `RESCUE_VOLUNTEER` เหลือในโค้ด/Seed/Test
5. **นับครัวเรือนต่อตำบลต้องใช้ `Household.tambonId`** — ห้าม Join ผ่าน `CommunityTambon` (นับควนสันติซ้ำ)
6. **`isPrimary` อนุญาต 0 หรือ 1 ตำบลหลัก** — ไม่บังคับต้องมี
7. **ข้อมูลกระดาษต้องเก็บดิบ** — `communityNameOnPaper`, `coordinateRawText` และ Double-entry เทียบที่ raw
8. **Risk: เก็บได้ คำนวณไม่ได้** — 3 คะแนนเป็นคอลัมน์ NULL จนกว่าได้ BR; ห้ามจัดระดับ/Hard Rule/Threshold/Confidence
9. **Custom SQL อยู่ใน Prisma Migration เท่านั้น** — ห้ามไฟล์รันมือ; ใช้ `Unsupported()` สำหรับ geography
10. **Consent/Encryption สงวนให้เจ้าของ** — คง 🔒 เป็น "รอตัดสิน"; ห้ามอ้างว่าเข้ารหัสแล้ว

---

## 5. สิ่งที่ยังต้องได้รับคำตอบก่อน Migration แรก (อัปเดตหลังรอบ 2)

| ลำดับ | ต้องการ | สถานะ | อ้างอิง |
|---|---|---|---|
| 1 | ~~รหัสชุมชน 5 แห่ง (`code`)~~ | ✅ **ปิดแล้ว** — TK01/PM01/KS01/PW01/NK01 (R2-#1,2) | Q-21 |
| 2 | **รหัสอำเภอ/ตำบล/หมู่** | 🔴 **ยังเปิด — ต้อง Verify (ห้ามเดา)** — ปัจจุบัน `UNVERIFIED`; `9001` น่าจะเป็นเมืองสงขลา | Q-24, R2-#3 |
| 3 | ~~เวอร์ชัน Better Auth~~ | ✅ **ปิดแล้ว** — `1.6.23` (R2-#4) | Q-19(2) |
| 4 | **Encryption Implementation** | 🟡 ได้ design; **ยังห้าม implement** จนกว่ามี Key Management + PDPA (R2-#5) | Q-20 |
| 5 | **ทิศทาง Consent/PDPA** | 🔴 legal BLOCKER (R2-#6) | Q-04 |
| 6 | **Business Rules (Risk + การคีย์ + จัดเก็บ)** | 🔴 ยังเปิด | Q-03, GAP-D01 |

> **สำคัญ:** รหัสอำเภอ/ตำบล (ลำดับ 2) จำเป็นสำหรับ **Seed ข้อมูลพื้นที่** — ไม่บล็อก DDL Migration แรก (สร้างตาราง) แต่**บล็อกการ Seed Production พื้นที่**
> รายการ 4–6 บล็อก **Feature ที่เกี่ยวข้อง** และ **การเก็บข้อมูลจริง** — ดูรายละเอียดใน [18-pre-migration-checklist.md](18-pre-migration-checklist.md)

---

## 6. คำตัดสินรอบที่ 2 (9 ข้อ)

> เพิ่มเติมจากรอบที่ 1 — เรียกว่า **R2-#1 ถึง R2-#9**

### R2-#1, R2-#2 — รหัสชุมชนเริ่มต้น (ปิด Q-21 / SEED-01)

| ชุมชน | รหัส |
|---|---|
| ชุมชนท่าเคียน | **`TK01`** |
| ชุมชนประสานมิตร | **`PM01`** |
| ชุมชนควนสันติ | **`KS01`** |
| ชุมชนปลักหว้า | **`PW01`** |
| ชุมชนหน้าควน | **`NK01`** |

- **R2-#2:** รหัสชุมชน**ต้องไม่ผูกกับรหัสตำบล** เพราะชุมชนหนึ่งอาจครอบคลุมหลายตำบล (ควนสันติ = 2 ตำบล)
- **ผลผูกพัน:** รหัสนี้ฝังใน `sheetNo` (`SHEET-{ชุมชน}-{batch}-{ลำดับ}`) ที่พิมพ์ลงกระดาษ → **เปลี่ยนไม่ได้หลังพิมพ์**
- **ข้อสังเกต:** รหัสใหม่ใช้อักษรย่อชื่อชุมชน (ไม่ใช่ตำบล) → รองรับชุมชนข้ามตำบลได้ ✅ ตรงเจตนา R2-#2

### R2-#3 — ห้ามเดารหัสพื้นที่ (จังหวัด/อำเภอ/ตำบล/หมู่)

**คำตัดสิน:** ตรวจว่ารหัสพื้นที่ใน Seed ปัจจุบันถูกต้องหรือไม่ — ถ้าไม่มีแหล่งยืนยัน ให้ระบุ `UNVERIFIED` — **ห้ามแก้ด้วยการคาดเดา**

**ผลการตรวจ Seed ปัจจุบัน (`seed.ts:16-54`):**

| ระดับ | ชื่อ | รหัสใน Seed | สถานะ | เหตุผล |
|---|---|---|---|---|
| จังหวัด | สงขลา | `90` | 🟡 **UNVERIFIED (สอดคล้องมาตรฐาน)** | `90` ตรงกับรหัสจังหวัดสงขลาตามระบบมาตรฐาน — แต่ยังไม่ยืนยันจากแหล่งทางการในรอบนี้ |
| อำเภอ | หาดใหญ่ | `9001` | 🔴 **UNVERIFIED — น่าจะผิด** | `9001` ตามระบบมาตรฐานมักเป็น **อำเภอเมืองสงขลา**; หาดใหญ่มักเป็น **`9011`** — **ห้ามแก้เป็น 9011 โดยไม่ยืนยัน** |
| ตำบล | ควนลัง | `900105` | 🔴 **UNVERIFIED** | ผูกกับรหัสอำเภอที่น่าจะผิด (ควรขึ้นต้นด้วยรหัสอำเภอที่ถูกต้อง) |
| ตำบล | หาดใหญ่ | `900101` | 🔴 **UNVERIFIED** | เช่นเดียวกัน |
| หมู่ | ควนลัง 1-10, หาดใหญ่ 1-5 | — | 🔴 **UNVERIFIED (Comment ยอมรับว่าตัวอย่าง)** | `seed.ts:56` = "หมู่ — ตัวอย่าง (ปรับตามจริง)" |

> **⚠️ ไม่ยืนยันว่ารหัสที่ถูกต้องคืออะไร** ตามคำสั่ง "ห้ามเดา" — เพียงชี้ว่า `9001` มีความเสี่ยงสูงที่จะผิด และต้องตรวจกับ **Dataset กรมการปกครอง (TIS-1099)** ก่อน Seed Production
> **แนวทาง:** จนกว่าจะยืนยัน — ทำเครื่องหมายทุกรหัสพื้นที่เป็น `UNVERIFIED` ในเอกสาร; **ห้าม Seed Production พื้นที่**

### R2-#4 — Better Auth เวอร์ชัน `1.6.23` (ปิด Q-19 ส่วน Version)

| ข้อกำหนด | รายละเอียด |
|---|---|
| เวอร์ชัน | **`1.6.23`** — ล็อกใน `package.json` (ห้าม `latest` ใน Production Workflow) |
| Adapter | **Prisma Adapter** |
| CLI | ใช้ **Better Auth CLI เฉพาะ Generate Schema เพื่อเปรียบเทียบ** เท่านั้น |
| Migration จริง | **Prisma Migration เป็นผู้จัดการ** (ไม่ใช่ Better Auth CLI) |
| RBAC | ใช้ **`UserRole` + `UserCommunityScope` ของระบบเอง** — **ไม่ใช้ Better Auth Admin Plugin เป็น RBAC หลัก** |

- **ผลผูกพัน:** โครงสร้างตาราง Auth ตอนนี้กำหนดได้แล้ว (ตามข้อกำหนด v1.6.23) → ปลดล็อก Phase 3 เชิงการวางแผน
- **⚠️ รอบนี้ยังห้ามติดตั้ง Package** — บันทึกเวอร์ชันไว้ใน [18-pre-migration-checklist.md](18-pre-migration-checklist.md) เพื่อดำเนินการเมื่อสร้างโปรเจกต์

### R2-#5 — แนวทาง Encryption เบื้องต้น (ทำเครื่องหมาย Q-20: ได้แนวทาง — ยังรอเงื่อนไข)

| ประเภทข้อมูล | แนวทาง |
|---|---|
| **ชื่อ + ข้อมูลค้นหา Fuzzy** | **ยังไม่เข้ารหัสระดับ Application รอบนี้** — ป้องกันด้วย RBAC + Query Scope + Audit Log + Database/Disk Encryption |
| **เบอร์โทรศัพท์ + ข้อมูลสุขภาพ** | ออกแบบให้**รองรับ Application-level Encryption** (ยังไม่ implement) |
| อัลกอริทึม (เมื่อ implement) | **AES-256-GCM** |
| ค้นหาแบบ Exact | **Blind Index แบบ HMAC-SHA256** |
| พิกัดรายบ้าน | ถือเป็น**ข้อมูลอ่อนไหว** (L3) |
| Public API / Public View | **ห้ามคืน PII, ข้อมูลสุขภาพ, พิกัดรายบ้าน** |

> **🔴 ยังห้าม Implement Encryption** จนกว่า **(1) มี Key Management** และ **(2) ได้รับการยืนยันด้าน PDPA**
> → นี่ปลด SCH-08 จาก "🔴 สงวน" เป็น "🟡 ได้ design" แต่**ยังไม่ปิด** — Encryption Implementation ยังอยู่ในกลุ่ม `WAITING_FOR_LEGAL_DECISION`
> → **ผลต่อ Schema รอบนี้:** ยังไม่เพิ่มคอลัมน์ ciphertext/blind-index (เพราะการเพิ่มหมายถึงต้องคำนวณ = implement); แต่**เพิ่มเครื่องหมาย 🔒 ให้พิกัดรายบ้าน** (`latitude`/`longitude` = L3) ได้ (เป็นการจัดหมวด ไม่ใช่ implement)

### R2-#6 — Consent + ฐานกฎหมาย = ยังเป็น legal BLOCKER

คงสถานะ GAP-R06 / Q-04 เป็น **BLOCKER ด้านกฎหมาย** — สงวนให้เจ้าของ + นิติกร (ไม่เปลี่ยนจากรอบ 1)

### R2-#7, R2-#8, R2-#9 — Risk

| # | คำตัดสิน |
|---|---|
| R2-#7 | **สูตร Risk Final และ Hard Rules ยังไม่อนุมัติ** |
| R2-#8 | **แก้ได้เฉพาะโครงสร้างเก็บ** `rawScore`, `maximumPossibleScore`, `normalizedScore` (ตรงกับรอบ 1 #13) |
| R2-#9 | **ห้ามสร้าง Logic กำหนดระดับ Risk Final** จนกว่าอนุมัติ Business Rule |

> ยืนยันและตอกย้ำคำตัดสินรอบ 1 #13/#14 — **3 คะแนน = STRUCTURE_ONLY**; การจัดระดับ/Hard Rule = `WAITING_FOR_BUSINESS_RULE`

---

## 6.5 คำตัดสินรอบที่ 3 — โมดูลจุดอพยพ (ปิด Q-EVAC-TYPE / Conflict D, 2026-07-21)

> เรียกว่า **#EVAC** — ปิด Conflict D (ดู [20-schema-conflict-resolution.md](20-schema-conflict-resolution.md))

| # | คำตัดสิน |
|---|---|
| #EVAC-1 | `EvacuationSite` เป็น **Phase 2 Future Module** (เมนู "จัดการจุดอพยพ") — Phase 1 สร้าง**โครงสร้างเท่านั้น**: ห้ามมี UI/API/Seed จริง/การผูกกับคำตอบครัวเรือน/Business Logic |
| #EVAC-2 | สร้าง enum **`EvacuationSiteType`** = `RELATIVE_HOME`, `SCHOOL`, `TEMPLE_OR_MOSQUE`, `COMMUNITY_CENTER`, `MUNICIPAL_AREA`, `OTHER` (ห้ามเพิ่ม/ลบ/เปลี่ยนชื่อ) |
| #EVAC-3 | **ไม่มี `UNKNOWN`** โดยเจตนา — ไม่ทราบประเภท → `EvacuationSite.type = NULL` (เปลี่ยนฟิลด์เป็น nullable) |
| #EVAC-4 | `NearestEvacSiteType` (คำตอบแบบสอบถาม ส่วนที่ 3 ข้อ 8) **คงไว้ครบ** รวม `UNKNOWN`/`OTHER` — **สอง enum แยกกันถาวร ห้ามรวม** |
| #EVAC-5 | **ห้าม Seed ตัวอย่างจุดอพยพใน Production** (ถ้าจำเป็นให้ใส่เฉพาะ Dev Seed) |

> **ผล:** ปิด Conflict D + FIX-45; `EvacuationSite.type` เปลี่ยนจาก `NearestEvacSiteType` → `EvacuationSiteType?`

---

## 6.6 คำตัดสินรอบที่ 4 — Entry Model + Registration (2026-07-22/23)

> เรียกว่า **#R4** — ดูบริบทโครงการแม่ใน [27-project-context-song-khlong-kuan-lang-model.md](27-project-context-song-khlong-kuan-lang-model.md)

| # | คำตัดสิน |
|---|---|
| #R4-1 | **Single-Entry + Verifier แก้ไขได้** แทน Blind Double-Entry — flow จริง: คีย์รอบเดียว → Verifier ตรวจ/แก้ไขได้โดยตรง → VERIFIED (อัปเดตใน CLAUDE.md แล้ว) |
| #R4-2 | **เก็บ schema Double-Entry ไว้แบบปิดใช้งาน** (`EntryAttempt.attemptNo/isBlind`, `CriticalFieldConfig`, `Discrepancy`, BR-44 trigger) เผื่อเปิดใช้เฉพาะฟิลด์วิกฤตในอนาคต — ห้ามลบ |
| #R4-3 | **ทุกการแก้ไขของ Verifier ต้องมี Audit diff** (old → new + เหตุผล) ใช้ `AuditLog.changes` ที่มีอยู่ — ห้ามแก้แบบไม่มีร่องรอย |
| #R4-4 | **Registration = Self-registration + Approval แบบไม่มีลิงก์**: ผู้สมัครตั้งรหัสผ่านเองตอนสมัคร → บัญชีเกิดเป็น `isActive=false` เสมอ (server hook) → ADMIN อนุมัติ 1 คลิก (activate + มอบ role/scope ใน transaction) → login ได้ทันที ไม่มี token/อีเมล/ก้อปลิงก์ |
| #R4-5 | **Whitelist บทบาทที่สมัครเองได้** = `VOLUNTEER`, `FIELD_SURVEYOR`, `DATA_ENTRY` เท่านั้น — บทบาทอำนาจสูงแอดมินสร้างให้เอง |
| #R4-6 | **สังกัด (organization) เป็น free text เฟสแรก** — รอรายชื่อภาคีจริง (docs/27 §4) ก่อนทำ master data |
| #R4-7 | **VolunteerProfile ไม่สร้างอัตโนมัติตอนอนุมัติ** — แยกไป Phase 13 (BR-68) ตามแผนเดิม |
| #R4-8 | การแจ้งเตือนผลอนุมัติ (email/LINE) = **Future** — เฟสนี้ผู้สมัคร login เองได้ทันทีหลังอนุมัติ; ต่อ email provider เมื่อทำ "ลืมรหัสผ่าน" |

---

## 6.7 คำตัดสินรอบที่ 6 — Scope และ Batch (2026-07-31)

> เรียกว่า **#R6**

### #R6-A — Global Community Scope เป็นธงระดับบัญชี ไม่ใช่ระดับ Role

| # | คำตัดสิน |
|---|---|
| #R6-1 | **`User.hasGlobalCommunityScope` (ธงรายบัญชี) คือกลไกเดียว**ในการให้สิทธิ์เห็นทุกชุมชน — ผู้ตรวจที่ต้องเห็นคิวทั้งระบบให้เปิดธงเป็นรายคน |
| #R6-2 | **`GLOBAL_SCOPE_ROLES` = `ADMIN` + `EXECUTIVE` เท่านั้น** — ห้ามเพิ่ม Role ใดเข้าไปอีก และ **ห้ามใส่ `OFFICER`** เด็ดขาด |
| #R6-3 | **Legacy Role ที่ยังค้างใน enum (เช่น `VERIFIER`, `COORDINATOR`, `FIELD_SURVEYOR`) ห้ามถูกใช้เป็นกลไกใหม่ในการให้ Global Scope** — ยกเลิกแนวทาง "VERIFIER → Global อัตโนมัติ" ของ #R5 (2026-07-26) |
| #R6-4 | ธงนี้แก้ได้เฉพาะผู้มี `user.manage` · **ห้ามแก้ของตนเอง** · ตรวจสิทธิ์ฝั่ง Server เสมอ · เขียน Audit Log ค่าก่อน/หลังทุกครั้ง |
| #R6-5 | ค่าเริ่มต้นต้องปลอดภัยเสมอ — ไม่มี scope และไม่มีธง → เห็น **0 ชุมชน** ห้าม fallback เป็นทั้งระบบ |

> **เหตุผล:** การผูก Global Scope กับชื่อ Role ทำให้สิทธิ์ระดับสูงสุดถูกแจกโดยผลข้างเคียงของการตั้งชื่อ
> และเมื่อยุบ/เลิกใช้ Role ในอนาคต สิทธิ์จะเปลี่ยนตามไปโดยไม่มีใครตั้งใจ
> ธงรายบัญชีทำให้ "ใครเห็นทั้งระบบ" เป็นรายการที่ตรวจสอบได้ทีละคนและมีร่องรอยการมอบสิทธิ์

### #R6-B — Batch เป็น Optional Workflow

> ยืนยันซ้ำโดยเจ้าของ 2026-07-31 ก่อนเริ่ม Commit 4 — ถ้อยคำด้านล่างคือฉบับที่มีผลผูกพัน

| # | คำตัดสิน |
|---|---|
| #R6-6 | **ระบบต้องสามารถทำงานได้โดยไม่มี Batch** |
| #R6-7 | การสร้าง Batch เป็น **ทางเลือก** สำหรับหน่วยงานที่มีการแบ่งกองเอกสารจริง |
| #R6-8 | **Household และ Questionnaire ต้องไม่บังคับอ้างอิง Batch** |
| #R6-9 | **`batchId` ต้องเป็น Nullable** |
| #R6-10 | **DATA_ENTRY เปิดแบบสอบถามด้วย Sheet ID และคีย์ข้อมูลได้ทันที** ไม่ว่าจะมี Batch หรือไม่ |
| #R6-11 | **Save Draft, Submit, Review และ Verify ต้องไม่ขึ้นกับการมี Batch** |
| #R6-12 | หาก Sheet อยู่ใน Batch ระบบ **สามารถ**แสดงข้อมูล Batch และใช้ติดตามความคืบหน้าได้ |
| #R6-12a | **การมีหรือไม่มี Batch ต้องไม่เปลี่ยนขั้นตอนหลักในการคีย์ข้อมูล** |
| #R6-12b | **UI ต้องไม่บังคับเลือกหรือสร้าง Batch ก่อนเปิดแบบสอบถาม** |
| #R6-12c | คำว่า **"ปึก" ให้แสดงเฉพาะเมื่อแบบสอบถามถูกผูกกับ Batch จริง** |
| #R6-12d | **Batch เป็นข้อมูลเพื่อการบริหารและติดตามงาน ไม่ใช่ Business Requirement หลัก** |

**สถานะการ Implement:** ทำครบแล้วตาม **#R6-F** (2026-08-01) ดูหัวข้อถัดไป
เดิม (ตรวจ 2026-07-31) `PaperSheet.batchId` และ `Household.batchId` ยังเป็น NOT NULL
และถูกแยกเป็นงานต่างหากตามที่ตกลงไว้ ไม่รวมกับงานปรับโครงสร้าง Role

### #R6-C — ADMIN = Full System Administrator + การเปิด/ปิดบัญชี

| # | คำตัดสิน |
|---|---|
| #R6-13 | **ADMIN = Full System Administrator** — คง `ALL_PERMISSIONS` + Global Scope ไว้ **ห้ามลดสิทธิ์** และห้ามบังคับให้ ADMIN ต้องได้ Role เพิ่ม (เช่น `ADMIN + OFFICER`) เพราะจะเกิด ADMIN หลายรูปแบบโดยพฤติกรรม |
| #R6-14 | กฎ **Separation of Duties ยังบังคับกับ ADMIN** เหมือน Role อื่น — `verifiedByUserId != enteredById` · ADMIN ที่คีย์ใบใด ยืนยัน/แก้ใบนั้นไม่ได้ (`SELF_VERIFY` / `SELF_EDIT`) |
| #R6-15 | ADMIN เปิด/ปิดบัญชีผู้ใช้ผ่านระบบได้ **ใช้คอลัมน์เดิม `User.isActive`** ห้ามสร้างระบบสถานะซ้ำ |
| #R6-16 | **ห้ามปิดบัญชีตนเอง** (`SELF_DEACTIVATION`) และต้องเหลือ ADMIN ที่ยัง Active อย่างน้อย 1 บัญชีเสมอ (`LAST_ACTIVE_ADMIN`) — ตรวจใน Transaction **พร้อม advisory lock** (ดู #R6-21) ห้ามเชื่อค่าจาก UI |
| #R6-21 | ทุกเส้นทางที่ลดจำนวน **Active ADMIN** (ปิดบัญชี / ถอด Role ADMIN) ต้องจอง `pg_advisory_xact_lock` ด้วย **key เดียวกัน** ก่อนนับและเขียน |
| #R6-17 | การเปิดบัญชีกลับ **ไม่เปลี่ยน Role หรือ Scope อัตโนมัติ** — คืนสิทธิ์เดิมของบัญชีพอดี |
| #R6-18 | บัญชีที่ยัง **ไม่ผ่านการอนุมัติ** เปิดตรง ๆ ไม่ได้ (`NOT_TOGGLEABLE`) ต้องใช้เส้นทางอนุมัติคำขอ ซึ่งมอบ Role/Scope ให้พร้อมกัน |
| #R6-19 | สั่งค่าเดิมซ้ำ = ไม่เปลี่ยนอะไรและ **ไม่เขียน Audit Log ซ้ำ** (idempotent) |
| #R6-20 | Audit ของการเปลี่ยนสถานะบัญชีใช้**มาตรฐานเดิม** `AuditAction.UPDATE` + `entityType: "User"` + `changes: { field, before, after }` — ไม่เพิ่มค่า enum ใหม่ให้ซ้ำซ้อนกับรูปแบบที่ใช้อยู่กับ Role/Scope |

**การแยกความหมายของ `isActive = false` (ไม่ต้องเพิ่มคอลัมน์):**
`RegistrationRequest.userId` เป็น `@unique` (1 คำขอต่อบัญชี) จึงใช้สถานะคำขอชี้ขาดได้ —
ดู `domain/admin/account-status.ts`

| `isActive` | คำขอสมัคร | สถานะที่แสดง |
|---|---|---|
| `true` | ใด ๆ | ใช้งานอยู่ |
| `false` | `PENDING` | **รออนุมัติ** |
| `false` | `REJECTED` | ถูกปฏิเสธ |
| `false` | `CANCELLED` | ยกเลิกคำขอ |
| `false` | `APPROVED` | **ปิดใช้งาน** (เคยเปิดแล้วถูกปิดภายหลัง) |
| `false` | ไม่มี (script/seed) | ปิดใช้งาน |

> **ห้ามแสดงบัญชีรออนุมัติเป็น "ถูกปิดใช้งาน"** — สองสถานะนี้สั่งงานคนละแบบ
> (อย่างแรกต้องไปกดอนุมัติ อย่างหลังคือคนที่ถูกตัดสิทธิ์โดยตั้งใจ)
> ก่อนหน้านี้หน้าจัดการผู้ใช้แสดงผิดจริง — แก้แล้วใน commit #R6-C

> **สมมติฐานของตารางนี้:** ผู้ใช้ที่**ไม่มี** `RegistrationRequest` คือบัญชีที่ ADMIN สร้างให้ /
> Seed / Legacy **ไม่ใช่** ผู้สมัครที่รออนุมัติ — เพราะเส้นทางสมัครสร้าง `User` กับ
> `RegistrationRequest` คู่กันเสมอ (`lib/registration/core.ts`) มีเทสต์ล็อกสมมติฐานนี้ไว้แล้ว

### Write skew ของ invariant "ต้องมี Active ADMIN ≥ 1" (#R6-21)

การนับแล้วค่อยเขียนภายใน Transaction **ไม่พอ** ภายใต้ `READ COMMITTED` ซึ่งเป็นค่าเริ่มต้นของ PostgreSQL:

```
Tx A (ปิด B): นับเห็น A ยัง active → ผ่าน guard
Tx B (ปิด A): นับเห็น B ยัง active → ผ่าน guard
A เขียนแถว B = inactive · B เขียนแถว A = inactive
ผล: Active ADMIN = 0
```

เงื่อนไข `updateMany where isActive: true` ช่วยไม่ได้ เพราะแต่ละทรานแซกชันเขียน **คนละแถว**
ไม่มีแถวไหนถูกแย่งกัน จึงไม่มีใครแพ้

**วิธีแก้ที่ใช้: PostgreSQL advisory transaction lock (ทางเลือก A)**
`SELECT pg_advisory_xact_lock(<key คงที่>)` ก่อน "นับ → ตรวจ → เขียน" ทุกครั้ง
บังคับให้เกิดทีละราย ผู้มาทีหลังจึงนับ**หลังจาก**ผู้มาก่อน commit แล้ว และเห็นสภาพจริง
ล็อกปล่อยอัตโนมัติเมื่อ commit/rollback จึงไม่ค้างแม้เกิด error

เลือกแทน Serializable + retry เพราะไม่ต้องมี retry loop ให้พลาด และงานจัดการบัญชีมีน้อยมาก
การ serialize จึงไม่กระทบประสิทธิภาพ

**สำคัญ:** `setUserActive` และ `setUserRoles` ต้องใช้ **key เดียวกัน** — ถ้าใช้คนละ key
A ถอด Role ADMIN ของ B พร้อมกับ B ปิดบัญชีของ A จะผ่านทั้งคู่ ช่องโหว่กลับมาเหมือนเดิม

พิสูจน์ด้วยการปิดล็อกชั่วคราวแล้วรันเทสต์ concurrency จริง → ได้ Active ADMIN = 0 ทั้งสองเคส

**พฤติกรรม Session หลังปิดบัญชี (ตรวจแล้ว ไม่ใช่การสมมติ):**

* Login ใหม่ถูกบล็อกที่ `databaseHooks.session.create.before` (`lib/auth.ts`) → โยน `FORBIDDEN`
* Session ที่ค้างอยู่ถูกตัดสิทธิ์ใน **คำขอถัดไป** เพราะ `getActiveSessionUser()`
  (`lib/auth-session.ts`) อ่าน `isActive` จากฐานข้อมูล**ทุกคำขอ** ไม่ได้เชื่อคุกกี้
  (`cookieCache` ของ Better Auth ไม่ bypass การตรวจนี้)
* **ระบบไม่มีการ revoke session** — แถว `Session` ยังอยู่จนหมดอายุเอง
  ยอมรับได้เพราะการตรวจรายคำขอทำให้ session นั้นใช้ทำอะไรไม่ได้อยู่แล้ว
* `loadAuthorizationForUser()` **ตรวจ `isActive` เอง** และคืน `null` เมื่อบัญชีถูกปิด
  (แก้แล้ว — เดิมคำนวณสิทธิ์จาก Role/Scope อย่างเดียว เป็น footgun ที่โค้ดใหม่เรียกตรง
  แล้วข้าม `getActiveSessionUser()` ได้เงียบ ๆ) ความปลอดภัยจึงไม่ฝากไว้กับวินัยของ caller
* ต้องการอ่าน "สิทธิ์ที่บัญชีหนึ่งเคยมี" เพื่อแสดงในหน้าแอดมิน ให้ใช้ `listUsers()`
  **ห้าม**ใช้ Authorization Context ซึ่งมีไว้สำหรับผู้ทำคำขอเท่านั้น

### #R6-D — ยุบ COORDINATOR + VERIFIER เข้า OFFICER

| # | คำตัดสิน |
|---|---|
| #R6-22 | **Role ที่ใช้งานจริง = `ADMIN` · `EXECUTIVE` · `OFFICER` · `DATA_ENTRY`** |
| #R6-23 | `COORDINATOR` และ `VERIFIER` **คงอยู่ใน PostgreSQL enum** เพื่อให้บัญชีเก่าอ่านได้ แต่ **เลิกใช้ในชั้นแอปพลิเคชัน** — มอบหมายใหม่ไม่ได้ทั้งจาก UI และจากการเรียก Server Action ตรง |
| #R6-24 | OFFICER ครอบคลุมหน้าที่เดิมทั้งสอง: จัดการ/ดู Batch · ติดตามการคีย์ · Verification Queue · ตรวจ/ขอแก้/ยืนยันข้อมูล · ทำงานตาม Community Scope |
| #R6-25 | **OFFICER ห้ามได้ Global Scope จากชื่อ Role** — เห็นทุกชุมชนได้เฉพาะเมื่อบัญชีนั้นมี `hasGlobalCommunityScope=true` (ต่อจาก #R6-A) |
| #R6-26 | ห้ามลด Permission ที่ OFFICER เดิมมีอยู่ · ADMIN ยังคง `ALL_PERMISSIONS` |
| #R6-27 | บทบาทเดิมที่ **ติดมากับบัญชีอยู่แล้ว ห้ามถูกถอดโดยผลข้างเคียง** ของการกดบันทึกบทบาทอื่น — การย้ายต้องทำผ่าน Data Migration เท่านั้น |
| #R6-28 | `FIELD_SURVEYOR` **ยังไม่แตะ** ในรอบนี้ — แยกไป Commit ถัดไป |

**Permission ก่อน/หลัง (ตรวจของจริงก่อนแก้ — ไม่ได้เดา):**

| Role | Permission |
|---|---|
| COORDINATOR (เดิม) | `dashboard.view` `community.view` `community.manage` `batch.manage` `report.view` |
| VERIFIER (เดิม) | `verification.view` |
| OFFICER (ก่อนและหลัง — **ไม่เปลี่ยน**) | `dashboard.view` `community.view` `community.manage` `household.view` `batch.manage` `verification.view` `report.view` |

> **OFFICER ⊇ COORDINATOR ∪ VERIFIER อยู่แล้วตั้งแต่ต้น** จึงไม่ต้องเพิ่ม Permission ใด
> งานจริงของรอบนี้อยู่ที่ **ชั้นมอบหมายบทบาทและ UI** ไม่ใช่ตาราง Permission
> (มีเทสต์ล็อกว่า OFFICER = union พอดี ไม่ขาดและไม่เกิน)

**สถานะ Role check ในโค้ด:** ตรวจทั้ง repository แล้ว **ไม่มี production code ที่ตัดสินสิทธิ์จากชื่อ Role เลย**
ทุกจุดผ่าน `hasPermission(ctx, …)` และ Community Scope — จึงไม่ต้องแก้ Route Guard ใด

**Migration Logic ที่เตรียมไว้สำหรับ Commit ถัดไป (ยังไม่รันในรอบนี้):**

```
COORDINATOR → OFFICER
VERIFIER    → OFFICER + hasGlobalCommunityScope = true
```

* `VERIFIER` ต้องได้ธงรายบัญชี เพราะบัญชีเดิมเคยเห็นทุกชุมชน — ต้องคงพฤติกรรมเดิมไว้
  ผ่านธง **ไม่ใช่ผ่านชื่อ Role**
* รองรับผู้ใช้หลายบทบาท และ **ห้ามเกิด Role ซ้ำ**:
  `[COORDINATOR, DATA_ENTRY] → [OFFICER, DATA_ENTRY]` ·
  `[VERIFIER, OFFICER] → [OFFICER] + flag`
* ฐานของการย้ายอยู่ที่ `LEGACY_ROLE_REPLACEMENT` (`lib/authz/role-labels.ts`) — มีเทสต์ล็อกว่า
  legacy role ทุกตัวระบุปลายทางได้

### Data Migration ของ #R6-D — วิธีรันและข้อจำกัด

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อ | `migrate-legacy-roles` (Data Migration ไม่ใช่ DDL) |
| วันที่ / Version | 2026-07-31 · อ้าง Owner Decision #R6-D |
| ตรรกะ | `COORDINATOR → OFFICER` · `VERIFIER → OFFICER + hasGlobalCommunityScope=true` |
| โค้ด | `lib/admin/migrate-legacy-roles.ts` (core) · `scripts/migrate-legacy-roles.ts` (CLI) |
| ตรวจนับ | `scripts/audit-legacy-roles.ts` — รายงานเป็นจำนวนเท่านั้น **ไม่มี PII** |

**คำสั่ง (ทุก environment):**

```
node --env-file=.env --import tsx scripts/audit-legacy-roles.ts       # ดูของจริงก่อน
node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts --dry-run
node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts     # เขียนจริง
```

**ทำไมเป็นสคริปต์ ไม่ใช่ `migration.sql`:** นี่คือ Data Migration ที่ต้องพิสูจน์ตรรกะการแปลง
กับข้อมูลหลายรูปแบบ (หลายบทบาท · มี OFFICER อยู่แล้ว · ธง global เดิมเป็น true)
เขียนเป็นฟังก์ชันจึงทดสอบได้จริงบน PostgreSQL — ไฟล์ `.sql` ทดสอบแบบนั้นไม่ได้
และ **ห้ามทำใน seed** เพราะ Production ไม่ได้รัน seed

**Transaction และ Idempotency:** ทั้งหมดอยู่ใน `$transaction` เดียว — ถ้าล้มกลางทางต้องไม่เหลือ
สภาพครึ่ง ๆ กลาง ๆ เช่นปิด `VERIFIER` ไปแล้วแต่ยังไม่ได้ตั้งธง global (ผู้ใช้จะเสียขอบเขต
การมองเห็นทันที) · ลำดับบังคับ: **ตั้งธง global ก่อนปิดบทบาท** เพราะต้องอ่านให้ได้ก่อนว่าใครเป็น
`VERIFIER` · รันซ้ำได้เพราะทุกขั้นกรองด้วย `isActive: true` และใช้ `upsert` บน
`@@unique([userId, role])` จึงไม่มีทางเกิด Role ซ้ำ

**Rollback — Forward-only:**
หลังรวมเป็น `OFFICER` แล้ว **ข้อมูลปลายทางอย่างเดียวบอกไม่ได้** ว่า `OFFICER` คนไหนเดิมเป็น
`COORDINATOR` / `VERIFIER` / `OFFICER` อยู่แล้ว → **ห้ามเขียน Down Migration ที่เปลี่ยน
`OFFICER` ทุกคนกลับเป็น Legacy Role** เพราะจะแจกบทบาทผิดให้คนที่เป็น `OFFICER` มาแต่ต้น

สิ่งที่ทำแทน:

1. **สำรองฐานข้อมูลก่อนรันทุกครั้ง** — เป็นเส้นทางคืนค่าหลัก
2. Migration **ปิด** แถวบทบาทเดิม (`isActive=false`) **ไม่ลบทิ้ง** — แถวที่ปิดไว้คือ
   หลักฐานว่าใครเคยเป็นอะไร ทำให้ย้อนกลับด้วยมือแบบมีข้อมูลจริงได้ ไม่ต้องเดา
3. **ข้อจำกัดที่เหลือ:** ค่า `hasGlobalCommunityScope` *ก่อน* ย้ายไม่ได้ถูกบันทึกแยก
   การย้อนกลับจึงแยกไม่ออกว่าใครมีธงอยู่ก่อนแล้วกับใครได้ธงจาก migration
   (สคริปต์ `audit-legacy-roles.ts` รายงาน `verifierAlreadyGlobal` ไว้ — ต้องเก็บค่านี้
   ก่อนรันถ้าต้องการย้อนกลับให้แม่นยำ)

**Production Runbook (บังคับทำทุก Environment):**
สคริปต์นี้ **ไม่ได้รันอัตโนมัติพร้อม `prisma migrate deploy`** — ต้องสั่งเองทุกครั้ง

| # | ขั้นตอน | คำสั่ง / สิ่งที่ต้องได้ |
|---|---|---|
| 1 | สำรองฐานข้อมูล | `pg_dump` หรือ snapshot ของผู้ให้บริการ — **เส้นทางคืนค่าหลัก** |
| 2 | รัน audit ก่อน | `node --env-file=.env --import tsx scripts/audit-legacy-roles.ts` |
| 3 | **เก็บผลจำนวนก่อนรัน** | บันทึก JSON ที่ได้ไว้ (โดยเฉพาะ `verifierAlreadyGlobal`) |
| 4 | Dry-run | `node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts --dry-run` |
| 5 | ตรวจผล Dry-run | `legacyUsers` / `officerRolesGranted` / `globalScopeGranted` ตรงกับข้อ 2 |
| 6 | รันจริง | `node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts` |
| 7 | รัน audit หลัง | `node --env-file=.env --import tsx scripts/audit-legacy-roles.ts` |
| 8 | ยืนยัน | `activeCoordinator = 0` |
| 9 | ยืนยัน | `activeVerifier = 0` |
| 10 | ยืนยัน | ผู้ใช้ VERIFIER เดิมมี `OFFICER` และ `hasGlobalCommunityScope = true` |

สคริปต์ตรวจ postcondition **เสมอ** (แม้ผลเป็น `noop`) และ **คืน exit code 1** เมื่อยังเหลือ
บทบาทเดิมที่ใช้งานอยู่ — ใช้ผูกกับ CI/CD ได้โดยไม่ต้องอ่าน log ด้วยตา

### #R6-E — เลิกใช้บทบาท FIELD_SURVEYOR ในชั้นแอปพลิเคชัน

| # | คำตัดสิน |
|---|---|
| #R6-29 | **`FIELD_SURVEYOR` ไม่ใช่บัญชีผู้ใช้งานระบบอีกต่อไป** — ผู้สำรวจภาคสนามเป็นเพียง**ข้อมูลประกอบของแบบสอบถาม** (ชื่อ / เบอร์โทร) ไม่ต้องมี User Account |
| #R6-30 | **ห้ามใช้ข้อมูลผู้สำรวจตัดสิน Authorization** — `surveyorUserId` เป็น Optional Legacy Reference เท่านั้น ห้าม derive Community Scope หรือ Permission จากผู้สำรวจ |
| #R6-31 | คง `FIELD_SURVEYOR` ใน PostgreSQL enum เพื่อรองรับข้อมูลและประวัติเดิม แต่ **เลิกใช้ในชั้นแอปพลิเคชัน** |
| #R6-32 | **ไม่มีบทบาททดแทน** — ห้ามแปลงผู้ใช้เดิมเป็น `OFFICER` หรือ `DATA_ENTRY` อัตโนมัติ เพราะไม่มีข้อมูลสนับสนุนว่าควรได้สิทธิ์ใด |
| #R6-33 | **ห้ามปิด `User.isActive` อัตโนมัติ** — บัญชีอาจมีบทบาทอื่นที่ยังใช้งานอยู่ |
| #R6-34 | คำขอสมัคร `PENDING` ที่ขอบทบาทนี้ → `REJECTED` พร้อมเหตุผลและ Audit Log · **ห้ามลบคำขอทิ้ง** |
| #R6-35 | **คำขอที่ `APPROVED` ห้ามเขียนทับเป็น `REJECTED`** — คำขอนั้นถูกอนุมัติจริงในเวลานั้น การเขียนทับคือการทำลายประวัติ · การเลิกใช้บทบาทแสดงผ่านการปิด `UserRole` แทน |
| #R6-36 | `REJECTED` / `CANCELLED` เดิม — ไม่เปลี่ยนซ้ำ |
| #R6-37 | **ห้ามเพิ่ม `surveyorCodeOnPaper` และ `surveyorOrganizationOnPaper`** — ไม่มีในแบบสอบถามกระดาษ (ตรวจ docs/03 §0 แล้ว มีเพียง 0.3 ชื่อ และ 0.4 เบอร์โทร) |
| #R6-38 | `VOLUNTEER` และ `RESEARCHER` ยังเป็นบทบาทสำรอง **ห้ามเปิดใช้งานในรอบนี้** |

**บทบาทที่มอบหมายใหม่ได้ (หลัง #R6-E):** `ADMIN` · `EXECUTIVE` · `OFFICER` · `DATA_ENTRY`
**Legacy / Retired:** `COORDINATOR` · `VERIFIER` · `FIELD_SURVEYOR`
**สำรองในอนาคต:** `VOLUNTEER` · `RESEARCHER`

**Permission ก่อน/หลัง:** `FIELD_SURVEYOR` = `[]` **ทั้งก่อนและหลัง** — ไม่เคยมี Operational
Permission อยู่แล้ว งานรอบนี้จึงเป็นการปิดช่องมอบหมายและย้ายข้อมูล ไม่ใช่การลดสิทธิ์
ผู้ใช้ที่มี `[FIELD_SURVEYOR, DATA_ENTRY]` ได้สิทธิ์จาก `DATA_ENTRY` เท่านั้น (มีเทสต์ล็อกไว้)

**Surveyor Metadata — ฟิลด์จริงในสคีมา (ใช้ชื่อเดิม ไม่สร้างซ้ำ):**

| ฟิลด์ | ความหมาย |
|---|---|
| `Household.surveyorPrefixId` / `surveyorPrefixOther` | คำนำหน้าผู้สำรวจ (master data) |
| `Household.surveyorFirstNameOnPaper` / `surveyorLastNameOnPaper` | ชื่อ-สกุลผู้สำรวจ **จากกระดาษ** |
| `Household.surveyorPhoneOnPaper` | เบอร์ผู้สำรวจ **จากกระดาษ** |
| `Household.surveyorUserId` | Optional Legacy Reference — **ไม่ถูกใช้ในโค้ดใด ๆ** |

> ตรวจทั้ง repository แล้ว `surveyorUserId` **ไม่ถูกอ้างในโค้ด production เลย** มีเพียงประกาศในสคีมา
> จึงไม่มีจุดใดใช้ผู้สำรวจตัดสิน Authorization อยู่แล้ว

**Data Migration — `retire-field-surveyor`:**

* `lib/admin/retire-field-surveyor.ts` (core) · `scripts/retire-field-surveyor.ts` (CLI)
  · `scripts/audit-field-surveyor.ts` (ตรวจนับ ไม่มี PII)
* ทำใน `$transaction` เดียว — ปิด `UserRole` และเปลี่ยนสถานะคำขอต้องเกิดหรือหายพร้อมกัน
* Audit เขียนด้วย `tx.auditLog.create` **ในทรานแซกชันเดียวกัน** (ไม่ใช้ `writeAuditLog`
  ซึ่งเป็น best-effort นอกทรานแซกชัน) เพราะร่องรอยกับการเปลี่ยนสถานะต้องไม่มีอย่างใดค้างเดี่ยว
* `AuditLog.userId = null` = ระบบเป็นผู้กระทำ ตามที่สคีมากำหนดไว้แล้ว
  พร้อม `changes.migration = "migration:retire-field-surveyor"` เป็นตัวระบุผู้ดำเนินการ
* Idempotent: กรองด้วย `isActive: true` และ `status: PENDING` — รันซ้ำได้ ไม่เขียน Audit ซ้ำ

**Runbook (เหมือน #R6-D):**

```
1) สำรองฐานข้อมูล
2) node --env-file=.env --import tsx scripts/audit-field-surveyor.ts
3) node --env-file=.env --import tsx scripts/retire-field-surveyor.ts --dry-run
4) node --env-file=.env --import tsx scripts/retire-field-surveyor.ts
5) node --env-file=.env --import tsx scripts/audit-field-surveyor.ts
```

ยืนยันหลังรัน: `Active FIELD_SURVEYOR UserRole = 0` · `Pending FIELD_SURVEYOR Request = 0`
· บทบาทอื่นของผู้ใช้ไม่เปลี่ยน — สคริปต์คืน **exit code 1** เมื่อ postcondition ไม่ผ่าน

### #R6-F — สถาปัตยกรรม Optional Batch (2026-08-01)

> ถ้อยคำที่มีผลผูกพันสำหรับการ Implement #R6-B — ปิดคำถามว่า "ชุมชนของใบมาจากไหนเมื่อไม่มีปึก"

| # | คำตัดสิน |
|---|---|
| #R6-39 | **`PaperSheet.communityId` คือ Source of Truth ของชุมชน** — ใบกระดาษมีอยู่ก่อน Household และ Authorization ต้องทำงานได้ตั้งแต่วินาทีที่เปิดใบจาก Sheet ID |
| #R6-40 | **`PaperSheet.batchId` เป็น Optional Operational Metadata** — Nullable · ไม่มีปึกไม่กระทบขั้นตอนใด |
| #R6-41 | **ลบ `Household.batchId`** — อ่านผ่าน `Household → PaperSheet → PaperBatch` เท่านั้น **ห้ามเพิ่ม Composite FK เพื่อคง `Household.batchId` ไว้** เพราะเป็นการคงข้อมูลซ้ำและเพิ่มภาระรักษา invariant โดยไม่จำเป็น |
| #R6-42 | **กฎคู่ `batchId`/`sequence`** — มีปึก → `sequence` บังคับและไม่ซ้ำภายในปึก · ไม่มีปึก → `sequence` ต้องเป็น `null` บังคับที่ฐานข้อมูลด้วย `CHECK ((batchId IS NULL) = (sequence IS NULL))` และ partial `UNIQUE (batchId, sequence) WHERE batchId IS NOT NULL` |
| #R6-43 | **การค้นด้วยเลขลำดับสั้นทำได้เฉพาะเมื่อระบุปึก** — ไม่ระบุปึกต้องใช้ Full Sheet ID (`sequence` เดี่ยว ๆ ไม่ระบุใบได้) |
| #R6-44 | **สร้างใบพร้อมปึก → derive `communityId` จากปึกแล้วเก็บลงใบ** — ใบที่สร้างมาพร้อมปึกต้องมีชุมชนของตัวเองตั้งแต่แรก ไม่ใช่อ่านผ่านปึก |
| #R6-46 | **Authorization ต้องตรวจ `PaperSheet.communityId` ไม่ใช่ `PaperSheet.batch.communityId`** — ห้ามให้ใบที่ไม่มีปึกกลายเป็นใบที่ไม่มี Community Scope |
| #R6-47 | **ตัวนับปึกทุกตัว (`receivedCount`/`enteredCount`/`verifiedCount`) ต้องอัปเดตแบบมีเงื่อนไข** — Save / Submit / Verify **ห้ามล้มเหลวเพราะ `batchId = null`** |
| #R6-48 | **คิวตรวจจัดกลุ่ม ชุมชน → (ยังไม่ได้จัดเข้าปึก \| ปึกที่มีอยู่) → ผู้คีย์** · ป้ายกลุ่มเป็นข้อความแสดงผล **ห้ามส่ง `null` ดิบไปแสดง** |

**เหตุผลที่คง FK เดิมเป็น `ON DELETE RESTRICT` (ไม่ใช่ `SET NULL`):** `SET NULL` จะเคลียร์
`batchId` แต่ไม่เคลียร์ `sequence` → ชน `CHECK` ของ #R6-42 อยู่ดี ใบจึงต้องถูกถอดออกจากปึก
ผ่าน Application ที่เคลียร์ทั้งคู่พร้อมกันเสมอ (ยังไม่มีเครื่องมือนี้ในรอบนี้ — ดู Future Enhancement)

**Migration:** `prisma/migrations/20260801020000_optional_batch/`
(เพิ่ม nullable → backfill จากปึก → guard `RAISE EXCEPTION` เมื่อ backfill ไม่ครบ →
FK/Index → `SET NOT NULL` → ผ่อน `batchId`/`sequence` → ลบ `household.batchId` → CHECK + partial unique)
ตรวจก่อนรันด้วย `scripts/audit-optional-batch.ts`

**เทสต์ที่ล็อกคำตัดสินนี้:** `tests/integration/optional-batch.test.ts` (21 เคส)

### #R6-G — ผู้ลงทะเบียน Sheet ID คือ OFFICER (2026-08-01)

| # | คำตัดสิน |
|---|---|
| #R6-49 | **ผู้ลงทะเบียนแบบสอบถามเข้าระบบคือ OFFICER** ผ่าน Permission เดิม `batch.manage` — ไม่เพิ่ม Permission String ใหม่ |
| #R6-50 | **`DATA_ENTRY` สร้าง `PaperSheet` เองไม่ได้** — เปิดได้เฉพาะใบที่ลงทะเบียนแล้ว แล้วคีย์ข้อมูลเท่านั้น |
| #R6-51 | **ปึกเป็นตัวตัดสินชุมชนเสมอ** — ระบุปึกแล้ว `communityId` จาก Client ที่ขัดกับปึก → `COMMUNITY_MISMATCH` **ห้ามเขียนทับเงียบ ๆ** |
| #R6-52 | **ปึกที่ปิดแล้วรับใบเพิ่มไม่ได้** (`BATCH_CLOSED`) · ผูกใบเข้าปึกเพิ่ม `expectedCount`/`receivedCount` ในทรานแซกชันเดียวกัน |
| #R6-53 | **การหาลำดับถัดไปในปึกต้องจัดคิวด้วย `pg_advisory_xact_lock` ต่อปึก** — retry อย่างเดียวไม่พอ (พิสูจน์แล้ว ดูด้านล่าง) · แยกสาเหตุ `P2002` จาก `meta.target` **ห้ามเดาจากการนับแถว** |

**เหตุผล:** `survey.entry` **ไม่ผูก Community Scope** (Owner Decision 2026-07-24) การลงทะเบียนใบ
จึงเป็น **ด่านเดียวที่เหลืออยู่** ที่ผูก "ข้อมูลที่ถูกคีย์" เข้ากับ "กระดาษที่รับมาจริง" —
ถ้าผู้คีย์สร้างใบเองได้ ผู้มี `survey.entry` คนใดก็สร้าง Sheet ID และครัวเรือนที่ไม่มีเอกสาร
ต้นทางในชุมชนใดก็ได้ ทำให้ตัวเลข Coverage เชื่อถือไม่ได้

**หลักฐานที่ทำให้ต้องใช้ Advisory Lock (#R6-53):** เดิมใช้ `max(sequence)+1` + retry 3 รอบ
ทดสอบจริงด้วยการลงทะเบียน **4 ใบพร้อมกันในปึกเดียว** ได้ผล `["ok","ok","ERROR","ok"]` —
เพราะผู้แข่ง N คนต้องใช้ retry ราว N รอบ (แต่ละรอบมีผู้ชนะเพียงคนเดียว) หลังใส่
`pg_advisory_xact_lock(hashtext(batchId))` ต้นทรานแซกชัน ทดสอบซ้ำ 4 ใบและ 9 ใบพร้อมกัน
ผ่านครบทุกใบ ลำดับเรียง 1..N ไม่ซ้ำไม่ข้าม · ล็อกผูกกับทรานแซกชัน (ปลดเองเมื่อจบ)
และแคบระดับปึก จึงไม่กระทบปึกอื่นหรือใบนอกปึก — retry ที่เหลือไว้เป็นตาข่ายกันพลาดเท่านั้น

**การแยกสาเหตุ `P2002`:** ตรวจกับฐานข้อมูลจริงแล้ว Prisma คืน `meta.target` เป็นรายชื่อ
**คอลัมน์** ทั้งสองกรณี — `["sheetNo"]` และ `["batchId","sequence"]` (partial unique จาก raw SQL
ก็รายงานเป็นคอลัมน์ ไม่ใช่ชื่อ index) · `sheetNo` ชน → `SHEET_CONFLICT` ทันที (retry ไม่ช่วย)
· `sequence` ชน → retry · ระบุไม่ได้ → ตรวจว่าเลขใบถูกใช้แล้วหรือไม่ก่อนตัดสิน

**ที่อยู่จริง:** `registerSheet()` ใน `lib/batch/core.ts` · `registerSheetAction()` ใน
`lib/batch/actions.ts` · ฟอร์ม `components/batch/register-sheet-form.tsx` วางในหน้า `/batches`
เดิม (ไม่สร้างหน้าใหม่) · CTA = **"บันทึกแบบสอบถาม"** ไม่พาผู้ใช้เข้า Wizard

**ขอบเขตของรอบนี้ (Owner Decision 2026-08-01):** #R6-F/#R6-G ทำให้ Batch **เป็น Optional**
และมี **Minimum Sheet Registration** เท่านั้น — **ไม่ใช่การสร้าง Batch Management Module**

**Future Enhancement (แยกออกจากรอบนี้ — ห้าม implement โดยไม่มีคำสั่งใหม่):**

| # | รายการ | เหตุผลที่เลื่อน |
|---|---|---|
| FE-1 | `linkSheetToBatch` / `unlinkSheetFromBatch` (ผูก/ถอดใบภายหลัง) | เป็นงานบริหารปึก ไม่ใช่เงื่อนไขของการคีย์ข้อมูล |
| FE-2 | Candidate Panel (รายการใบนอกปึกให้เลือกผูก) | UI ของ FE-1 |
| FE-3 | Batch Reconciliation (`recountBatch` / `reconcileBatchCounters`) | Drift ของตัวนับเกิดจากการย้ายใบ (FE-1) เท่านั้น ตัวนับปัจจุบันเพิ่ม/ลดทีละ 1 ในทรานแซกชันเดียวกับการเขียนจริง |
| FE-4 | Drag-and-drop · Bulk reassignment · หน้าจัดการใบแยกต่างหาก | ไม่มีความจำเป็นเชิงธุรกิจในรอบนี้ |

ข้อผูกพันที่ยังมีผลเมื่อทำ FE-1 ในอนาคต: ผูก/ถอดปึก **ห้ามเปลี่ยนชุมชนของใบ** ·
ผูกได้เฉพาะชุมชนเดียวกัน (`COMMUNITY_MISMATCH`) · ถอดใบ **ห้ามลบใบหรือ Household** ·
ต้องเคลียร์ `batchId`/`sequence` พร้อมกันตาม CHECK #R6-42

---

## 7. ข้อจำกัดเพิ่มเติมจากรอบ 2 (บังคับใช้)

11. **รหัสชุมชนไม่ผูกตำบล** — ใช้ TK01/PM01/KS01/PW01/NK01 (อักษรย่อชื่อชุมชน)
12. **ห้ามเดารหัสพื้นที่** — `UNVERIFIED` จนกว่ายืนยันจากกรมการปกครอง; ห้าม Seed Production พื้นที่ก่อนยืนยัน
13. **Better Auth ล็อก `1.6.23`** — ห้าม `latest`; Prisma จัดการ Migration; RBAC ใช้ของระบบเอง
14. ~~**Encryption: ได้ design แต่ยังห้าม implement**~~ — **ยกเลิกโดย R5 (2026-07-23)**: อนุมัติ App-layer AES-256-GCM + key ใน server env + blind index เบอร์โทร; พิกัดเก็บตรงตามดีไซน์ GIS — รายละเอียดและขั้นตอนสำรอง key ใน [28-encryption-key-management.md](28-encryption-key-management.md)
15. **พิกัดรายบ้าน = อ่อนไหว (L3)** — Public ห้ามคืนพิกัดรายบ้าน/PII/สุขภาพ

---

## เอกสารที่เกี่ยวข้อง

- [14-open-questions.md](14-open-questions.md) — คำถามที่ปรับสถานะตามคำตัดสินนี้
- [17-approved-schema-change-spec.md](17-approved-schema-change-spec.md) — สเปกการแก้ Schema (5 กลุ่ม)
- [18-pre-migration-checklist.md](18-pre-migration-checklist.md) — เงื่อนไขทั้งหมดก่อน Migration แรก
- [15-database-fix-plan.md](15-database-fix-plan.md) — แผนแก้ไขฉบับเต็ม (FIX-01..49)
