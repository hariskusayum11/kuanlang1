# 11 — Requirement Traceability Matrix (RTM)

> ตอบภารกิจที่ 11 — เชื่อมโยง Requirement → Business Rule → แบบสอบถาม → Database → API → UI → Role → Privacy → Test → Phase → Status

## คำอธิบายคอลัมน์

| คอลัมน์ | ความหมาย |
|---|---|
| **Req ID** | รหัส Requirement จาก `docs/system-analysis.md` |
| **BR** | Business Rule ที่เกี่ยวข้อง (⚠️ = ไม่มีข้อความจริง — ดู GAP-D01) |
| **แบบสอบถาม** | ส่วน/ข้อ ใน `questionnaire.pdf` |
| **DB Model.Field** | Prisma Model และ Field |
| **API/Action** | Endpoint หรือ Server Action |
| **UI Page** | หน้าจอ |
| **Role** | ผู้มีสิทธิ์ |
| **Privacy** | L1 (สาธารณะ) / L2 (ภายใน) / L3 (PII) / L4 (อ่อนไหวสูงสุด) |
| **Test** | ประเภท Test ที่ต้องมี |
| **Phase** | Phase ตาม [13-implementation-plan.md](13-implementation-plan.md) |
| **Status** | สถานะปัจจุบัน |

## สถานะ (Status)

| สัญลักษณ์ | ความหมาย |
|---|---|
| 🔴 **BLOCKED** | มี BLOCKER ขวางอยู่ — เริ่มไม่ได้ |
| 🟠 **GAP** | Schema/Seed/SQL ยังไม่รองรับ |
| 🟡 **PARTIAL** | รองรับบางส่วน |
| 🟢 **READY** | Schema พร้อม — เริ่มพัฒนาได้ |
| ⚪ **NOT_STARTED** | ยังไม่มีอะไรเลย (ทุกอย่างอยู่ในสถานะนี้ในเชิงโค้ด — ยังไม่มี Next.js Project) |

> ⚠️ **หมายเหตุสำคัญ:** ปัจจุบัน **ยังไม่มีโค้ดใดๆ** ในโปรเจกต์ (มีเพียง `CLAUDE.md`, `docs/`, `prisma/`, `database/`)
> คอลัมน์ Status จึงหมายถึง **"ความพร้อมของ Schema/Design ที่จะเริ่มพัฒนา"** ไม่ใช่ "พัฒนาไปแล้วเท่าไร"

---

## 1. Public Portal (M00)

| Req ID | Requirement | BR | แบบสอบถาม | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FR-PUB-01 | หน้า Landing สาธารณะไม่ต้อง Login | BR-67 | — | — | — | `/(public)/page.tsx` | PUBLIC | L1 | E2E, Perf(3G) | 13 | 🟢 READY |
| FR-PUB-02 | แสดงแผนที่จุดอพยพ + ชื่อ/ที่อยู่/ความจุ | — | — | `EvacuationSite.*` | `GET /api/public/evacuation-sites` | `/(public)/evacuation` | PUBLIC | L1 | E2E, Integration | 13 | 🟡 PARTIAL¹ |
| FR-PUB-03 | แสดงเบอร์ฉุกเฉิน | — | — | ❌ **ไม่มี Model** | `GET /api/public/emergency-contacts` | `/(public)/emergency` | PUBLIC | L1 | E2E | 13 | 🟠 **GAP-R02** |
| FR-PUB-04 | แสดงสถานะเหตุการณ์ปัจจุบัน | — | — | `Incident.status/severity` | `GET /api/public/incident-status` | `/(public)/page.tsx` | PUBLIC | L1 | E2E | 14 | 🟡 PARTIAL² |
| FR-PUB-05 | สถิติรวมชุมชน (Aggregate เท่านั้น) | BR-67 | — | `v_public_community_stats` ⭐ใหม่ | `GET /api/public/stats` | `/(public)/page.tsx` | PUBLIC | L1 | Integration(no-PII) | 13 | 🟠 GAP |
| FR-PUB-06 | Heatmap ความเสี่ยงระดับ Grid | BR-66/67 | — | `v_public_risk_grid` ⭐ใหม่ | `GET /api/public/risk-heatmap` | `/(public)/page.tsx` | PUBLIC | L1 | Integration(k≥5) | 13 | 🟠 GAP |
| FR-PUB-07 | หน้าคำแนะนำฉุกเฉิน | — | — | (Static content) | — | `/(public)/emergency` | PUBLIC | L1 | E2E | 13 | 🟢 READY |
| FR-PUB-08 | ลิงก์สมัครอาสาสมัคร | — | — | — | — | `/(public)/volunteer/register` | PUBLIC | L1 | E2E | 13 | 🔴 **GAP-R01** |
| FR-PUB-09 | ลิงก์เจ้าหน้าที่เข้าระบบ | — | — | — | — | `/(auth)/login` | PUBLIC | L1 | E2E | 3 | 🟢 READY |
| FR-PUB-10 | Cache ได้ / CDN | — | — | — | ISR revalidate 5 นาที | — | PUBLIC | L1 | Perf(spike) | 13 | 🟢 READY |
| FR-PUB-11 | **ห้ามแสดง PII ใดๆ** | BR-67 | — | View ที่ Aggregate แล้ว | ทุก `/api/public/*` | ทุกหน้า Public | PUBLIC | L1 | 🔴 **Security** | 13 | 🟠 GAP |
| FR-PUB-12 | Jitter ±50m **หรือ** Grid | BR-66 | — | `v_public_risk_grid` | `GET /api/public/risk-heatmap` | — | PUBLIC | L1 | 🔴 Security | 13 | 🔴 **AMB-01** |
| FR-PUB-13 | Responsive ≥320px | NFR-U-03 | — | — | — | ทุกหน้า Public | PUBLIC | L1 | E2E(mobile) | 13 | 🟢 READY |
| FR-PUB-14 | โหลด ≤2 วิ บน 3G | NFR-PUB-01 | — | — | — | `/(public)/page.tsx` | PUBLIC | L1 | 🔴 Perf | 13 | 🟢 READY |
| FR-PUB-15 | ปุ่ม SOS (เฟสถัดไป) | — | — | ❌ ไม่มี | — | — | PUBLIC | L1 | — | 16+ | ⚪ Future |

