# 05 — การออกแบบ Community และพื้นที่การปกครอง

> ตอบภารกิจที่ 4 — **เสนอ Model และ Relation เท่านั้น ยังไม่แก้ Schema**

---

## 1. ข้อเท็จจริงที่ยืนยันแล้ว (จากคำสั่งผู้ใช้)

| # | ชุมชน | ตำบล | อำเภอ | จังหวัด |
|---|---|---|---|---|
| 1 | ชุมชนท่าเคียน | ควนลัง | หาดใหญ่ | สงขลา |
| 2 | ชุมชนประสานมิตร | ควนลัง | หาดใหญ่ | สงขลา |
| 3 | **ชุมชนควนสันติ** | **ควนลัง + หาดใหญ่** | หาดใหญ่ | สงขลา |
| 4 | ชุมชนปลักหว้า | ควนลัง | หาดใหญ่ | สงขลา |
| 5 | ชุมชนหน้าควน | ควนลัง | หาดใหญ่ | สงขลา |

**ข้อกำหนดที่ต้องรองรับ:**
1. ชุมชนควนสันติครอบคลุม **2 ตำบล**
2. Household แต่ละหลังต้องระบุ**ตำบลจริงของตนเอง**ได้
3. Community มี**ตำบลหลักและตำบลรอง**ได้
4. รองรับชุมชนใหม่ในพื้นที่อื่น (จังหวัด/อำเภอ/ตำบลใดก็ได้)
5. Dashboard Filter ตามจังหวัด → อำเภอ → ตำบล → ชุมชน
6. GIS แสดงขอบเขตชุมชนที่**อาจไม่ตรงกับขอบเขตตำบล**

---

## 2. สภาพปัจจุบัน (ปัญหา)

```prisma
// prisma/schema.prisma:392-414 — ปัจจุบัน
model Community {
  id               String    @id @default(cuid())
  tambonId         String              // ❌ 1 ชุมชน = 1 ตำบล เท่านั้น
  code             String    @unique   // ⚠️ "KL01" — รหัสสื่อถึงตำบล
  nameTh           String
  targetHouseholds Int       @default(0)  // ❌ แนวคิดถูกยกเลิก (ดู doc 06)
  // boundary      — PostGIS Polygon (จัดการผ่าน raw SQL)  // ❌ Polygon ไม่ใช่ MultiPolygon
  tambon           Tambon    @relation(fields: [tambonId], references: [id])
  ...
}
```

**ปัญหา 4 ข้อ:**
1. 🔴 `tambonId` เดี่ยว → **Seed ชุมชนควนสันติไม่ได้** (SCH-01)
2. 🔴 `targetHouseholds` → แนวคิดผิด (SCH-04)
3. 🟠 `boundary geography(Polygon, 4326)` → ชุมชนที่มีพื้นที่ไม่ต่อเนื่องแทนไม่ได้
4. 🟡 `code` "KL01" → รหัสผูกกับตำบล ทำให้ชุมชนข้ามตำบลตั้งรหัสไม่ได้อย่างมีเหตุผล

---

## 3. เปรียบเทียบ 3 ทางเลือกที่คำสั่งระบุ

### ทางเลือก A — Community ผูกกับ Tambon โดยตรง (สภาพปัจจุบัน)

```
Community.tambonId → Tambon
```

| ข้อดี | ข้อเสีย |
|---|---|
| ง่ายที่สุด Query ตรงไปตรงมา | 🔴 **ควนสันติทำไม่ได้** — ต้องเลือกตำบลเดียว = ข้อมูลผิด |
| Join น้อย | 🔴 ผิด CLAUDE.md โดยตรง |
| | 🔴 ถ้าเลือก "ควนลัง" ครัวเรือนฝั่งหาดใหญ่จะถูกนับผิดตำบล |
| | 🔴 Dashboard filter ตำบลหาดใหญ่จะไม่เห็นควนสันติเลย |

**สรุป: ❌ ใช้ไม่ได้ — เป็นสาเหตุของ BLOCKER SCH-01**

---

### ทางเลือก B — CommunityTambon เป็นตารางเชื่อม Many-to-Many

