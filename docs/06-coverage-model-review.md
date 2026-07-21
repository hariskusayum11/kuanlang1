# 06 — Coverage Model Review

> ตอบภารกิจที่ 5 — ตรวจว่า Schema รองรับ Coverage Model หรือไม่ และเสนอว่าส่วนใดควรเก็บจริง ส่วนใดควรคำนวณ
> **ยังไม่แก้ Schema**

---

## 1. สรุปผลตรวจ: Schema รองรับ **0 จาก 9 ฟิลด์**

| # | ฟิลด์ที่คำสั่งกำหนด | มีใน Schema? | สถานะปัจจุบัน |
|---|---|---|---|
| 1 | `totalHouseholds` | ❌ **ไม่มี** | มี `Community.targetHouseholds Int @default(0)` ซึ่งเป็น**คนละแนวคิด** (เป้าหมาย ≠ จำนวนจริง) และไม่ Nullable |
| 2 | `targetCoveragePercent` | ❌ **ไม่มี** | — |
| 3 | `receivedSurveyCount` | ⚠️ **มีบางส่วน** | `PaperBatch.expectedCount` + `PaperBatch.receivedCount` — อยู่ระดับ **Batch ไม่ใช่ Community** และ `receivedCount` **ไม่มี Trigger คำนวณ** (ดู SQL-05) |
| 4 | `enteredSurveyCount` | ⚠️ **มีบางส่วน** | `PaperBatch.enteredCount` — ระดับ Batch เท่านั้น |
| 5 | `verifiedHouseholdCount` | ⚠️ **มีบางส่วน** | `PaperBatch.verifiedCount` — ระดับ Batch เท่านั้น |
| 6 | `surveyCoveragePercent` | ❌ **ไม่มี** | — |
| 7 | `verifiedCoveragePercent` | ❌ **ไม่มี** | `v_community_summary."coveragePercent"` มีเพียง**ตัวเดียว** ที่ไม่ระบุว่าเป็น Survey หรือ Verified และหารด้วย `targetHouseholds` (600) |
| 8 | `lastPopulationUpdatedAt` | ❌ **ไม่มี** | — |
| 9 | `populationDataSource` | ❌ **ไม่มี** | — |

**สรุป:** Coverage Model **ยังไม่มีอยู่จริง** — สิ่งที่มีคือ Counter ระดับ Batch ที่ Trigger ทำงานไม่ครบ + View ที่คำนวณผิด

---

## 2. ปัญหาของ Coverage ปัจจุบัน

### 🔴 COV-01 — BLOCKER: `coveragePercent` คำนวณจาก Denominator ที่เป็นค่าสมมติ

**พบในไฟล์ใด:** `database/drafts/00_postgis_extensions.sql:246-251`

```sql
CASE
  WHEN c."targetHouseholds" > 0
  THEN ROUND(COUNT(DISTINCT h.id) FILTER (WHERE ps.status = 'VERIFIED')::numeric
       / c."targetHouseholds" * 100, 1)
  ELSE 0
END AS "coveragePercent"
```

**ปัญหา 4 ชั้น:**

1. **หารด้วย 600 ที่เป็นค่าสมมติ** — `targetHouseholds` มาจาก `seed.ts:82-86` ที่ตั้งไว้ 600 ทุกชุมชนโดยไม่มีหลักฐาน → **Coverage ทุกตัวเลขในระบบไม่มีความหมาย**
2. **`ELSE 0` อันตรายที่สุด** — เมื่อ `targetHouseholds = 0` (ค่า default!) จะคืน **Coverage = 0%** ซึ่งแปลว่า "สำรวจแล้ว 0%" ทั้งที่ความจริงคือ **"ยังไม่ทราบว่าครอบคลุมเท่าไร"** → **นี่คือ RK-C1 โดยตรง** ("เจ้าหน้าที่เข้าใจผิดว่าข้อมูลครบ" — ในที่นี้กลับกันคือเข้าใจผิดว่าไม่มีข้อมูลเลย)
3. **มี Coverage ตัวเดียว** — ไม่แยก Survey Coverage กับ Verified Coverage ตามที่คำสั่งกำหนด
4. **ไม่กรองข้อมูลที่ห้ามนับ** — ไม่กรอง `hasDuplicateFlag`, `MERGED_INTO`, `SHEET_LOST` → ดู COV-02

