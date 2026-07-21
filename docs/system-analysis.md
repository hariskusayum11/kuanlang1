# เอกสารวิเคราะห์และออกแบบระบบ (ฉบับสมบูรณ์ v3.0)
# ระบบสารสนเทศการจัดการภัยพิบัติโดยชุมชนเป็นฐาน
### เครือข่าย "สองคลองควนลัง" (SKL-FRIS: Song Khlong Khuan Lang Flood Resilience Information System)

| หัวข้อ | รายละเอียด |
|---|---|
| ชื่อระบบ (ย่อ) | SKL-FRIS |
| หน่วยงานเจ้าของ | เครือข่ายสองคลองควนลัง / มหาวิทยาลัยทักษิณ |
| พื้นที่ | ต.ควนลัง, ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา |
| โมเดลการเก็บข้อมูล | **สำรวจด้วยกระดาษ → เจ้าหน้าที่คีย์เข้าระบบ** (Paper-first, Back-office Entry) |
| ปริมาณงานตั้งต้น | **3,000 ชุด (600 ชุด × 5 ชุมชน)** |
| ผู้คีย์ข้อมูล | **เจ้าหน้าที่/จ้างคีย์/นักศึกษาฝึกงาน** (ไม่ใช่อาสาสมัครชุมชน) |
| หน้าสาธารณะ | **มี — ไม่ต้อง Login เปิดได้ทันทีตอนฉุกเฉิน** |
| เทคโนโลยีหลัก | Next.js (App Router), Better Auth, PostgreSQL + PostGIS, Prisma, Docker |
| เวอร์ชันเอกสาร | **3.0** |

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [Problem Analysis](#2-problem-analysis)
3. [Requirement Analysis](#3-requirement-analysis)
4. [Business Process](#4-business-process)
5. [User Journey](#5-user-journey)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Actors](#8-actors)
9. [User Roles (RBAC)](#9-user-roles)
10. [Use Cases](#10-use-cases)
11. [Business Rules](#11-business-rules)
12. [Data Categories](#12-data-categories)
13. [Entity / Data Model](#13-entity--data-model)
14. [Module](#14-module)
15. [Dashboard](#15-dashboard)
16. [Reports](#16-reports)
17. [GIS / Mapping](#17-gis--mapping)
18. [Future Expansion](#18-future-expansion)
19. [ความเสี่ยงของระบบ](#19-ความเสี่ยงของระบบ)
20. [ข้อเสนอแนะในการออกแบบ](#20-ข้อเสนอแนะในการออกแบบ)
21. [Sitemap & Navigation](#21-sitemap--navigation)
22. [Prisma Schema Reference](#22-prisma-schema-reference)
23. [API Endpoints](#23-api-endpoints)
24. [Deployment](#24-deployment)
25. [Testing Strategy](#25-testing-strategy)
26. [KPI ความสำเร็จ](#26-kpi-ความสำเร็จ)
27. [Appendix](#27-appendix)

---

## บันทึกการเปลี่ยนแปลง (Change Log)

| เวอร์ชัน | วันที่ | เปลี่ยนแปลง |
|---|---|---|
| v1.0 | — | ร่างแรก — สมมติว่าระบบแทนที่กระดาษ (Mobile-first, Offline PWA) |
| v2.0 | — | แก้สมมติฐาน — กระดาษยังอยู่ ระบบเป็นปลายทางคีย์ (Desktop-first, Batch, Double-entry) |
| **v3.0** | **ปัจจุบัน** | **(1)** อาสาสมัคร ≠ คนคีย์ — แยก VOLUNTEER (ชุมชน) ออกจาก DATA_ENTRY (เจ้าหน้าที่) **(2)** เพิ่มหน้า Public Landing ไม่ต้อง Login ใช้ตอนฉุกเฉินได้ทันที **(3)** เพิ่ม Volunteer Management Module **(4)** รวมเอกสารทั้งหมดเป็นฉบับเดียว |

---

## 1. ภาพรวมระบบ

### 1.1 ระบบนี้คืออะไร

ระบบสารสนเทศที่เปลี่ยนแบบสอบถามกระดาษ 3,000 ใบ ให้เป็น **"ข้อมูลที่มีชีวิต"** ที่ชุมชนใช้ตัดสินใจได้จริงทั้ง 3 ช่วงเวลา — ก่อนเกิดภัย (เตรียมพร้อม), ระหว่างเกิดภัย (ปฏิบัติการ), หลังเกิดภัย (ฟื้นฟู)

### 1.2 ระบบมี 4 โซนการใช้งาน

```
┌─────────────────────────────────────────────────────────────┐
│  🌊 Public Zone (ไม่ต้อง Login — ใครก็เปิดได้ ตอนฉุกเฉินก็ใช้ได้)│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Landing  │ │ จุดอพยพ  │ │ ฉุกเฉิน  │ │ สมัครอาสาสมัคร  ││
│  │ +แผนที่  │ │ +แผนที่  │ │ +เบอร์   │ │ (8 ด้าน)        ││
│  │ +สถิติ   │ │ +เส้นทาง │ │ +คำแนะนำ │ │                  ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  🏭 Entry Zone (เจ้าหน้าที่คีย์ — Phase 1)                    │
│  Entry Console → Batch → Verify → Discrepancy → Quality    │
├─────────────────────────────────────────────────────────────┤
│  🎯 Decision Zone (เจ้าหน้าที่/ผู้บริหาร — Phase 2)           │
│  Dashboard → Map → Household → Vulnerable → Report         │
├─────────────────────────────────────────────────────────────┤
│  🤝 Volunteer Zone (อาสาสมัครชุมชน — Phase 2-3)              │
│  ข้อมูลชุมชน → แผนที่ → จุดอพยพ → งานของฉัน (Incident)     │
├─────────────────────────────────────────────────────────────┤
│  🚨 Incident Zone (เมื่อเกิดเหตุ — Phase 3)                  │
│  ประกาศเหตุ → Task Board → Volunteer Assignment → SOS      │
├─────────────────────────────────────────────────────────────┤
│  ⚙️ Admin Zone                                               │
│  Users → Master Data → Risk Config → Audit → Settings      │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 ข้อเท็จจริงสำคัญที่ต้องเข้าใจก่อนอ่านเอกสารนี้

| ข้อ | ข้อเท็จจริง | ผลต่อการออกแบบ |
|---|---|---|
| 1 | **กระดาษยังเป็นเครื่องมือสำรวจ** — ระบบไม่ได้แทนที่กระดาษ | ฟอร์มในระบบต้องเรียงตรงกระดาษ 100% |
| 2 | **3,000 ใบ (600×5 ชุมชน)** เข้ามาพร้อมกันเป็นก้อน | ต้องมี Batch Management + Throughput Dashboard |
| 3 | **คนคีย์คือเจ้าหน้าที่/จ้างคีย์** ไม่ใช่อาสาสมัครชุมชน | ควบคุมได้ดีกว่า แต่ต้องมีงบจ้าง |
| 4 | **อาสาสมัครคือชาวบ้านที่สมัครช่วยชุมชน** ในด้านต่างๆ | เป็น Role แยก เห็นข้อมูลระดับ Aggregate ไม่เห็น PII |
| 5 | **ต้องมีหน้าสาธารณะ** เปิดได้โดยไม่ต้อง Login | ใช้ตอนฉุกเฉิน ไม่มีใครจำรหัสผ่านตอนตี 2 ฝนตกหนัก |
| 6 | **กระดาษไม่มีช่อง Consent (PDPA)** | ⚠️ ต้องพิมพ์ใบ Consent แนบก่อนลงพื้นที่ |
| 7 | **พิกัด GPS จดด้วยมือ** ไม่ได้จับจากมือถือ | มีโอกาสผิดสูง ต้อง Validate ตอนคีย์ |

### 1.4 สถาปัตยกรรมภาพรวม

```
┌─────────────────────────────────────────────────────────────┐
│  Client Layer (Desktop-first)                               │
│  ├─ Public Portal (SSG/ISR — Cache ได้, ทนต่อ Traffic Spike)│
│  ├─ Data Entry Console (Keyboard-optimized)                 │
│  ├─ Verification Console (Double-entry)                     │
│  ├─ Dashboard / Map / Reports                                │
│  ├─ Volunteer Portal                                         │
│  └─ Admin Console                                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│              Next.js App Router (Docker)                    │
│  ├─ Server Actions (Mutation)                               │
│  ├─ Route Handlers (Export / API / GeoJSON)                 │
│  ├─ Better Auth (Session + RBAC)                            │
│  ├─ Zod (Validation)                                        │
│  ├─ Prisma ORM                                              │
│  ├─ Risk/Triage Engine                                      │
│  └─ Discrepancy Engine                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16 + PostGIS  │  MinIO/S3          │  Redis      │
│  - Transactional          │  - สแกนกระดาษ      │  - Cache    │
│  - Spatial Index          │  - Export Files    │  - BullMQ   │
└─────────────────────────────────────────────────────────────┘
        │                           │
        │   External Services       │
        ├── Google Maps API ────────┘
        ├── LINE Messaging API
        └── SMS Gateway
```

---

## 2. Problem Analysis

### 2.1 ปัญหาแบ่งตาม 4 โซน

#### 🌊 ปัญหาโซน Public (ใหม่ v3.0)

| # | ปัญหา | ผลกระทบ | ระดับ |
|---|---|---|---|
| PP1 | **ไม่มีที่ให้ชาวบ้านดูจุดอพยพตอนฉุกเฉิน** — ต้อง Login ก่อน | น้ำท่วมตี 2 ไม่มีใครจำรหัสผ่านได้ | 🔴 วิกฤต |
| PP2 | **ไม่มีเบอร์ฉุกเฉินรวมศูนย์** | หาเบอร์ไม่ทัน | 🟠 สูง |
| PP3 | **ไม่มีช่องทางให้ชาวบ้านรู้สถานะเหตุการณ์** | ไม่รู้ว่าอพยพหรือยัง | 🟠 สูง |
| PP4 | **ไม่มีช่องทางสมัครอาสาสมัครออนไลน์** | อาสาน้อย | 🟡 กลาง |

#### 🏭 ปัญหาโซน Entry (จาก v2.0)

| # | ปัญหา | ผลกระทบ | ระดับ |
|---|---|---|---|
| PE1 | คีย์ไม่เสร็จ / ค้างเป็นปี | ระบบไม่มีข้อมูล | 🔴 วิกฤต |
| PE2 | คีย์ผิดโดยไม่มีใครรู้ | ตัดสินใจบนข้อมูลผิด | 🔴 วิกฤต |
| PE3 | กระดาษหาย/ตกหล่น | ข้อมูลหายถาวร | 🔴 วิกฤต |
| PE4 | ลายมืออ่านไม่ออก | เดาข้อมูล = ข้อมูลปลอม | 🟠 สูง |
| PE5 | ข้อมูลในกระดาษขาด/ว่าง | ไม่รู้ว่า "ไม่มี" หรือ "ไม่ได้ถาม" | 🟠 สูง |
| PE6 | เจ้าหน้าที่คีย์ตีความต่างกัน | ข้อมูลไม่สม่ำเสมอ | 🟠 สูง |
| PE7 | กระดาษซ้ำ (บ้านเดียวสำรวจ 2 ครั้ง) | สถิติเพี้ยน | 🟠 สูง |
| PE9 | ข้อมูลอ่อนไหวรั่วผ่านกระดาษ | ผิด PDPA | 🟠 สูง |
| PE10 | ไม่มี Consent ในกระดาษ | **ผิด PDPA ม.26** | 🔴 วิกฤต |

#### 🎯 ปัญหาโซน Decision (จาก v1.0)

| # | ปัญหา | ระดับ |
|---|---|---|
| P1 | ช่วยเหลือกลุ่มเปราะบางไม่ทัน — ไม่มีทะเบียนค้นหาเร็ว | 🔴 วิกฤต |
| P2 | ไม่รู้ว่าพื้นที่ไหนเสี่ยงสูง | 🟠 สูง |
| P3 | จัดสรรทรัพยากรไม่ตรงจุด | 🟠 สูง |
| P4 | ข้อมูลไม่เป็นปัจจุบัน | 🟠 สูง |
| P5 | เตือนภัยไม่ถึงตัว | 🟠 สูง |

### 2.2 คำนวณภาระงาน (Workload Analysis)

```
3,000 ใบ × 4 นาที/ใบ (Entry 1)                    = 200 ชม.
3,000 ใบ × 3 นาที/ใบ (Entry 2 เฉพาะฟิลด์วิกฤต)    = 150 ชม.
Discrepancy resolution ~10%                        =  25 ชม.
────────────────────────────────────────────────────────
รวม                                                ≈ 375 ชม.-คน

✅ เจ้าหน้าที่ 5 คน เต็มเวลา (8 ชม./วัน) = เสร็จใน ~10 วันทำการ
✅ เจ้าหน้าที่ 3 คน + นักศึกษา 5 คน (4 ชม./วัน) = เสร็จใน ~3 สัปดาห์
```

> **ข้อดีที่เปลี่ยนจากอาสาสมัครเป็นเจ้าหน้าที่:** ควบคุมเวลาได้ อบรมได้ ตั้ง KPI ได้ ไม่ต้องกลัวคนหาย

### 2.3 Double-Entry Recommendation

**ข้อเสนอ: Double-entry เฉพาะฟิลด์วิกฤต** (ประหยัดเวลา 40%)

ฟิลด์ที่ต้อง Double-entry:
- ชื่อ-นามสกุลกลุ่มเปราะบาง ⭐
- เบอร์โทรศัพท์ (ทุกเบอร์) ⭐
- ประเภทความเปราะบาง (9 ช่อง) ⭐
- พิกัด GPS ⭐
- บ้านเลขที่ + หมู่ ⭐
- ระดับน้ำสูงสุด ⭐

ฟิลด์อื่น (ข้อเสนอแนะ, ทรัพยากร, ช่องทางรับข่าว) → Single entry พอ

---

## 3. Requirement Analysis

### 3.1 Stakeholder Analysis

| Stakeholder | ความต้องการหลัก | ⚠️ ความเสี่ยง |
|---|---|---|
| **ชาวบ้าน/ประชาชนทั่วไป** ⭐ ใหม่ | ดูจุดอพยพ/เบอร์ฉุกเฉินตอนน้ำท่วมได้ทันทีโดยไม่ต้อง Login | หน้า Public ล่มตอน Traffic Spike |
| **อาสาสมัครชุมชน** ⭐ ปรับ | สมัครง่าย เห็นข้อมูลชุมชนตัวเอง รับงานตอนเกิดเหตุ | สมัครปลอมเพื่อดูข้อมูล |
| **เจ้าหน้าที่คีย์ข้อมูล** ⭐ ปรับ | คีย์เร็ว ไม่เมื่อย ไม่งง | คีย์ผิด / คีย์ช้า |
| **หัวหน้าทีมคีย์ (Coordinator)** | รู้ว่าคีย์ไปถึงไหน ปึกไหนหาย | ไม่มีคนรับบทนี้ |
| **ผู้สำรวจภาคสนาม** | ถูกถามกลับให้น้อยที่สุด | ถูกถามเยอะจนไม่อยากช่วย |
| **เจ้าหน้าที่เทศบาล/ปภ.** | รู้ว่าต้องช่วยใครก่อน มีแผนที่ | ต้องรอข้อมูลคีย์เสร็จ |
| **ผู้บริหาร** | Dashboard ตัวเลขใหญ่ รายงาน | อาจกดดันให้เร่งจนคุณภาพตก |
| **นักวิจัย ม.ทักษิณ** | ข้อมูลดิบ Export ได้ | |
| **ชาวบ้านเจ้าของข้อมูล** | ข้อมูลไม่รั่ว ใช้ถูกวัตถุประสงค์ | ไม่เคยเซ็นยินยอม |

### 3.2 ข้อจำกัด

| ข้อจำกัด | ผลต่อการออกแบบ |
|---|---|
| กระดาษพิมพ์แล้ว 3,000 ชุด แก้ไม่ได้ | ฟอร์มต้องตรงกับกระดาษ ห้ามเพิ่มฟิลด์ที่กระดาษไม่มี |
| กระดาษไม่มีช่อง Consent | ⚠️ ต้องพิมพ์ใบ Consent แนบก่อนลงพื้นที่ |
| งบประมาณจำกัด → Open Source | Google Maps มีค่าใช้จ่าย → Fallback OSM |
| ผู้ใช้บางส่วนเป็นผู้สูงอายุ | หน้า Public ต้องตัวใหญ่ ง่าย ภาษาไทย |
| PDPA พ.ศ. 2562 | ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหว ม.26 |
| สัญญาณเน็ตอาจไม่ดีตอนน้ำท่วม | หน้า Public ต้อง Cache ได้ / CDN / Static |

---

## 4. Business Process

### 4.1 BP-01: กระบวนการรับและจัดการกระดาษ (Paper Intake)

```
[ผู้สำรวจ] ──► รวบรวมกระดาษเป็นปึก
                    │
              [ผู้ประสาน] ──► นับจำนวนใบ
                    │        ──► สร้าง Batch ในระบบ
                    │        ──► พิมพ์/เขียนเลขประจำใบทุกใบ
                    │        ──► (Optional) สแกน PDF
                    │        ──► เก็บเข้าตู้ล็อก
                    │
              [ระบบ] ──► สร้าง Batch ID + เลขใบ
                       ──► status: READY_FOR_ENTRY
```

### 4.2 BP-02: กระบวนการคีย์ข้อมูล (Data Entry)

```
[เจ้าหน้าที่คีย์] ──► Login
                    ──► กด "หยิบงาน" → ระบบ Lock ใบ 10 นาที
                    ──► เดินไปหยิบกระดาษจากตู้
                    ──► คีย์ ส่วนที่ 0→1→2→3→4→5
                    │   ├─ อ่านไม่ออก? → กด F2 (Mark ILLEGIBLE)
                    │   ├─ ว่างในกระดาษ? → กด F3 (Mark BLANK)
                    │   └─ พิกัดผิดปกติ? → ระบบเตือนทันที
                    ──► กด Ctrl+Enter ส่ง
                    ──► ระบบ Validate + ตรวจซ้ำ
                    ──► status: ENTERED_1
                    ──► เอากระดาษคืนตู้ช่อง "คีย์แล้ว"
                    ──► Auto-lock ใบถัดไป
```

### 4.3 BP-03: กระบวนการยืนยัน (Double-Entry Verification)

```
[เจ้าหน้าที่คีย์ B] (ต้องไม่ใช่คนเดิม!)
    ──► หยิบใบที่ status = ENTERED_1
    ──► คีย์ซ้ำ "เฉพาะฟิลด์วิกฤต" (ไม่เห็นค่าที่คนแรกคีย์!)
    ──► ส่ง → Discrepancy Engine เทียบ
    ├─ ตรงกัน → VERIFIED → คำนวณ Risk/Triage → ขึ้น Dashboard/Map
    └─ ไม่ตรง → DISCREPANCY → เข้าคิว Verifier ตัดสิน
```

### 4.4 BP-04: กระบวนการส่งคำถามกลับสนาม (Field Query Loop)

```
[ระบบ] ──► รวบรวม ILLEGIBLE / BLANK / DISCREPANCY ที่แก้ไม่ได้
       ──► จัดกลุ่มตามผู้สำรวจ/ซอย
       ──► สร้าง PDF ใบคำถามกลับ
[ผู้สำรวจ] ──► โทรถาม/ไปถามซ้ำ → ตอบกลับ
[ผู้ประสาน] ──► คีย์คำตอบเข้าระบบ → VERIFIED
```

### 4.5 BP-05: กระบวนการปิด Batch

เงื่อนไขปิด Batch:
- จำนวนใบที่คีย์ = expectedCount (ครบทุกใบ)
- ไม่มีใบ LOCKED ค้าง
- Discrepancy แก้หมดแล้ว
- ผู้ประสานกด "ยืนยันปิด Batch"

### 4.6 BP-06: กระบวนการสมัครอาสาสมัครชุมชน (ใหม่ v3.0)

```
[ชาวบ้าน] ──► เปิดหน้า Public Landing
           ──► กด "สมัครอาสาสมัคร"
           ──► กรอก: ชื่อ, เบอร์, อีเมล, ชุมชน, ความเชี่ยวชาญ (8 ด้าน)
           ──► ยอมรับเงื่อนไข PDPA
           ──► รอ Admin/Coordinator อนุมัติ (1-3 วัน)
           ──► ได้รับอนุมัติ → Login → เห็นข้อมูลชุมชนตามสิทธิ์
```

### 4.7 BP-07 ถึง BP-10: กระบวนการใช้งาน (จาก v1.0)

- **BP-07 เตรียมพร้อมก่อนเกิดภัย** — ดู Dashboard → ดึงรายชื่อ P1 → จับคู่ทรัพยากร → Export แผน
- **BP-08 ปฏิบัติการขณะเกิดภัย** — Incident Mode → Task → มอบหมายอาสาสมัคร → ติดตาม
- **BP-09 ฟื้นฟูหลังน้ำลด** — ประเมินความเสียหาย → ส่งต่อทีมจิตวิทยา/โครงการแก้จน
- **BP-10 Re-survey** — ⚠️ ต้องพิมพ์กระดาษใหม่ → วนกลับ BP-01

---

## 5. User Journey

### 5.1 Journey: ชาวบ้าน ตอนน้ำท่วม (ใหม่ v3.0 — สำคัญที่สุด)

| Stage | Action | ก่อนมีระบบ | หลังมีระบบ |
|---|---|---|---|
| ตี 2 ฝนตกหนัก | ตื่น ตกใจ | ไม่รู้ว่าอพยพยังไง | เปิดมือถือ → เจอหน้าเว็บทันที ไม่ต้อง Login |
| จะไปไหน? | หาจุดอพยพ | ถามเพื่อนบ้าน / ไม่รู้ | กดแผนที่ → เห็นจุดอพยพใกล้ + เส้นทาง |
| ขอความช่วยเหลือ | โทรหาใคร? | หาเบอร์ไม่เจอ | เห็นเบอร์ฉุกเฉินบนหน้าเว็บ |
| สถานะ | เกิดอะไรขึ้น? | ฟังข่าว | เห็น "⚠ ประกาศเตือนภัยระดับ 4" บนหน้าเว็บ |

### 5.2 Journey: อาสาสมัครชุมชน (ปรับใหม่ v3.0)

| Stage | Action | ก่อนมีระบบ | หลังมีระบบ |
|---|---|---|---|
| สมัคร | อยากช่วยชุมชน | ไม่รู้สมัครที่ไหน | กด "สมัครอาสาสมัคร" ในหน้า Public |
| รอ | รออนุมัติ | — | ได้อีเมลแจ้ง 1-3 วัน |
| ใช้งาน | ดูข้อมูลชุมชน | ไม่เคยเห็น | Login → เห็นสถิติ, แผนที่, จุดอพยพ, ทรัพยากร |
| เกิดเหตุ | รับงานช่วยเหลือ | ไม่รู้ว่าต้องไปช่วยใคร | ได้รับแจ้ง → เห็นรายชื่อ+ที่อยู่+สิ่งที่ต้องช่วย |

### 5.3 Journey: เจ้าหน้าที่คีย์ข้อมูล (ปรับจาก v2.0)

| Stage | Action | Solution |
|---|---|---|
| เริ่มงาน | Login → เห็นปุ่ม "เริ่มคีย์" | หน้าแรกมีปุ่มเดียว |
| หยิบงาน | ระบบบอกว่าหยิบใบไหน | "ไปหยิบ SHEET-KL01-001-024 ที่ตู้ A ช่อง 3" |
| คีย์ | ฟอร์มเรียงตรงกระดาษ | Keyboard-only, Tab ไหลตามลำดับ |
| ติดขัด | ลายมืออ่านไม่ออก | F2 = Mark แล้วคีย์ต่อ (ไม่ต้องเดา) |
| ส่ง | Ctrl+Enter | Validate + ตรวจซ้ำ + Auto-lock ใบถัดไป |
| เหนื่อย | คีย์ไป 30 ใบ | Progress: "คุณคีย์แล้ว 30 ใบวันนี้ = 105 คนมีข้อมูลแล้ว" |

### 5.4 Journey: เจ้าหน้าที่เทศบาล (จาก v1.0 + Coverage Badge)

```
Login → Dashboard → ⚠️ "ข้อมูลครอบคลุม 28% (847/3,000)"
→ ดูรายชื่อ P1 → Export → วางแผน
⚠️ แผนที่แสดง "โซนที่ยังไม่มีข้อมูล" เป็นสีเทา ชัดเจน
```

---

## 6. Functional Requirements

### 6.1 Public Portal (PUB) — ใหม่ v3.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-PUB-01 | **ต้องมีหน้า Landing สาธารณะที่เปิดได้โดยไม่ต้อง Login** | M |
| FR-PUB-02 | **หน้า Landing ต้องแสดงแผนที่จุดอพยพทั้งหมด** พร้อมชื่อ ที่อยู่ ความจุ | M |
| FR-PUB-03 | **ต้องแสดงเบอร์ฉุกเฉิน** (เทศบาล, ปภ., ตำรวจ, 1784, โรงพยาบาล) | M |
| FR-PUB-04 | **ต้องแสดงสถานะเหตุการณ์ปัจจุบัน** ("ปกติ" หรือ "⚠ ประกาศเตือนภัย") | M |
| FR-PUB-05 | ต้องแสดงสถิติรวมชุมชน (จำนวนครัวเรือน, จุดอพยพ, อาสาสมัคร) — **Aggregate เท่านั้น** | M |
| FR-PUB-06 | ต้องแสดง Heatmap ความเสี่ยงระดับ Grid (ไม่เจาะรายบ้าน) | S |
| FR-PUB-07 | ต้องมีหน้าคำแนะนำฉุกเฉิน (เตรียมตัว, ถุงยังชีพ, เส้นทางอพยพ) | S |
| FR-PUB-08 | ต้องมีลิงก์ "สมัครอาสาสมัคร" ไปหน้าสมัคร | M |
| FR-PUB-09 | ต้องมีลิงก์ "เจ้าหน้าที่เข้าระบบ" ไปหน้า Login | M |
| FR-PUB-10 | **หน้า Public ต้อง Cache ได้ / ใช้ CDN** ทนต่อ Traffic Spike ตอนน้ำท่วม | M |
| FR-PUB-11 | **ห้ามแสดง PII ใดๆ** (ชื่อ, เบอร์, บ้านเลขที่, พิกัดแม่นยำรายบ้าน) | M |
| FR-PUB-12 | พิกัดในหน้า Public ต้อง Jitter ±50m หรือแสดงเป็น Grid | M |
| FR-PUB-13 | ต้องรองรับมือถือ (Responsive) — ข้อมูลต้องอ่านได้บนจอ 5 นิ้ว | M |
| FR-PUB-14 | ต้องโหลดเสร็จใน ≤ 2 วินาทีบนเน็ต 3G | M |
| FR-PUB-15 | ปุ่ม SOS สำหรับขอความช่วยเหลือ (เฟสถัดไป) | C |

### 6.2 Volunteer Management (VOL) — ใหม่ v3.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-VOL-01 | **ต้องมีหน้าสมัครอาสาสมัครสาธารณะ** (ไม่ต้อง Login) | M |
| FR-VOL-02 | ต้องกรอก: ชื่อ, เบอร์, อีเมล, ชุมชน (Dropdown), รหัสผ่าน | M |
| FR-VOL-03 | **ต้องเลือกความเชี่ยวชาญได้หลายข้อจาก 8 ด้าน** | M |
| FR-VOL-04 | ต้องระบุอุปกรณ์ที่มี (เรือ, เครื่องปั่นไฟ ฯลฯ) — ไม่บังคับ | S |
| FR-VOL-05 | ต้องยอมรับเงื่อนไข PDPA + ข้อตกลงการใช้ข้อมูล | M |
| FR-VOL-06 | **สมัครแล้วต้องรอ Admin/Coordinator อนุมัติก่อน Login** | M |
| FR-VOL-07 | ต้องแจ้งผลอนุมัติทางอีเมล | S |
| FR-VOL-08 | อาสาสมัครที่ได้รับอนุมัติ ดูข้อมูลชุมชนได้ตาม Permission Matrix | M |
| FR-VOL-09 | ต้องมีโปรไฟล์อาสาสมัคร (แก้ไขความเชี่ยวชาญ/อุปกรณ์ได้) | S |
| FR-VOL-10 | ต้องมีทะเบียนอาสาสมัครสำหรับ Officer (แยกตามด้าน/ชุมชน) | M |

### 6.3 Authentication & Authorization (AUTH)

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-AUTH-01 | Email/Password ผ่าน Better Auth | M |
| FR-AUTH-02 | ⭐ **สมัครอาสาสมัคร** ผ่านหน้า Public → รอ Admin อนุมัติ | M |
| FR-AUTH-03 | ⭐ **สมัครเจ้าหน้าที่คีย์** โดย Admin แต่งตั้ง (ไม่ใช่เปิดรับสมัคร) | M |
| FR-AUTH-04 | RBAC 9 บทบาท + Public Zone | M |
| FR-AUTH-05 | 2FA สำหรับ Admin | S |
| FR-AUTH-06 | Auto-logout 30 นาที + ปลด Lock ใบ | M |
| FR-AUTH-07 | รีเซ็ตรหัสผ่านผ่านอีเมล | M |
| FR-AUTH-08 | **DATA_ENTRY เห็นเฉพาะใบที่ Lock — ห้าม Query** | M |
| FR-AUTH-09 | **VOLUNTEER เห็นข้อมูล Aggregate — ห้ามเห็น PII** | M |
| FR-AUTH-10 | **VOLUNTEER เห็น PII เฉพาะเมื่อ Incident + เฉพาะรายที่มอบหมาย** | M |
| FR-AUTH-11 | เจ้าหน้าที่คีย์ลงนามข้อตกลงรักษาความลับก่อนคีย์ใบแรก | M |
| FR-AUTH-12 | ล็อกบัญชีหลังใส่รหัสผิด 5 ครั้ง | S |

### 6.4 Batch & Paper Management (BAT) — จาก v2.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-BAT-01 | สร้าง Batch (ชุมชน, จำนวนใบ, ผู้ส่งมอบ, วันที่รับ) | M |
| FR-BAT-02 | สร้างเลขประจำใบอัตโนมัติ (SHEET-{ชุมชน}-{batch}-{ลำดับ}) | M |
| FR-BAT-03 | พิมพ์สติกเกอร์/รายการเลขใบ | S |
| FR-BAT-04 | ติดตามสถานะรายใบ (10 สถานะ) | M |
| FR-BAT-05 | แสดงใบที่หาย | M |
| FR-BAT-06 | ปิด Batch ไม่ได้จนกว่าครบเงื่อนไข | M |
| FR-BAT-07 | แนบไฟล์สแกนกระดาษ | S |
| FR-BAT-08 | Lock ใบ 10 นาที + ปลดอัตโนมัติ | M |

### 6.5 Data Entry Console (ENT) — จาก v2.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-ENT-01 | **ฟอร์มเรียงตรงกระดาษ 100%** | M |
| FR-ENT-02 | **คีย์ด้วยคีย์บอร์ดล้วน ไม่ต้องใช้เมาส์** | M |
| FR-ENT-03 | Tab order ไหลตามลำดับกระดาษ | M |
| FR-ENT-04 | Checkbox/Radio กดเลข 1-9 หรือ Space | M |
| FR-ENT-05 | Ctrl+Enter = ส่ง, F1 = ช่วยเหลือ | M |
| FR-ENT-06 | **F2 = ILLEGIBLE** (อ่านไม่ออก) | M |
| FR-ENT-07 | **F3 = BLANK_IN_PAPER** (ว่างในกระดาษ ≠ "ไม่มี") | M |
| FR-ENT-08 | Auto-save Draft ทุก 10 วินาที | M |
| FR-ENT-09 | Validate ทันที + ไฮไลต์แดง + Focus กลับ | M |
| FR-ENT-10 | **Grid Mode สำหรับตารางกลุ่มเปราะบาง** (คีย์เหมือน Excel) | M |
| FR-ENT-11 | เพิ่มแถวกลุ่มเปราะบางไม่จำกัด | M |
| FR-ENT-12 | แสดงเลขใบค้างจอตลอด | M |
| FR-ENT-13 | Skip Logic: ไม่มีเปราะบาง → ข้ามส่วนที่ 2 | M |
| FR-ENT-14 | **Mini map ข้างช่องพิกัด — แสดงทันทีเมื่อคีย์ครบ** | M |
| FR-ENT-15 | **เตือนพิกัดนอกขอบเขต / สลับ lat/lng / ซ้ำเป๊ะ** | M |
| FR-ENT-16 | ตรวจซ้ำ (บ้านเลขที่+หมู่+ตำบล) ตอนส่ง | M |
| FR-ENT-17 | จับเวลาคีย์ต่อใบ | S |

### 6.6 Verification & Discrepancy (VER) — จาก v2.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-VER-01 | Double-entry เฉพาะฟิลด์วิกฤต (ตั้งค่าได้) | M |
| FR-VER-02 | **ผู้คีย์ Entry 2 ต้องไม่เห็นค่าที่ Entry 1 คีย์ (Blind)** | M |
| FR-VER-03 | **ผู้คีย์ Entry 2 ต้องไม่ใช่คนเดิม** | M |
| FR-VER-04 | เทียบและระบุจุดที่ไม่ตรงอัตโนมัติ | M |
| FR-VER-05 | หน้าจอเทียบข้าง-ข้าง + เลือกค่าที่ถูก | M |
| FR-VER-06 | อนุญาตค่าที่สาม (ถ้าผิดทั้งคู่) | M |
| FR-VER-07 | คำนวณ Error Rate รายคน/ราย Batch/รายฟิลด์ | S |

### 6.7 Data Completeness & Coverage (CVG) — จาก v2.0

| รหัส | ความต้องการ | ระดับ |
|---|---|---|
| FR-CVG-01 | **Dashboard ทุกหน้าต้องแสดง Coverage Badge** | M |
| FR-CVG-02 | **แผนที่ต้องแสดงโซนไม่มีข้อมูลเป็นสีเทา** | M |
| FR-CVG-03 | สถิติทุกตัวต้องมี Denominator | M |
| FR-CVG-04 | เตือนเมื่อ Export ข้อมูลที่ Coverage <80% | S |
| FR-CVG-05 | รายงานทุกฉบับต้องมี Coverage Watermark | M |

### 6.8 Vulnerable / Risk / GIS / Dashboard / Search / Resource / Incident / Notification / Report / Admin — จาก v2.0

(รายละเอียดเดิมทั้งหมดยังใช้ได้ ดู v2.0 sections 6.3-6.12)

ข้อที่ปรับ:
- FR-VUL-08: อายุครรภ์ต้องคำนวณจาก `surveyedAt` ไม่ใช่วันที่คีย์
- FR-RSK-07: ต้องไม่คำนวณ Risk จนกว่า VERIFIED
- FR-RSK-08: แสดง Confidence Level เมื่อข้อมูลขาด
- FR-GIS-16: Map ต้องแสดงโซนไม่มีข้อมูลเป็นสีเทา

---

## 7. Non-Functional Requirements

| รหัส | หมวด | ความต้องการ | เกณฑ์ |
|---|---|---|---|
| NFR-E-01 | Entry Speed | เวลาคีย์ 1 ใบ (คนคล่อง) | ≤ 4 นาที |
| NFR-E-02 | Entry Speed | Latency ระหว่างช่อง (Tab→Focus) | ≤ 50 ms |
| NFR-E-03 | Entry UX | จำนวนครั้งที่ต้องแตะเมาส์ต่อ 1 ใบ | **0 ครั้ง** |
| NFR-E-04 | Entry Quality | Error rate หลัง Double-entry | ≤ 0.5% |
| **NFR-PUB-01** | **Public** | **หน้า Landing โหลดเสร็จบนเน็ต 3G** | **≤ 2 วินาที** |
| **NFR-PUB-02** | **Public** | **หน้า Landing ใช้ได้แม้ Server หลักล่ม** | **Static/CDN** |
| **NFR-PUB-03** | **Public** | **รองรับ Traffic Spike ตอนน้ำท่วม** | **≥ 10,000 concurrent** |
| NFR-P-01 | Performance | Dashboard โหลด | ≤ 2 วิ (P95) |
| NFR-P-02 | Performance | Map 5,000 หมุด | ≤ 3 วิ |
| NFR-P-03 | Performance | บันทึกใบ | ≤ 1 วิ |
| NFR-P-04 | Performance | Concurrent users (ระบบหลัก) | ≥ 50 |
| NFR-A-01 | Availability | Uptime ปกติ | ≥ 99.0% |
| NFR-A-02 | Availability | Uptime ช่วง Incident | ≥ 99.9% |
| NFR-S-01 | Security | TLS | 1.3 |
| NFR-S-02 | Security | เข้ารหัสข้อมูลอ่อนไหว | AES-256 at rest |
| NFR-S-03 | Security | Password | Argon2/bcrypt |
| NFR-S-04 | Security | OWASP | Prisma + Zod + CSRF |
| NFR-S-05 | Security | Audit Log | Append-only |
| NFR-S-06 | Security | DATA_ENTRY ต้อง Query ไม่ได้ | เห็นทีละใบ |
| **NFR-S-07** | **Security** | **VOLUNTEER เห็น Aggregate เท่านั้น** | **ห้าม PII** |
| **NFR-S-08** | **Security** | **หน้า Public ไม่มี PII** | **Jitter พิกัด ±50m** |
| NFR-C-01 | Compliance | PDPA พ.ศ. 2562 | Consent + สิทธิ์เจ้าของ |
| NFR-U-01 | Usability | ภาษาไทยเต็มรูปแบบ | ทุกหน้า + PDF |
| NFR-U-02 | Usability | Desktop-first (Entry Console) | ≥ 1366px |
| **NFR-U-03** | **Usability** | **Mobile-first (Public Portal)** | **≥ 320px** |
| NFR-R-01 | Reliability | Backup | Daily + WAL, 30 วัน |
| NFR-R-02 | Reliability | RPO/RTO | RPO ≤24 ชม., RTO ≤4 ชม. |
| NFR-M-01 | Maintainability | Test Coverage | ≥ 70% |
| NFR-M-02 | Maintainability | Docker Compose | 1 คำสั่ง |
| NFR-SC-01 | Scalability | ข้อมูล | ≥ 50,000 ครัวเรือน |

---

## 8. Actors

### 8.1 Human Actors

| Actor | คำอธิบาย | อุปกรณ์ | ⭐ |
|---|---|---|---|
| **Public User** | ประชาชนทั่วไป — ดูจุดอพยพ/เบอร์ฉุกเฉินตอนน้ำท่วม | **Mobile** | ⭐ ใหม่ |
| **Volunteer** | อาสาสมัครชุมชน — สมัครเอง 8 ด้าน เห็นข้อมูลชุมชนตามสิทธิ์ | Mobile + Desktop | ⭐ ปรับ |
| **Data Entry Staff** | เจ้าหน้าที่คีย์ข้อมูล — Admin แต่งตั้ง ไม่ใช่เปิดรับสมัคร | **Desktop** | ⭐ ปรับ |
| Data Entry Coordinator | ผู้ประสาน — รับปึก สร้าง Batch ติดตาม | Desktop | |
| Verifier | ตรวจสอบ Discrepancy ตัดสินค่าที่ถูก | Desktop | |
| Field Surveyor | ผู้สำรวจ — เดินกระดาษ + ตอบคำถามกลับ | กระดาษ + LINE | |
| Officer / Staff | เจ้าหน้าที่เทศบาล/ปภ./อสม. | Desktop + Mobile | |
| Executive | ผู้บริหาร | Desktop/Tablet | |
| System Administrator | ผู้ดูแลระบบ IT | Desktop | |
| Researcher | นักวิจัย ม.ทักษิณ | Desktop | |
| Data Subject | ชาวบ้านเจ้าของข้อมูล — ใช้สิทธิ์ PDPA | Mobile/โทรศัพท์ | |

### 8.2 System Actors

| Actor | บทบาท |
|---|---|
| Google Maps API | แผนที่, Geocoding, ตรวจพิกัดตอนคีย์ |
| LINE Messaging API | แจ้งเตือน + ส่งคำถามกลับ |
| SMS Gateway | ส่ง SMS |
| Scheduler (Cron/BullMQ) | ปลด Lock ค้าง, Backup, Stale Data, Throughput Stats |
| Object Storage (MinIO/S3) | สแกนกระดาษ, Export files |
| CDN | ⭐ Cache หน้า Public |
| Discrepancy Engine | เทียบ Entry 1 vs Entry 2 |

---

## 9. User Roles

### 9.1 นิยามบทบาท (9 Roles + Public)

| Role | ระดับ | ขอบเขต | ⭐ |
|---|---|---|---|
| — (Public) | 0 | หน้าสาธารณะเท่านั้น (ไม่ต้อง Login) | ⭐ ใหม่ |
| `VOLUNTEER` | 1 | ข้อมูลชุมชนระดับ Aggregate + รับงาน Incident | ⭐ ปรับ |
| `DATA_ENTRY` | 1 | เห็นเฉพาะใบที่ Lock — ห้าม Query | ⭐ ปรับ |
| `FIELD_SURVEYOR` | 1 | ตอบคำถามกลับเท่านั้น | |
| `RESEARCHER` | 1 | ข้อมูล Anonymized | |
| `VERIFIER` | 3 | ตัดสิน Discrepancy — เห็น PII เฉพาะใบที่ตรวจ | |
| `COORDINATOR` | 4 | จัดการ Batch + Throughput + อนุมัติอาสา | |
| `OFFICER` | 4 | จัดการชุมชนที่รับผิดชอบ | |
| `EXECUTIVE` | 5 | ทั้งระบบ (อ่านอย่างเดียว + สถิติ) | |
| `ADMIN` | 6 | ทั้งระบบ | |

### 9.2 Permission Matrix

| ฟังก์ชัน | Public | VOLUNTEER | DATA_ENTRY | VERIFIER | COORD | OFFICER | EXEC | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **หน้า Public (จุดอพยพ/เบอร์/สถิติ)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **สมัครอาสาสมัคร** | ✅ | — | — | — | — | — | — | — |
| คีย์ข้อมูล (Entry 1/2) | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| ตัดสิน Discrepancy | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| จัดการ Batch | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **ดู Dashboard สถิติ** | ❌ | ✅ Aggregate | 🔸ของตน | ❌ | ✅ Entry | ✅ | ✅ | ✅ |
| **ดูแผนที่** | 🔸จุดอพยพ | ✅ ไม่เห็นรายบ้าน | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| ดูชื่อ/เบอร์กลุ่มเปราะบาง | ❌ | 🔸 Incident only | 🔸ใบที่ Lock | 🔸ใบที่ตรวจ | ❌ | ✅ | ❌ | ✅ |
| ดูข้อมูลสุขภาพ | ❌ | 🔸 Incident only | 🔸ใบที่ Lock | 🔸ใบที่ตรวจ | ❌ | ✅ | ❌ | ✅ |
| ค้นหา/Query ข้อมูล | ❌ | ❌ | **❌** | ❌ | 🔸Meta | ✅ | ✅ | ✅ |
| Export | ❌ | ❌ | **❌** | ❌ | 🔸Meta | ✅ | ✅ | ✅ |
| **รับงาน Incident** | ❌ | **✅** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| จัดการผู้ใช้ | ❌ | ❌ | ❌ | ❌ | 🔸อนุมัติอาสา | ❌ | ❌ | ✅ |
| ดู Audit Log | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🔸สรุป | ✅ |

---

## 10. Use Cases (สรุป)

| UC | ชื่อ | Actor หลัก | Zone | Phase |
|---|---|---|---|---|
| UC-01 | ดูจุดอพยพบนหน้า Public | Public User | 🌊 Public | 1 |
| UC-02 | ดูเบอร์ฉุกเฉิน | Public User | 🌊 Public | 1 |
| UC-03 | ดูสถานะเหตุการณ์ | Public User | 🌊 Public | 1 |
| UC-04 | สมัครอาสาสมัครชุมชน | Public User | 🌊 Public | 2 |
| UC-05 | อนุมัติอาสาสมัคร | Coordinator/Admin | ⚙️ Admin | 2 |
| UC-06 | รับปึกกระดาษ / สร้าง Batch | Coordinator | 🏭 Entry | 1 |
| UC-07 | คีย์ข้อมูลจากกระดาษ (Entry 1) | Data Entry Staff | 🏭 Entry | 1 |
| UC-08 | คีย์ยืนยัน (Entry 2 — Blind) | Data Entry Staff | 🏭 Entry | 1.5 |
| UC-09 | Mark ILLEGIBLE / BLANK | Data Entry Staff | 🏭 Entry | 1 |
| UC-10 | ตัดสิน Discrepancy | Verifier | 🏭 Entry | 1.5 |
| UC-11 | สร้างคำถามกลับสนาม | Coordinator/Verifier | 🏭 Entry | 1.5 |
| UC-12 | ตอบคำถามกลับ | Field Surveyor | 🏭 Entry | 1.5 |
| UC-13 | ปิด Batch | Coordinator | 🏭 Entry | 1.5 |
| UC-14 | Merge ข้อมูลซ้ำ | Officer | 🏭 Entry | 1.5 |
| UC-15 | ดู Executive Dashboard | Executive | 🎯 Decision | 2 |
| UC-16 | ดูแผนที่ความเสี่ยง | Officer | 🎯 Decision | 2 |
| UC-17 | ค้นหาข้อมูลครัวเรือน | Officer | 🎯 Decision | 2 |
| UC-18 | ดู Priority List (P1) | Officer | 🎯 Decision | 2 |
| UC-19 | ออกรายงาน PDF/Excel | Officer/Executive | 🎯 Decision | 2 |
| UC-20 | ดูข้อมูลชุมชน (อาสาสมัคร) | Volunteer | 🤝 Volunteer | 2 |
| UC-21 | ประกาศเหตุการณ์ (Incident Mode) | Officer/Admin | 🚨 Incident | 3 |
| UC-22 | มอบหมายงานให้อาสาสมัคร | Officer | 🚨 Incident | 3 |
| UC-23 | รับงานและอัปเดตสถานะ | Volunteer | 🚨 Incident | 3 |
| UC-24 | ใช้สิทธิ์ PDPA | Data Subject | ⚙️ Admin | 2 |

---

## 11. Business Rules

### 11.1 กฎการจัดเก็บข้อมูล (BR-01 ถึง BR-14) — จาก v2.0

(เหมือนเดิม — ดูรายละเอียดใน v2.0)

### 11.2 กฎการคีย์ข้อมูล (BR-40 ถึง BR-55) — จาก v2.0

(เหมือนเดิม — ดูรายละเอียดใน v2.0)

### 11.3 กฎการคำนวณความเสี่ยง (BR-15 ถึง BR-22) — จาก v2.0

(เหมือนเดิม — ดูรายละเอียดใน v2.0)

### 11.4 กฎด้านสิทธิ์และความเป็นส่วนตัว — ปรับ + เพิ่ม v3.0

| รหัส | กฎ | ⭐ |
|---|---|---|
| BR-23 | ต้องได้ Consent ก่อนบันทึกข้อมูลกลุ่มเปราะบาง | |
| BR-24 | ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหว ม.26 — เข้ารหัส + จำกัดสิทธิ์ | |
| BR-25 | ~~RESCUE_VOLUNTEER~~ → **VOLUNTEER เห็น PII เฉพาะ Incident + เฉพาะรายที่มอบหมาย** | ⭐ ปรับ |
| BR-26 | ทุกครั้งที่ดู/Export ข้อมูลกลุ่มเปราะบาง ต้องบันทึก Audit Log | |
| BR-27 | ข้อมูล Researcher ต้อง Anonymize | |
| BR-28 | เจ้าของข้อมูลมีสิทธิ์ขอดู/แก้/ลบ — 30 วัน | |
| BR-29 | ห้าม Hard Delete ยกเว้นคำขอ PDPA | |
| BR-30 | เก็บได้ไม่เกิน 5 ปี | |
| BR-58 | DATA_ENTRY เห็นเฉพาะใบที่ Lock — ห้าม Query | |
| BR-59 | **เจ้าหน้าที่คีย์** ลงนามข้อตกลงรักษาความลับก่อนคีย์ | ⭐ ปรับ |
| BR-60 | กระดาษต้องเก็บในตู้ล็อก มีทะเบียนเบิก | |
| BR-61 | ห้ามถ่ายรูปกระดาษออกนอกสถานที่ | |
| BR-62 | ไฟล์สแกนกระดาษเข้ารหัส = ข้อมูล L4 | |
| **BR-64** | **VOLUNTEER เห็นข้อมูลระดับ Aggregate เท่านั้น ห้ามเห็น PII** | ⭐ ใหม่ |
| **BR-65** | **VOLUNTEER เห็น PII ได้เฉพาะเมื่อ Incident Mode + เฉพาะรายที่มอบหมาย** | ⭐ ใหม่ |
| **BR-66** | **หน้า Public ต้อง Jitter พิกัด ±50m + แสดงเป็น Grid เท่านั้น** | ⭐ ใหม่ |
| **BR-67** | **หน้า Public ต้องแสดงเฉพาะข้อมูล L1 (สาธารณะ) — ห้าม PII** | ⭐ ใหม่ |
| **BR-68** | **อาสาสมัครใหม่ต้องผ่านการอนุมัติก่อนเห็นข้อมูลใดๆ ในระบบ** | ⭐ ใหม่ |

---

## 12. Data Categories

| ระดับ | สี | ตัวอย่าง | ใน Public? | ใน VOLUNTEER? |
|---|---|---|---|---|
| **L4 อ่อนไหวสูงสุด** | 🔴 | โรค, ยา, จิตเวช, ฟอกไต, อายุครรภ์ | ❌ | 🔸 Incident only |
| **L3 ข้อมูลส่วนบุคคล** | 🟠 | ชื่อ, เบอร์, บ้านเลขที่, พิกัดแม่นยำ, สแกนกระดาษ | ❌ | ❌ |
| **L2 ภายใน** | 🟡 | ระดับความเสี่ยง, ประเภทอาคาร, ทรัพยากร | ❌ | ✅ (Aggregate) |
| **L1 สาธารณะ** | 🟢 | สถิติรวม, จุดอพยพ, เบอร์ฉุกเฉิน | ✅ | ✅ |

---

## 13. Entity / Data Model

### 13.1 สรุป Entity (35 ตาราง)

| กลุ่ม | Entity | หมายเหตุ |
|---|---|---|
| **Auth** | User, Session, Account, Verification | Better Auth |
| **RBAC** | UserRole, UserCommunityScope, ConfidentialityAgreement | 9 Roles |
| **Master Data** | Province, District, Tambon, Moo, Community, BuildingType, OwnershipType, VulnerabilityType, AssistanceNeedType, ResourceType, AlertChannel, VolunteerSkillType | ไม่ Hardcode |
| **Paper/Batch** | PaperBatch, PaperSheet | ⭐ จัดการกระดาษ |
| **Data Entry** | EntryAttempt, FieldStatus, Discrepancy, FieldQuery | ⭐ Double-entry + 4 สถานะฟิลด์ |
| **Household** | Household (หลัก), HouseholdVersion, ConsentRecord | แยก surveyedAt ↔ enteredAt |
| **Vulnerable** | VulnerablePerson, PersonVulnerability, AssistanceNeed | referenceDate สำหรับอายุครรภ์ |
| **Flood Risk** | FloodRiskProfile, HouseholdResource, EvacuationVehicle | Risk Score + Confidence |
| **Communication** | AlertChannelPref, DigitalReadiness, VolunteerInterest | ส่วนที่ 4 |
| **Planning** | EvacuationSite, RiskWeightConfig | จุดอพยพ + น้ำหนักเสี่ยง |
| **Incident** | Incident, RescueTask, TaskUpdate | Phase 3 |
| **Notification** | NotificationTemplate, Notification | LINE/SMS |
| **System** | AuditLog, PdpaRequest, ExportJob, SystemSetting, EntryStats | Append-only Audit |

> รายละเอียด Schema ทั้งหมดอยู่ในไฟล์ `schema.prisma` + `00_postgis_extensions.sql` + `seed.ts`

### 13.2 Field Status Model (แนวคิดสำคัญ)

**ทุกฟิลด์ในระบบต้องแยก 4 สถานะให้ชัด:**

| สถานะ | ความหมาย | สี UI |
|---|---|---|
| `HAS_VALUE` | มีค่าจริงจากกระดาษ | ปกติ |
| `EXPLICIT_NONE` | ผู้สำรวจติ๊ก "ไม่มี" จริง | ปกติ |
| `BLANK_IN_PAPER` | กระดาษเว้นว่าง (ไม่รู้ว่าไม่มีหรือลืมถาม) | 🔘 เทา |
| `ILLEGIBLE` | มีเขียนแต่อ่านไม่ออก | 🟡 เหลือง |

---

## 14. Module

```
SKL-FRIS
│
├── M00 Public Portal                     ⭐ ใหม่ v3.0
│   ├── Landing Page (แผนที่+สถิติ+สถานะ)
│   ├── Evacuation Sites Directory
│   ├── Emergency Contacts
│   └── Incident Status Banner
│
├── M01 Authentication & Authorization
│
├── 🏭 Entry Zone (Phase 1)
│   ├── M02 Batch & Paper Management
│   ├── M03 Data Entry Console            ⭐ สำคัญที่สุด
│   ├── M04 Verification & Discrepancy
│   ├── M05 Field Query Loop
│   ├── M06 Data Entry Dashboard
│   └── M07 Duplicate Merge
│
├── 🎯 Decision Zone (Phase 2)
│   ├── M08 Vulnerable Person Registry
│   ├── M09 Risk Analysis Engine
│   ├── M10 GIS & Mapping
│   ├── M11 Dashboard & Analytics
│   ├── M12 Search & Query
│   ├── M13 Resource & Evacuation Planning
│   └── M16 Report & Export
│
├── 🤝 Volunteer Zone (Phase 2-3)         ⭐ ใหม่ v3.0
│   ├── M19 Volunteer Management
│   │   ├── Public Registration
│   │   ├── Skill Selection (8 ด้าน)
│   │   ├── Admin Approval Queue
│   │   ├── Volunteer Profile
│   │   └── Volunteer Directory
│   │
│
├── 🚨 Incident Zone (Phase 3)
│   ├── M14 Incident Management
│   └── M15 Notification
│
├── M17 Administration
│
└── M18 Compliance & Privacy
```

### Module Priority & Phasing

| Phase | ระยะเวลา | Modules | ผลลัพธ์ |
|---|---|---|---|
| **Phase 0** | ก่อนลงพื้นที่ | — | เคลียร์ PDPA + พิมพ์ใบ Consent |
| **Phase 1** | เดือน 1-2 | M00 (Landing), M01, M02, M03 | **Public Landing ใช้ได้ + คีย์ข้อมูลได้** |
| **Phase 1.5** | เดือน 2-3 | M04, M05, M06, M07 | ยืนยัน + คุณภาพ |
| **Phase 2** | เดือน 3-5 | M08-M13, M16, M19 | Dashboard + Map + Report + อาสาสมัคร |
| **Phase 3** | เดือน 6-8 | M14, M15 | Incident + Notification |
| **Phase 4** | เดือน 9-12 | M18(full), SOS, Multi-tenant | ขยาย |

---

## 15-17. Dashboard / Reports / GIS

(รายละเอียดจาก v2.0 ยังใช้ได้ทั้งหมด — เพิ่ม Coverage Badge ทุกหน้า + Coverage Layer บนแผนที่)

ข้อเพิ่ม v3.0:
- **Dashboard ของ VOLUNTEER:** แสดงสถิติชุมชน (Aggregate) + แผนที่จุดอพยพ + ทรัพยากร — ไม่เห็นรายบ้าน/รายบุคคล
- **GIS หน้า Public:** แสดงเฉพาะจุดอพยพ + Heatmap ระดับ Grid — พิกัด Jitter ±50m

---

## 18. Future Expansion

| ระยะ | ความสามารถ | ความยาก |
|---|---|---|
| **ปี 1** | Mobile Survey App (แทนกระดาษ — กำจัดขั้นตอนคีย์) | กลาง |
| **ปี 1** | SOS Button ในหน้า Public | ต่ำ |
| **ปี 1** | LINE OA Chatbot | กลาง |
| **ปี 1** | Multi-tenant (ขยายตำบล/อำเภอ) | กลาง |
| ปี 2 | IoT Water Sensor | สูง |
| ปี 2 | เชื่อม API ปภ./กรมอุตุ | กลาง |
| ปี 2 | Flood Simulation | สูงมาก |
| ปี 3 | เชื่อมทะเบียนราษฎร์ / รพ.สต. | สูง |
| ปี 3 | Open Data API | ต่ำ |

**Paper Exit Strategy:**
```
รอบที่ 1 (ปีนี้):    กระดาษ 100% → คีย์ 100%        [375 ชม.-คน]
รอบที่ 2 (ปีหน้า):   Hybrid — มือถือ 50% + กระดาษ 50% [190 ชม.]
รอบที่ 3 (ปี 3):     มือถือ 90% + กระดาษสำรอง         [40 ชม.]
```

---

## 19. ความเสี่ยงของระบบ

### 19.1 ความเสี่ยงวิกฤต (ต้องจัดการก่อนเริ่ม)

| รหัส | ความเสี่ยง | ระดับ | มาตรการ |
|---|---|---|---|
| RK-E5 | ไม่มี Consent = ผิด PDPA ม.26 | 🔴 วิกฤต | พิมพ์ใบ Consent แนบก่อนแจกกระดาษ |
| RK-E2 | คีย์ผิดโดยไม่มีใครรู้ | 🔴 วิกฤต | Double-entry ฟิลด์วิกฤต |
| RK-E3 | กระดาษหาย | 🔴 วิกฤต | เลขประจำใบทุกใบ + สแกน |
| RK-01 | ข้อมูลกลุ่มเปราะบางรั่ว | 🔴 วิกฤต | เข้ารหัส + RBAC + Audit |
| RK-02 | ระบบล่มตอนน้ำท่วม | 🔴 วิกฤต | พิมพ์รายชื่อ P1 เป็นกระดาษล่วงหน้า (Analog Fallback) |
| RK-C1 | เจ้าหน้าที่เข้าใจผิดว่าข้อมูลครบ | 🔴 วิกฤต | Coverage Badge ทุกหน้า ทุก KPI |
| **RK-P2** | **หน้า Public ล่มตอนน้ำท่วม (Traffic Spike)** | **🔴 วิกฤต** | **Static/CDN/ISR** |

### 19.2 ความเสี่ยงสูง

| รหัส | ความเสี่ยง | ระดับ | มาตรการ |
|---|---|---|---|
| RK-E1 | คีย์ไม่เสร็จ | 🟠 สูง | ⭐ ลดลงจาก v2.0 — เจ้าหน้าที่ควบคุมได้ดีกว่าอาสา แต่ต้องมีงบจ้าง |
| RK-E13 | พิกัดผิด | 🟠 สูง | Coordinate Validation Pipeline |
| RK-E14 | ข้อมูลล้าสมัยตั้งแต่วันแรก | 🟠 สูง | นับอายุจาก surveyedAt + Paper Exit Strategy |
| RK-04 | ข้อมูลไม่อัปเดต | 🟠 สูง | Re-survey = พิมพ์กระดาษใหม่ → ต้องมี Paper Exit Strategy |
| RK-11 | PDF ภาษาไทยพัง | 🟠 สูง | Puppeteer + HTML, ทดสอบ Sprint 1 |
| RK-18 | อคติในข้อมูล (บ้านเข้าถึงยากตกหล่น) | 🟠 สูง | ติดตามอัตราเข้าถึงรายซอย |
| **RK-V1** | **อาสาสมัครปลอมสมัครเพื่อดูข้อมูล** | **🟠 สูง** | **ต้องมีการอนุมัติ + VOLUNTEER เห็นแค่ Aggregate** |
| **RK-P1** | **หน้า Public ถูกใช้หาข้อมูลบ้านเป้าหมาย** | **🟠 สูง** | **Jitter พิกัด + ไม่แสดงรายบ้าน** |

### 19.3 สิ่งที่ต้องทำก่อนแจกกระดาษ

1. ⛔ เคลียร์ PDPA / Consent — ปรึกษานิติกร + พิมพ์ใบ Consent
2. ⛔ ระบบเลขประจำใบ — สติกเกอร์/เขียนมือ/ปั๊ม
3. ⛔ บรีฟผู้สำรวจ — เขียนตัวบรรจง โดยเฉพาะเบอร์โทร/พิกัด/อายุ

---

## 20. ข้อเสนอแนะในการออกแบบ

### 20.1 เชิงกลยุทธ์

| # | ข้อเสนอแนะ |
|---|---|
| S1 | **สร้าง Public Landing + Entry Console ก่อนอย่างอื่น** |
| S2 | **เริ่มคีย์ทันทีที่ปึกแรกมาถึง อย่ารอครบ 3,000** |
| S3 | **ตั้งงบจ้างคีย์ตั้งแต่ต้น** — ไม่หวังอาสาสมัครมาช่วยฟรี |
| S4 | **ปรึกษานิติกรเรื่อง Consent ก่อนแจกกระดาษ** |
| S5 | **วางแผนเลิกใช้กระดาษตั้งแต่วันนี้** (Paper Exit Strategy) |
| S6 | **ให้เทศบาลเป็นเจ้าของระบบ ไม่ใช่มหาวิทยาลัย** |
| S7 | **ออกแบบให้ใช้ได้แม้ข้อมูลไม่ครบ** — Coverage Badge ทุกที่ |
| S8 | **ทำงานร่วมกับ อสม.** — ช่องทางอัปเดตข้อมูลฟรี |
| S9 | **หน้า Public ต้องใช้ได้แม้ Server หลักล่ม** — Static/CDN |

### 20.2 UX

| # | ข้อเสนอแนะ |
|---|---|
| U1 | **Entry Console: 0 ครั้งที่ต้องแตะเมาส์** |
| U2 | **ลำดับฟิลด์ตรงกระดาษ 100%** |
| U3 | **F2 (อ่านไม่ออก) / F3 (ว่าง) ต้องกดง่ายกว่าการเดา** |
| U4 | **ตารางเปราะบางบน Desktop = Grid Mode** ไม่ใช่ Card |
| U5 | **Mini map ข้างช่องพิกัด** |
| U6 | **หน้า Public ต้อง Mobile-first ตัวใหญ่ อ่านง่ายตอนตื่นตี 2** |
| U7 | **หน้าสมัครอาสาสมัครต้องง่าย ≤ 3 นาที** |

### 20.3 เทคนิค

| # | ข้อเสนอแนะ |
|---|---|
| T1 | PostGIS ตั้งแต่วันแรก — geography(Point,4326) |
| T2 | Zod Schema เป็น Single Source of Truth |
| T3 | PDF ไทย: Puppeteer + HTML |
| T4 | เข้ารหัสระดับ Field (Prisma Middleware) |
| T5 | Audit Log Append-only (DB Trigger) |
| T6 | Entry Console เป็น Client Component ล้วน — ห้ามมี Server Round-trip ระหว่างช่อง |
| T7 | `SELECT ... FOR UPDATE SKIP LOCKED` สำหรับหยิบงาน |
| T8 | **หน้า Public ใช้ Next.js ISR (Incremental Static Regeneration)** revalidate ทุก 5 นาที |
| T9 | **Static Map API สำหรับ mini map ตอนคีย์** (ประหยัดค่า Google Maps) |
| T10 | **Field Status ต้องอยู่ในโครงสร้างข้อมูลตั้งแต่แรก** |

### 20.4 สูตร Risk Score (จาก v2.0)

```
RiskScore (0-100) = Σ (Factor × Weight) / Σ (Weight ที่มีข้อมูล) × 100

12 ปัจจัย รวมน้ำหนัก 115 คะแนน
Normalize เป็น 0-100 → แบ่ง 4 ระดับ (ต่ำ/กลาง/สูง/สูงมาก)
+ Confidence Level = % ปัจจัยที่มีข้อมูล
+ Hard Rules: ติดเตียง/ฟอกไต → บังคับ ≥ "สูง"
```

---

## 21. Sitemap & Navigation

### 21.1 App Router Structure

```
app/
├── (public)/                    ─── ⭐ ไม่ต้อง Login
│   ├── page.tsx                     🌊 Landing (แผนที่+สถิติ+เบอร์ฉุกเฉิน)
│   ├── evacuation/page.tsx          จุดอพยพ + แผนที่ + เส้นทาง
│   ├── emergency/page.tsx           เบอร์ฉุกเฉิน + คำแนะนำ
│   └── volunteer/register/page.tsx  สมัครอาสาสมัคร
│
├── (auth)/                      ─── Login (ไม่มี Sidebar)
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
│
├── (app)/                       ─── ต้อง Login (มี Sidebar)
│   ├── entry/...                    🏭 Entry Console
│   ├── verify/...                   ✅ Verification
│   ├── discrepancies/...            ⚖️ Discrepancy
│   ├── batches/...                  📦 Batch
│   ├── entry-dashboard/...          📊 Entry Dashboard
│   ├── field-queries/...            💬 Field Query
│   ├── duplicates/...               📋 Merge
│   ├── households/...               🏠 Household
│   ├── vulnerable/...               ❤️ Vulnerable
│   ├── dashboard/...                📈 Dashboard
│   ├── map/...                      🗺️ Map
│   ├── resources/...                🛡️ Resource
│   ├── reports/...                  📄 Reports
│   ├── incidents/...                🚨 Incident
│   ├── my-tasks/page.tsx            งานของฉัน (VOLUNTEER)
│   ├── volunteer/...                🤝 Volunteer Portal
│   ├── admin/...                    ⚙️ Admin
│   └── profile/page.tsx             โปรไฟล์
```

### 21.2 หน้าแรกหลัง Login (ตาม Role)

| Role | หน้าแรก |
|---|---|
| DATA_ENTRY | `/entry` (ปุ่มเดียว "เริ่มคีย์") |
| VOLUNTEER | `/volunteer/community` (ข้อมูลชุมชน) |
| COORDINATOR | `/entry-dashboard` (Throughput) |
| VERIFIER | `/discrepancies` (คิว Discrepancy) |
| OFFICER | `/dashboard/officer` (ภาพรวมชุมชน) |
| EXECUTIVE | `/dashboard` (ตัวเลขใหญ่) |
| ADMIN | `/dashboard` (ภาพรวมทั้งระบบ) |

### 21.3 Sidebar รายบทบาท

(รายละเอียดใน เอกสาร Sitemap แยก — ดู `sitemap-navigation.md`)

---

## 22. Prisma Schema Reference

Schema ครบ 35 Entity + 18 Enums อยู่ในไฟล์แยก:
- `schema.prisma` — Prisma Schema ทั้งหมด
- `00_postgis_extensions.sql` — PostGIS, Trigger, Views, Constraints
- `seed.ts` — Master Data (ตัวเลือกทุกช่องตรงกับกระดาษ 100%)

---

## 23. API Endpoints (สรุป)

```
Public (ไม่ต้อง Login)
  GET    /api/public/evacuation-sites      จุดอพยพ + GeoJSON
  GET    /api/public/emergency-contacts    เบอร์ฉุกเฉิน
  GET    /api/public/stats                 สถิติรวม (Aggregate)
  GET    /api/public/incident-status       สถานะเหตุการณ์
  GET    /api/public/risk-heatmap          Heatmap (Grid, Jitter)
  POST   /api/public/volunteer/register    สมัครอาสาสมัคร

Auth
  POST   /api/auth/[...all]               Better Auth handler

Batch & Sheet
  POST   /api/batches                     สร้าง Batch
  GET    /api/batches                     รายการ
  POST   /api/batches/:id/close           ปิด Batch

Data Entry
  POST   /api/entry/pickup                หยิบงาน (SELECT FOR UPDATE SKIP LOCKED)
  POST   /api/entry/:sheetId/submit       ส่ง
  POST   /api/entry/check-duplicate       ตรวจซ้ำ
  POST   /api/entry/validate-coord        ตรวจพิกัด

Verification
  POST   /api/verify/pickup               หยิบงานยืนยัน
  POST   /api/discrepancies/:id/resolve   ตัดสิน

GIS
  GET    /api/gis/households.geojson      GeoJSON + bbox
  GET    /api/gis/coverage.geojson        โซนไม่มีข้อมูล
  POST   /api/gis/spatial-query           Spatial Query

Dashboard
  GET    /api/stats/overview              Dashboard stats
  GET    /api/stats/coverage              Coverage %
  GET    /api/stats/entry-throughput      Throughput + ETA

Volunteer
  GET    /api/admin/volunteers/pending    คิวรออนุมัติ
  POST   /api/admin/volunteers/:id/approve  อนุมัติ
  GET    /api/volunteer/community         ข้อมูลชุมชน (Aggregate)

Export
  POST   /api/exports                     สร้างงาน Export
  GET    /api/exports/:jobId/download     ดาวน์โหลด
```

---

## 24. Deployment (Docker Compose)

```yaml
services:
  app:
    build: .
    environment:
      DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_MAPS_API_KEY,
      ENCRYPTION_KEY, REDIS_URL, S3_ENDPOINT, TZ: Asia/Bangkok
    depends_on: [db, cache, storage]

  db:
    image: postgis/postgis:16-3.4

  cache:
    image: redis:7-alpine

  storage:
    image: minio/minio          # เก็บสแกนกระดาษ + Export

  worker:
    command: node worker.js     # BullMQ: Lock cleanup, Export, Notification

  proxy:
    image: caddy:2-alpine       # Reverse Proxy + Auto SSL
    ports: ["80:80", "443:443"]

  backup:
    image: postgres:16-alpine   # Daily pg_dump + 30 วัน retention
```

---

## 25. Testing Strategy

| ระดับ | ขอบเขต | เป้าหมาย |
|---|---|---|
| Unit | Risk Calculator, Triage, Discrepancy Engine, Coordinate Validator | ≥ 90% |
| Integration | Server Actions, Lock Manager, Spatial Queries | ≥ 70% |
| E2E | คีย์ครบ 1 ใบ, Double-entry, Batch close | Critical Path 100% |
| **Keyboard** | **คีย์ครบ 1 ใบด้วยคีย์บอร์ดล้วน ไม่แตะเมาส์** | **100%** |
| **Speed** | **จับเวลาคีย์ 1 ใบ** | **≤ 4 นาที** |
| **Public** | **หน้า Public โหลดบนเน็ต 3G** | **≤ 2 วินาที** |
| Security | OWASP, RBAC bypass, DATA_ENTRY Query ไม่ได้, VOLUNTEER ไม่เห็น PII | ไม่มี High/Critical |
| PDF Thai | ทุก Report | ไม่มีสี่เหลี่ยม/สระลอย |

---

## 26. KPI ความสำเร็จ

### 🌊 Public Zone

| ตัวชี้วัด | เป้าหมาย |
|---|---|
| เวลาโหลดหน้า Landing (3G) | ≤ 2 วินาที |
| หน้า Landing ใช้ได้แม้ Server หลักล่ม | ✅ (Static/CDN) |
| จำนวนอาสาที่สมัครผ่านระบบ | ≥ 50 คน |
| % อาสาที่ได้รับอนุมัติภายใน 3 วัน | ≥ 80% |

### 🏭 Entry Zone (วัดใน 3 เดือนแรก)

| ตัวชี้วัด | เป้าหมาย |
|---|---|
| % ใบที่คีย์แล้ว ณ เดือนที่ 3 | ≥ 90% (2,700/3,000) |
| เวลาเฉลี่ยคีย์ 1 ใบ | ≤ 4 นาที |
| Error rate หลัง Double-entry | ≤ 0.5% |
| % ใบที่ตามหาได้ (ไม่หาย) | 100% |
| % ใบที่มี Consent ครบ | 100% |

### 🎯 Decision Zone (วัดหลังคีย์เสร็จ)

| ตัวชี้วัด | เป้าหมาย |
|---|---|
| Coverage | ≥ 85% |
| เวลาค้นหารายชื่อ P1 | ≤ 10 วินาที |
| % P1 ที่มีแผนอพยพ | 100% |
| (เมื่อเกิดเหตุจริง) เวลาตอบสนอง P1 | ≤ 30 นาที |
| จำนวนหน่วยงานที่ใช้ร่วมกัน | ≥ 3 |
| จำนวนเหตุข้อมูลรั่วไหล | 0 |

---

## 27. Appendix

### A. Mapping แบบสอบถาม → Entity/Field

(รายละเอียดจาก v2.0 Appendix ก — ยังใช้ได้ทั้งหมด)

ข้อเพิ่มเติม v3.0:
- ส่วนที่ 4 ข้อ 4 (อาสาสมัคร) → เชื่อมกับ VolunteerInterest **และ** VOLUNTEER Role (ถ้าสมัครผ่านระบบ)
- ทุกฟิลด์ ← มี FieldStatus กำกับ (HAS_VALUE/EXPLICIT_NONE/BLANK/ILLEGIBLE)

### B. ⚠️ ประเด็นวิกฤต: PDPA และ Consent ที่หายไป

**กระดาษ 3,000 ชุด ไม่มีช่องขอความยินยอม แต่เก็บข้อมูลสุขภาพ (ม.26)**

**ข้อเสนอ:** พิมพ์ใบ Consent 1 หน้าแนบทุกชุด ให้เซ็นตอนสำรวจ

**เนื้อหาใบ Consent ต้องมี:**
1. วัตถุประสงค์ที่ชัดเจน (แยก "ช่วยเหลือ" กับ "วิจัย")
2. ผู้ควบคุมข้อมูล
3. ผู้ที่จะเข้าถึงข้อมูล
4. ระยะเวลาเก็บ (5 ปี)
5. สิทธิ์ของเจ้าของข้อมูล (ขอดู/แก้/ลบ/ถอน)
6. ลายเซ็นผู้ยินยอม + ผู้สำรวจ (พยาน)

> ⚠️ ต้องปรึกษานิติกรก่อนใช้ — นี่เป็นแค่ร่างเริ่มต้น

### C. สรุปสำหรับผู้บริหาร (Executive Summary)

**ปัญหา:** ข้อมูลชุมชน 3,000 ครัวเรือนจะอยู่ในกระดาษ ใช้ตัดสินใจตอนน้ำท่วมไม่ได้

**ทางออก:** ระบบสารสนเทศที่มี 2 ส่วนสำคัญ:
1. **หน้าสาธารณะ** — ชาวบ้านเปิดได้ทันทีตอนน้ำท่วมโดยไม่ต้อง Login เห็นจุดอพยพ เบอร์ฉุกเฉิน สถานะเหตุการณ์
2. **ระบบหลัง Login** — คีย์ข้อมูลจากกระดาษ → วิเคราะห์ → ตอบได้ว่า "คืนนี้ต้องไปช่วยใครก่อน อยู่ตรงไหน ต้องใช้อะไร"

**สิ่งที่ต้องตัดสินใจก่อนลงพื้นที่:**
1. 🚨 ใบยินยอม PDPA — ปรึกษานิติกร + พิมพ์แนบ
2. 🚨 ระบบเลขประจำใบ — ทุกใบต้องมีเลขก่อนคีย์
3. 🚨 งบจ้างคีย์ — เจ้าหน้าที่ 3-5 คน เต็มเวลา 3 สัปดาห์

**ไทม์ไลน์:** Public Landing + Entry Console 2 เดือน → คีย์เสร็จ เดือนที่ 3-4 → ระบบเต็มรูปแบบ เดือนที่ 8

---

*เอกสารฉบับ v3.0 — รวมการปรับทั้งหมดจากการวิเคราะห์ 3 รอบ*
*ควรผ่านการทบทวนร่วมกับผู้มีส่วนได้ส่วนเสียก่อนนำไปพัฒนา*
*โดยเฉพาะประเด็น PDPA ที่ควรได้รับการยืนยันจากนิติกรก่อนเริ่มเก็บข้อมูล*