```
Community ──< CommunityTambon >── Tambon
                  (isPrimary)
```

| ข้อดี | ข้อเสีย |
|---|---|
| ✅ ควนสันติทำได้ (2 แถว: ควนลัง `isPrimary=true`, หาดใหญ่ `isPrimary=false`) | ต้อง Join เพิ่ม 1 ชั้น |
| ✅ ตรงกับ CLAUDE.md 100% ("ควรใช้ M:N ผ่านตารางเชื่อม" + "ตารางเชื่อมควรมี `isPrimary`") | ต้องมี Constraint กัน isPrimary ซ้ำ |
| ✅ รองรับชุมชนใหม่ที่ครอบคลุมกี่ตำบลก็ได้ | Dashboard filter ต้องระวังการนับซ้ำ |
| ✅ Dashboard filter ตำบลหาดใหญ่จะเห็นควนสันติ ✅ | |
| ✅ ไม่ต้องพึ่ง GIS (ทำงานได้แม้ยังไม่มี Polygon) | |
| ✅ เป็นความจริงเชิงการปกครอง (Administrative Truth) ที่ตรวจสอบได้ | |

**สรุป: ✅ จำเป็น — เป็นแกนหลักของการออกแบบ**

---

### ทางเลือก C — CommunityBoundary ใช้ Polygon เป็นขอบเขตจริง

```
Community ──< CommunityBoundary (MultiPolygon)
```

| ข้อดี | ข้อเสีย |
|---|---|
| ✅ แทนขอบเขตจริงที่ไม่ตรงกับตำบลได้ (ตรงข้อกำหนดข้อ 6) | 🔴 **ยังไม่มีข้อมูล Polygon** — ต้องไปวาด/ขอจากเทศบาล |
| ✅ ใช้หา "ครัวเรือนนี้อยู่ในชุมชนไหน" จากพิกัดได้ (`ST_Covers` — ดูหมายเหตุ) | 🔴 ถ้าใช้เป็นแหล่งความจริงเดียว → ครัวเรือนที่ไม่มีพิกัดจะไม่มีชุมชน |
| ✅ GIS แสดงขอบเขตได้สวยงาม | ⚠️ พิกัดจดด้วยมือ มีโอกาสผิดสูง (ข้อเท็จจริงข้อ 7 ของเอกสาร) → ถ้าพิกัดผิด ชุมชนจะผิดตาม |
| ✅ คำนวณ Coverage เชิงพื้นที่ได้ (โซนสีเทา FR-CVG-02) | ⚠️ ขอบเขตชุมชนอาจทับซ้อนกัน/มีช่องว่าง |

**สรุป: ✅ จำเป็นสำหรับ GIS — แต่ ❌ ห้ามใช้เป็นแหล่งความจริงของ "ครัวเรือนนี้อยู่ชุมชนไหน"**

---

## 4. ข้อเสนอ: ใช้ B + C ร่วมกัน (แยกหน้าที่ให้ชัด)

### หลักการออกแบบ

> **แยก "ความจริงเชิงการปกครอง" ออกจาก "ความจริงเชิงภูมิศาสตร์" — และอย่าให้อย่างหลังมาตัดสินอย่างแรก**

| แนวคิด | แหล่งความจริง | ใช้ทำอะไร |
|---|---|---|
| **ครัวเรือนนี้อยู่ชุมชนไหน** | `Household.communityId` (มาจาก Batch + ชื่อบนกระดาษ) | Dashboard, Coverage, Report |
| **ครัวเรือนนี้อยู่ตำบลไหน** | `Household.tambonId` (ติ๊กบนกระดาษ ส่วนที่ 1 ข้อ 3) | Filter ตำบล, สถิติราชการ |
| **ชุมชนนี้ครอบคลุมตำบลใดบ้าง** | `CommunityTambon` (ข้อมูลการปกครอง) | Filter, Validation, การรายงานต่อราชการ |
| **ขอบเขตชุมชนบนแผนที่** | `CommunityBoundary` (MultiPolygon) | GIS แสดงผล, Coverage เชิงพื้นที่, Grid Aggregation |