**ผลกระทบ:** Dashboard, Coverage Badge (FR-CVG-01), Report Watermark (FR-CVG-05), Export Warning (FR-CVG-04), KPI — **ทั้งหมดแสดงตัวเลขที่ผิด**

---

### 🔴 COV-02 — BLOCKER: นับ Household ซ้ำ และนับข้อมูลที่ห้ามนับ

**พบในไฟล์ใด:** `00_postgis_extensions.sql:231-258`

**ปัญหา (ก) — นับซ้ำจาก JOIN Fan-out:**

```sql
FROM "community" c
LEFT JOIN "household" h ON h."communityId" = c.id AND h."deletedAt" IS NULL
LEFT JOIN "paper_sheet" ps ON ps.id = h."sheetId"
LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
LEFT JOIN "vulnerable_person" vp ON vp."householdId" = h.id   -- ⚠️ 1:N → ระเบิดแถว
GROUP BY c.id, ...
```

`vulnerable_person` เป็นความสัมพันธ์ **1:N** → ครัวเรือนที่มีกลุ่มเปราะบาง 3 คน จะกลายเป็น **3 แถว** ใน result set

- `COUNT(DISTINCT h.id)` → ✅ ปลอดภัย (DISTINCT ป้องกันไว้)
- **`COALESCE(SUM(h."memberCount"), 0) AS "totalPopulation"`** → ❌ **ผิดร้ายแรง** — ครัวเรือนที่มีสมาชิก 5 คน และมีกลุ่มเปราะบาง 3 คน จะถูก SUM เป็น **5 × 3 = 15 คน**

→ **`totalPopulation` บน Dashboard จะสูงกว่าความจริงหลายเท่า** และยิ่งชุมชนมีกลุ่มเปราะบางมาก ตัวเลขยิ่งเพี้ยนมาก (ซึ่งเป็นชุมชนที่ต้องการความแม่นยำที่สุด)

**ปัญหา (ข) — ไม่กรองข้อมูลที่ห้ามนับ:**

คำสั่งระบุชัด: *"ห้ามนับข้อมูลสถานะ Draft, Duplicate, Cancelled, Rejected หรือ Invalid เป็น Verified Coverage"* และ *"ห้ามนับ Household ซ้ำ"*

| สถานะที่ต้องกรอง | Schema มีอะไร | View กรองหรือไม่ |
|---|---|---|
| **Duplicate** | `Household.hasDuplicateFlag`, `SheetStatus.MERGED_INTO` | ❌ **ไม่กรอง** |
| **Draft** | ⚠️ ไม่มีสถานะ Draft ที่ชัดเจน (`EntryAttempt.submittedAt = null`?) | ❌ |
| **Cancelled** | ⚠️ ไม่มี | — |
| **Rejected** | ⚠️ ไม่มี | — |
| **Invalid** | `SheetStatus.UNRESOLVABLE`, `SHEET_LOST` | ❌ ไม่กรอง (แต่ไม่กระทบ เพราะกรอง `= VERIFIED` อยู่แล้ว) |
| **Soft-deleted** | `Household.deletedAt` | ✅ กรอง |

**ประเด็นสำคัญ:** `COUNT(DISTINCT h.id) AS "totalHouseholds"` (บรรทัด 237) **ไม่กรอง `MERGED_INTO`** → ใบซ้ำที่ Merge แล้วจะถูกนับเป็นครัวเรือนแยก → **นับซ้ำ**

**⚠️ ความสับสนของชื่อ:** View ตั้งชื่อ column ว่า `"totalHouseholds"` ซึ่งหมายถึง "จำนวนครัวเรือนที่คีย์เข้าระบบ" แต่ Coverage Model ใหม่ใช้คำว่า `totalHouseholds` หมายถึง **"จำนวนครัวเรือนทั้งหมดในชุมชน (Denominator)"** → **คนละความหมายโดยสิ้นเชิง** → ถ้าไม่แก้ชื่อจะเกิดความเข้าใจผิดร้ายแรง

---

### 🟠 COV-03 — HIGH: Coverage อยู่ระดับ Batch ไม่ใช่ Community

