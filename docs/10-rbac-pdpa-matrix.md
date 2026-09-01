# 10 — RBAC และ PDPA Permission Matrix

> ตอบภารกิจที่ 9 — สร้าง Permission Matrix ครบทุก Role และระบุว่าการตรวจสิทธิ์ต้องอยู่ที่ชั้นใด
> **ข้อเสนอ — ยังไม่ implement**

> **ข้อยกเว้นชั่วคราวที่เจ้าของระบบยืนยัน 2026-08-25 และขยาย 2026-08-28:** ผู้ใช้งานจริงตำแหน่งผู้บริหารและแพทย์เป็นบุคคลเดียวกัน จึงให้ Role `EXECUTIVE` เข้าถึงทะเบียนสุขภาพรายบุคคลที่ **ผ่านการตรวจแล้วและไม่ถูกยืนยันว่าเป็นใบซ้ำ** แบบอ่านอย่างเดียว ผ่าน permission `medical.case.view`, `medical.map.view`, `medical.report.export`, `report.personal.export` และต้องบันทึก Audit `READ`/`EXPORT` ทุกครั้ง ห้ามแก้ไข ลบ ตรวจใบ หรือจัดการผู้ใช้ รายงานรายบุคคลต้องระบุให้ชัดว่าชื่อใดเป็นผู้ให้ข้อมูล ผู้ติดต่อ หรือบุคคลกลุ่มเปราะบาง ห้ามอนุมานว่าเป็นบุคคลเดียวกัน ข้อยกเว้นนี้ต้องย้ายออกจาก `EXECUTIVE` เมื่อสร้าง Role แพทย์แยกในอนาคต

---

## 1. Role ที่ใช้ในเอกสารนี้

> ⚠️ **ใช้ `VOLUNTEER` (ไม่ใช่ `RESCUE_VOLUNTEER`)** ตามเอกสาร v3.0 BR-25 — **ต้องได้รับการยืนยันก่อนเริ่ม M01** (ดู CONF-02)

| Role | ระดับ | ขอบเขต | Scope Type |
|---|---|---|---|
| `PUBLIC` | 0 | หน้าสาธารณะ (ไม่ต้อง Login) | — |
| `VOLUNTEER` | 1 | ข้อมูลชุมชน Aggregate + งาน Incident ที่ได้รับมอบหมาย | Community (1 แห่ง) |
| `DATA_ENTRY` | 1 | เฉพาะใบที่ Lock — **ห้าม Query** | Sheet-level (ทีละใบ) |
| `FIELD_SURVEYOR` | 1 | ตอบคำถามกลับเท่านั้น | Query-level |
| `RESEARCHER` | 1 | ข้อมูล Anonymized | Community/Area |
| `VERIFIER` | 3 | ตัดสิน Discrepancy — PII เฉพาะใบที่ตรวจ | Sheet-level |
| `COORDINATOR` | 4 | Batch + Throughput + อนุมัติอาสา | Community/Area |
| `OFFICER` | 4 | จัดการชุมชนที่รับผิดชอบ | Community/Area |
| `EXECUTIVE` | 5 | ทั้งระบบ (อ่านอย่างเดียว + สถิติ) | ทั้งระบบ |
| `ADMIN` | 6 | ทั้งระบบ | ทั้งระบบ |

**สัญลักษณ์ในตาราง:**

| สัญลักษณ์ | ความหมาย |
|---|---|
| ✅ | อนุญาตเต็มที่ (ภายใน Scope ของตน) |
| 🔸 | **อนุญาตแบบมีเงื่อนไข** — ดูเงื่อนไขในหมายเหตุ |
| 📊 | เห็นเฉพาะข้อมูล Aggregate (ไม่เห็นรายบุคคล) |
| 🎭 | เห็นข้อมูล Anonymized/Masked |
| ❌ | ห้าม |
| 📝 | ต้องบันทึก Audit Log ทุกครั้ง |

---

## 2. Permission Matrix

### 2.1 การเข้าถึงข้อมูลครัวเรือนและ PII

| การกระทำ | PUBLIC | VOLUNTEER | DATA_ENTRY | FIELD_SURVEYOR | RESEARCHER | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **ดูข้อมูลครัวเรือน** | ❌ | 📊 | 🔸¹ | 🔸² | 🎭 | 🔸³ | 🔸⁴ | ✅📝 | 📊 | ✅📝 |
| **ดู PII** (ชื่อ, เบอร์, บ้านเลขที่) | ❌ | 🔸⁵📝 | 🔸¹📝 | 🔸²📝 | ❌ | 🔸³📝 | ❌ | ✅📝 | ❌ | ✅📝 |
| **ดูข้อมูลสุขภาพ** (L4) | ❌ | 🔸⁶📝 | 🔸¹📝 | ❌ | ❌ | 🔸³📝 | ❌ | ✅📝 | ❌ | ✅📝 |
| **ดูพิกัดรายบ้าน** | ❌ | ❌ | 🔸⁷ | ❌ | 🎭⁸ | 🔸³ | ❌ | ✅📝 | ❌ | ✅📝 |
| **ค้นหา/Query ข้อมูล** | ❌ | ❌ | **❌**⁹ | ❌ | 🎭 | ❌ | 🔸¹⁰ | ✅📝 | 📊 | ✅📝 |