**เหตุผลที่ต้องแยก:**
- กระดาษให้ผู้สำรวจ**ติ๊กตำบลเอง** (ควนลัง/หาดใหญ่) → นี่คือความจริงจากภาคสนาม ต้องเชื่อถือมากกว่าการคำนวณจากพิกัดที่จดด้วยมือ
- ครัวเรือนที่พิกัดว่าง/อ่านไม่ออก (ซึ่งจะมีจำนวนมาก) **ต้องยังมีชุมชนและตำบล** → ถ้าใช้ Polygon ตัดสิน ครัวเรือนเหล่านี้จะหายจากระบบ
- ขอบเขตชุมชนจริงอาจ**คร่อมตำบล** → Polygon เป็นตัวแสดง ไม่ใช่ตัวตัดสิน

---

### 4.1 Model ที่เสนอ

```prisma
/// ชุมชน (หน่วยหลักในการจัดการ)
model Community {
  id                     String    @id @default(cuid())
  code                   String    @unique  /// รหัสชุมชน — ดูกฎการตั้งรหัสด้านล่าง
  nameTh                 String
  nameEn                 String?

  // --- Coverage Model (ดู doc 06) ---
  totalHouseholds        Int?      /// ⚠️ Nullable — ยังไม่ทราบ
  targetCoveragePercent  Float     @default(60)
  lastPopulationUpdatedAt DateTime?
  populationDataSource   String?
  populationDataNote     String?

  leaderName             String?
  leaderPhone            String?   /// 🔒 L3
  isActive               Boolean   @default(true)
  deletedAt              DateTime?

  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  // --- Relations ---
  communityTambons       CommunityTambon[]   /// ⭐ M:N แทน tambonId เดี่ยว
  boundaries             CommunityBoundary[] /// ⭐ ประวัติขอบเขต
  households             Household[]
  batches                PaperBatch[]
  evacuationSites        EvacuationSite[]
  userScopes             UserCommunityScope[]
  incidentCommunities    IncidentCommunity[] /// ⭐ แทน String[]

  @@index([isActive])
  @@map("community")
}

/// ⭐ ใหม่ — ตารางเชื่อม Community ↔ Tambon (M:N)
model CommunityTambon {
  id          String   @id @default(cuid())
  communityId String
  tambonId    String
  isPrimary   Boolean  @default(false) /// ตำบลหลักของชุมชน (มีได้เพียง 1 ต่อชุมชน)
  note        String?  /// เช่น "ครอบคลุมเฉพาะฝั่งตะวันออกของคลอง"

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  community   Community @relation(fields: [communityId], references: [id], onDelete: Restrict)
  tambon      Tambon    @relation(fields: [tambonId], references: [id], onDelete: Restrict)

  @@unique([communityId, tambonId])
  @@index([tambonId])          /// Filter: ตำบลนี้มีชุมชนอะไรบ้าง
  @@index([communityId, isPrimary])
  @@map("community_tambon")
}

/// ⭐ ใหม่ — ขอบเขตชุมชนเชิงภูมิศาสตร์ (แยกจาก Community เพื่อเก็บประวัติ)
model CommunityBoundary {
  id            String    @id @default(cuid())
  communityId   String
  version       Int       @default(1)
  // geom       — geography(MultiPolygon, 4326) ⚠️ จัดการผ่าน Custom SQL (Prisma ไม่รองรับ)
  source        String?   /// "เทศบาลนครหาดใหญ่" / "วาดโดยชุมชน" / "GPS Survey"
  accuracyNote  String?   /// "ขอบเขตโดยประมาณ ยังไม่ผ่านการรับรอง"
  isApproved    Boolean   @default(false)
  approvedById  String?
  approvedAt    DateTime?
  effectiveFrom DateTime  @default(now())
  effectiveTo   DateTime? /// null = ใช้อยู่ปัจจุบัน

  createdAt     DateTime  @default(now())

  community     Community @relation(fields: [communityId], references: [id], onDelete: Restrict)

  @@unique([communityId, version])
  @@index([communityId, effectiveTo]) /// หาขอบเขตปัจจุบัน
  @@map("community_boundary")
}
```

**การเปลี่ยนแปลงที่ `Tambon`:**