**ปัญหา:** `PaperBatch.receivedCount/enteredCount/verifiedCount` เป็น Counter ระดับ **Batch** แต่ Coverage ต้องรายงานระดับ **Community**

**ทำไมถึงเป็นปัญหา:**
- 1 ชุมชนอาจมีหลาย Batch (ปึกทยอยส่งมา — S2: *"เริ่มคีย์ทันทีที่ปึกแรกมาถึง อย่ารอครบ 3,000"*)
- Batch หนึ่งอาจมี "1 ปึก = 1 ชุมชน **โดยปกติ**" (schema.prisma:522) → คำว่า "โดยปกติ" แปลว่ามีข้อยกเว้น → **Batch อาจปนหลายชุมชนได้**

**ผลกระทบ:** ถ้า Batch ปนชุมชน → `SUM(batch.verifiedCount)` ต่อชุมชนจะผิด → **ต้องนับจาก `Household.communityId` เสมอ ไม่ใช่จาก Batch**

---

## 3. ข้อเสนอ: Coverage Model

### 3.1 หลักการออกแบบ

> **แยก "ตัวหาร (Denominator)" ที่มนุษย์ป้อน ออกจาก "ตัวตั้ง (Numerator)" ที่ระบบนับได้เอง**

| ประเภท | ลักษณะ | ควรเก็บที่ไหน |
|---|---|---|
| **Denominator** (`totalHouseholds`) | มนุษย์ป้อน / มาจากทะเบียนราษฎร์ / เปลี่ยนน้อย | ✅ **เก็บจริงใน DB** |
| **Policy** (`targetCoveragePercent`) | มนุษย์ตั้ง / เปลี่ยนน้อย | ✅ **เก็บจริงใน DB** |
| **Metadata** (`lastPopulationUpdatedAt`, `populationDataSource`) | อธิบายที่มาของ Denominator | ✅ **เก็บจริงใน DB** |
| **Numerator** (`receivedSurveyCount`, `enteredSurveyCount`, `verifiedHouseholdCount`) | ระบบนับได้จากข้อมูลจริง / เปลี่ยนตลอดเวลา | ⚠️ **คำนวณ — ไม่เก็บ** (ดูเหตุผล 3.3) |
| **Derived** (`surveyCoveragePercent`, `verifiedCoveragePercent`) | คำนวณจาก Numerator ÷ Denominator | ❌ **ห้ามเก็บ — คำนวณเสมอ** |

**เหตุผลที่ห้ามเก็บ Derived:** ถ้าเก็บ `verifiedCoveragePercent` ไว้ใน DB แล้ว `totalHouseholds` เปลี่ยน → ตัวเลขจะค้างเป็นค่าเก่าทันที (Stale) และไม่มีทางรู้ว่าค้าง → **Single Source of Truth ต้องเป็นค่าดิบเท่านั้น**

---

### 3.2 ส่วนที่ควรเก็บจริงใน Database

```prisma
model Community {
  id                      String    @id @default(cuid())
  code                    String    @unique
  nameTh                  String

  // ═══ Coverage Model ═══

  /// จำนวนครัวเรือนทั้งหมดในชุมชน (Denominator)
  /// ⚠️ Nullable — ปัจจุบันยังไม่ทราบ ห้ามเดา ห้าม default 0
  totalHouseholds         Int?

  /// เปอร์เซ็นต์เป้าหมายการสำรวจ — เกณฑ์ผ่านคือ coveragePercent > targetCoveragePercent
  targetCoveragePercent   Float     @default(60)

  /// วันที่อัปเดตข้อมูลจำนวนครัวเรือนล่าสุด
  lastPopulationUpdatedAt DateTime?

  /// แหล่งที่มาของ totalHouseholds เช่น "ทะเบียนราษฎร์ 2567", "สำรวจโดยชุมชน"
  populationDataSource    String?

  /// หมายเหตุ เช่น "ไม่รวมบ้านเช่า", "ประมาณการจากผู้นำชุมชน"
  populationDataNote      String?

  /// ใครอัปเดตล่าสุด (Audit)
  populationUpdatedById   String?

  // ... (fields อื่นตาม doc 05)
}
```

**❌ ลบ `targetHouseholds Int @default(0)` ออก**