¹ `EvacuationSite` มี Model ✅ แต่ **ไม่มีข้อมูลใน Seed เลย** → หน้า Public จะว่างเปล่า และกระทบ `FAR_FROM_EVAC` (RISK-11)
² `Incident` มี Model ✅ แต่ `affectedCommunities String[]` ไม่มี FK (SCH-21)

---

## 2. Volunteer Management (M19)

| Req ID | Requirement | BR | แบบสอบถาม | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FR-VOL-01 | หน้าสมัครอาสาสมัครสาธารณะ | BR-68 | — | ❌ `VolunteerProfile` | `POST /api/public/volunteer/register` | `/(public)/volunteer/register` | PUBLIC | L3 | E2E | 13 | 🔴 **GAP-R01** |
| FR-VOL-02 | กรอกชื่อ/เบอร์/อีเมล/ชุมชน/รหัสผ่าน | — | — | ❌ `VolunteerProfile` | ↑ | ↑ | PUBLIC | L3 | Integration | 13 | 🔴 GAP-R01 |
| FR-VOL-03 | เลือกความเชี่ยวชาญจาก **8 ด้าน** | — | ส่วน 4 ข้อ 4 | `VolunteerSkillType` ✅ + ❌ `VolunteerProfileSkill` | ↑ | ↑ | PUBLIC | L2 | Unit | 13 | 🟡 PARTIAL |
| FR-VOL-04 | ระบุอุปกรณ์ที่มี | — | — | ❌ ไม่มี | ↑ | ↑ | PUBLIC | L2 | — | 13 | 🟠 GAP |
| FR-VOL-05 | ยอมรับ PDPA + ข้อตกลง | BR-68 | — | ❌ `VolunteerProfile.pdpaAcceptedAt` | ↑ | ↑ | PUBLIC | L3 | Integration | 13 | 🟠 GAP |
| FR-VOL-06 | **รอ Admin อนุมัติก่อน Login** | **BR-68** | — | ❌ `VolunteerProfile.status` | `POST /api/admin/volunteers/:id/approve` | `/admin/volunteers` | COORD, ADMIN | L3 | 🔴 Security | 13 | 🔴 GAP-R01 |
| FR-VOL-07 | แจ้งผลอนุมัติทางอีเมล | — | — | `Notification` ✅ | — | — | — | L3 | Integration | 14 | 🟡 PARTIAL |
| FR-VOL-08 | ดูข้อมูลชุมชนตาม Permission | BR-64 | — | `v_public_community_stats` | `GET /api/volunteer/community` | `/volunteer/community` | VOLUNTEER | L2 | 🔴 Security | 13 | 🟠 GAP |
| FR-VOL-09 | โปรไฟล์แก้ไขได้ | — | — | ❌ `VolunteerProfile` | — | `/profile` | VOLUNTEER | L3 | E2E | 13 | 🟠 GAP |
| FR-VOL-10 | ทะเบียนอาสาสมัคร แยกตามด้าน/ชุมชน | — | — | ❌ `VolunteerProfile` | — | `/admin/volunteers` | OFFICER, ADMIN | L3 | Integration | 13 | 🟠 GAP |

---

