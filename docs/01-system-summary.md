# 01 — สรุประบบ SKL-FRIS (System Summary)

> เอกสารนี้เป็นผลจากการอ่าน `docs/system-analysis.md` (v3.0), `docs/questionnaire.pdf` (4 หน้า),
> `prisma/schema.prisma`, `prisma/seed.ts` และ `database/drafts/00_postgis_extensions.sql`
> รอบนี้เป็นการวิเคราะห์เท่านั้น ไม่มีการแก้ไขไฟล์ต้นฉบับ

---

## 1. บริบท ปัญหา เป้าหมาย และขอบเขต

### 1.1 บริบท

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อระบบ | SKL-FRIS (Song Khlong Khuan Lang Flood Resilience Information System) |
| เจ้าของ | เครือข่ายสองคลองควนลัง / มหาวิทยาลัยทักษิณ |
| พื้นที่เริ่มต้น | ชุมชน 5 แห่ง อ.หาดใหญ่ จ.สงขลา (ยืนยันตามคำสั่งผู้ใช้ — ไม่ใช่ตาม Seed ปัจจุบัน) |
| โมเดลข้อมูล | Paper-first → เจ้าหน้าที่คีย์เข้าระบบ (Back-office Entry) |
| ผู้คีย์ | เจ้าหน้าที่ / จ้างคีย์ / นักศึกษาฝึกงาน (ไม่ใช่อาสาสมัครชุมชน) |

### 1.2 ปัญหาที่ระบบแก้ (สรุปจากเอกสารวิเคราะห์ ข้อ 2)

ระบบตอบปัญหา 4 กลุ่ม:

1. **โซนสาธารณะ (PP1–PP4)** — ชาวบ้านไม่มีที่ดูจุดอพยพ/เบอร์ฉุกเฉินตอนเกิดเหตุ ปัญหาระดับวิกฤตคือ PP1 (ต้อง Login ก่อนถึงจะดูได้ ทั้งที่เหตุเกิดตี 2)
2. **โซนคีย์ข้อมูล (PE1–PE10)** — คีย์ไม่เสร็จ, คีย์ผิดโดยไม่มีใครรู้, กระดาษหาย, ลายมืออ่านไม่ออก, แยกไม่ออกว่า "ไม่มี" หรือ "ไม่ได้ถาม", และ **ไม่มี Consent ในกระดาษ (ผิด PDPA ม.26)**
3. **โซนตัดสินใจ (P1–P5)** — ไม่มีทะเบียนกลุ่มเปราะบางที่ค้นได้เร็ว ไม่รู้พื้นที่เสี่ยง จัดสรรทรัพยากรไม่ตรงจุด
4. **โซนคุณภาพข้อมูล (RK-C1)** — เจ้าหน้าที่เข้าใจผิดว่าข้อมูลครบ ทั้งที่ Coverage ยังต่ำ

### 1.3 เป้าหมาย

เปลี่ยนแบบสอบถามกระดาษเป็นข้อมูลที่ใช้ตัดสินใจได้จริงใน 3 ช่วงเวลา — ก่อนเกิดภัย (เตรียมพร้อม), ระหว่างเกิดภัย (ปฏิบัติการ), หลังเกิดภัย (ฟื้นฟู) โดยตอบคำถามหลักให้ได้ว่า **"คืนนี้ต้องไปช่วยใครก่อน อยู่ตรงไหน ต้องใช้อะไร"**

### 1.4 ขอบเขต

**อยู่ในขอบเขต:** Public Portal, Batch/Paper Management, Data Entry Console, Double-entry Verification, Discrepancy, Field Query Loop, Coverage, Risk Engine, GIS, Dashboard, Volunteer Management, Incident & Rescue Task, Report/Export, Admin, PDPA/Audit

**อยู่นอกขอบเขตรอบแรก (Future — ข้อ 18):** Mobile Survey App, SOS Button, LINE OA Chatbot, Multi-tenant, IoT Sensor, Flood Simulation, เชื่อมทะเบียนราษฎร์, Open Data API