**⚠️ CHECK Constraint ที่ต้องเพิ่ม:**
```sql
ALTER TABLE "community"
  ADD CONSTRAINT ck_community_total_households
    CHECK ("totalHouseholds" IS NULL OR "totalHouseholds" > 0);

ALTER TABLE "community"
  ADD CONSTRAINT ck_community_target_coverage
    CHECK ("targetCoveragePercent" > 0 AND "targetCoveragePercent" <= 100);
```

> **`totalHouseholds > 0` ไม่ใช่ `>= 0`** — เพราะชุมชนที่มี 0 ครัวเรือนไม่มีอยู่จริง และการอนุญาต 0 จะเปิดช่องให้หารด้วยศูนย์กลับมาอีก
> **"ไม่ทราบ" ต้องเป็น `NULL` เท่านั้น — ห้ามใช้ 0**

---

### 3.3 ส่วนที่ควรคำนวณ (ไม่เก็บ)

**เหตุผลที่ไม่เก็บ Counter ระดับ Community:**

| เหตุผล | รายละเอียด |
|---|---|
| **Consistency** | Counter ที่เก็บไว้จะไม่ตรงกับความจริงทันทีที่มี Bug ใน Trigger — ซึ่ง**เกิดขึ้นแล้ว**กับ `PaperBatch.receivedCount` ที่ไม่มี Trigger คำนวณเลย (SQL-05) |
| **Race Condition** | Trigger ที่ UPDATE `community` ทุกครั้งที่ sheet เปลี่ยนสถานะ → **Lock contention รุนแรง** เมื่อมีคนคีย์พร้อมกัน 5 คน + Batch 600 ใบ → เสี่ยง Deadlock |
| **ปริมาณข้อมูลน้อย** | 5 ชุมชน × ~600 ครัวเรือน = 3,000 แถว → `COUNT(*)` เร็วมาก (< 10ms) ไม่จำเป็นต้อง Cache |
| **ความถูกต้องสำคัญกว่าความเร็ว** | RK-C1 (เข้าใจผิดว่าข้อมูลครบ) เป็นความเสี่ยง 🔴 วิกฤต — ตัวเลขผิดอันตรายกว่าตัวเลขช้า |

**เมื่อไหร่ถึงควร Cache:** เมื่อถึง NFR-SC-01 (50,000 ครัวเรือน) และวัดแล้วว่าช้าจริง → ใช้ **Materialized View** + Refresh ตาม Schedule (ไม่ใช่ Trigger)

---

### 3.4 View ที่เสนอ (แทน `v_community_summary`)