**เงื่อนไข:**

| # | เงื่อนไข | อ้างอิง |
|---|---|---|
| ¹ | **เฉพาะใบที่ตนเอง Lock อยู่ และ Lock ยังไม่หมดอายุ** — `sheet.lockedById = user.id AND sheet.lockExpiresAt > now()` | BR-58, FR-AUTH-08, NFR-S-06 |
| ² | เฉพาะฟิลด์ที่ปรากฏใน `FieldQuery` ที่มอบหมายให้ตน + สถานะ `SENT` — **ไม่ใช่ทั้งใบ** | Role definition |
| ³ | เฉพาะใบที่มี `Discrepancy` ที่ตนกำลังตัดสิน (`resolution IS NULL`) และตนถูก assign | Role definition |
| ⁴ | **Metadata เท่านั้น** — เลขใบ, สถานะ, Batch, เวลา — **ไม่เห็นเนื้อหาข้อมูล** | เอกสาร 9.2 "🔸Meta" |
| ⁵ | **เฉพาะ Incident Mode + เฉพาะรายที่มอบหมาย** — `incident.status = ACTIVE AND task.assignedToId = user.id AND task.status IN (ASSIGNED, IN_PROGRESS)` | **BR-65**, FR-AUTH-10 |
| ⁶ | เงื่อนไขเดียวกับ ⁵ + **เฉพาะข้อมูลที่จำเป็นต่อภารกิจ** (ไม่ใช่ทั้ง record) | BR-65, CLAUDE.md |
| ⁷ | เฉพาะพิกัดของใบที่ตน Lock — สำหรับ Mini Map (FR-ENT-14) — **ไม่แสดงหมุดบ้านอื่น** | CONF-06 |
| ⁸ | พิกัดต้อง Generalize เป็น Grid — ห้ามพิกัดแม่นยำ | BR-27 |
| ⁹ | **ห้ามเด็ดขาด** — เห็นทีละใบเท่านั้น ไม่มี List/Search/Filter | **BR-58**, NFR-S-06 |
| ¹⁰ | Query ได้เฉพาะ Metadata ของ Batch/Sheet — ไม่ใช่เนื้อหา | เอกสาร 9.2 |

---

### 2.2 การจัดการแบบสอบถามและการคีย์ข้อมูล

| การกระทำ | PUBLIC | VOLUNTEER | DATA_ENTRY | FIELD_SURVEYOR | RESEARCHER | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **สร้าง/แก้ไข Batch** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ❌ | ✅📝 |
| **ปิด Batch** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ❌ | ✅📝 |
| **หยิบงาน (Lock ใบ)** | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🔸¹¹ |
| **คีย์ Entry 1** | ❌ | ❌ | ✅📝 | ❌ | ❌ | 🔸¹² | ❌ | 🔸¹² | ❌ | 🔸¹¹ |
| **คีย์ Entry 2 (Blind)** | ❌ | ❌ | 🔸¹³📝 | ❌ | ❌ | 🔸¹²˒¹³ | ❌ | 🔸¹²˒¹³ | ❌ | 🔸¹¹˒¹³ |
| **Resolve Discrepancy** | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸¹⁴📝 | ❌ | 🔸¹⁴📝 | ❌ | 🔸¹⁴📝 |
| **Verify ข้อมูล** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 | ❌ | ✅📝 |
| **สร้างคำถามกลับสนาม** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ✅📝 | ✅📝 | ❌ | ✅📝 |
| **ตอบคำถามกลับ** | ❌ | ❌ | ❌ | ✅📝 | ❌ | ❌ | ✅📝 | ❌ | ❌ | ✅📝 |
| **Merge ข้อมูลซ้ำ** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **แก้ไข Household หลัง VERIFIED** | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸¹⁵📝 | ❌ | 🔸¹⁵📝 | ❌ | 🔸¹⁵📝 |

**เงื่อนไข:**

| # | เงื่อนไข |
|---|---|
| ¹¹ | ADMIN ควรคีย์ได้เพื่อ Debug/แก้ไข **แต่ต้อง Audit ทุกครั้ง** และควรมี Alert เมื่อ ADMIN คีย์ข้อมูล |
| ¹² | ⚠️ **เอกสาร 9.2 ให้สิทธิ์ VERIFIER/OFFICER คีย์ข้อมูลได้** — **แต่ขัดกับ Separation of Duties** (CONF-04) → ดูกฎ SoD ด้านล่าง |
| ¹³ | **ต้องไม่ใช่ผู้ที่คีย์ Entry 1 ของใบนั้น** — **BR-44/FR-VER-03** → ต้องบังคับที่ App + DB Trigger (SCH-03) |
| ¹⁴ | **ต้องไม่ใช่ผู้ที่คีย์ Entry 1 หรือ Entry 2 ของใบนั้น** — กฎที่เสนอเพิ่ม (ดู SoD-02) |
| ¹⁵ | ต้องระบุเหตุผล + สร้าง `HouseholdVersion` + Audit |

---

### 🔴 กฎ Separation of Duties (SoD) ที่เสนอเพิ่ม