**⚠️ ขอบเขตที่เอกสารระบุแต่ขัดกับคำสั่งผู้ใช้รอบนี้:** เอกสารกำหนดปริมาณงาน "3,000 ชุด (600 × 5 ชุมชน)" ซึ่ง**ถูกยกเลิกแล้ว** ตามคำสั่ง (ดู [02-requirement-gap-analysis.md](02-requirement-gap-analysis.md) หัวข้อ CONF-01)

---

## 2. ผู้ใช้งานและบทบาท

### 2.1 Actors (เอกสารข้อ 8)

| Actor | คำอธิบาย | อุปกรณ์หลัก |
|---|---|---|
| Public User | ประชาชนทั่วไป ดูจุดอพยพ/เบอร์ฉุกเฉิน | Mobile |
| Volunteer | อาสาสมัครชุมชน สมัครเอง เห็นข้อมูลตามสิทธิ์ | Mobile + Desktop |
| Data Entry Staff | เจ้าหน้าที่คีย์ (Admin แต่งตั้ง) | Desktop |
| Data Entry Coordinator | รับปึก สร้าง Batch ติดตาม Throughput | Desktop |
| Verifier | ตัดสิน Discrepancy | Desktop |
| Field Surveyor | ผู้สำรวจ ตอบคำถามกลับ | กระดาษ + LINE |
| Officer / Staff | เจ้าหน้าที่เทศบาล/ปภ./อสม. | Desktop + Mobile |
| Executive | ผู้บริหาร (อ่านอย่างเดียว) | Desktop/Tablet |
| System Administrator | ผู้ดูแลระบบ | Desktop |
| Researcher | นักวิจัย (ข้อมูล Anonymized) | Desktop |
| Data Subject | ชาวบ้านเจ้าของข้อมูล (ใช้สิทธิ์ PDPA) | Mobile/โทรศัพท์ |

**System Actors:** Google Maps API, LINE Messaging API, SMS Gateway, Scheduler (Cron/BullMQ), Object Storage (MinIO/S3), CDN, Discrepancy Engine

### 2.2 Roles (เอกสารข้อ 9 — 9 Roles + Public)

| Role | ระดับ | ขอบเขต |
|---|---|---|
| — (Public) | 0 | หน้าสาธารณะเท่านั้น |
| `VOLUNTEER` | 1 | ข้อมูลชุมชนระดับ Aggregate + รับงาน Incident |
| `DATA_ENTRY` | 1 | เห็นเฉพาะใบที่ Lock — ห้าม Query |
| `FIELD_SURVEYOR` | 1 | ตอบคำถามกลับเท่านั้น |
| `RESEARCHER` | 1 | ข้อมูล Anonymized |
| `VERIFIER` | 3 | ตัดสิน Discrepancy — เห็น PII เฉพาะใบที่ตรวจ |
| `COORDINATOR` | 4 | จัดการ Batch + Throughput + อนุมัติอาสา |
| `OFFICER` | 4 | จัดการชุมชนที่รับผิดชอบ |
| `EXECUTIVE` | 5 | ทั้งระบบ (อ่านอย่างเดียว) |
| `ADMIN` | 6 | ทั้งระบบ |

> ⚠️ **ขัดแย้ง:** `prisma/schema.prisma:158` ใช้ `RESCUE_VOLUNTEER` แต่เอกสาร v3.0 ใช้ `VOLUNTEER`
> และ Schema **ไม่มี** `VOLUNTEER` เลย → ดู BLK-04 ใน [04-schema-gap-analysis.md](04-schema-gap-analysis.md)

---

## 3. Business Process (รับกระดาษ → นำข้อมูลไปใช้)