```sql
-- ⚠️ ต้อง DROP VIEW ก่อน (CREATE OR REPLACE เปลี่ยนชื่อ column ไม่ได้ — ดู SQL-10)
DROP VIEW IF EXISTS v_community_summary;

CREATE VIEW v_community_coverage AS
SELECT
  c.id                        AS "communityId",
  c.code                      AS "communityCode",
  c."nameTh"                  AS "communityName",

  -- ═══ Denominator (จาก DB) ═══
  c."totalHouseholds",
  c."targetCoveragePercent",
  c."lastPopulationUpdatedAt",
  c."populationDataSource",

  -- ═══ Numerator (คำนวณ — ใช้ Subquery แยก ไม่ JOIN เพื่อกัน Fan-out) ═══

  /// จำนวนใบที่รับเข้ามา (นับจาก PaperSheet ที่ไม่หาย/ไม่ถูก Merge)
  COALESCE((
    SELECT COUNT(*) FROM "paper_sheet" ps
    JOIN "paper_batch" pb ON pb.id = ps."batchId"
    WHERE pb."communityId" = c.id
      AND ps.status NOT IN ('SHEET_LOST', 'MERGED_INTO')
  ), 0)                       AS "receivedSurveyCount",

  /// จำนวนใบที่คีย์ Entry 1 แล้ว (ผ่านขั้นตอนคีย์ไปแล้ว)
  COALESCE((
    SELECT COUNT(*) FROM "paper_sheet" ps
    JOIN "paper_batch" pb ON pb.id = ps."batchId"
    WHERE pb."communityId" = c.id
      AND ps.status IN ('ENTERED_1','ENTERED_2','DISCREPANCY','NEEDS_FIELD_QUERY','VERIFIED')
  ), 0)                       AS "enteredSurveyCount",

  /// ⭐ จำนวนครัวเรือนที่ VERIFIED — นับจาก Household (ไม่ใช่ Batch) + กรองครบ
  COALESCE((
    SELECT COUNT(DISTINCT h.id) FROM "household" h
    JOIN "paper_sheet" ps ON ps.id = h."sheetId"
    WHERE h."communityId" = c.id
      AND h."deletedAt" IS NULL              -- ไม่นับที่ลบแล้ว
      AND h."hasDuplicateFlag" = false       -- ไม่นับใบซ้ำ
      AND ps.status = 'VERIFIED'             -- นับเฉพาะ VERIFIED
  ), 0)                       AS "verifiedHouseholdCount",

  -- ═══ Derived (คำนวณเสมอ — NULL เมื่อไม่ทราบ Denominator) ═══

  CASE WHEN c."totalHouseholds" IS NULL OR c."totalHouseholds" <= 0 THEN NULL
       ELSE ROUND(
         (SELECT COUNT(*) FROM "paper_sheet" ps
          JOIN "paper_batch" pb ON pb.id = ps."batchId"
          WHERE pb."communityId" = c.id
            AND ps.status NOT IN ('SHEET_LOST','MERGED_INTO'))::numeric
         / c."totalHouseholds" * 100, 1)
  END                         AS "surveyCoveragePercent",

  CASE WHEN c."totalHouseholds" IS NULL OR c."totalHouseholds" <= 0 THEN NULL
       ELSE ROUND(
         (SELECT COUNT(DISTINCT h.id) FROM "household" h
          JOIN "paper_sheet" ps ON ps.id = h."sheetId"
          WHERE h."communityId" = c.id
            AND h."deletedAt" IS NULL
            AND h."hasDuplicateFlag" = false
            AND ps.status = 'VERIFIED')::numeric
         / c."totalHouseholds" * 100, 1)
  END                         AS "verifiedCoveragePercent"

FROM "community" c
WHERE c."isActive" = true AND c."deletedAt" IS NULL;
```

**จุดสำคัญของ View นี้:**

| ประเด็น | วิธีแก้ |
|---|---|
| **ห้ามหารด้วยศูนย์** | `CASE WHEN totalHouseholds IS NULL OR <= 0 THEN NULL` |
| **"ยังคำนวณไม่ได้" ≠ "0%"** | คืน **`NULL`** ไม่ใช่ `0` → UI แสดง "ยังคำนวณไม่ได้" |
| **ห้ามนับซ้ำ** | ใช้ Subquery แยกแทน JOIN → ไม่มี Fan-out + `COUNT(DISTINCT)` |
| **ห้ามนับ Duplicate** | `hasDuplicateFlag = false` + `status NOT IN ('MERGED_INTO')` |
| **แยก Survey vs Verified** | 2 columns แยกกันชัดเจน |
| **นับจาก Household ไม่ใช่ Batch** | แก้ COV-03 |

---

### 3.5 การคำนวณสถานะเป้าหมาย

```typescript
// domain/coverage/coverage.ts — Pure Function + Unit Test (ตาม CLAUDE.md)

export type CoverageStatus =
  | { kind: 'NOT_CALCULABLE'; reason: 'NO_TOTAL_HOUSEHOLDS' }
  | { kind: 'CALCULATED'; percent: number; meetsTarget: boolean };

export function calculateCoverage(input: {
  count: number;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
}): CoverageStatus {
  // ⭐ ห้ามหารด้วยศูนย์ + ห้ามคืน 0 เมื่อไม่ทราบ
  if (input.totalHouseholds === null || input.totalHouseholds <= 0) {
    return { kind: 'NOT_CALCULABLE', reason: 'NO_TOTAL_HOUSEHOLDS' };
  }

  const percent = (input.count / input.totalHouseholds) * 100;

  return {
    kind: 'CALCULATED',
    percent: Math.round(percent * 10) / 10,
    // ⭐ "มากกว่าร้อยละ 60" → ใช้ > ไม่ใช่ >=
    meetsTarget: percent > input.targetCoveragePercent,
  };
}
```

**Unit Test ที่ต้องมี (ครอบคลุม Business Rule ทุกข้อ):**