## 3. Authentication & Authorization (M01)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-AUTH-01 | Email/Password ผ่าน Better Auth | — | `User`, `Session`, `Account`, `Verification` | `POST /api/auth/[...all]` | `/(auth)/login` | ทุก Role | L3 | Integration | 3 | 🟡 **SCH-09** |
| FR-AUTH-02 | สมัครอาสาสมัคร → รออนุมัติ | BR-68 | ❌ `VolunteerProfile` | ↑ | `/(public)/volunteer/register` | PUBLIC | L3 | 🔴 Security | 13 | 🔴 GAP-R01 |
| FR-AUTH-03 | สมัครเจ้าหน้าที่คีย์ โดย Admin แต่งตั้ง | — | `User` + `UserRole` ✅ | — | `/admin/users` | ADMIN | L3 | Integration | 3 | 🟢 READY |
| FR-AUTH-04 | **RBAC 9 บทบาท + Public** | — | `UserRoleEnum` | — | — | ทุก Role | — | 🔴 Unit(ทุก Role) | 3 | 🔴 **SCH-05** |
| FR-AUTH-05 | 2FA สำหรับ Admin | — | ❌ ไม่มีตาราง `twoFactor` | — | `/profile` | ADMIN | L3 | Integration | 16 | 🟠 SCH-09 |
| FR-AUTH-06 | Auto-logout 30 นาที + ปลด Lock | — | `Session.expiresAt` ✅ + `release_expired_locks()` | — | — | ทุก Role | — | Integration | 3 | 🟡 **SQL-05** |
| FR-AUTH-07 | รีเซ็ตรหัสผ่านผ่านอีเมล | — | `Verification` ✅ | `POST /api/auth/[...all]` | `/(auth)/forgot-password` | ทุก Role | L3 | E2E | 3 | 🟢 READY |
| FR-AUTH-08 | **DATA_ENTRY เห็นเฉพาะใบที่ Lock** | **BR-58** | `PaperSheet.lockedById/lockExpiresAt` | ทุก API | — | DATA_ENTRY | L3 | 🔴 **Security** | 3 | 🟡 **SCH-11** |
| FR-AUTH-09 | **VOLUNTEER เห็น Aggregate** | **BR-64** | — | ทุก API | — | VOLUNTEER | L2 | 🔴 Security | 13 | 🟠 GAP |
| FR-AUTH-10 | VOLUNTEER เห็น PII เฉพาะ Incident+มอบหมาย | **BR-65** | `RescueTask.assignedToId` | — | `/my-tasks` | VOLUNTEER | L4 | 🔴 Security | 14 | 🟠 **SCH-12** |
| FR-AUTH-11 | ลงนามข้อตกลงรักษาความลับก่อนคีย์ใบแรก | BR-59 | `ConfidentialityAgreement` ✅ | — | `/entry` | DATA_ENTRY | — | Integration | 6 | 🟢 READY³ |
| FR-AUTH-12 | ล็อกบัญชีหลังรหัสผิด 5 ครั้ง | — | ❌ ไม่มี | — | `/(auth)/login` | ทุก Role | — | Integration | 16 | 🟠 SCH-09 |

³ Model พร้อม ✅ แต่ Comment ยังเขียนว่า "อาสาสมัคร" ควรเป็น "เจ้าหน้าที่คีย์" (SCH-27)

---

## 4. Batch & Paper Management (M02)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-BAT-01 | สร้าง Batch | — | `PaperBatch.*` ✅ | `POST /api/batches` | `/batches/new` | COORD, ADMIN | L2 | Integration | 5 | 🟢 READY |
| FR-BAT-02 | เลขประจำใบอัตโนมัติ `SHEET-{ชุมชน}-{batch}-{ลำดับ}` | **BR-40** | `PaperSheet.sheetNo @unique` ✅ | `POST /api/batches` | `/batches/:id` | COORD | L2 | Unit | 5 | 🟡 **Q-21**⁴ |
| FR-BAT-03 | พิมพ์สติกเกอร์/รายการเลขใบ | — | `PaperSheet.sheetNo` | — | `/batches/:id/labels` | COORD | L2 | E2E | 5 | 🟢 READY |
| FR-BAT-04 | ติดตามสถานะรายใบ (10 สถานะ) | — | `SheetStatus` (10 ค่า) ✅ | `GET /api/batches/:id` | `/batches/:id` | COORD | L2 | Unit | 5 | 🟢 READY |
| FR-BAT-05 | แสดงใบที่หาย | — | `PaperBatch.receivedCount` vs `expectedCount` | — | `/batches/:id` | COORD | L2 | Integration | 5 | 🔴 **SQL-04**⁵ |
| FR-BAT-06 | ปิด Batch ไม่ได้จนกว่าครบเงื่อนไข | BP-05 | `PaperBatch.status/closedAt` ✅ | `POST /api/batches/:id/close` | `/batches/:id` | COORD | L2 | 🔴 Integration | 5 | 🟡 PARTIAL⁵ |
| FR-BAT-07 | แนบไฟล์สแกนกระดาษ | BR-62 | `PaperBatch.scanPdfUrl` 🔒 | — | `/batches/:id` | COORD | **L4** | Integration | 5 | 🟠 **SCH-08** |
| FR-BAT-08 | Lock ใบ 10 นาที + ปลดอัตโนมัติ | — | `PaperSheet.lockExpiresAt` + `release_expired_locks()` | `POST /api/entry/pickup` | `/entry` | DATA_ENTRY | L2 | 🔴 Integration | 6 | 🟠 **SQL-05** |