> เอกสาร v3.0 ให้สิทธิ์ VERIFIER และ OFFICER คีย์ข้อมูลได้ (`system-analysis.md:581-582`) โดยไม่มีกฎกำกับ
> ซึ่ง**เปิดช่องให้คนคนเดียวคีย์ → ตรวจ → ยืนยัน ข้อมูลของตัวเองได้ทั้งกระบวนการ**

| รหัส (เสนอ) | กฎ | บังคับที่ |
|---|---|---|
| **SoD-01** | ผู้คีย์ Entry 2 ต้องไม่ใช่ผู้คีย์ Entry 1 ของใบนั้น | 🔴 App + **DB Trigger** |
| **SoD-02** | ผู้ Resolve Discrepancy ต้องไม่ใช่ผู้คีย์ Entry 1 หรือ Entry 2 ของใบนั้น | 🔴 App + **DB Trigger** |
| **SoD-03** | ผู้ Verify ต้องไม่ใช่ผู้คีย์ Entry ใดๆ ของใบนั้น | 🔴 App |
| **SoD-04** | ผู้อนุมัติอาสาสมัคร ต้องไม่ใช่ผู้สมัครเอง | 🟠 App |
| **SoD-05** | ผู้ปิด Batch ต้องไม่ใช่ผู้คีย์ใบสุดท้ายใน Batch นั้น | 🟡 App (Warning) |

**⚠️ ข้อจำกัดที่ต้องยอมรับ:** ในทีมเล็ก (3–5 คน) กฎ SoD อาจทำให้งานติดขัด — เช่น ถ้ามีคนคีย์แค่ 2 คน และคนหนึ่งลาป่วย → Entry 2 ทำไม่ได้เลย
→ **ต้องมีทางออก:** ADMIN สามารถ Override ได้ **แต่ต้องระบุเหตุผล + Audit + แสดงในรายงานคุณภาพ** (ดู Q-32)

---

### 2.3 Dashboard, GIS, Report และ Export

| การกระทำ | PUBLIC | VOLUNTEER | DATA_ENTRY | FIELD_SURVEYOR | RESEARCHER | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **ดูหน้า Public** (จุดอพยพ/เบอร์/สถิติ) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ดู Dashboard** | ❌ | 📊¹⁶ | 🔸¹⁷ | ❌ | 📊 | 🔸¹⁸ | ✅¹⁹ | ✅ | ✅ | ✅ |
| **ใช้ GIS (แผนที่)** | 🔸²⁰ | 📊²¹ | 🔸⁷ | ❌ | 🎭⁸ | ❌ | ❌ | ✅📝 | ✅ | ✅📝 |
| **ดู Coverage** | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Export ข้อมูล** | ❌ | ❌ | **❌**²² | ❌ | 🎭²³📝 | ❌ | 🔸¹⁰📝 | ✅📝 | ✅📝 | ✅📝 |
| **ดูรายชื่อ P1** | ❌ | 🔸⁵ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | 📊 | ✅📝 |
| **ออกรายงาน PDF/Excel** | ❌ | ❌ | ❌ | ❌ | 🎭📝 | ❌ | 🔸¹⁰ | ✅📝 | ✅📝 | ✅📝 |

**เงื่อนไข:**

| # | เงื่อนไข |
|---|---|
| ¹⁶ | สถิติ Aggregate ของ**ชุมชนตนเองเท่านั้น** — ไม่เห็นรายบ้าน/รายบุคคล (BR-64, NFR-S-07) |
| ¹⁷ | เฉพาะสถิติ**ของตนเอง** (คีย์ไปกี่ใบ, เวลาเฉลี่ย) — ไม่เห็นของคนอื่นและไม่เห็นข้อมูลครัวเรือน |
| ¹⁸ | เฉพาะคิว Discrepancy ของตน |
| ¹⁹ | Entry Dashboard (Throughput) — ไม่ใช่ Dashboard ข้อมูลครัวเรือน |
| ²⁰ | เฉพาะจุดอพยพ + Risk Heatmap ระดับ Grid (k≥5) — **ห้ามพิกัดรายบ้าน** (FR-PUB-06/11/12, BR-66/67) |
| ²¹ | เห็นแผนที่ชุมชน + จุดอพยพ + ทรัพยากร — **ไม่เห็นหมุดรายบ้าน** (เอกสาร 9.2: "✅ ไม่เห็นรายบ้าน") |
| ²² | **ห้ามเด็ดขาด** (BR-58, NFR-S-06, เอกสาร 9.2) |
| ²³ | ต้อง Anonymized (BR-27) + `ExportJob.isAnonymized = true` |

**⚠️ FR-CVG-04:** Export ที่ Coverage < 80% ต้องเตือน — และเมื่อ **Coverage = NULL (ยังไม่ทราบ Denominator)** ต้องเตือนแรงกว่า (ดู doc 06 หัวข้อ 6)

---

### 2.4 Incident และ Rescue Task

| การกระทำ | PUBLIC | VOLUNTEER | DATA_ENTRY | FIELD_SURVEYOR | RESEARCHER | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **ดูสถานะเหตุการณ์** | ✅²⁴ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ประกาศ/จัดการ Incident** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **สร้าง/มอบหมาย Rescue Task** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **รับ Rescue Task** | ❌ | ✅📝 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **อัปเดตสถานะ Task** | ❌ | 🔸²⁵📝 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **ปิด Rescue Task** | ❌ | 🔸²⁵📝 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **ยกเลิก Task** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |

| # | เงื่อนไข |
|---|---|
| ²⁴ | เฉพาะสถานะสาธารณะ (FR-PUB-04) — ไม่เห็นรายละเอียด Task |
| ²⁵ | **เฉพาะ Task ที่มอบหมายให้ตน** (`task.assignedToId = user.id`) — และ**เฉพาะเมื่อ `incident.status = ACTIVE`** |

### 🔴 กฎการหมดอายุสิทธิ์ของ VOLUNTEER (สำคัญมาก — ยังไม่มีในเอกสาร)

**ช่องโหว่ที่พบ (SCH-12):** BR-65 บอกว่า VOLUNTEER เห็น PII "เฉพาะเมื่อ Incident Mode + เฉพาะรายที่มอบหมาย" **แต่ไม่มีกฎว่าเมื่อ Incident ปิดแล้วจะเป็นอย่างไร**

**สถานการณ์โจมตี (RK-V1):** สมัครอาสา → รอ Incident → รับงาน → ได้ PII → **เก็บสิทธิ์ไว้ตลอดกาล**

**กฎที่เสนอ:**

| รหัส | กฎ |
|---|---|
| **VOL-EXP-01** | VOLUNTEER เห็น PII ของ Task ได้เฉพาะเมื่อ `incident.status = ACTIVE` **AND** `task.assignedToId = user.id` **AND** `task.status IN (ASSIGNED, IN_PROGRESS)` |
| **VOL-EXP-02** | เมื่อ Task เปลี่ยนเป็น `COMPLETED`/`CANCELLED`/`UNREACHABLE` → **สิทธิ์เห็น PII หายทันที** (เห็นได้เฉพาะ Metadata ของงานที่ตนทำ) |
| **VOL-EXP-03** | เมื่อ `incident.status = CLOSED` → สิทธิ์เห็น PII ของทุก Task ใน Incident นั้น**หายทันที** |
| **VOL-EXP-04** | ทุกการเปิดดู PII ผ่าน Task ต้อง Audit (`AuditAction.READ` + entityId) — **บังคับ** (BR-26) |
| **VOL-EXP-05** | ส่งเฉพาะข้อมูลที่จำเป็นต่อภารกิจ — ชื่อ + ที่อยู่ + สิ่งที่ต้องช่วย + เบอร์ติดต่อ — **ไม่ส่งทั้ง record** (CLAUDE.md: *"Volunteer เห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ"*) |

---

### 2.5 การจัดการระบบและ PDPA

| การกระทำ | PUBLIC | VOLUNTEER | DATA_ENTRY | FIELD_SURVEYOR | RESEARCHER | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **สมัครอาสาสมัคร** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **อนุมัติอาสาสมัคร** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸²⁶📝 | ❌ | ❌ | ✅📝 |
| **จัดการผู้ใช้** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸²⁶ | ❌ | ❌ | ✅📝 |
| **จัดการ Master Data** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝²⁷ |
| **แก้ `totalHouseholds`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸²⁸📝 | ❌ | ✅📝 |
| **จัดการ Risk Weight** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝²⁹ |
| **จัดการ EvacuationSite** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **จัดการ EmergencyContact** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ❌ | ✅📝 |
| **ดู Audit Log** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 📊³⁰ | ✅ |
| **ดู Consent** | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸³ | ❌ | ✅📝 | 📊 | ✅📝 |
| **บันทึก/แก้ Consent** | ❌ | ❌ | 🔸¹ | ❌ | ❌ | 🔸³📝 | ❌ | ✅📝 | ❌ | ✅📝 |
| **รับคำขอ PDPA** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅📝 | ✅📝 | ❌ | ✅📝 |
| **ลบ/Anonymize ตาม PDPA** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸³¹📝 |

| # | เงื่อนไข |
|---|---|
| ²⁶ | เฉพาะอนุมัติ/ปฏิเสธอาสาสมัครในชุมชนที่ตนดูแล — **ไม่ใช่จัดการผู้ใช้ทั่วไป** (สร้าง/ลบ/เปลี่ยน Role ไม่ได้) |
| ²⁷ | **Master Data จากกระดาษ: แก้ Label/sortOrder/isActive เท่านั้น — ห้ามเพิ่ม/ลบ** (ดู [07](07-seed-gap-analysis.md) ข้อ 19) |
| ²⁸ | OFFICER แก้ได้เฉพาะชุมชนใน Scope ของตน + ต้องระบุ `populationDataSource` |
| ²⁹ | ต้อง Preview ผลกระทบ + ระบุเหตุผล + สร้าง Version ใหม่ (ห้าม UPDATE ทับ) |
| ³⁰ | เฉพาะสรุป/สถิติ — ไม่เห็นรายการที่มี PII |
| ³¹ | **Hard Delete ทำได้เฉพาะผ่าน PDPA Flow ที่มีการอนุมัติ 2 ชั้น** (BR-29) + ต้องบันทึกว่าลบอะไรไปบ้างก่อนลบ |

---

## 3. ชั้นการตรวจสอบสิทธิ์ (Authorization Layers)

> **หลักการ:** *"การซ่อนปุ่มใน UI ไม่ถือว่าเป็น Authorization"* (CLAUDE.md)
> ทุกสิทธิ์ต้องถูกตรวจ **อย่างน้อย 2 ชั้น** และชั้นที่บังคับจริงคือ Server เสมอ