```
BP-01 Paper Intake
  ผู้สำรวจรวบรวมกระดาษเป็นปึก → ผู้ประสานนับจำนวน → สร้าง Batch
  → พิมพ์เลขประจำใบทุกใบ → (Optional) สแกน PDF → เก็บตู้ล็อก
  → ระบบสร้าง Batch ID + เลขใบ → status: READY_FOR_ENTRY
        │
        ▼
BP-02 Data Entry (Entry 1)
  เจ้าหน้าที่ Login → "หยิบงาน" (Lock ใบ 10 นาที) → คีย์ ส่วนที่ 0→1→2→3→4→5
  → F2 = ILLEGIBLE / F3 = BLANK_IN_PAPER → Ctrl+Enter ส่ง
  → Validate + ตรวจซ้ำ → status: ENTERED_1 → Auto-lock ใบถัดไป
        │
        ▼
BP-03 Blind Double-Entry (Entry 2)
  เจ้าหน้าที่คนที่ 2 (ต้องไม่ใช่คนเดิม) หยิบใบ ENTERED_1
  → คีย์ซ้ำเฉพาะ "ฟิลด์วิกฤต" โดยไม่เห็นค่าของ Entry 1
  → Discrepancy Engine เทียบ
      ├─ ตรงกัน  → VERIFIED → คำนวณ Risk/Triage → ขึ้น Dashboard/Map
      └─ ไม่ตรง  → DISCREPANCY → คิว Verifier ตัดสิน
                        │
                        ▼
BP-04 Field Query Loop
  รวบรวม ILLEGIBLE / BLANK / DISCREPANCY ที่แก้ไม่ได้ → จัดกลุ่มตามผู้สำรวจ/ซอย
  → สร้าง PDF ใบคำถามกลับ → ผู้สำรวจโทรถาม/ไปถามซ้ำ
  → ผู้ประสานคีย์คำตอบ → VERIFIED
        │
        ▼
BP-05 Batch Close
  เงื่อนไข: คีย์ครบ expectedCount + ไม่มีใบ LOCKED ค้าง + Discrepancy แก้หมด
  + ผู้ประสานกด "ยืนยันปิด Batch"
        │
        ▼
การนำข้อมูลไปใช้ (เฉพาะข้อมูล VERIFIED เท่านั้น — FR-RSK-07)
  BP-07 เตรียมพร้อม  → Dashboard → รายชื่อ P1 → จับคู่ทรัพยากร → Export แผน
  BP-08 ขณะเกิดภัย   → Incident Mode → Task → มอบหมายอาสาสมัคร → ติดตาม
  BP-09 ฟื้นฟู       → ประเมินความเสียหาย → ส่งต่อทีมจิตวิทยา/โครงการแก้จน
  BP-10 Re-survey    → ⚠️ ต้องพิมพ์กระดาษใหม่ → วนกลับ BP-01
```

**กระบวนการคู่ขนาน:** BP-06 สมัครอาสาสมัครชุมชน (Public → กรอกข้อมูล + ความเชี่ยวชาญ 8 ด้าน → ยอมรับ PDPA → รอ Admin/Coordinator อนุมัติ 1–3 วัน → Login)

### สถานะใบกระดาษ (SheetStatus — 10 สถานะ)

`PENDING → LOCKED → ENTERED_1 → ENTERED_2 → (VERIFIED | DISCREPANCY → VERIFIED)`
สถานะพิเศษ: `NEEDS_FIELD_QUERY`, `UNRESOLVABLE`, `SHEET_LOST`, `MERGED_INTO`

---

## 4. Module ทั้งหมด

| รหัส | Module | Zone | Phase (ตามเอกสาร) |
|---|---|---|---|
| M00 | Public Portal | 🌊 Public | 1 |
| M01 | Authentication & Authorization | ทุกโซน | 1 |
| M02 | Batch & Paper Management | 🏭 Entry | 1 |
| M03 | **Data Entry Console** ⭐ สำคัญที่สุด | 🏭 Entry | 1 |
| M04 | Verification & Discrepancy | 🏭 Entry | 1.5 |
| M05 | Field Query Loop | 🏭 Entry | 1.5 |
| M06 | Data Entry Dashboard | 🏭 Entry | 1.5 |
| M07 | Duplicate Merge | 🏭 Entry | 1.5 |
| M08 | Vulnerable Person Registry | 🎯 Decision | 2 |
| M09 | Risk Analysis Engine | 🎯 Decision | 2 |
| M10 | GIS & Mapping | 🎯 Decision | 2 |
| M11 | Dashboard & Analytics | 🎯 Decision | 2 |
| M12 | Search & Query | 🎯 Decision | 2 |
| M13 | Resource & Evacuation Planning | 🎯 Decision | 2 |
| M14 | Incident Management | 🚨 Incident | 3 |
| M15 | Notification | 🚨 Incident | 3 |
| M16 | Report & Export | 🎯 Decision | 2 |
| M17 | Administration | ⚙️ Admin | 1–4 |
| M18 | Compliance & Privacy | ⚙️ Admin | 4 (full) |
| M19 | Volunteer Management | 🤝 Volunteer | 2 |