⁴ รูปแบบ `SHEET-KL01-001-024` ใช้รหัสชุมชนที่ต้องเปลี่ยน (Q-21) — **และเลขนี้พิมพ์ลงกระดาษจริง เปลี่ยนภายหลังไม่ได้**
⁵ `receivedCount` ไม่มี Trigger คำนวณเลย → FR-BAT-05 แสดงว่า "หายทุกใบ" และ BP-05 ตรวจเงื่อนไขไม่ได้

---

## 5. Data Entry Console (M03)

| Req ID | Requirement | BR | แบบสอบถาม | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FR-ENT-01 | **ฟอร์มเรียงตรงกระดาษ 100%** | — | ทุกส่วน | ทุก Field | — | `/entry/:sheetId` | DATA_ENTRY | L3/L4 | 🔴 E2E | 6 | 🟠 **AMB-05, QM-08** |
| FR-ENT-02 | **คีย์ด้วยคีย์บอร์ดล้วน** | — | — | — | — | ↑ | DATA_ENTRY | — | 🔴 **Keyboard E2E** | 6 | 🟢 READY |
| FR-ENT-03 | Tab order ไหลตามกระดาษ | — | — | — | — | ↑ | DATA_ENTRY | — | 🔴 Keyboard E2E | 6 | 🟢 READY |
| FR-ENT-04 | Checkbox/Radio กดเลข 1-9 หรือ Space | — | — | — | — | ↑ | DATA_ENTRY | — | E2E | 6 | 🟢 READY |
| FR-ENT-05 | Ctrl+Enter = ส่ง, F1 = ช่วยเหลือ | — | — | — | — | ↑ | DATA_ENTRY | — | E2E | 6 | 🟢 READY |
| FR-ENT-06 | **F2 = ILLEGIBLE** | **BR-43** | ทุกช่อง | `FieldStatus.status = ILLEGIBLE` ✅ | — | ↑ | DATA_ENTRY | — | 🔴 E2E | 6 | 🟢 READY |
| FR-ENT-07 | **F3 = BLANK_IN_PAPER** | **BR-42** | ทุกช่อง | `FieldStatus.status = BLANK_IN_PAPER` ✅ | — | ↑ | DATA_ENTRY | — | 🔴 E2E | 6 | 🟢 READY |
| FR-ENT-08 | Auto-save Draft ทุก 10 วินาที | — | — | `EntryAttempt.submittedAt = null`? | `POST /api/entry/:id/draft` | ↑ | DATA_ENTRY | L3 | 🔴 Integration | 6 | 🟡 **AMB-03** |
| FR-ENT-09 | Validate ทันที + ไฮไลต์แดง + Focus กลับ | — | — | (Zod) | — | ↑ | DATA_ENTRY | — | E2E | 6 | 🟢 READY |
| FR-ENT-10 | **Grid Mode ตารางกลุ่มเปราะบาง** | — | ส่วน 2 ข้อ 2 | `VulnerablePerson` ✅ | — | ↑ | DATA_ENTRY | **L4** | E2E | 6 | 🟢 READY |
| FR-ENT-11 | เพิ่มแถวกลุ่มเปราะบางไม่จำกัด | — | ส่วน 2 (5 แถว) | `VulnerablePerson.seq` | — | ↑ | DATA_ENTRY | L4 | Unit | 6 | 🟡 **AMB-04** |
| FR-ENT-12 | แสดงเลขใบค้างจอตลอด | — | — | `PaperSheet.sheetNo` | — | ↑ | DATA_ENTRY | L2 | E2E | 6 | 🟢 READY |
| FR-ENT-13 | Skip Logic: ไม่มีเปราะบาง → ข้ามส่วน 2 | — | ส่วน 2 ข้อ 1 | `Household.hasVulnerable` ✅ | — | ↑ | DATA_ENTRY | — | Unit | 6 | 🟢 READY |
| FR-ENT-14 | **Mini map ข้างช่องพิกัด** | — | ส่วน 1 ข้อ 3 | `latitude/longitude` | — | ↑ | DATA_ENTRY | L3 | E2E | 6 | 🟡 **CONF-06** |
| FR-ENT-15 | เตือนพิกัดนอกขอบเขต/สลับ/ซ้ำ | **BR-03** | ส่วน 1 ข้อ 3 | `SystemSetting.HAT_YAI_*` | `POST /api/entry/validate-coord` | ↑ | DATA_ENTRY | L3 | 🔴 Unit | 6 | 🟠 **SEED-08** |
| FR-ENT-16 | ตรวจซ้ำ (บ้านเลขที่+หมู่+ตำบล) | **BR-01** | ส่วน 1 ข้อ 3 | `Household @@unique` | `POST /api/entry/check-duplicate` | ↑ | DATA_ENTRY | L3 | 🔴 Integration | 6 | 🔴 **QM-03** |
| FR-ENT-17 | จับเวลาคีย์ต่อใบ | — | — | `EntryAttempt.durationSeconds` ✅ | — | ↑ | DATA_ENTRY | L2 | Unit | 6 | 🟢 READY |
| — | **พิกัดค่าดิบจากกระดาษ** | — | ส่วน 1 ข้อ 3 | ❌ `coordinateRawText` | — | ↑ | DATA_ENTRY | L3 | Unit(parser) | 6 | 🟠 **QM-04** |
| — | **ระดับน้ำ 2 ช่อง (ม./ซม.)** | BR-10 | ส่วน 3 ข้อ 3 | ❌ `floodDepthMetersRaw/CmRaw` | — | ↑ | DATA_ENTRY | L2 | Unit | 6 | 🟠 **QM-08** |
| — | **ชื่อชุมชนบนกระดาษ** | — | ส่วน 0 | ❌ `communityNameOnPaper` | — | ↑ | DATA_ENTRY | L2 | Unit | 6 | 🟠 **QM-01** |
| — | **จำนวนคนต้องการช่วยเหลือ (รวม)** | — | ส่วน 2 ข้อ 3 | ❌ `assistanceTotalPersonCount` | — | ↑ | DATA_ENTRY | L4 | Unit | 6 | 🟠 **QM-07** |
| — | **"☐ ไม่มี" ทรัพยากร** | — | ส่วน 3 ข้อ 11 | ❌ `hasNoResources` | — | ↑ | DATA_ENTRY | L2 | Unit | 6 | 🟠 **QM-09** |
| — | **"☐ ไม่สะดวก" อาสาสมัคร** | — | ส่วน 4 ข้อ 4 | ❌ `volunteerNotAvailable` | — | ↑ | DATA_ENTRY | L2 | Unit | 6 | 🟠 **QM-12** |
| — | **อายุครรภ์ (หน่วยไม่ชัด)** | — | ส่วน 2 ข้อ 2 | ❌ `pregnancyRawText/Unit` | — | ↑ | DATA_ENTRY | **L4** | Unit | 6 | 🟠 **QM-06** |
| — | **วันที่สำรวจ พ.ศ./ค.ศ.** | **BR-47** | ส่วน 0 | `Household.surveyedAt` | — | ↑ | DATA_ENTRY | L2 | 🔴 Unit | 6 | 🟡 **QM-02** |