```
┌──────────────────────────────────────────────────────────────┐
│ ชั้นที่ 1: UI (Cosmetic เท่านั้น — ไม่ใช่ Security)           │
│  • ซ่อน/แสดงปุ่ม, เมนู, Sidebar ตาม Role                     │
│  • ⚠️ ห้ามพึ่งพาชั้นนี้เพื่อความปลอดภัย                       │
│  • วัตถุประสงค์: UX (ไม่ให้ผู้ใช้เห็นสิ่งที่กดไม่ได้)          │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ ชั้นที่ 2: Server Action / API Route  🔴 บังคับจริง            │
│  • assertCan(ctx, 'household:read', { householdId })         │
│  • ตรวจ Session → Role → Scope → Resource-level condition    │
│  • Zod validate input (ห้ามเชื่อ Client — CLAUDE.md)          │
│  • ⭐ ทุก Server Action ต้องเริ่มด้วย assertCan() เสมอ         │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ ชั้นที่ 3: Database Query Scope  🔴 บังคับจริง                │
│  • Repository รับ AuthContext เสมอ — ไม่มี default            │
│  • ทุก Query ถูก inject: communityId IN (scope)              │
│                          AND deletedAt IS NULL               │
│  • ESLint rule: ห้ามเรียก prisma.* นอก db/repositories/       │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ ชั้นที่ 4: PostgreSQL RLS (Defense in Depth) — แนะนำ          │
│  • household, vulnerable_person, person_vulnerability        │
│  • ป้องกันแม้โค้ดพลาด — สำคัญเพราะ NFR-S-06 เป็น Security Req │
│  • SET LOCAL app.current_user_id / app.current_role          │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ ชั้นที่ 5: Audit Log (Append-only)  📝                        │
│  • บันทึกทุกการ READ/EXPORT ข้อมูลอ่อนไหว (BR-26)             │
│  • เขียนใน Transaction เดียวกับการกระทำ                       │
│  • ⚠️ ถ้า Audit เขียนไม่ได้ → การกระทำต้อง Rollback           │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 ตารางสรุปชั้นการตรวจสอบต่อการกระทำ

| การกระทำ | UI | Server Action/API | DB Query Scope | RLS | Audit |
|---|:---:|:---:|:---:|:---:|:---:|
| ดูข้อมูลครัวเรือน | ✅ ซ่อนเมนู | 🔴 **บังคับ** | 🔴 **บังคับ** (communityId) | ✅ แนะนำ | 📝 **บังคับ** |
| ดู PII / ข้อมูลสุขภาพ | ✅ | 🔴 **บังคับ** | 🔴 **บังคับ** | 🔴 **บังคับ** | 📝 **บังคับ** |
| DATA_ENTRY ดูใบที่ Lock | ✅ | 🔴 **บังคับ** | 🔴 **บังคับ** (lockedById) | 🔴 **บังคับ** | 📝 บังคับ |
| คีย์ Entry 1/2 | ✅ | 🔴 **บังคับ** | 🔴 บังคับ | — | 📝 บังคับ |
| **Entry 2 ≠ Entry 1 (SoD-01)** | ✅ ซ่อนใบ | 🔴 **บังคับ** | 🔴 บังคับ | — | 📝 บังคับ |
| **Entry 2 ≠ Entry 1 (DB)** | — | — | — | **🔴 Trigger** | — |
| Resolve Discrepancy | ✅ | 🔴 **บังคับ** | 🔴 บังคับ | — | 📝 **บังคับ** |
| Export | ✅ ซ่อนปุ่ม | 🔴 **บังคับ** | 🔴 **บังคับ** | ✅ | 📝 **บังคับ** |
| VOLUNTEER ดู PII ผ่าน Task | ✅ | 🔴 **บังคับ** | 🔴 **บังคับ** (incident ACTIVE + assignedTo) | 🔴 **บังคับ** | 📝 **บังคับ** |
| หน้า Public | — | ✅ (ไม่ต้อง auth) | 🔴 **บังคับ** (View ที่ Aggregate แล้ว) | — | ❌ ไม่ต้อง |
| จัดการ Master Data | ✅ | 🔴 **บังคับ** | — | — | 📝 บังคับ |
| PDPA Hard Delete | ✅ | 🔴 **บังคับ** (2 ชั้น) | 🔴 บังคับ | — | 📝 **บังคับ** |

---

## 4. Scope Resolution (Community Scope + Area Scope)

**ปัญหาปัจจุบัน (SCH-10):** Schema มีเพียง `UserCommunityScope` — **ไม่มี Area Scope** ทั้งที่ CLAUDE.md ระบุ *"ทุก Role ต้องรองรับ Community Scope **หรือ Area Scope**"*

**ข้อเสนอ:**

```prisma
/// ⭐ ใหม่ — สิทธิ์ระดับพื้นที่ (จังหวัด/อำเภอ/ตำบล)
model UserAreaScope {
  id        String    @id @default(cuid())
  userId    String
  scopeType AreaScopeType   /// PROVINCE | DISTRICT | TAMBON
  scopeId   String          /// FK ไป province/district/tambon (polymorphic)
  canEdit   Boolean   @default(false)
  grantedById String
  grantedAt DateTime  @default(now())
  expiresAt DateTime?       /// ⭐ สิทธิ์ชั่วคราว (เช่น ช่วง Incident)

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, scopeType, scopeId])
  @@index([userId, expiresAt])
  @@map("user_area_scope")
}