> **หมายเหตุ:** เอกสารไม่มี Module สำหรับ **Coverage & Data Quality** แยกออกมา ทั้งที่ FR-CVG-01..05 เป็นข้อกำหนดระดับ M (Must)
> และ Coverage ถูกอ้างถึงในเกือบทุก Dashboard → ควรยก Coverage เป็น Module หรือ Domain Service ที่ชัดเจน (ดู GAP-M01)

---

## 5. ขอบเขตชัดเจนพอจะพัฒนาได้หรือไม่?

**สรุป: ยังไม่พร้อมเริ่มพัฒนา Feature — ต้องเคลียร์ BLOCKER 10 รายการก่อน**

| ประเด็น | สถานะ | เหตุผล |
|---|---|---|
| Business Process | 🟢 ชัดเจน | BP-01..BP-10 ครบ มีเงื่อนไขปิด Batch ชัด |
| Field Status Model | 🟢 ชัดเจน | 4 สถานะ (HAS_VALUE / EXPLICIT_NONE / BLANK_IN_PAPER / ILLEGIBLE) กำหนดครบ |
| แบบสอบถาม → ฟิลด์ | 🟡 ส่วนใหญ่ชัด | มี 9 จุดที่กระดาษกับ Schema ไม่ตรง (ดู [03](03-questionnaire-database-mapping.md)) |
| Role & Permission | 🔴 ไม่ชัด | ชื่อ Role ขัดกันระหว่างเอกสารกับ Schema |
| Coverage Model | 🔴 ไม่ชัด | Schema ไม่มีฟิลด์ Coverage เลย + ยังอิงสมมติฐาน 600 ที่ถูกยกเลิก |
| Community/พื้นที่ | 🔴 ไม่ชัด | Schema รองรับ 1 ชุมชน = 1 ตำบล แต่ควนสันติครอบคลุม 2 ตำบล |
| Risk Model | 🔴 ไม่ชัด | น้ำหนักรวม 115 แต่ CHECK จำกัด 0–100 + ไม่มี Version |
| Business Rules | 🔴 ไม่ครบ | BR-01..BR-22, BR-40..BR-57 เขียนว่า "(เหมือนเดิม — ดู v2.0)" แต่**ไม่มีไฟล์ v2.0 ในโปรเจกต์** |
| Sitemap รายบทบาท | 🟡 อ้างไฟล์ที่ไม่มี | อ้าง `sitemap-navigation.md` ซึ่งไม่มีในโปรเจกต์ |
| Appendix Mapping | 🟡 อ้างไฟล์ที่ไม่มี | อ้าง "v2.0 Appendix ก" ซึ่งไม่มี |

**ข้อสรุป:** เอกสาร v3.0 เป็น "เอกสารส่วนต่าง" ที่อ้างอิง v2.0 และ v1.0 อย่างหนัก แต่เอกสารทั้งสองเวอร์ชันนั้น**ไม่มีอยู่ในโปรเจกต์** ทำให้ Business Rule ที่สำคัญที่สุดของระบบ (BR-01 ถึง BR-57) **ไม่มีข้อความจริงให้อ่านได้** → นี่คือ BLOCKER ที่ใหญ่ที่สุดของเอกสาร (ดู GAP-D01)

---

## 6. การจำแนก Requirement