---

## 6. Verification & Discrepancy (M04)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-VER-01 | Double-entry เฉพาะฟิลด์วิกฤต (**ตั้งค่าได้**) | — | ❌ `CriticalFieldConfig` | — | `/admin/critical-fields` | ADMIN | L2 | Unit | 7 | 🔴 **GAP-R03** |
| FR-VER-02 | **Entry 2 ไม่เห็นค่า Entry 1 (Blind)** | — | `EntryAttempt.isBlind` | `POST /api/verify/pickup` | `/verify/:sheetId` | DATA_ENTRY | L3 | 🔴 **Security** | 7 | 🟡 PARTIAL⁶ |
| FR-VER-03 | **Entry 2 ต้องไม่ใช่คนเดิม** | **BR-44** | `EntryAttempt.enteredById` | ↑ | ↑ | DATA_ENTRY | — | 🔴 **Security×2** | 7 | 🔴 **SCH-03** |
| FR-VER-04 | เทียบและระบุจุดที่ไม่ตรงอัตโนมัติ | — | `Discrepancy.*` ✅ | (Discrepancy Engine) | — | — | L3 | 🔴 Unit | 8 | 🟡 PARTIAL⁷ |
| FR-VER-05 | หน้าจอเทียบข้าง-ข้าง + เลือกค่าที่ถูก | — | `DiscrepancyResolution.CHOSE_ENTRY_1/2` ✅ | `POST /api/discrepancies/:id/resolve` | `/discrepancies/:id` | VERIFIER | L3 | E2E | 8 | 🟢 READY |
| FR-VER-06 | อนุญาตค่าที่สาม | — | `CHOSE_OTHER` + `resolvedValue` ✅ | ↑ | ↑ | VERIFIER | L3 | Unit | 8 | 🟢 READY |
| FR-VER-07 | คำนวณ Error Rate รายคน/Batch/ฟิลด์ | — | `EntryStats.errorRate` | `GET /api/stats/entry-throughput` | `/entry-dashboard` | COORD | L2 | Unit | 9 | 🟡 PARTIAL⁸ |