| Test Case | Input | Expected |
|---|---|---|
| ไม่ทราบ Denominator | `totalHouseholds = null` | `NOT_CALCULABLE` (**ไม่ใช่ 0%**) |
| Denominator = 0 | `totalHouseholds = 0` | `NOT_CALCULABLE` (ห้ามหารศูนย์) |
| Denominator ติดลบ | `totalHouseholds = -5` | `NOT_CALCULABLE` |
| **ขอบเขตเป้าหมาย: เท่ากับ 60 พอดี** | `count=60, total=100, target=60` | `meetsTarget = false` ⭐ (**"มากกว่า 60" → 60 ไม่ผ่าน**) |
| **เกิน 60 เล็กน้อย** | `count=601, total=1000, target=60` | `meetsTarget = true` (60.1%) |
| ต่ำกว่าเป้า | `count=50, total=100` | `meetsTarget = false` |
| ครบ 100% | `count=100, total=100` | `percent = 100, meetsTarget = true` |
| **เกิน 100%** | `count=110, total=100` | `percent = 110` ⚠️ ดูหมายเหตุ |
| ยังไม่มีข้อมูล | `count=0, total=500` | `percent = 0, meetsTarget = false` |

**⚠️ หมายเหตุกรณี > 100%:** เป็นไปได้จริง — ถ้า `totalHouseholds` (จากทะเบียนราษฎร์ปี 2567) ต่ำกว่าจำนวนครัวเรือนที่สำรวจเจอจริง (มีบ้านใหม่/บ้านเช่าที่ไม่อยู่ในทะเบียน) → **ห้าม clamp เป็น 100** เพราะจะซ่อนสัญญาณว่า Denominator ผิด → ควร**แสดงเตือน**ว่า "Coverage > 100% — ควรตรวจสอบ `totalHouseholds`" (ดู Q-22)

---

## 4. ตอบ Business Rule ทีละข้อ

| Business Rule (จากคำสั่ง) | รองรับอย่างไร | สถานะปัจจุบัน |
|---|---|---|
| **ค่าเริ่มต้น `targetCoveragePercent` = 60** | `@default(60)` ที่ `Community` | ❌ ไม่มีฟิลด์ |
| **เป้าหมายคือ `coveragePercent > 60`** | `meetsTarget: percent > target` (ใช้ `>` ไม่ใช่ `>=`) + Unit Test ขอบเขต | ❌ ไม่มี |
| **`totalHouseholds` ต้อง Nullable** | `Int?` + CHECK `> 0` เมื่อไม่ NULL | ❌ ปัจจุบัน `Int @default(0)` |
| **ถ้าไม่มี `totalHouseholds` ต้องแสดง "ยังคำนวณไม่ได้"** | คืน `NULL` จาก View + `NOT_CALCULABLE` จาก Function → UI แสดงข้อความ | ❌ **ปัจจุบันคืน `0` → แสดงผิดเป็น "0%"** |
| **ห้ามหารด้วยศูนย์** | `CASE WHEN ... <= 0 THEN NULL` ทั้งใน SQL และ TS | ⚠️ View มี guard แต่ `ELSE 0` ผิด |
| **ห้ามนับ Household ซ้ำ** | `COUNT(DISTINCT h.id)` + `hasDuplicateFlag = false` + กรอง `MERGED_INTO` + ใช้ Subquery แทน JOIN | ❌ ไม่กรอง Duplicate + `SUM` fan-out |
| **ห้ามนับ Draft/Duplicate/Cancelled/Rejected/Invalid เป็น Verified** | กรอง `ps.status = 'VERIFIED'` + `hasDuplicateFlag = false` + `deletedAt IS NULL` | ⚠️ กรองแค่ VERIFIED + deletedAt |
| **ต้องแยก Survey Coverage และ Verified Coverage** | 2 columns: `surveyCoveragePercent` + `verifiedCoveragePercent` | ❌ มีตัวเดียว |

---

## 5. นิยามที่ต้องตกลงให้ชัด (สำคัญ)

### 5.1 "Survey Coverage" นับอะไร?

**คำถาม:** นับ "ใบที่รับเข้ามา" หรือ "ใบที่คีย์แล้ว"?