enum AreaScopeType { PROVINCE  DISTRICT  TAMBON }
```

**Resolver Logic (Pure Function + Unit Test):**

```typescript
/**
 * แปลง Role + Scope → รายการ communityId ที่เข้าถึงได้
 * ⚠️ ต้องเรียกทุกครั้งก่อน Query — ไม่มี default
 */
export async function resolveScopedCommunityIds(ctx: AuthContext): Promise<string[]> {
  // 1) ADMIN / EXECUTIVE → ทั้งระบบ
  if (ctx.roles.includes('ADMIN') || ctx.roles.includes('EXECUTIVE')) {
    return ALL_COMMUNITIES;   // ⚠️ ต้องมี Bypass ที่ชัดเจน ไม่ใช่ต้องเพิ่มแถวทุกชุมชน
  }

  // 2) Community Scope โดยตรง
  const direct = await getCommunityScopes(ctx.userId);

  // 3) Area Scope → ขยายเป็นชุมชน
  //    ⭐ ต้องผ่าน CommunityTambon (M:N) — ชุมชนควนสันติจะปรากฏเมื่อมีสิทธิ์
  //      ตำบลควนลัง "หรือ" ตำบลหาดใหญ่
  const fromArea = await getCommunitiesFromAreaScopes(ctx.userId);

  // 4) VOLUNTEER → ชุมชนของตนเท่านั้น
  //    + สิทธิ์เพิ่มเติมชั่วคราวผ่าน RescueTask (VOL-EXP-01..03)

  return unique([...direct, ...fromArea]);
}
```

**⚠️ ประเด็นสำคัญที่ต้องระวัง:** เมื่อขยาย Area Scope → Community ต้องผ่าน `CommunityTambon` (M:N)
→ **ผู้ที่มีสิทธิ์ตำบลหาดใหญ่ จะเห็นชุมชนควนสันติทั้งชุมชน** (รวมครัวเรือนฝั่งควนลังด้วย) — ถูกต้องหรือไม่?
→ **ต้องตัดสินใจ:** ให้สิทธิ์ระดับ **ชุมชนทั้งชุมชน** หรือ **เฉพาะครัวเรือนในตำบลที่มีสิทธิ์** (`Household.tambonId`)?
→ ข้อเสนอ: **เฉพาะครัวเรือนในตำบลที่มีสิทธิ์** (ใช้ `Household.tambonId` กรอง) — ปลอดภัยกว่าและตรงเจตนา (ดู Q-33)

---

## 5. PDPA Compliance Matrix

| สิทธิ์ตาม PDPA | มาตรา | รองรับ? | กลไก | ปัญหา |
|---|---|---|---|---|
| **สิทธิ์ได้รับแจ้ง** | ม.23 | ⚠️ | ใบ Consent (ยังเป็นร่าง) | ⚠️ **กระดาษไม่มีช่อง Consent** (GAP-R06) |
| **สิทธิ์ให้ความยินยอม** | ม.19 | ⚠️ | `ConsentRecord`, `ConsentStatus` | ⚠️ ต้องพิมพ์ใบแนบ + ปรึกษานิติกร |
| **ข้อมูลอ่อนไหว** | **ม.26** | ❌ | `PersonVulnerability`, `AssistanceNeed.detail` | 🔴 **ไม่มีการเข้ารหัสจริง** (SCH-08) + **ไม่มี Consent** |
| **สิทธิ์เข้าถึง** | ม.30 | ⚠️ | `PdpaRequest` (type=ACCESS) | ⚠️ ไม่มี FK, ไม่มี Flow, ไม่มี UI |
| **สิทธิ์แก้ไข** | ม.35 | ⚠️ | `PdpaRequest` (RECTIFY) + `HouseholdVersion` | ⚠️ Version ไม่ครอบคลุมตารางลูก |
| **สิทธิ์ลบ** | ม.33 | ⚠️ | `PdpaRequest` (ERASE) + `deletedAt` | ⚠️ Soft Delete มีแค่ 1/49 ตาราง (SCH-07) |
| **สิทธิ์คัดค้าน** | ม.32 | ⚠️ | `PdpaRequest` (OBJECT) | ⚠️ ไม่มี Flow |
| **สิทธิ์ถอนความยินยอม** | ม.19 วรรค 5 | ❌ | `ConsentRecord.withdrawnAt` | 🔴 **มีฟิลด์แต่ไม่มีผล** — ถอนแล้วข้อมูลยังถูกใช้ต่อ (SCH-19) |
| **สิทธิ์ให้โอนย้าย** | ม.31 | ❌ | — | ❌ ไม่มี |
| **ระยะเวลาเก็บ** | ม.37 | ❌ | BR-30 (5 ปี) | 🔴 **ไม่มี Retention Job** + Audit Trigger ห้าม DELETE (SQL-09) |
| **การรักษาความมั่นคงปลอดภัย** | ม.37(1) | ⚠️ | TLS, RBAC, Audit | 🔴 **ไม่มี Encryption at rest จริง** (NFR-S-02) |
| **บันทึกรายการกิจกรรม (RoPA)** | ม.39 | ❌ | — | ❌ ไม่มีเอกสาร RoPA |
| **แจ้งเหตุละเมิด 72 ชม.** | ม.37(4) | ❌ | — | ❌ ไม่มี Incident Response Plan |
| **DPO** | ม.41 | ❌ | — | ⚠️ ต้องพิจารณาว่าองค์กรเข้าเกณฑ์ต้องมี DPO หรือไม่ |

### 🔴 ประเด็น PDPA ที่ต้องแก้ก่อนเก็บข้อมูลจริง

| # | ประเด็น | ระดับ | อ้างอิง |
|---|---|---|---|
| 1 | **กระดาษไม่มีช่อง Consent แต่เก็บข้อมูลสุขภาพ (ม.26)** | 🔴 **BLOCKER ทางกฎหมาย** | PE10, RK-E5, Appendix B |
| 2 | **ไม่มีการเข้ารหัสข้อมูลอ่อนไหวจริง** | 🔴 BLOCKER | SCH-08, NFR-S-02 |
| 3 | **ถอน Consent แล้วไม่มีผล** | 🟠 HIGH | SCH-19 |
| 4 | **ไม่มี Retention Policy (5 ปี)** | 🟠 HIGH | BR-30, SQL-09 |
| 5 | **ไม่มี RoPA** | 🟡 MEDIUM | ม.39 |
| 6 | **ส่วนที่ 5 (โครงการแก้จน) เป็นวัตถุประสงค์ต่างจากภัยพิบัติ** | 🟠 HIGH | Appendix B — ต้องแยก Consent |

> ⚠️ **ข้อ 1 คือ BLOCKER ที่แท้จริงของทั้งโครงการ** — ต้องแก้**ก่อนแจกกระดาษ** ไม่ใช่ก่อนเขียนโค้ด
> เอกสารระบุไว้ชัดเจนแล้ว (RK-E5, ข้อ 19.3 "สิ่งที่ต้องทำก่อนแจกกระดาษ") และย้ำว่า **"ต้องปรึกษานิติกรก่อนใช้"**
> **ไม่มีทางแก้ด้วยโค้ด** — ต้องเป็นการตัดสินใจเชิงกฎหมายและกระบวนการ (ดู Q-04)

---

## 6. Policy Implementation ที่เสนอ

```typescript
// authz/policies/household.policy.ts