⁶ `isBlind` เป็น Flag ที่ไม่มีผลบังคับ — ต้องพึ่ง App 100% + ต้องมี Integration Test
⁷ `Discrepancy` พร้อม ✅ แต่ **ไม่มี Normalize Rule** → จะเกิด Discrepancy เท็จจำนวนมาก (GAP-R03)
⁸ `EntryStats` ไม่มี FK ไป User (SCH-20)

---

## 7. Coverage & Data Quality (M06, M11)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-CVG-01 | **Coverage Badge ทุกหน้า** | — | ❌ `Community.totalHouseholds` | `GET /api/stats/coverage` | ทุก Dashboard | COORD, OFFICER, EXEC | L2 | Unit | 9 | 🔴 **COV-01/04** |
| FR-CVG-02 | **แผนที่แสดงโซนไม่มีข้อมูลเป็นสีเทา** | — | ❌ `CommunityBoundary` | `GET /api/gis/coverage.geojson` | `/map` | OFFICER | L2 | E2E | 12 | 🟠 GAP |
| FR-CVG-03 | **สถิติทุกตัวต้องมี Denominator** | — | `Community.totalHouseholds` | ทุก stats API | ทุก Dashboard | ทุก Role | L2 | 🔴 Unit | 9 | 🔴 **COV-01** |
| FR-CVG-04 | เตือนเมื่อ Export Coverage <80% | — | `ExportJob.coveragePercent` ✅ | `POST /api/exports` | `/reports` | OFFICER | L2 | Integration | 15 | 🟡 **CONF-03** |
| FR-CVG-05 | **รายงานทุกฉบับต้องมี Coverage Watermark** | — | `ExportJob.coveragePercent` | ↑ | `/reports` | OFFICER | L2 | E2E(PDF) | 15 | 🟡 PARTIAL |
| — | **Survey vs Verified Coverage แยกกัน** | — | ❌ `v_community_coverage` | `GET /api/stats/coverage` | ทุก Dashboard | — | L2 | 🔴 Unit | 9 | 🔴 **COV-04** |
| — | **ห้ามหารด้วยศูนย์ / "ยังคำนวณไม่ได้"** | — | `totalHouseholds Int?` | ↑ | ↑ | — | L2 | 🔴 **Unit(NULL)** | 9 | 🔴 **COV-01** |

---

## 8. Risk Engine (M09)

| Req ID | Requirement | BR | แบบสอบถาม | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FR-RSK-07 | **ห้ามคำนวณ Risk จนกว่า VERIFIED** | **BR-46** | — | `PaperSheet.status` | (Risk Engine) | — | L2 | 🔴 Unit+Integration | 10 | 🟠 **SCH-13** |
| FR-RSK-08 | แสดง Confidence Level เมื่อข้อมูลขาด | **BR-56** | — | `riskConfidence` | — | `/households/:id` | OFFICER | L2 | 🔴 Unit | 10 | 🟠 **RISK-05** |
| FR-RSK-05 | น้ำหนักปรับได้ | — | — | ❌ `RiskWeightVersion` | — | `/admin/risk-config` | ADMIN | L2 | Unit | 10 | 🔴 **RISK-07** |
| — | **Raw/Max/Normalized Score** | — | — | ❌ 4 ฟิลด์ | — | — | — | L2 | 🔴 **Unit** | 10 | 🔴 **RISK-01** |
| — | **Risk Formula Version** | — | — | ❌ `riskFormulaVersion` | — | — | — | L2 | Unit | 10 | 🔴 **RISK-08** |
| — | **Hard Rules (ติดเตียง/ฟอกไต → ≥HIGH)** | — | ส่วน 2 | ❌ `RiskHardRule` | — | `/admin/risk-config` | ADMIN | L4 | 🔴 Unit | 10 | 🟠 **RISK-09** |
| — | Threshold LOW/MEDIUM/HIGH/CRITICAL | — | — | `RiskLevel` (Comment) | — | — | — | L2 | 🔴 Unit(ขอบเขต) | 10 | 🟠 **RISK-03** |
| — | **Triage P1/P2/P3 อิง `surveyedAt`** | **BR-48/57** | ส่วน 2 | `VulnerablePerson.triageBasedOnDate` ✅ | — | `/vulnerable` | OFFICER | L4 | 🔴 Unit | 10 | 🟡 PARTIAL⁹ |
| FR-VUL-08 | **อายุครรภ์คำนวณจาก `surveyedAt`** | **BR-48** | ส่วน 2 ข้อ 2 | `PersonVulnerability.referenceDate` ✅ | — | `/vulnerable/:id` | OFFICER | **L4** | 🔴 Unit | 10 | 🟡 **QM-06** |
| BR-54 | **ห้ามให้คนคีย์ประเมิน Risk เอง** | **BR-54** | ท้ายเล่ม | `riskLevelSurveyor` | — | `/entry/:id` | DATA_ENTRY | L2 | Unit | 6 | 🟠 **AMB-05** |
| BR-19 | Officer ยืนยัน Risk Final | **BR-19** | — | `riskLevelFinal` + `riskLevelOverrideReason` ✅ | — | `/households/:id` | OFFICER | L2 | Integration | 10 | 🟢 READY |