### 6.1 Functional Requirement (FR)

| กลุ่ม | รหัส | จำนวน | สถานะความชัดเจน |
|---|---|---|---|
| Public Portal | FR-PUB-01..15 | 15 | 🟢 ครบ |
| Volunteer Mgmt | FR-VOL-01..10 | 10 | 🟢 ครบ แต่ Schema ไม่รองรับ |
| Auth & RBAC | FR-AUTH-01..12 | 12 | 🟢 ครบ |
| Batch & Paper | FR-BAT-01..08 | 8 | 🟢 ครบ |
| Data Entry | FR-ENT-01..17 | 17 | 🟢 ครบ |
| Verification | FR-VER-01..07 | 7 | 🟢 ครบ |
| Coverage | FR-CVG-01..05 | 5 | 🟢 ครบ แต่ Schema ไม่รองรับ |
| Vulnerable/Risk/GIS/Dashboard/Search/Resource/Incident/Notification/Report/Admin | FR-VUL / FR-RSK / FR-GIS / … | **ไม่ระบุ** | 🔴 เอกสารเขียนว่า "(รายละเอียดเดิมทั้งหมดยังใช้ได้ ดู v2.0 sections 6.3-6.12)" — **ไม่มีตัวเอกสาร** |

**FR ที่ระบุเพิ่มเฉพาะเจาะจงใน v3.0:** FR-VUL-08 (อายุครรภ์คำนวณจาก `surveyedAt`), FR-RSK-07 (ห้ามคำนวณ Risk จนกว่า VERIFIED), FR-RSK-08 (แสดง Confidence), FR-GIS-16 (โซนไม่มีข้อมูลเป็นสีเทา), FR-GIS-15 (อ้างถึงใน Schema — ตรวจพิกัดซ้ำ)

### 6.2 Non-functional Requirement (NFR)

| หมวด | รหัส | ตัวอย่างเกณฑ์ |
|---|---|---|
| Entry Speed/UX/Quality | NFR-E-01..04 | ≤4 นาที/ใบ, Tab latency ≤50ms, **แตะเมาส์ 0 ครั้ง**, Error ≤0.5% |
| Public | NFR-PUB-01..03 | โหลด ≤2 วิ บน 3G, ใช้ได้แม้ Server ล่ม (Static/CDN), ≥10,000 concurrent |
| Performance | NFR-P-01..04 | Dashboard ≤2 วิ (P95), Map 5,000 หมุด ≤3 วิ, บันทึกใบ ≤1 วิ, ≥50 concurrent |
| Availability | NFR-A-01..02 | ปกติ ≥99.0%, ช่วง Incident ≥99.9% |
| Security | NFR-S-01..08 | TLS 1.3, AES-256 at rest, Argon2/bcrypt, Audit append-only |
| Compliance | NFR-C-01 | PDPA พ.ศ. 2562 |
| Usability | NFR-U-01..03 | ภาษาไทยเต็มรูปแบบ, Entry ≥1366px, Public ≥320px |
| Reliability | NFR-R-01..02 | Backup Daily + WAL 30 วัน, RPO ≤24 ชม. / RTO ≤4 ชม. |
| Maintainability | NFR-M-01..02 | Test Coverage ≥70%, Docker Compose 1 คำสั่ง |
| Scalability | NFR-SC-01 | ≥50,000 ครัวเรือน |

### 6.3 Business Rule (BR)

| กลุ่ม | รหัส | สถานะ |
|---|---|---|
| การจัดเก็บข้อมูล | BR-01..BR-14 | 🔴 **ไม่มีข้อความ** (อ้าง v2.0) — พบเพียงเศษเสี้ยวใน Comment ของ Schema |
| การคำนวณความเสี่ยง | BR-15..BR-22 | 🔴 **ไม่มีข้อความ** (อ้าง v2.0) |
| สิทธิ์และความเป็นส่วนตัว | BR-23..BR-30, BR-58..BR-68 | 🟢 มีข้อความครบในเอกสาร |
| การคีย์ข้อมูล | BR-40..BR-57 | 🔴 **ไม่มีข้อความ** (อ้าง v2.0) |