/**
 * นโยบายการเข้าถึง Household
 * ⚠️ ทุก Policy ต้องเป็น Pure Function + Unit Test (CLAUDE.md)
 */
export const householdPolicy = {
  /** ดูข้อมูลครัวเรือน (ไม่รวม PII) */
  canRead(ctx: AuthContext, h: HouseholdRef): PolicyResult {
    if (ctx.roles.includes('ADMIN')) return allow();
    if (ctx.roles.includes('OFFICER')) return inScope(ctx, h.communityId);
    if (ctx.roles.includes('EXECUTIVE')) return allow({ aggregateOnly: true });

    // 🔴 DATA_ENTRY: เฉพาะใบที่ Lock อยู่ และยังไม่หมดอายุ (BR-58)
    if (ctx.roles.includes('DATA_ENTRY')) {
      if (h.sheet.lockedById !== ctx.userId) return deny('BR-58: ไม่ได้ Lock ใบนี้');
      if (h.sheet.lockExpiresAt <= new Date()) return deny('Lock หมดอายุแล้ว');
      return allow({ singleSheetOnly: true });
    }

    // 🔴 VOLUNTEER: ต้องผ่าน Task ที่ ACTIVE เท่านั้น (BR-65, VOL-EXP-01)
    if (ctx.roles.includes('VOLUNTEER')) {
      return deny('BR-64: VOLUNTEER เห็นเฉพาะ Aggregate — ใช้ rescueTaskPolicy สำหรับ PII');
    }

    return deny('ไม่มีสิทธิ์');
  },

  /** ดู PII — เข้มกว่า canRead และต้อง Audit เสมอ */
  canReadPii(ctx: AuthContext, h: HouseholdRef): PolicyResult {
    const base = this.canRead(ctx, h);
    if (!base.allowed) return base;

    if (ctx.roles.includes('EXECUTIVE')) return deny('EXEC ดู PII ไม่ได้');
    if (ctx.roles.includes('COORDINATOR')) return deny('COORD เห็นเฉพาะ Metadata');
    if (ctx.roles.includes('RESEARCHER')) return deny('BR-27: ต้อง Anonymize');

    return allow({ mustAudit: true });   // ⭐ BR-26
  },
};
```

**กฎการเขียนโค้ดที่บังคับ:**

| กฎ | เหตุผล |
|---|---|
| ทุก Server Action **ต้องเริ่มด้วย `assertCan()`** | ป้องกันการลืม |
| Repository **ต้องรับ `AuthContext` เป็น parameter แรก** — ไม่มี default | บังคับให้คิดเรื่องสิทธิ์ทุกครั้ง |
| **ESLint rule:** ห้ามเรียก `prisma.*` นอก `db/repositories/` | บังคับให้ผ่าน Scope + Audit |
| `mustAudit: true` → Repository **ต้องเขียน Audit ใน Transaction เดียวกัน** | ถ้า Audit ล้ม → Rollback ทั้งหมด (BR-26) |
| Policy ทุกตัว **ต้องมี Unit Test ครบทุก Role** (10 roles × N actions) | Testing Strategy: "RBAC bypass" |

---

## 7. Test Cases ที่บังคับต้องมี (Security)

จาก Testing Strategy (`system-analysis.md:1056`): *"Security | OWASP, RBAC bypass, **DATA_ENTRY Query ไม่ได้**, **VOLUNTEER ไม่เห็น PII** | ไม่มี High/Critical"*

| # | Test Case | ประเภท | ต้องผ่าน |
|---|---|---|---|
| 1 | DATA_ENTRY เรียก API ทุกตัว → ไม่เห็นใบที่ไม่ได้ Lock | Integration | 🔴 |
| 2 | DATA_ENTRY เรียก `/api/exports` → 403 | Integration | 🔴 |
| 3 | DATA_ENTRY เรียก GIS/Search API → 403 | Integration | 🔴 |
| 4 | DATA_ENTRY เข้าถึงใบหลัง Lock หมดอายุ → 403 | Integration | 🔴 |
| 5 | VOLUNTEER เรียก API ครัวเรือน → ไม่มี PII ใน Response | Integration | 🔴 |
| 6 | VOLUNTEER ดู Task หลัง Incident CLOSED → ไม่เห็น PII | Integration | 🔴 |
| 7 | VOLUNTEER ดู Task ที่ไม่ได้มอบหมายให้ตน → 403 | Integration | 🔴 |
| 8 | **คนเดียวกันคีย์ Entry 1 + Entry 2 → ถูกปฏิเสธที่ App** | Integration | 🔴 |
| 9 | **คนเดียวกันคีย์ Entry 1 + Entry 2 → ถูกปฏิเสธที่ DB (Trigger)** | Integration | 🔴 |
| 10 | ผู้คีย์ Resolve Discrepancy ของใบตัวเอง → 403 (SoD-02) | Integration | 🔴 |
| 11 | ผู้ใช้ Community A เรียกข้อมูล Community B → 403 | Integration | 🔴 |
| 12 | Public API ทุกตัว → ไม่มี PII, ไม่มีพิกัดรายบ้าน | Integration | 🔴 |
| 13 | Public Grid API → cell ที่มี < 5 ครัวเรือน ไม่ปรากฏ | Integration | 🔴 |
| 14 | EXECUTIVE เรียก API PII → 403 | Integration | 🔴 |
| 15 | RESEARCHER Export → ทุกแถวต้อง Anonymized | Integration | 🔴 |
| 16 | ทุกการดู PII → มีแถวใน `audit_log` | Integration | 🔴 |
| 17 | UPDATE/DELETE `audit_log` → ถูกปฏิเสธ | Integration | 🔴 |
| 18 | Policy Unit Test — 10 Roles × ทุก Action | Unit | 🔴 |

---

## 8. สรุปปัญหา RBAC/PDPA

| ID | ระดับ | ปัญหา | อ้างอิง |
|---|---|---|---|
| RBAC-01 | 🔴 BLOCKER | ชื่อ Role ขัดกัน (`VOLUNTEER` vs `RESCUE_VOLUNTEER`) | CONF-02, SCH-05 |
| RBAC-02 | 🔴 BLOCKER | ไม่มีกลไกบังคับ SoD-01 (คนเดียวคีย์ 2 รอบ) | SCH-03 |
| RBAC-03 | 🔴 BLOCKER | ไม่มีการเข้ารหัสข้อมูลอ่อนไหว (ม.26) | SCH-08 |
| RBAC-04 | 🔴 BLOCKER | กระดาษไม่มี Consent แต่เก็บข้อมูลสุขภาพ | GAP-R06 |
| RBAC-05 | 🟠 HIGH | Permission Matrix ในเอกสารขาด `FIELD_SURVEYOR` + `RESEARCHER` | CONF-04 |
| RBAC-06 | 🟠 HIGH | VERIFIER/OFFICER คีย์ข้อมูลได้ → ไม่มีกฎ SoD-02/03 | CONF-04 |
| RBAC-07 | 🟠 HIGH | VOLUNTEER เห็น PII ตลอดกาลหลัง Incident ปิด | SCH-12 |
| RBAC-08 | 🟠 HIGH | ไม่มี Area Scope | SCH-10 |
| RBAC-09 | 🟠 HIGH | DATA_ENTRY จำกัดได้แค่ที่ App — ไม่มี RLS | SCH-11 |
| RBAC-10 | 🟠 HIGH | ถอน Consent แล้วไม่มีผล | SCH-19 |
| RBAC-11 | 🟡 MEDIUM | ไม่มีอะไรบังคับให้เขียน Audit (BR-26) | SCH-17 |
| RBAC-12 | 🟡 MEDIUM | ไม่มี Retention (BR-30) + Trigger ห้าม DELETE | SQL-09 |
| RBAC-13 | 🟡 MEDIUM | ไม่มี RoPA / Incident Response Plan | ม.39, ม.37(4) |
| RBAC-14 | 🟡 MEDIUM | ไม่ชัดว่า Area Scope ควรให้สิทธิ์ทั้งชุมชนหรือเฉพาะตำบล | Q-33 |