⁹ ฟิลด์ + Comment พร้อม ✅ แต่ **ไม่มี Job คำนวณ `triageStale`** และไม่มีกฎว่าอายุ/เด็ก <5 ปี หมดอายุเมื่อไหร่ (ดู [03](03-questionnaire-database-mapping.md) ข้อ 10)

---

## 9. GIS (M10)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-GIS-15 | ตรวจพิกัดซ้ำเป๊ะ | — | `@@index ix_household_exact_coord` ✅ | `POST /api/entry/validate-coord` | `/entry/:id` | DATA_ENTRY | L3 | Unit | 6 | 🟢 READY |
| FR-GIS-16 | Map แสดงโซนไม่มีข้อมูลเป็นสีเทา | — | ❌ `CommunityBoundary` | `GET /api/gis/coverage.geojson` | `/map` | OFFICER | L2 | E2E | 12 | 🟠 GAP |
| — | GeoJSON + bbox | — | `household.location` (Unsupported) | `GET /api/gis/households.geojson` | `/map` | OFFICER | **L3** | 🔴 Perf(5,000) | 12 | 🟡 **SQL-02/06** |
| — | Spatial Query | — | GIST index ✅ | `POST /api/gis/spatial-query` | `/map` | OFFICER | L3 | Integration | 12 | 🟢 READY |
| — | ขอบเขตชุมชน (MultiPolygon) | — | ❌ `CommunityBoundary.geom` | — | `/map` | OFFICER | L2 | Integration | 12 | 🟠 **SQL-08** |
| — | จุดอพยพใกล้สุด (`ST_DWithin`) | — | `evacuation_site.location` ✅ | — | `/map` | OFFICER | L1 | Unit | 12 | 🟡 PARTIAL¹ |
| NFR-P-02 | Map 5,000 หมุด ≤3 วิ | — | GIST + Partial Index | — | `/map` | OFFICER | L3 | 🔴 Perf | 12 | 🟡 **SQL-16** |

---

## 10. Incident & Rescue (M14)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| UC-21 | ประกาศเหตุการณ์ | — | `Incident.*` ✅ | — | `/incidents/new` | OFFICER, ADMIN | L2 | E2E | 14 | 🟡 **SCH-21** |
| UC-22 | มอบหมายงานให้อาสาสมัคร | — | `RescueTask.assignedToId` ✅ | — | `/incidents/:id` | OFFICER | L4 | Integration | 14 | 🟢 READY |
| UC-23 | รับงานและอัปเดตสถานะ | **BR-65** | `TaskUpdate.*` ✅ | — | `/my-tasks` | VOLUNTEER | **L4** | 🔴 **Security** | 14 | 🟠 **SCH-12** |
| — | **VOLUNTEER เห็น PII เฉพาะ Incident ACTIVE** | **BR-65** | `Incident.status` + `RescueTask.assignedToId` | — | `/my-tasks` | VOLUNTEER | L4 | 🔴 **Security** | 14 | 🟠 **RBAC-07** |
| — | Priority P1–P4 | — | `TriageLevel` (P1-P3) | — | `/incidents/:id` | OFFICER | L4 | Unit | 14 | 🟡 **SCH-15** |

---

## 11. Compliance & Privacy (M18)

| Req ID | Requirement | BR | DB Model.Field | API/Action | UI Page | Role | Privacy | Test | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| BR-23 | ต้องได้ Consent ก่อนบันทึกข้อมูลกลุ่มเปราะบาง | **BR-23** | `ConsentRecord` + `consentStatus` ✅ | — | `/entry/:id` | DATA_ENTRY | L3 | Integration | 6 | 🔴 **GAP-R06** |
| BR-24 | ข้อมูลสุขภาพ ม.26 — **เข้ารหัส** + จำกัดสิทธิ์ | **BR-24** | 🔒 (Comment เท่านั้น) | — | — | — | **L4** | 🔴 **Security** | 16 | 🔴 **SCH-08** |
| BR-26 | ทุกครั้งที่ดู/Export ต้อง Audit | **BR-26** | `AuditLog` ✅ | ทุก API | — | — | L4 | 🔴 Integration | 3+ | 🟡 **SCH-17** |
| BR-27 | ข้อมูล Researcher ต้อง Anonymize | **BR-27** | `ExportJob.isAnonymized` ✅ | `POST /api/exports` | `/reports` | RESEARCHER | L2 | 🔴 Security | 15 | 🟡 PARTIAL |
| BR-28 | สิทธิ์ขอดู/แก้/ลบ — 30 วัน | **BR-28** | `PdpaRequest` | — | `/admin/pdpa` | ADMIN | L3 | Integration | 16 | 🟡 **SCH-20** |
| BR-29 | ห้าม Hard Delete ยกเว้น PDPA | **BR-29** | `Household.deletedAt` (1/49 ตาราง) | — | — | ADMIN | L3 | Integration | 16 | 🟠 **SCH-07** |
| BR-30 | เก็บได้ไม่เกิน 5 ปี | **BR-30** | ❌ ไม่มี Retention | — | — | ADMIN | L3 | Integration | 16 | 🟠 **SQL-09** |
| NFR-S-05 | Audit Log Append-only | — | `prevent_audit_modification()` ✅ | — | `/admin/audit` | ADMIN | L4 | 🔴 Integration | 16 | 🟡 **SQL-09** |