| ทางเลือก | นิยาม | ความหมาย |
|---|---|---|
| **A** | จำนวนใบที่รับเข้ามา ÷ totalHouseholds | "ผู้สำรวจเข้าถึงครัวเรือนไปแล้วกี่ %" — **วัดงานภาคสนาม** |
| **B** | จำนวนใบที่คีย์แล้ว ÷ totalHouseholds | "ข้อมูลเข้าระบบแล้วกี่ %" — วัดงานคีย์ |

**ข้อเสนอ: ทางเลือก A** — เพราะ "Survey" หมายถึงการสำรวจ (งานภาคสนาม) และเรามี `enteredSurveyCount` แยกไว้วัดงานคีย์อยู่แล้ว

→ ดังนั้นควรมี **3 ตัวชี้วัด** ไม่ใช่ 2:
1. `surveyCoveragePercent` = ใบที่รับ ÷ totalHouseholds → **ผู้สำรวจไปถึงกี่ %**
2. `entryProgressPercent` = ใบที่คีย์ ÷ ใบที่รับ → **คีย์ไปกี่ %** (ไม่ใช่ Coverage — เป็น Progress)
3. `verifiedCoveragePercent` = ครัวเรือน VERIFIED ÷ totalHouseholds → **ข้อมูลที่ใช้ได้จริงกี่ %**

**⚠️ สำคัญ:** ตัวที่ 2 มี Denominator ต่างจากตัวที่ 1 และ 3 → **ห้ามเรียกว่า "Coverage"** เพราะจะทำให้เข้าใจผิด (FR-CVG-03: "สถิติทุกตัวต้องมี Denominator" → ต้องแสดง Denominator ให้ชัดว่าคืออะไร)

⚠️ **ต้องยืนยัน** (ดู Q-23)

### 5.2 "ใบที่หาย" (SHEET_LOST) นับอย่างไร?

**ปัญหา:** ถ้าผู้สำรวจไปถึงบ้านแล้ว (สำรวจสำเร็จ) แต่กระดาษหายระหว่างทาง (PE3) — Survey Coverage ควรนับหรือไม่?

- **นับ** → สะท้อนว่าผู้สำรวจไปถึงจริง แต่ทำให้ดูเหมือนมีข้อมูล ทั้งที่ไม่มี
- **ไม่นับ** → สะท้อนข้อมูลที่มีจริง (ข้อเสนอใน View ด้านบนใช้วิธีนี้)

**ข้อเสนอ:** ไม่นับใน Coverage แต่**แสดงแยกเป็นตัวเลข "ใบที่หาย"** บน Dashboard (FR-BAT-05 "แสดงใบที่หาย") เพื่อความโปร่งใส → ตรงกับ KPI "% ใบที่ตามหาได้ (ไม่หาย) = 100%"

---

## 6. Denominator ที่ยังไม่มี — จะทำอย่างไรระหว่างนี้?

**ข้อเท็จจริง:** ปัจจุบัน **ยังไม่ทราบ `totalHouseholds` ของทั้ง 5 ชุมชน** → `verifiedCoveragePercent` จะเป็น `NULL` ทั้งหมด

**ผลกระทบต่อ Requirement:**

| Requirement | ผลกระทบ | ทางออก |
|---|---|---|
| FR-CVG-01 (Coverage Badge ทุกหน้า) | Badge จะแสดง "ยังคำนวณไม่ได้" | ✅ ยอมรับได้ — **โปร่งใสกว่าแสดงตัวเลขผิด** |
| FR-CVG-03 (สถิติทุกตัวต้องมี Denominator) | ⚠️ ไม่มี Denominator | แสดง **ตัวเลขดิบ** แทน ("VERIFIED แล้ว 847 ครัวเรือน" โดยไม่มี %) |
| FR-CVG-04 (เตือนเมื่อ Export < 80%) | เตือนไม่ได้ | เตือนว่า "**ไม่ทราบ Coverage**" ซึ่งควรเป็นการเตือนที่**แรงกว่า** Coverage ต่ำด้วยซ้ำ |
| FR-CVG-05 (Coverage Watermark) | Watermark ว่าอะไร? | "**Coverage: ยังคำนวณไม่ได้ — ไม่ทราบจำนวนครัวเรือนทั้งหมด**" |
| FR-CVG-02 (โซนสีเทาบนแผนที่) | ยังทำได้ | ใช้ `CommunityBoundary` + Grid ที่ไม่มีข้อมูล |