```prisma
model Tambon {
  id               String    @id @default(cuid())
  districtId       String
  code             String    @unique
  nameTh           String
  nameEn           String?
  isActive         Boolean   @default(true)   /// ⭐ เพิ่ม
  sortOrder        Int       @default(0)      /// ⭐ เพิ่ม

  district         District  @relation(fields: [districtId], references: [id])
  moos             Moo[]
  households       Household[]
  communityTambons CommunityTambon[]  /// ⭐ แทน communities Community[]

  @@index([districtId])   /// ⭐ เพิ่ม
  @@map("tambon")
}
```

**`Household` — ไม่เปลี่ยนโครงสร้าง แต่เพิ่ม Validation:**

```prisma
model Household {
  communityId  String   /// ชุมชน (จาก Batch + ชื่อบนกระดาษ)
  tambonId     String?  /// ⭐ ตำบลจริงของครัวเรือน (ติ๊กบนกระดาษ ส่วนที่ 1 ข้อ 3)
  mooId        String?
  // ... (คงเดิม)
}
```

✅ **`Household` ปัจจุบันออกแบบถูกแล้ว** — มีทั้ง `communityId` และ `tambonId` แยกกัน ตรงกับข้อกำหนดข้อ 2 ("Household แต่ละหลังควรระบุตำบลจริงของตนเองได้")

---

### 4.2 กฎความสอดคล้อง (Business Rules ใหม่ที่ต้องเพิ่ม)

| รหัส (เสนอ) | กฎ | ระดับการบังคับ |
|---|---|---|
| **BR-CT-01** | 1 ชุมชนต้องมีอย่างน้อย 1 ตำบลใน `CommunityTambon` | 🔴 Hard (Validation ตอนสร้างชุมชน) |
| **BR-CT-02** | 1 ชุมชนมี `isPrimary = true` ได้**เพียง 1 แถวเท่านั้น** | 🔴 Hard (Partial Unique Index) |
| **BR-CT-03** | `Household.tambonId` **ควร**อยู่ในเซ็ตของ `CommunityTambon` ของชุมชนนั้น | 🟡 **Soft (Warning เท่านั้น)** — ดูเหตุผลด้านล่าง |
| **BR-CT-04** | `Moo` ที่เลือกต้องอยู่ใน `Tambon` ที่เลือก | 🔴 Hard |
| **BR-CT-05** | ห้ามลบ `CommunityTambon` ที่ยังมี Household อ้างถึงตำบลนั้น | 🔴 Hard |

**⚠️ ทำไม BR-CT-03 ต้องเป็น Soft (สำคัญมาก):**

ถ้าบังคับ Hard แล้วผู้สำรวจติ๊กตำบลที่ไม่อยู่ในเซ็ตของชุมชน (เช่น ใบของชุมชนท่าเคียนแต่ติ๊ก "หาดใหญ่") → **ผู้คีย์จะบันทึกไม่ได้เลย** → ขัดกับหลักการสูงสุดของระบบว่า *"ห้ามบังคับให้ผู้คีย์เดาค่า"* และ *"ฟอร์มต้องตรงกระดาษ 100%"*

ความจริงคือ **กระดาษอาจผิด** หรือ **ขอบเขตชุมชนที่เราเข้าใจอาจผิด** → ต้องคีย์ตามกระดาษก่อน แล้วให้ Verifier ตัดสิน (เข้า Field Query Loop ถ้าจำเป็น)

**Implementation:** Warning ที่ Entry Console + Flag ไว้ให้ Verifier + Dashboard "รายการที่ตำบลไม่ตรงกับชุมชน"

**Partial Unique Index สำหรับ BR-CT-02:**
```sql
CREATE UNIQUE INDEX ux_community_primary_tambon
  ON "community_tambon" ("communityId")
  WHERE "isPrimary" = true;
```

---

### 4.3 กฎการตั้งรหัสชุมชน (`Community.code`)

**ปัญหาปัจจุบัน:** `KL01`, `KL02`, `HY01` — รหัสสื่อถึงตำบล (KL = ควนลัง, HY = หาดใหญ่) → **ชุมชนควนสันติที่ครอบคลุม 2 ตำบล จะใช้รหัสอะไร?**