---

## 12. สรุปสถานะ Requirement

| สถานะ | จำนวน | % |
|---|---|---|
| 🔴 **BLOCKED** (มี BLOCKER ขวาง) | 18 | ~21% |
| 🟠 **GAP** (Schema/Seed/SQL ไม่รองรับ) | 26 | ~30% |
| 🟡 **PARTIAL** (รองรับบางส่วน) | 21 | ~24% |
| 🟢 **READY** (พร้อมพัฒนา) | 22 | ~25% |

### Requirement ที่พร้อมพัฒนามากที่สุด (🟢 READY)

**M02 Batch & Paper Management** — FR-BAT-01/03/04 พร้อม (ยกเว้น FR-BAT-05/08)
**M03 Data Entry Console (ส่วน UX)** — FR-ENT-02/03/04/05/06/07/09/10/12/13/17 พร้อม
**M01 Auth (พื้นฐาน)** — FR-AUTH-03/07 พร้อม

### Requirement ที่ติด BLOCKER มากที่สุด

| Module | จำนวน BLOCKED | สาเหตุหลัก |
|---|---|---|
| **M11 Coverage/Dashboard** | 5 | COV-01/04 — ไม่มีฟิลด์ Coverage เลย |
| **M09 Risk Engine** | 5 | RISK-01/07/08 — 115 vs 100, ไม่มี Version |
| **M19 Volunteer** | 3 | GAP-R01 — ไม่มี Model เลย |
| **M04 Verification** | 2 | SCH-03 (SoD), GAP-R03 (Critical Field) |

---

## 13. Requirement ที่ไม่สามารถ Trace ได้

> **⚠️ นี่คือช่องว่างที่ใหญ่ที่สุดของ RTM ฉบับนี้**

| กลุ่ม Requirement | สถานะ | สาเหตุ |
|---|---|---|
| **FR-VUL-01..07** (Vulnerable Registry) | ❌ **Trace ไม่ได้** | เอกสารเขียนว่า "ดู v2.0 sections 6.3-6.12" — **ไม่มีไฟล์** (GAP-D01) |
| **FR-RSK-01..06** (Risk) | ❌ Trace ไม่ได้ | ↑ (มีเพียง FR-RSK-05/07/08 ที่ระบุใน v3.0) |
| **FR-GIS-01..14** | ❌ Trace ไม่ได้ | ↑ (มีเพียง FR-GIS-15/16) |
| **FR-DSH / FR-SRC / FR-RES / FR-INC / FR-NOT / FR-RPT / FR-ADM** | ❌ Trace ไม่ได้ | ↑ |
| **BR-01..BR-14** (กฎการจัดเก็บ) | ❌ Trace ไม่ได้ | "เหมือนเดิม — ดู v2.0" |
| **BR-15..BR-22** (กฎ Risk) | ❌ Trace ไม่ได้ | ↑ |
| **BR-40..BR-55** (กฎการคีย์) | ❌ Trace ไม่ได้ | ↑ |
| **Sitemap รายบทบาท** | ❌ Trace ไม่ได้ | อ้าง `sitemap-navigation.md` — ไม่มีไฟล์ |
| **Appendix ก (Mapping)** | ❌ Trace ไม่ได้ | อ้าง "v2.0 Appendix ก" — ไม่มีไฟล์ |

**ผลกระทบ:** RTM ฉบับนี้ครอบคลุมได้เฉพาะ Requirement ที่มีข้อความจริงในเอกสาร v3.0 (~87 รายการ)
→ **Requirement อีกจำนวนมาก (ประมาณ 60-80 รายการ) ยังไม่มีข้อความให้ Trace**
→ **ต้องได้ไฟล์ v2.0 หรือเขียน BR/FR ขึ้นใหม่ ก่อนที่ RTM จะสมบูรณ์** (ดู Q-03)
