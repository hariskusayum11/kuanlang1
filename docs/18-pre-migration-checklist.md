# 18 — Pre-Migration Checklist (เงื่อนไขก่อน Migration แรก)

> **วัตถุประสงค์:** ระบุ **ทุกเงื่อนไข** ที่ต้องผ่านก่อนสร้าง/รัน Migration แรก และก่อน Seed / เก็บข้อมูลจริง
> **ฐานอ้างอิง:** [16-owner-decisions.md](16-owner-decisions.md) (รอบ 1 #1..16 + รอบ 2 R2-#1..9), [17-approved-schema-change-spec.md](17-approved-schema-change-spec.md), [14-open-questions.md](14-open-questions.md)
> **🟢 สถานะจริง (อัปเดต 2026-07-21):** `schema.prisma` **v3.1 แก้แล้ว** (Gate B) · `prisma validate` **ผ่าน** · Unit tests **23/23 ผ่าน** · `tsc --noEmit` **ผ่าน** · Package ติดตั้งแล้ว (`better-auth 1.6.23`, `prisma 5.22.0`) · **Conflict A+B แก้แล้ว, D HALT** (ดู `docs/20`)
> **🔴 ยังค้าง:** ยังไม่มี real `prisma/migrations/` (มีแค่ draft) · ยังไม่มี `.env` / Development Database · ยังไม่ Apply Migration
> **📌 หมายเหตุ:** ข้อความ "รอบนี้ยังไม่แก้ schema" ในเวอร์ชันเดิมของไฟล์นี้ **ล้าสมัย** — ดูสถานะจริงฉบับเต็มที่ [19-current-project-status.md](19-current-project-status.md)

---

## 0. หลักการแบ่งด่าน (Gates)

> **ข้อค้นพบสำคัญ:** หลังคำตัดสินรอบ 2 — **DDL Migration แรก (สร้างตาราง) แทบไม่มี Blocker เหลือ**
> สิ่งที่ยังเปิด (รหัสพื้นที่, PDPA, Encryption, Risk BR) **ไม่บล็อกการสร้างตาราง** แต่บล็อก **Seed Production / เก็บข้อมูลจริง / Feature logic**

| ด่าน | ครอบคลุม | บล็อกอะไร |
|---|---|---|
| **Gate A** | Decision & Document | ทุกอย่าง (ต้องเสร็จก่อน) |
| **Gate B** | Schema Edit + Validate | DDL Migration |
| **Gate C** | Migration Mechanics | DDL Migration |
| **Gate D** | Better Auth Alignment | DDL Migration (ตาราง Auth) |
| **Gate E** | Seed — Master Data + ชุมชน | Seed (บางส่วนพร้อม) |
| **Gate F** | Seed — Production พื้นที่ | 🔴 **รอรหัสพื้นที่ (Q-24)** |
| **Gate G** | เก็บข้อมูลจริง | 🔴 **รอ PDPA (Q-04)** |
| **Gate H** | Encryption Implementation | 🔴 **รอ Key Mgmt + PDPA** |
| **Gate I** | Risk Engine | 🔴 **รอ Business Rule (Q-03)** |
| **Gate J** | Verification Tests | หลัง Migration |

---

## Gate A — Decision & Document (ต้องเสร็จก่อนเริ่ม)

- [x] คำตัดสินรอบ 1 (16 ข้อ) บันทึกใน `docs/16`
- [x] คำตัดสินรอบ 2 (R2-#1..9) บันทึกใน `docs/16` ส่วนที่ 6
- [x] `docs/14` ปรับสถานะ Q-19, Q-21 (ปิด), Q-20 (ได้แนวทาง), Q-24 (UNVERIFIED)
- [x] `docs/17` จัดกลุ่ม Schema Changes เป็น 5 กลุ่ม
- [ ] เจ้าของระบบรับรอง `docs/16` เป็นทางการ (ลงนาม/ยืนยัน)
- [ ] ทีมพัฒนาเข้าใจตรงกัน: **ห้ามแก้รหัสพื้นที่โดยเดา** และ **ห้าม implement Encryption/Risk formula**

---

## Gate B — Schema Edit + Validate (บล็อก DDL Migration)

> ดำเนินการเฉพาะรายการ **APPROVED_TO_IMPLEMENT + STRUCTURE_ONLY** ใน [17](17-approved-schema-change-spec.md)

- [ ] `git commit` สำรองก่อนแก้ Schema (CLAUDE.md บังคับ) — *schema v3.1 ถูกรวมใน commit `b62957a` "Initial project setup" แล้ว*
- [x] Enum: `RESCUE_VOLUNTEER` → `VOLUNTEER` *(ยืนยันด้วย test: มี `VOLUNTEER` ไม่มี `RESCUE_VOLUNTEER`)*
- [~] Enum ใหม่: `SurveyorRiskLevel`, `PregnancyUnit`, `VolunteerApprovalStatus`, `CompareMode`, status enums ✅ · **`EvacuationSiteType` HALT** (Conflict D — อนุมัติให้สร้างแต่ไม่มีค่า enum ในเอกสาร; รอเจ้าของยืนยัน — ดู `docs/20` §6)
- [x] Model ใหม่: `CommunityTambon`, `CommunityBoundary`, `VolunteerProfile`(+Skill), `EmergencyContact`, `UserAreaScope`, `IncidentCommunity`, `CriticalFieldConfig`
- [x] `Community`: ลบ `tambonId`/`targetHouseholds` → เพิ่ม `totalHouseholds Int?` + `targetCoveragePercent Float @default(60)` + metadata
- [x] `Household`: เพิ่ม `communityNameOnPaper`, `coordinateRawText`, `hasNoResources`, `volunteerNotAvailable`, `assistanceTotalPersonCount`; ลบ `@@unique([houseNo,mooId,tambonId])`; 🔒 `latitude`/`longitude` (Decimal)
- [x] `FloodRiskProfile`: ลบ `riskScoreAuto` → เพิ่ม `rawScore`/`maximumPossibleScore`/`normalizedScore`; `floodDepthMetersRaw`/`CmRaw`; `SurveyorRiskLevel?` **(ไม่มี logic จัดระดับ — ยืนยันด้วย test)**
- [x] `PersonVulnerability`: เพิ่ม `pregnancyRawText`/`pregnancyUnit`/`pregnancyValue`
- [x] FK relation ที่ขาด + Unique ที่ขาด + `createdAt`/`updatedAt` + `deletedAt` soft-delete
- [x] `onDelete: Cascade` → `Restrict`
- [x] Comment v2.0 → v3.0 (รวม `DATA_ENTRY`, `ConfidentialityAgreement`)
- [x] **ห้ามเพิ่ม:** `RiskWeightVersion`, `RiskHardRule`, `absoluteScore`, Confidence, ciphertext/blind-index columns *(ยืนยันไม่มี)*
- [x] `npx prisma format` ผ่าน
- [x] `npx prisma validate` ผ่าน *(ด้วย dummy `DATABASE_URL` — validate ไม่ต่อ DB)*

---

## Gate C — Migration Mechanics (บล็อก DDL Migration)

- [x] `datasource` มี `extensions = [postgis, pg_trgm]` *(Conflict B — validate ผ่าน; ดู `docs/20`)*
- [x] PostGIS columns ใช้ `Unsupported("geography(...)")` — **ไม่ให้เกิด Drift** *(Conflict A — Household.location, EvacuationSite.location = Point; CommunityBoundary.geom = MultiPolygon; ดู `docs/20`)*
- [ ] Migration แยกลำดับ: `0001_init` → `0002_postgis_columns` → `0003_functions_triggers` → `0004_constraints` → `0005_indexes` → `0006_views`
- [ ] Constraint ทั้งหมดห่อ `DO $$ IF NOT EXISTS` (Idempotent — SQL-03)
- [ ] View ทุกตัว `DROP VIEW IF EXISTS` ก่อน CREATE (SQL-10)
- [ ] Trigger `check_different_entry_person` อยู่ใน `0003`
- [ ] `update_batch_counts` รองรับ INSERT/DELETE/ย้าย Batch
- [ ] `prevent_audit_modification` ใช้ `RETURN OLD` (ไม่ใช่ `RETURN NULL`)
- [ ] **ห้าม** เปิด Retention DELETE (รอ PDPA)
- [ ] `database/drafts/00_postgis_extensions.sql` ทำเครื่องหมาย "ห้ามรันมือ" (เก็บอ้างอิง)
- [ ] รัน Migration **2 ครั้งติดกัน** → ไม่ Error
- [ ] `prisma migrate dev` หลัง migrate → **ไม่มี Drift**

---

## Gate D — Better Auth Alignment (บล็อก DDL Migration — ตาราง Auth)

> ⚠️ **รอบนี้ยังห้ามติดตั้ง Package** — รายการนี้ทำเมื่อสร้างโปรเจกต์จริง

- [ ] `package.json` ล็อก `better-auth` = **`1.6.23`** (exact — **ห้าม `^` / `latest`**)
- [ ] ใช้ **Prisma Adapter**
- [ ] รัน `npx @better-auth/cli generate` → **เปรียบเทียบ**กับ `schema.prisma` (ไม่ใช่ให้ CLI จัดการ migration)
- [ ] Reconcile ตาราง Auth (`User`/`Session`/`Account`/`Verification`) ให้ตรง v1.6.23
- [ ] ตัดสินตาราง 2FA / lockout ตามที่ v1.6.23 ต้องการ
- [ ] **RBAC ใช้ `UserRole` + `UserCommunityScope` ของระบบเอง** — ไม่ใช้ Admin Plugin เป็น RBAC หลัก
- [ ] **Prisma Migration เป็นผู้จัดการ Migration จริง** (ไม่ใช่ Better Auth CLI)

---

## Gate E — Seed: Master Data + ชุมชน (บางส่วนพร้อม)

- [ ] แยก `seeds/production/` + `seeds/development/` + Guard `NODE_ENV`
- [ ] **รหัสชุมชน:** `TK01`(ท่าเคียน), `PM01`(ประสานมิตร), `KS01`(ควนสันติ), `PW01`(ปลักหว้า), `NK01`(หน้าควน)
- [ ] ลบชุมชนตัวอย่าง `KL01/KL02/KL03/HY01/HY02` (เพิ่มขั้นตอนลบ — upsert ไม่ลบให้)
- [ ] `CommunityTambon`: ควนสันติ = 2 แถว (ควนลัง + หาดใหญ่), `isPrimary = false` ทั้งคู่
- [ ] `totalHouseholds = null` ทั้ง 5 ชุมชน (ห้าม 600, ห้าม 0)
- [ ] `targetCoveragePercent = 60`
- [ ] `exportWarningCoveragePercent = 80` ใน `SystemSetting` (Config แยก)
- [ ] Master Data 7 ชุด ตรงกระดาษ + แก้ Comment "9 ประเภทอาสา" → 8
- [ ] ลบ `HAT_YAI_*` bbox → `COORD_BOUNDS_COUNTRY`
- [ ] **ห้าม Seed:** น้ำหนัก Risk (115), `CriticalFieldConfig` content (รอ Q-13)

---

## Gate F — Seed: Production พื้นที่ 🔴 (รอรหัสพื้นที่ — Q-24 / R2-#3)

> **บล็อก Seed Production พื้นที่ — ไม่บล็อก DDL Migration**

- [ ] ตรวจรหัสพื้นที่กับ **Dataset กรมการปกครอง (TIS-1099)**
- [ ] ยืนยัน Province `90` (สงขลา) — ปัจจุบัน UNVERIFIED (สอดคล้องมาตรฐาน)
- [ ] แก้/ยืนยัน District หาดใหญ่ — `9001` **น่าจะผิด** (`9001`≈เมืองสงขลา; หาดใหญ่≈`9011`) — **ห้ามแก้โดยเดา**
- [ ] ยืนยัน Tambon ควนลัง/หาดใหญ่ (ผูกกับรหัสอำเภอที่ถูก)
- [ ] ยืนยันจำนวนหมู่จริง (ปัจจุบันเป็น "ตัวอย่าง")
- [ ] เพิ่ม Validation: `Tambon.code` ขึ้นต้นด้วย `District.code`; `District.code` ขึ้นต้นด้วย `Province.code`
- [ ] จนกว่ายืนยัน: ทำเครื่องหมายทุกรหัสเป็น `UNVERIFIED` — **ห้าม Seed Production พื้นที่**

> **หมายเหตุ:** หากจำเป็นต้องรัน Migration + ทดสอบก่อนได้รหัสจริง → ใช้ **development seed** (ข้อมูลสังเคราะห์) เท่านั้น — **ห้ามใช้เป็น Production**

---

## Gate G — เก็บข้อมูลจริง 🔴 (รอ PDPA — Q-04 / R2-#6)

> **legal BLOCKER — ต้องปิดก่อนเก็บข้อมูลจริง (ไม่ใช่ก่อน Migration)**

- [ ] นิติกรยืนยันฐานทางกฎหมายสำหรับข้อมูลสุขภาพ (ม.26)
- [ ] ใบ Consent ได้รับการรับรองจากนิติกร (ปัจจุบันเป็น "ร่าง")
- [ ] กำหนดว่า `ConsentStatus.UNKNOWN` ใช้ทำอะไรได้ (Risk/Dashboard/Export/ฉุกเฉิน)
- [ ] กำหนดผลของ `withdrawnAt` (ถอน Consent แล้วเกิดอะไร)
- [ ] ส่วนที่ 5 (โครงการแก้จน) — Consent แยกวัตถุประสงค์
- [ ] Public API/View **ไม่คืน PII / ข้อมูลสุขภาพ / พิกัดรายบ้าน** (R2-#5)

---

## Gate H — Encryption Implementation 🔴 (รอ Key Mgmt + PDPA — Q-20 / R2-#5)

> **มี design แล้ว — ยังห้าม implement**

- [ ] Key Management พร้อม (จัดเก็บ/หมุน Key อย่างปลอดภัย)
- [ ] PDPA ยืนยัน (Gate G)
- [ ] Implement AES-256-GCM สำหรับเบอร์โทร + ข้อมูลสุขภาพ
- [ ] Blind Index HMAC-SHA256 สำหรับค้นหา Exact (เบอร์โทร)
- [ ] ชื่อ + ค้นหา Fuzzy: **ไม่เข้ารหัส App** — RBAC + Query Scope + Audit + DB/Disk Encryption
- [ ] เพิ่มคอลัมน์ ciphertext/blind-index (ทำได้เฉพาะเมื่อ Gate นี้ผ่าน)
- [ ] **ห้ามทำก่อน Gate นี้:** เพิ่มคอลัมน์ encryption, ลบ 🔒, อ้างว่าเข้ารหัสแล้ว

---

## Gate I — Risk Engine 🔴 (รอ Business Rule — Q-03 / #14 / R2-#7,9)

- [ ] ได้ Business Rules (BR-15..22 Risk, BR-40..55 การคีย์, BR-01..14 จัดเก็บ) หรือเขียนใหม่ + รับรอง
- [ ] รับรองน้ำหนัก 12 ปัจจัย (115) + ที่มา (Q-29)
- [ ] รับรอง Threshold LOW/MEDIUM/HIGH/CRITICAL (Q-26)
- [ ] ตัดสินสูตรจัดระดับ (`absoluteScore` vs `normalizedScore`) — ยกประเด็น RISK-02 (Q-25)
- [ ] ตัดสิน Confidence formula (Q-28)
- [ ] ตัดสิน Hard Rules (ติดเตียง/ฟอกไต → ≥HIGH)
- [ ] ตัดสินการตีความ `NO_VEHICLE`/`NO_DIGITAL_CHANNEL` (Q-27)
- [ ] **ก่อนผ่าน Gate นี้:** มีแค่ 3 คอลัมน์คะแนน (NULL) — **ห้ามมี logic กำหนดระดับ (R2-#9)**

---

## Gate J — Verification Tests (หลัง Migration)

- [ ] Migration idempotency (รัน 2 ครั้ง)
- [ ] `rawScore = 115` บันทึกได้ (ck ไม่ปฏิเสธ) — RISK-01
- [ ] `memberCount = 500` บันทึกได้ (โรงเรียน) — SQL-12
- [ ] Trigger `check_different_entry_person` ปฏิเสธคนเดียวกันคีย์ 2 รอบ — SCH-03
- [ ] Batch Trigger ถูกต้อง INSERT/DELETE/ย้าย
- [ ] `v_community_coverage` คืน **NULL** เมื่อ `totalHouseholds IS NULL` (ไม่ใช่ 0)
- [ ] เกณฑ์ผ่าน Coverage `> 60` (60 พอดี = ไม่ผ่าน)
- [ ] Seed idempotency (รัน 3 ครั้ง ผลเหมือนเดิม)
- [ ] ไม่มี `RESCUE_VOLUNTEER` / `targetHouseholds` / 600 / 3,000 เหลือ
- [ ] ควนสันติ 2 แถว `CommunityTambon`, `isPrimary` false ทั้งคู่
- [ ] รหัสชุมชน = TK01/PM01/KS01/PW01/NK01

---

## สรุป: อะไรบล็อก / ไม่บล็อก Migration แรก

### 🟢 ไม่บล็อก DDL Migration แรก (ดำเนินการได้)

- รหัสพื้นที่ UNVERIFIED (ใช้ dev seed ทดสอบได้)
- PDPA / Consent (ตารางสร้างได้ นโยบายตามภายหลัง)
- Encryption (คอลัมน์ plaintext + 🔒; encryption columns เพิ่มภายหลัง)
- Risk formula (3 คอลัมน์ NULL; ไม่มี logic)

### 🔴 บล็อก DDL Migration แรก (ต้องผ่านก่อน)

- **Gate B** — Schema edit + `prisma validate`
- **Gate C** — Migration mechanics (no drift, idempotent, ordering)
- **Gate D** — Better Auth 1.6.23 alignment (ตาราง Auth) — **ต้องติดตั้ง Package ก่อน (รอบนี้ยังห้าม)**

### 🔴 บล็อกขั้นถัดไป (ไม่ใช่ DDL)

| ขั้น | Gate ที่ต้องผ่าน |
|---|---|
| Seed Production พื้นที่ | **Gate F** (Q-24) |
| เก็บข้อมูลจริง | **Gate G** (Q-04 PDPA) |
| Encryption ทำงาน | **Gate H** (Key Mgmt + PDPA) |
| Risk Engine ทำงาน | **Gate I** (Q-03 BR) |

---

## ยืนยันขอบเขตรอบนี้

- 🔴 **ไม่แก้** `schema.prisma`, `seed.ts`, `00_postgis_extensions.sql`
- 🔴 **ไม่สร้าง** Migration
- 🔴 **ไม่ติดตั้ง** Package (เวอร์ชัน Better Auth `1.6.23` บันทึกไว้เพื่อดำเนินการภายหลัง)