**ข้อเสนอ:** ใช้รหัสที่**ไม่ผูกกับตำบล** แต่ผูกกับอำเภอ (ซึ่งชุมชนไม่ข้ามอำเภอในกรณีนี้) หรือใช้ Running Number ล้วน

| ทางเลือก | ตัวอย่าง | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **A. รหัสอำเภอ + ลำดับ** | `9001-001` ถึง `9001-005` | ไม่ผูกตำบล, ขยายได้, สื่อความหมาย | ยาว |
| **B. Running Number ล้วน** | `C0001` … | สั้น, ไม่ผูกพื้นที่เลย | ไม่สื่อความหมาย |
| **C. ชื่อย่อชุมชน** | `TKN`, `PSM`, `KST`, `PLW`, `NKN` | อ่านง่าย | ตั้งซ้ำได้เมื่อขยายพื้นที่ |

**แนะนำ: ทางเลือก A** — เพราะ `sheetNo` ใช้รูปแบบ `SHEET-{ชุมชน}-{batch}-{ลำดับ}` (FR-BAT-02) ซึ่งต้องอ่านออกด้วยตาบนกระดาษ → รหัสควรสื่อความหมายแต่ไม่ผูกตำบล

**⚠️ ต้องได้รับการยืนยัน** — รหัสจะปรากฏบนสติกเกอร์กระดาษ 3,000 ใบ เปลี่ยนภายหลังยาก (ดู Q-21)

---

### 4.4 การ Seed ข้อมูล 5 ชุมชน (ตามข้อเสนอ)

```
Province: สงขลา (90)
  └── District: หาดใหญ่ (9001)
        ├── Tambon: ควนลัง (900105?)   ⚠️ ต้องยืนยันรหัส
        └── Tambon: หาดใหญ่ (900101?)  ⚠️ ต้องยืนยันรหัส

Community: ชุมชนท่าเคียน
  └── CommunityTambon → ควนลัง (isPrimary: true)

Community: ชุมชนประสานมิตร
  └── CommunityTambon → ควนลัง (isPrimary: true)

Community: ชุมชนควนสันติ          ⭐ กรณีพิเศษ
  ├── CommunityTambon → ควนลัง  (isPrimary: ???)  ⚠️ ต้องยืนยัน (Q-17)
  └── CommunityTambon → หาดใหญ่ (isPrimary: ???)

Community: ชุมชนปลักหว้า
  └── CommunityTambon → ควนลัง (isPrimary: true)

Community: ชุมชนหน้าควน
  └── CommunityTambon → ควนลัง (isPrimary: true)
```

**totalHouseholds ของทั้ง 5 ชุมชน = `null`** (ยังไม่ทราบ — ห้ามเดา)

---

## 5. ตอบข้อพิจารณาทั้ง 6 ข้อของภารกิจที่ 4

### 1. ชุมชนควนสันติครอบคลุมตำบลควนลังและตำบลหาดใหญ่

✅ **รองรับด้วย `CommunityTambon`** — 2 แถว (ควนลัง + หาดใหญ่) โดยระบุ `isPrimary` ที่ตำบลหลัก

⚠️ **ต้องยืนยัน:** ตำบลใดเป็นตำบลหลัก (Q-17) — มีผลต่อการรายงานต่อราชการและการตั้งรหัส

### 2. Household แต่ละหลังควรระบุตำบลจริงของตนเองได้

✅ **รองรับอยู่แล้ว** — `Household.tambonId` เป็น FK แยกจาก `communityId` และกระดาษให้ติ๊กตำบลเอง (ส่วนที่ 1 ข้อ 3) → Schema ปัจจุบันออกแบบถูกต้องในจุดนี้

**ตัวอย่างการทำงาน:** ครัวเรือนในชุมชนควนสันติที่อยู่ฝั่งตำบลหาดใหญ่ → `communityId = ควนสันติ`, `tambonId = หาดใหญ่` ✅

### 3. Community สามารถมีตำบลหลักและตำบลรองได้

✅ **รองรับด้วย `CommunityTambon.isPrimary`** ตามที่ CLAUDE.md ระบุ (*"ตารางเชื่อมควรมี `isPrimary` สำหรับระบุตำบลหลัก"*) + Partial Unique Index กันมีหลายตำบลหลัก