**ข้อเสนอเชิงปฏิบัติ:** Dashboard ต้องมี **Banner เตือนถาวร** ว่า *"ยังไม่ได้ระบุจำนวนครัวเรือนทั้งหมดของชุมชน X, Y, Z — Coverage คำนวณไม่ได้"* พร้อมปุ่มไปหน้ากรอกข้อมูล (Admin UI) → เปลี่ยนจุดอ่อนเป็นแรงผลักดันให้ไปหาข้อมูลมา

**⚠️ นี่คือประเด็นที่ต้องยืนยันเร็วที่สุด** เพราะ Coverage คือหัวใจของ RK-C1 (ดู Q-01)

---

## 7. สรุปข้อเสนอ

| ประเด็น | ข้อเสนอ |
|---|---|
| **เก็บจริงใน DB** | `totalHouseholds Int?`, `targetCoveragePercent Float @default(60)`, `lastPopulationUpdatedAt`, `populationDataSource`, `populationDataNote`, `populationUpdatedById` |
| **คำนวณจาก Query/View** | `receivedSurveyCount`, `enteredSurveyCount`, `verifiedHouseholdCount`, `surveyCoveragePercent`, `verifiedCoveragePercent` |
| **ห้ามเก็บเด็ดขาด** | ค่า Derived ทุกตัว (Coverage %) — จะค้างเป็น Stale ทันทีที่ Denominator เปลี่ยน |
| **Materialized View** | ⏸️ **ยังไม่ต้องทำ** — 3,000 แถวไม่ต้องการ Cache; พิจารณาเมื่อถึง 50,000 แถว (NFR-SC-01) และวัดแล้วว่าช้าจริง |
| **Trigger นับ Counter** | ❌ **ไม่แนะนำ** — เสี่ยง Lock contention + Bug (พิสูจน์แล้วจาก `receivedCount` ที่ไม่มี Trigger) |
| **PaperBatch counters** | คงไว้สำหรับ **Batch Progress** (M02/M06) เท่านั้น — **ห้ามใช้คำนวณ Coverage ระดับชุมชน** |
| **View ใหม่** | `v_community_coverage` (DROP `v_community_summary` เดิม) |
| **ค่าเมื่อไม่ทราบ Denominator** | **`NULL`** → UI แสดง "ยังคำนวณไม่ได้" — **ห้ามคืน 0 เด็ดขาด** |
| **เกณฑ์ผ่าน** | `percent > targetCoveragePercent` (ใช้ `>` ไม่ใช่ `>=`) + Unit Test ขอบเขต 60 พอดี |

---

## 8. ตารางสรุปปัญหา

| ID | ระดับ | ปัญหา | ไฟล์ | Module |
|---|---|---|---|---|
| COV-01 | 🔴 BLOCKER | `coveragePercent` หารด้วย 600 สมมติ + `ELSE 0` แสดง "0%" แทน "ไม่ทราบ" | SQL:246-251, seed.ts:82-86 | M11, M16, M06 |
| COV-02 | 🔴 BLOCKER | `SUM(memberCount)` เพี้ยนจาก JOIN fan-out + ไม่กรอง Duplicate/Merged | SQL:231-258 | M11 |
| COV-03 | 🟠 HIGH | Coverage อยู่ระดับ Batch ไม่ใช่ Community | schema.prisma:528-530 | M06, M11 |
| COV-04 | 🟠 HIGH | ไม่มี 9 ฟิลด์ Coverage ใน Schema | schema.prisma:398 | M11, M16 |
| COV-05 | 🟡 MEDIUM | ชื่อ column `totalHouseholds` ใน View หมายถึงคนละอย่างกับ Coverage Model | SQL:237 | M11 |
| COV-06 | 🟡 MEDIUM | ไม่มีนิยามชัดว่า Survey Coverage นับใบที่รับหรือใบที่คีย์ | — | M06, M11 |
| COV-07 | 🟡 MEDIUM | ไม่มีกฎว่า SHEET_LOST นับใน Coverage หรือไม่ | — | M02, M11 |