**BR ที่กู้คืนได้จาก Comment ใน Schema/SQL (ต้องยืนยัน):**
BR-01 (ห้ามซ้ำ บ้านเลขที่+หมู่+ตำบล), BR-03 (พิกัดในขอบเขต), BR-04 (2 ตำบล), BR-05 (สมาชิก 1–50), BR-06 (อายุ 0–120), BR-10 (ระดับน้ำ ≤1000 ซม.), BR-12 (ท่วม 1–365 วัน), BR-15 (คำนวณ Risk อัตโนมัติ), BR-19 (Officer ยืนยัน Risk Final), BR-29 (ห้าม Hard Delete), BR-40 (เลขประจำใบ), BR-42/43 (Field Status), BR-44 (ห้ามคนเดียวกันคีย์ 2 รอบ), BR-46 (คำนวณ Risk เมื่อ VERIFIED), BR-47 (ห้าม default surveyedAt = now), BR-48/57 (Triage อิง surveyedAt), BR-54 (ห้ามคนคีย์ประเมิน Risk เอง), BR-56 (Confidence), BR-58 (DATA_ENTRY ห้าม Query), BR-59 (ลงนามข้อตกลง)

### 6.4 Security Requirement

- TLS 1.3, AES-256 at rest สำหรับข้อมูลอ่อนไหว, Argon2/bcrypt สำหรับรหัสผ่าน
- OWASP: Prisma (SQLi) + Zod (Validation) + CSRF
- Audit Log **Append-only**
- **DATA_ENTRY ต้อง Query ไม่ได้** — เห็นทีละใบที่ Lock (NFR-S-06, BR-58, FR-AUTH-08)
- **VOLUNTEER เห็น Aggregate เท่านั้น** ห้ามเห็น PII (NFR-S-07, BR-64)
- VOLUNTEER เห็น PII เฉพาะ Incident Mode + เฉพาะรายที่มอบหมาย (BR-65, FR-AUTH-10)
- 2FA สำหรับ Admin (FR-AUTH-05), ล็อกบัญชีหลังรหัสผิด 5 ครั้ง (FR-AUTH-12)
- Auto-logout 30 นาที + ปลด Lock ใบ (FR-AUTH-06)
- เจ้าหน้าที่คีย์ลงนามข้อตกลงรักษาความลับก่อนคีย์ใบแรก (FR-AUTH-11, BR-59)
- อาสาสมัครใหม่ต้องผ่านการอนุมัติก่อนเห็นข้อมูลใดๆ (BR-68)
- ป้องกันอาสาสมัครปลอมสมัครเพื่อดูข้อมูล (RK-V1)

### 6.5 Privacy Requirement

- **Data Categories 4 ระดับ:** L4 อ่อนไหวสูงสุด (โรค, ยา, จิตเวช, ฟอกไต, อายุครรภ์) / L3 ข้อมูลส่วนบุคคล (ชื่อ, เบอร์, บ้านเลขที่, พิกัดแม่นยำ, สแกนกระดาษ) / L2 ภายใน (ระดับเสี่ยง, ประเภทอาคาร, ทรัพยากร) / L1 สาธารณะ (สถิติรวม, จุดอพยพ, เบอร์ฉุกเฉิน)
- ต้องได้ Consent ก่อนบันทึกข้อมูลกลุ่มเปราะบาง (BR-23) — **⚠️ กระดาษไม่มีช่อง Consent**
- ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหว ม.26 → เข้ารหัส + จำกัดสิทธิ์ (BR-24)
- ทุกครั้งที่ดู/Export ข้อมูลกลุ่มเปราะบาง ต้องบันทึก Audit Log (BR-26)
- ข้อมูล Researcher ต้อง Anonymize (BR-27)
- เจ้าของข้อมูลมีสิทธิ์ขอดู/แก้/ลบ ภายใน 30 วัน (BR-28)
- ห้าม Hard Delete ยกเว้นคำขอ PDPA (BR-29)
- เก็บได้ไม่เกิน 5 ปี (BR-30)
- หน้า Public: ห้าม PII, Jitter พิกัด ±50m หรือแสดงเป็น Grid (BR-66, BR-67, FR-PUB-11/12, NFR-S-08)
- ไฟล์สแกนกระดาษ = ข้อมูล L4 ต้องเข้ารหัส (BR-62)
- กระดาษเก็บตู้ล็อก มีทะเบียนเบิก (BR-60), ห้ามถ่ายรูปกระดาษออกนอกสถานที่ (BR-61)