### 4. ระบบต้องรองรับชุมชนใหม่ในพื้นที่อื่น

✅ **รองรับ** — โครงสร้าง Province → District → Tambon → Moo เป็น FK ทั้งหมด และ `CommunityTambon` ไม่จำกัดว่าตำบลต้องอยู่อำเภอ/จังหวัดใด

⚠️ **แต่ยังมี 2 จุดที่บล็อก:**
1. **Bounding Box หาดใหญ่ Hardcode** (`HAT_YAI_LAT_MIN/MAX/LNG_MIN/MAX` ใน seed.ts:341-344) → ชุมชนนอกหาดใหญ่จะถูกเตือน "พิกัดผิด" ตลอด → **ต้องย้ายไปเป็น Bounding Box ต่อชุมชน/อำเภอ** (ดู [07-seed-gap-analysis.md](07-seed-gap-analysis.md) SEED-08)
2. **รหัสชุมชน `KL01`** → ดูข้อ 4.3

⚠️ **ข้อควรพิจารณาเชิงโครงสร้าง:** ถ้าอนาคตชุมชนหนึ่งครอบคลุม **2 อำเภอ** หรือ **2 จังหวัด** — โครงสร้างนี้รองรับได้โดยอัตโนมัติ ✅ (เพราะเชื่อมที่ระดับ Tambon ซึ่งเป็นหน่วยเล็กสุด) แต่การรายงานจะซับซ้อน → ควรมี `Community.primaryDistrictId` (Derived) เพื่อความเร็วในการ Filter

### 5. Dashboard ต้อง Filter ตามจังหวัด อำเภอ ตำบล และชุมชนได้

✅ **รองรับ — แต่ต้องระวังการนับซ้ำ**

**Query Pattern ที่แนะนำ:**

```sql
-- Filter: ครัวเรือนในตำบล X
-- ✅ ใช้ Household.tambonId ตรงๆ (ความจริงจากกระดาษ)
SELECT * FROM household h WHERE h."tambonId" = :tambonId AND h."deletedAt" IS NULL;

-- Filter: ชุมชนในตำบล X (รวมชุมชนที่ครอบคลุมหลายตำบล)
SELECT DISTINCT c.* FROM community c
JOIN community_tambon ct ON ct."communityId" = c.id
WHERE ct."tambonId" = :tambonId AND c."isActive" = true;

-- Filter: ครัวเรือนในอำเภอ Y
SELECT h.* FROM household h
JOIN tambon t ON t.id = h."tambonId"
WHERE t."districtId" = :districtId AND h."deletedAt" IS NULL;

-- ⚠️ อันตราย: นับครัวเรือนต่อตำบล ผ่าน community_tambon
-- ❌ ผิด — ควนสันติจะถูกนับ 2 ครั้ง (ทั้งควนลังและหาดใหญ่)
SELECT ct."tambonId", COUNT(h.id)
FROM community_tambon ct
JOIN household h ON h."communityId" = ct."communityId"
GROUP BY ct."tambonId";
```

**🔴 กฎสำคัญ:** **การนับครัวเรือนต่อตำบล ต้องใช้ `Household.tambonId` เสมอ — ห้ามใช้ `CommunityTambon`**
เพราะ `CommunityTambon` บอกเพียงว่า "ชุมชนนี้แตะตำบลใดบ้าง" ไม่ได้บอกว่าครัวเรือนไหนอยู่ตำบลไหน → **การ Join ผ่าน `CommunityTambon` จะทำให้ควนสันติถูกนับ 2 เท่า** ซึ่งเป็นบั๊กประเภทเดียวกับที่พบใน `v_community_summary` แล้ว (ดู [09](09-postgis-sql-review.md) SQL-06)

**Filter UI ที่แนะนำ:** Cascading Dropdown — จังหวัด → อำเภอ → ตำบล → ชุมชน โดยชุมชนควนสันติจะปรากฏเมื่อเลือกตำบลควนลัง**หรือ**หาดใหญ่ ✅

### 6. GIS ต้องแสดงขอบเขตชุมชนที่อาจไม่ตรงกับขอบเขตตำบล

✅ **รองรับด้วย `CommunityBoundary` (MultiPolygon)**

**เหตุผลที่ต้องเป็น MultiPolygon ไม่ใช่ Polygon:**
1. ชุมชนอาจมีพื้นที่**ไม่ต่อเนื่อง** (ถูกคลอง/ถนน/ทางรถไฟตัดผ่าน) — ชื่อเครือข่ายคือ "**สองคลอง**ควนลัง" ซึ่งบ่งชี้ว่าพื้นที่ถูกคลองตัดผ่านจริง
2. ควนสันติที่คร่อม 2 ตำบล มีโอกาสสูงที่จะไม่ต่อเนื่อง
3. `MultiPolygon` รองรับ Polygon เดี่ยวได้อยู่แล้ว (ไม่เสียอะไร) แต่ `Polygon` รองรับหลายชิ้นไม่ได้

**เหตุผลที่ต้องแยกเป็นตาราง `CommunityBoundary` ไม่ใช่ column ใน `Community`:**
1. **เก็บประวัติ** — ขอบเขตชุมชนเปลี่ยนได้ และต้องรู้ว่าตอนคำนวณ Coverage ใช้ขอบเขตเวอร์ชันไหน
2. **สถานะการรับรอง** — ขอบเขตที่ยังไม่ผ่านการรับรอง (`isApproved = false`) ไม่ควรใช้ในรายงานทางการ
3. **แหล่งที่มา** — ต้องรู้ว่าใครวาด (เทศบาล vs ชุมชนวาดเอง) เพราะความน่าเชื่อถือต่างกัน
4. **ปัจจุบันยังไม่มีข้อมูล** — ถ้าเป็น column ใน `Community` จะเป็น NULL ทั้ง 5 แถว และไม่รู้ว่า "ยังไม่มี" หรือ "ไม่มีขอบเขต"

**Custom SQL ที่ต้องเพิ่ม:**
```sql
ALTER TABLE "community_boundary"
  ADD COLUMN IF NOT EXISTS "geom" geography(MultiPolygon, 4326);

CREATE INDEX IF NOT EXISTS ix_community_boundary_geom
  ON "community_boundary" USING GIST ("geom");
```

**⚠️ หมายเหตุ:** SQL ปัจจุบันเพิ่ม `boundary geography(Polygon, 4326)` ที่ตาราง `community` โดยตรง (SQL:80-84) → ต้องย้ายและเปลี่ยนเป็น MultiPolygon

---

## 6. การใช้งาน GIS: ขอบเขตชุมชน vs การตัดสินว่าอยู่ชุมชนไหน

| กรณีใช้งาน | ใช้อะไร | เหตุผล |
|---|---|---|
| แสดงขอบเขตบนแผนที่ | `CommunityBoundary.geom` | ✅ |
| หาว่าครัวเรือนนี้อยู่ชุมชนไหน | **`Household.communityId`** (ไม่ใช่ Polygon) | พิกัดจดมือ ผิดได้ / บางใบไม่มีพิกัด |
| **ตรวจสอบ**ว่าพิกัดตรงกับชุมชนไหม | `ST_Covers(boundary, location)` → **Warning** | เป็นเครื่องมือตรวจคุณภาพ ไม่ใช่ตัวตัดสิน |
| โซนไม่มีข้อมูล (FR-CVG-02) | `CommunityBoundary` + Grid | ต้องมี Polygon ถึงจะรู้ว่า "โซนไหน" |
| Grid Aggregation หน้า Public | `CommunityBoundary` + Grid | ✅ |
| หาจุดอพยพใกล้สุด | `ST_Distance` (geography) | ✅ |

**กฎที่เสนอ (BR-GIS-01):** ระบบต้อง**เตือน** (ไม่ใช่ปฏิเสธ) เมื่อ `ST_Covers(boundary.geom, household.location) = false` → เข้าคิวให้ Verifier ตรวจ