### 6.6 GIS Requirement

- PostGIS ตั้งแต่วันแรก — `geography(Point, 4326)` (T1)
- Mini map ข้างช่องพิกัดใน Entry Console แสดงทันทีเมื่อคีย์ครบ (FR-ENT-14)
- เตือนพิกัดนอกขอบเขต / สลับ lat-lng / ซ้ำเป๊ะ (FR-ENT-15, FR-GIS-15)
- แผนที่ต้องแสดงโซนไม่มีข้อมูลเป็นสีเทา (FR-CVG-02, FR-GIS-16)
- Map 5,000 หมุด ≤3 วินาที (NFR-P-02)
- GeoJSON API + bbox query, Coverage GeoJSON, Spatial Query
- หน้า Public: เฉพาะจุดอพยพ + Heatmap ระดับ Grid + Jitter ±50m (FR-PUB-06/12)
- Static Map API สำหรับ mini map เพื่อประหยัดค่า Google Maps (T9), Fallback OSM เมื่องบจำกัด

### 6.7 Reporting Requirement

- **รายงานทุกฉบับต้องมี Coverage Watermark** (FR-CVG-05)
- **สถิติทุกตัวต้องมี Denominator** (FR-CVG-03)
- Dashboard ทุกหน้าต้องแสดง Coverage Badge (FR-CVG-01)
- เตือนเมื่อ Export ข้อมูลที่ Coverage <80% (FR-CVG-04)
- Export PDF/Excel/CSV ผ่าน ExportJob (Background) + หมดอายุ 7 วัน
- PDF ภาษาไทยต้องไม่มีสี่เหลี่ยม/สระลอย → Puppeteer + HTML (T3, RK-11)
- Researcher Export ต้อง Anonymized (BR-27)
- DATA_ENTRY และ VERIFIER **ห้าม Export**

---

## 7. KPI ความสำเร็จ (สรุป)

| โซน | ตัวชี้วัดหลัก | เป้าหมาย |
|---|---|---|
| 🌊 Public | โหลดหน้า Landing บน 3G | ≤ 2 วินาที |
| 🌊 Public | อาสาที่ได้รับอนุมัติภายใน 3 วัน | ≥ 80% |
| 🏭 Entry | ใบที่คีย์แล้ว ณ เดือนที่ 3 | ≥ 90% |
| 🏭 Entry | Error rate หลัง Double-entry | ≤ 0.5% |
| 🏭 Entry | ใบที่มี Consent ครบ | 100% |
| 🎯 Decision | Coverage | ≥ 85% ⚠️ ขัดกับเป้าหมายใหม่ ">60%" (ดู CONF-02) |
| 🎯 Decision | เวลาตอบสนอง P1 เมื่อเกิดเหตุจริง | ≤ 30 นาที |
| 🎯 Decision | เหตุข้อมูลรั่วไหล | 0 |

---

## 8. เอกสารที่เกี่ยวข้อง

- [02-requirement-gap-analysis.md](02-requirement-gap-analysis.md) — Requirement ที่ขาด/ซ้ำ/ขัดแย้ง
- [03-questionnaire-database-mapping.md](03-questionnaire-database-mapping.md) — Mapping กระดาษ → DB
- [04-schema-gap-analysis.md](04-schema-gap-analysis.md) — ปัญหา Schema
- [14-open-questions.md](14-open-questions.md) — สิ่งที่ต้องยืนยันจากเจ้าของระบบ