> ⚠️ **หมายเหตุทางเทคนิคที่สำคัญ:** ต้องใช้ **`ST_Covers`** ไม่ใช่ `ST_Contains`
> เพราะ PostGIS **ไม่มี** `ST_Contains(geography, geography)` — จะได้ `ERROR: function st_contains(geography, geography) does not exist`
> ฟังก์ชันที่รองรับ `geography` มีจำกัด: `ST_Intersects`, `ST_Covers`, `ST_CoveredBy`, `ST_DWithin`, `ST_Distance`, `ST_Area`
> นอกจากนี้ `ST_Covers` ยัง**รวมจุดที่อยู่บนขอบเขต** ซึ่งเหมาะกว่าสำหรับกรณีนี้ (บ้านที่อยู่ติดขอบชุมชนควรนับเป็นในชุมชน)
> ดูรายละเอียดใน [09-postgis-sql-review.md](09-postgis-sql-review.md) SQL-07

---

## 7. Migration Path (แผนการเปลี่ยน — ยังไม่ดำเนินการ)

เนื่องจาก**ยังไม่มีข้อมูลจริงในระบบ** (ยังไม่ได้รัน Migration) → เปลี่ยนได้อย่างปลอดภัย

| ลำดับ | การเปลี่ยนแปลง | ความเสี่ยง |
|---|---|---|
| 1 | เพิ่ม `CommunityTambon` model | 🟢 ต่ำ |
| 2 | ลบ `Community.tambonId` + relation `tambon` | 🟢 ต่ำ (ยังไม่มีข้อมูล) |
| 3 | เปลี่ยน `Tambon.communities` → `Tambon.communityTambons` | 🟢 ต่ำ |
| 4 | เพิ่ม `CommunityBoundary` model | 🟢 ต่ำ |
| 5 | ย้าย `community.boundary` → `community_boundary.geom` (MultiPolygon) | 🟢 ต่ำ |
| 6 | เปลี่ยน `targetHouseholds` → Coverage fields (doc 06) | 🟢 ต่ำ |
| 7 | อัปเดต Seed ตามชุมชนจริง 5 แห่ง | 🟢 ต่ำ |
| 8 | อัปเดต `v_community_summary` | 🟡 กลาง (ต้องแก้ View ด้วย) |

> ⚠️ **ถ้าปล่อยให้ Migration รันไปก่อน แล้วค่อยแก้ → จะยากขึ้นมาก** เพราะต้อง Backfill `CommunityTambon` จาก `tambonId` เดิม และแก้ View/Trigger ที่อ้างถึง → **นี่คือเหตุผลที่ SCH-01 เป็น BLOCKER ที่ต้องแก้ก่อน Phase 2**

---

## 8. สรุปข้อเสนอ

| ประเด็น | ข้อเสนอ | เหตุผลหลัก |
|---|---|---|
| **Community ↔ Tambon** | ✅ **`CommunityTambon` (M:N + `isPrimary`)** | ควนสันติ 2 ตำบล + ตรง CLAUDE.md |
| **ขอบเขตชุมชน** | ✅ **`CommunityBoundary` แยกตาราง + MultiPolygon + version** | เก็บประวัติ + รองรับพื้นที่ไม่ต่อเนื่อง |
| **ครัวเรือนอยู่ชุมชนไหน** | ✅ **`Household.communityId`** (ไม่ใช่ Polygon) | พิกัดจดมือเชื่อถือไม่ได้ + บางใบไม่มีพิกัด |
| **ครัวเรือนอยู่ตำบลไหน** | ✅ **`Household.tambonId`** (ติ๊กบนกระดาษ) | ความจริงจากภาคสนาม |
| **นับครัวเรือนต่อตำบล** | ✅ **ใช้ `Household.tambonId` เสมอ** | ห้าม Join ผ่าน `CommunityTambon` → นับซ้ำ |
| **Polygon ใช้ทำอะไร** | แสดงผล + ตรวจสอบคุณภาพ (Warning) | ไม่ใช่ตัวตัดสิน |
| **รหัสชุมชน** | เสนอ `9001-001` (อำเภอ+ลำดับ) | ไม่ผูกตำบล ⚠️ ต้องยืนยัน |
| **ตำบลหลักควนสันติ** | ⚠️ **ต้องยืนยัน** | Q-17 |
