# 09 — PostGIS และ Custom SQL Review

> ตอบภารกิจที่ 8 ทั้ง 20 ข้อ — ตรวจ `database/drafts/00_postgis_extensions.sql` (294 บรรทัด)
> **เสนอแผนแยก SQL แต่ยังไม่รัน SQL**

## สรุประดับปัญหา

| ระดับ | จำนวน |
|---|---|
| 🔴 BLOCKER | 4 |
| 🟠 HIGH | 6 |
| 🟡 MEDIUM | 7 |
| 🟢 LOW | 3 |

---

## ตอบคำถามภารกิจที่ 8 ทีละข้อ

---

### ข้อ 1 — SQL อ้างถึงชื่อตารางและชื่อคอลัมน์ที่มีอยู่จริงใน Prisma Schema หรือไม่?

## ✅ **ใช่ — ตรวจสอบครบทุกตารางและทุกคอลัมน์แล้ว**

**ตาราง (9 ตัว) — ตรงกับ `@@map` ทั้งหมด ✅**

| ตารางใน SQL | `@@map` ใน Prisma | Model | ✓ |
|---|---|---|---|
| `"household"` | `@@map("household")` | Household | ✅ |
| `"evacuation_site"` | `@@map("evacuation_site")` | EvacuationSite | ✅ |
| `"community"` | `@@map("community")` | Community | ✅ |
| `"audit_log"` | `@@map("audit_log")` | AuditLog | ✅ |
| `"paper_batch"` | `@@map("paper_batch")` | PaperBatch | ✅ |
| `"paper_sheet"` | `@@map("paper_sheet")` | PaperSheet | ✅ |
| `"flood_risk_profile"` | `@@map("flood_risk_profile")` | FloodRiskProfile | ✅ |
| `"vulnerable_person"` | `@@map("vulnerable_person")` | VulnerablePerson | ✅ |
| `"person_vulnerability"` | `@@map("person_vulnerability")` | PersonVulnerability | ✅ |

**คอลัมน์ — ตรวจแล้วมีครบทุกตัว ✅**

| SQL อ้างถึง | มีใน Schema? |
|---|---|
| `household`: `latitude`, `longitude`, `respondentName`, `placeName`, `houseNo`, `deletedAt`, `memberCount`, `hasVulnerable`, `completenessScore`, `consentStatus`, `surveyedAt`, `communityId`, `sheetId`, `id` | ✅ ครบ |
| `evacuation_site`: `latitude`, `longitude` | ✅ |
| `community`: `nameTh`, `targetHouseholds`, `isActive`, `id` | ✅ |
| `paper_batch`: `enteredCount`, `verifiedCount`, `updatedAt`, `id` | ✅ |
| `paper_sheet`: `status`, `batchId`, `lockedById`, `lockedAt`, `lockExpiresAt`, `updatedAt`, `id` | ✅ |
| `flood_risk_profile`: `householdId`, `riskLevelFinal`, `riskScoreAuto`, `riskConfidence`, `floorLevelVsRoad`, `hasFloodedBefore`, `maxFloodDepthCm`, `canBeHostHouse`, `lastFloodDurationDays` | ✅ |
| `vulnerable_person`: `householdId`, `isActive`, `triageLevel`, `fullName`, `age`, `id` | ✅ |
| `person_vulnerability`: `pregnancyWeeks` | ✅ |

**ค่า Enum ที่ SQL อ้างถึง — ตรงกับ Prisma enum ทั้งหมด ✅**
`'PENDING'`, `'LOCKED'`, `'SHEET_LOST'`, `'MERGED_INTO'`, `'VERIFIED'` ∈ `SheetStatus` ✅
`'P1'`, `'P2'` ∈ `TriageLevel` ✅
`'CRITICAL'`, `'HIGH'`, `'MEDIUM'`, `'LOW'` ∈ `RiskLevel` ✅

**⚠️ แต่มี 1 คอลัมน์ที่จะหายไปตามแผนแก้ไข:** `community."targetHouseholds"` (SQL:236, 247-248) — เมื่อเปลี่ยนเป็น Coverage Model ใหม่ (doc 06) **`v_community_summary` จะพังทันที** → ต้องแก้พร้อมกัน

---

### ข้อ 2 — Prisma ใช้ชื่อ Table และ Column ตามที่ SQL อ้างถึงจริงหรือไม่?

## ✅ **ใช่**

- **Table:** Prisma ใช้ `@@map()` เป็น snake_case ทุกตาราง → SQL อ้างถูก ✅
- **Column:** Prisma **ไม่ได้ใช้ `@map()` ที่ระดับ field เลย** → ชื่อคอลัมน์จริงใน DB คือ **camelCase ตามชื่อ field** → SQL ใส่ double quotes ครบทุกที่ (`"respondentName"`, `"deletedAt"`) ✅ **ถูกต้อง**

> **หมายเหตุ:** PostgreSQL จะ fold ชื่อที่ไม่ได้ quote เป็น lowercase → `respondentName` ที่ไม่มี quote จะกลายเป็น `respondentname` → **ไม่เจอคอลัมน์**
> SQL ไฟล์นี้ใส่ quote ครบ ✅ แต่เป็นจุดที่ผู้เขียน SQL ในอนาคตพลาดได้ง่ายมาก → ควรระบุใน Coding Standard

**⚠️ ความเสี่ยงที่ซ่อนอยู่:** ถ้าในอนาคตมีคนเพิ่ม `@map()` ที่ field ใด SQL จะพังเงียบๆ → ควรมี Integration Test ที่รัน SQL ทั้งหมดกับ DB จริงใน CI

---

### ข้อ 3 — ลำดับการรัน Extension, Prisma Migration และ Custom SQL ถูกต้องหรือไม่?

## 🔴 SQL-01 — BLOCKER: ชื่อไฟล์ `00_` ขัดแย้งกับลำดับที่ต้องรันจริง

**ปัญหา:** ไฟล์ชื่อ **`00_postgis_extensions.sql`** — เลข `00` สื่อว่า "รันเป็นอันดับแรก" และชื่อสื่อว่า "แค่เปิด Extension"

**แต่เนื้อหาจริงมี:**

| บรรทัด | เนื้อหา | ต้องรันเมื่อไหร่ |
|---|---|---|
| 7-8 | `CREATE EXTENSION postgis`, `pg_trgm` | ✅ **ก่อน** Migration ได้ |
| 16-17 | `ALTER TABLE "household" ADD COLUMN "location"` | ❌ **ต้องมีตาราง `household` ก่อน** |
| 20-43 | Function + Trigger + Index บน `household` | ❌ ต้องมีตารางก่อน |
| 49-74 | ALTER + Trigger บน `evacuation_site` | ❌ ต้องมีตารางก่อน |
| 80-84 | ALTER + Index บน `community` | ❌ ต้องมีตารางก่อน |
| 91-105 | GIN trgm Index บน 4 ตาราง | ❌ ต้องมีตารางก่อน |
| 117-129 | Trigger บน `audit_log` | ❌ ต้องมีตารางก่อน |
| 135-160 | Trigger บน `paper_sheet`/`paper_batch` | ❌ ต้องมีตารางก่อน |
| 168-186 | Function `release_expired_locks` | ❌ ต้องมีตารางก่อน |
| 195-258 | Views | ❌ ต้องมีตารางก่อน |
| 264-290 | CHECK Constraints | ❌ ต้องมีตารางก่อน |

→ **บรรทัดที่ 7-8 รันก่อนได้ ส่วนบรรทัดที่ 16-294 (94% ของไฟล์) ต้องรันหลัง Prisma Migration**

**ผลกระทบ:** ถ้าใครรันไฟล์นี้ตามชื่อ (เป็นอันดับแรก) → **ล้มเหลวทันทีที่บรรทัด 16** ด้วย `ERROR: relation "household" does not exist`
→ ผิด CLAUDE.md โดยตรง: *"Custom SQL ที่อ้างถึงตาราง Prisma ต้องรันหลัง Prisma Migration สร้างตารางแล้ว"*

**หมายเหตุ:** Comment บรรทัดที่ 3 เขียนถูกแล้วว่า *"ส่วนที่ Prisma จัดการไม่ได้ — **ต้อง run หลัง prisma migrate**"* → **แต่ชื่อไฟล์ขัดกับ Comment ของตัวเอง** → เป็นกับดักสำหรับคนที่ดูแต่ชื่อไฟล์

---

## 🔴 SQL-02 — BLOCKER: Custom SQL นอก Prisma Migration จะทำให้ Prisma ตรวจพบ "Drift" และเสนอให้ Reset ฐานข้อมูล

**นี่คือปัญหาที่ร้ายแรงที่สุดของแนวทาง "แยกไฟล์ SQL รันเอง" และยังไม่มีใครระบุไว้**

**กลไก:** Prisma Migrate ตรวจสอบ **Drift** โดยเทียบ "สถานะ DB จริง" กับ "สถานะที่ควรเป็นตาม Migration History" → เมื่อรัน `prisma migrate dev` ครั้งถัดไป Prisma จะพบว่า DB มีสิ่งที่ Migration ไม่ได้สร้าง:

- คอลัมน์ `household.location`, `evacuation_site.location`, `community.boundary`
- Index `ix_household_location`, `ix_household_search_name`, …
- Trigger, Function, View, CHECK Constraint

→ Prisma รายงาน **"Drift detected: Your database schema is not in sync with your migration history"**
→ และ**เสนอให้ `prisma migrate reset`** = **ลบข้อมูลทั้งหมดทิ้ง** 🔴

**ผลกระทบร้ายแรง:**
- ระหว่างพัฒนา: นักพัฒนาจะเจอ Drift ทุกครั้ง และอาจกด reset โดยไม่คิด → **ข้อมูลที่คีย์ไว้ทดสอบหายหมด**
- ใน Production: `prisma migrate deploy` ไม่ reset ✅ แต่ Migration ใหม่ที่ Prisma สร้างอาจ **DROP คอลัมน์ที่ไม่รู้จัก** ได้
- ผิด CLAUDE.md: *"Migration ต้องสามารถตรวจสอบและย้อนกลับได้ตามแนวทางที่เหมาะสม"*

**แนวทางแก้ไข (เลือก 1 ใน 2):**

#### ✅ **ทางเลือก A (แนะนำ): ประกาศคอลัมน์ PostGIS ด้วย `Unsupported()` + ใส่ SQL ที่เหลือใน Migration File**

```prisma
model Household {
  latitude   Decimal? @db.Decimal(10, 7)
  longitude  Decimal? @db.Decimal(10, 7)
  /// PostGIS geography — Prisma Client ใช้ไม่ได้ ต้อง Query ผ่าน $queryRaw
  location   Unsupported("geography(Point, 4326)")?
}
```

> **⚠️ แก้ความเข้าใจผิดใน Schema:** `schema.prisma:747` เขียนว่า *"Prisma ยังไม่รองรับ geography โดยตรง **ใช้ Unsupported ไม่ได้**ใน relation"*
> — ข้อความนี้**ถูกเพียงครึ่งเดียว**: `Unsupported()` ใช้ใน **relation** ไม่ได้จริง ✅ แต่ใช้เป็น **คอลัมน์ธรรมดาได้** ✅
> และเรา**ไม่ต้องการ relation** บน `location` — เราต้องการแค่คอลัมน์ + Spatial Index
> → **การหลีกเลี่ยง `Unsupported()` คือสาเหตุที่ทำให้เกิดปัญหา Drift ทั้งหมดนี้**

**ข้อดี:** Prisma รู้จักคอลัมน์ → ไม่มี Drift → `prisma migrate dev` ทำงานปกติ → Migration History สมบูรณ์ → Rollback ได้

**ข้อจำกัด:** `Unsupported` ไม่ปรากฏใน Prisma Client → ต้อง Query ผ่าน `$queryRaw` (ซึ่งเราต้องทำอยู่แล้วสำหรับ Spatial Query)

#### ทางเลือก B: ใส่ Custom SQL ลงใน Migration File โดยตรง

```bash
# สร้าง migration เปล่า แล้วเติม SQL เอง
npx prisma migrate dev --create-only --name add_postgis_columns
# → แก้ prisma/migrations/xxxx_add_postgis_columns/migration.sql
```

**ข้อดี:** SQL อยู่ใน Migration History → ไม่มี Drift (สำหรับ Trigger/View/Function ที่ Prisma แทนไม่ได้ **ต้องใช้วิธีนี้อยู่ดี**)
**ข้อเสีย:** ต้องระวังลำดับด้วยมือ

**ข้อสรุป:** ใช้ **A สำหรับคอลัมน์** + **B สำหรับ Trigger/Function/View/Constraint** → ดูแผนในหัวข้อสุดท้าย

---

### ข้อ 4 — SQL ส่วนใดสามารถรันก่อนสร้างตารางได้?

| ส่วน | บรรทัด | รันก่อนได้? |
|---|---|---|
| `CREATE EXTENSION IF NOT EXISTS postgis` | 7 | ✅ **ได้** |
| `CREATE EXTENSION IF NOT EXISTS pg_trgm` | 8 | ✅ **ได้** |
| `CREATE OR REPLACE FUNCTION update_household_location()` | 20-33 | ⚠️ **ได้ในทางเทคนิค** — PL/pgSQL ไม่ตรวจสอบ table reference ตอน CREATE (late binding) แต่ **จะพังตอนเรียกใช้** ถ้าตารางไม่มี → **ไม่ควร** |
| `CREATE OR REPLACE FUNCTION prevent_audit_modification()` | 117-123 | ✅ ได้ (ไม่อ้างตารางเลย) |
| ส่วนอื่นทั้งหมด | 16-294 | ❌ **ไม่ได้** |

**สรุป:** **มีเพียง 2 บรรทัด (7-8) ที่รันก่อนได้จริง** — คิดเป็น **0.7% ของไฟล์**

> **แต่:** ถ้าประกาศ `extensions = [postgis, pg_trgm]` ใน `datasource` (ปัจจุบันมีแค่ `[postgis]`) → **Prisma จะสร้าง Extension ให้เองใน Migration แรก** → ไม่ต้องรันมือเลย ✅ **นี่คือวิธีที่ถูกต้อง**

---

### ข้อ 5 — SQL ส่วนใดต้องรันหลัง Prisma Migration?

**ทุกส่วนตั้งแต่บรรทัด 16 ถึง 294** — ดูตารางในข้อ 3

---

### ข้อ 6 — ควรแยกไฟล์ Extension ออกจาก Trigger, View, Index และ Constraint หรือไม่?

## ✅ **ควรแยก — เพราะมี Dependency และรอบการเปลี่ยนแปลงต่างกันโดยสิ้นเชิง**

| ประเภท | ลักษณะ | ความถี่ในการเปลี่ยน | Idempotent ได้ง่าย? |
|---|---|---|---|
| **Extension** | ต้องมาก่อนทุกอย่าง | ครั้งเดียว | ✅ `IF NOT EXISTS` |
| **PostGIS Columns** | ต้องมีตารางก่อน | นานๆ ครั้ง | ✅ `ADD COLUMN IF NOT EXISTS` |
| **Functions** | ไม่ขึ้นกับใคร (late binding) | บ่อย (แก้ Logic) | ✅ `CREATE OR REPLACE` |
| **Triggers** | ต้องมี Function + ตาราง | บ่อย | ✅ `DROP IF EXISTS` + `CREATE` |
| **Constraints** | ต้องมีตาราง + ข้อมูลต้องผ่าน | นานๆ ครั้ง | ❌ **ไม่มี `IF NOT EXISTS`** (SQL-03) |
| **Views** | ต้องมีตาราง + คอลัมน์ครบ | บ่อยมาก | ⚠️ `CREATE OR REPLACE` มีข้อจำกัด (SQL-10) |
| **Indexes** | ต้องมีตาราง/คอลัมน์ | บ่อย | ✅ `IF NOT EXISTS` |

**เหตุผลเพิ่มเติมที่ต้องแยก:**
1. **View เปลี่ยนบ่อยที่สุด** — ทุกครั้งที่ Dashboard ต้องการข้อมูลใหม่ → ถ้าอยู่ไฟล์เดียวกับ Constraint จะต้องรัน Constraint ซ้ำ → **Error** (SQL-03)
2. **Index สร้างนาน** — เมื่อข้อมูลเยอะ ควรใช้ `CREATE INDEX CONCURRENTLY` ซึ่ง**รันใน Transaction ไม่ได้** → ต้องแยกไฟล์
3. **Rollback** — ถ้าไฟล์เดียวมีทุกอย่าง จะย้อนกลับเฉพาะส่วนไม่ได้

---

### ข้อ 7 — Trigger รองรับ INSERT, UPDATE, DELETE และการย้าย Batch ครบหรือไม่?

## 🔴 SQL-04 — BLOCKER: Batch Count Trigger รองรับเพียง 1 ใน 4 กรณี

```sql
-- SQL:156-160 — ปัจจุบัน
CREATE TRIGGER trg_update_batch_counts
  AFTER UPDATE OF status ON "paper_sheet"   -- ⚠️ เฉพาะ UPDATE ของคอลัมน์ status
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_counts();
```

| กรณี | Trigger ทำงาน? | ผลลัพธ์ |
|---|---|---|
| **UPDATE `status`** | ✅ ทำงาน | Count ถูกต้อง ✅ |
| **INSERT sheet ใหม่** | ❌ **ไม่ทำงาน** | สร้าง Batch + 600 sheets → `enteredCount` = 0 ✅ (บังเอิญถูก เพราะ sheet ใหม่เป็น PENDING) แต่ `receivedCount` ไม่ถูกคำนวณ ❌ |
| **DELETE sheet** | ❌ **ไม่ทำงาน** | Count **ค้างเป็นค่าเก่า** → ผิดถาวร |
| **ย้าย Batch (UPDATE `batchId`)** | ❌ **ไม่ทำงานเลย** | ⚠️ **สำคัญที่สุด** — `AFTER UPDATE OF status` จะ fire **เฉพาะเมื่อ `status` อยู่ใน SET list** → `UPDATE paper_sheet SET "batchId" = 'x' WHERE id = 'y'` → **Trigger ไม่ fire** → **Batch เก่าและใหม่ผิดทั้งคู่** |
| **ย้าย Batch + เปลี่ยน status พร้อมกัน** | ⚠️ ทำงานครึ่งเดียว | `COALESCE(NEW."batchId", OLD."batchId")` → `NEW.batchId` มีค่าเสมอใน UPDATE → **อัปเดตเฉพาะ Batch ใหม่ → Batch เก่าค้างเป็นค่าผิดถาวร** |

**ปัญหาเพิ่มเติมของ Function:**

```sql
-- SQL:151-153
  WHERE "id" = COALESCE(NEW."batchId", OLD."batchId");
  RETURN NEW;    -- ⚠️ ถ้าเป็น DELETE trigger, NEW = NULL
```
`RETURN NEW` ใน AFTER trigger ถูกละเลยอยู่แล้ว ✅ ไม่พัง — แต่ถ้าเปลี่ยนเป็น BEFORE จะพังทันที → ควรเป็น `RETURN COALESCE(NEW, OLD)` เพื่อความปลอดภัย

**ปัญหา Concurrency:**
```sql
UPDATE "paper_batch" SET ... WHERE "id" = ...
```
→ ทุกครั้งที่ sheet เปลี่ยนสถานะ จะ **UPDATE แถวเดียวกันของ `paper_batch`** → เมื่อ 5 คนคีย์พร้อมกันใน Batch เดียวกัน → **Lock contention บนแถว Batch** → ช้าลงและเสี่ยง Deadlock
→ ขัดกับ NFR-P-03 ("บันทึกใบ ≤1 วิ") และ NFR-P-04 (≥50 concurrent)

**แนวทางแก้ไข:**
```sql
CREATE OR REPLACE FUNCTION update_batch_counts()
RETURNS TRIGGER AS $$
DECLARE
  affected_batches TEXT[];
  b TEXT;
BEGIN
  -- ⭐ รวบรวม Batch ที่ได้รับผลกระทบทั้งเก่าและใหม่
  affected_batches := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."batchId" END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."batchId" END
    ]) AS x WHERE x IS NOT NULL
  );

  FOREACH b IN ARRAY affected_batches LOOP
    UPDATE "paper_batch" SET
      "receivedCount" = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b AND "status" <> 'SHEET_LOST'),
      "enteredCount"  = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b
                           AND "status" IN ('ENTERED_1','ENTERED_2','DISCREPANCY',
                                            'NEEDS_FIELD_QUERY','VERIFIED')),
      "verifiedCount" = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b AND "status" = 'VERIFIED'),
      "updatedAt" = NOW()
    WHERE "id" = b;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_batch_counts ON "paper_sheet";
CREATE TRIGGER trg_update_batch_counts
  AFTER INSERT OR DELETE OR UPDATE OF status, "batchId" ON "paper_sheet"
  FOR EACH ROW EXECUTE FUNCTION update_batch_counts();
```

**⚠️ แต่ข้อเสนอที่ดีกว่า:** พิจารณา**เลิกใช้ Trigger** แล้วคำนวณจาก Query แทน (เหมือน Coverage — doc 06) เพราะ:
- Batch มี ~600 sheets → `COUNT(*)` เร็วมาก
- ไม่มี Lock contention
- ไม่มีทางไม่ตรงกับความจริง
- **หลักฐาน:** `receivedCount` ที่ไม่มี Trigger คำนวณเลย พิสูจน์แล้วว่าวิธี Denormalize + Trigger เปราะบางแค่ไหน

---

### ข้อ 8 — Batch Count Trigger คำนวณ `receivedCount` หรือไม่?

## ❌ **ไม่คำนวณเลย**

```sql
-- SQL:138-149 — Function อัปเดตเพียง 2 คอลัมน์
UPDATE "paper_batch"
SET
  "enteredCount" = (...),      -- ✅ คำนวณ
  "verifiedCount" = (...),     -- ✅ คำนวณ
  "updatedAt" = NOW()          -- ✅
  -- ❌ ไม่มี "receivedCount"
WHERE "id" = COALESCE(NEW."batchId", OLD."batchId");
```

**ผลกระทบ:** `PaperBatch.receivedCount Int @default(0)` (schema.prisma:528) จะเป็น **0 ตลอดไป** เว้นแต่ Application เขียนเอง

**ทำไมถึงสำคัญ:**
- Comment ใน Schema บอกว่า `receivedCount` = *"จำนวนใบที่คีย์ได้จริง (อาจ ≠ expected ถ้าหาย)"*
- **BP-05 (เงื่อนไขปิด Batch)** ต้องใช้ค่านี้เทียบกับ `expectedCount`
- **FR-BAT-05 ("แสดงใบที่หาย")** = `expectedCount - receivedCount` → **จะแสดงว่าหายทุกใบเสมอ** (600 - 0 = 600)
- **KPI "% ใบที่ตามหาได้ (ไม่หาย) = 100%"** → คำนวณไม่ได้

**⚠️ ความกำกวมของนิยาม:** `receivedCount` หมายถึงอะไรกันแน่?
- "จำนวนใบที่นับได้ตอนรับปึก" → ควรเท่ากับ `expectedCount` เสมอ (ผู้ประสานนับเอง — BP-01)
- "จำนวนใบที่มีอยู่จริงในระบบ" → = `COUNT(paper_sheet)` ของ Batch นั้น
- Comment บอก "จำนวนใบที่คีย์ได้จริง" → ฟังดูเหมือน `enteredCount` → **ซ้ำซ้อน?**

→ **ต้องนิยามให้ชัดก่อนเขียนโค้ด** (ดู Q-30)

---

### ข้อ 9 — Lock Timeout ทำงานอย่างปลอดภัยหรือไม่?

## 🟠 SQL-05 — HIGH: ไม่ปลอดภัย — มี Race Condition และไม่มี Lock Timeout จริง

```sql
-- SQL:168-186
CREATE OR REPLACE FUNCTION release_expired_locks()
RETURNS INTEGER AS $$
DECLARE released_count INTEGER;
BEGIN
  UPDATE "paper_sheet"
  SET "status" = 'PENDING', "lockedById" = NULL, "lockedAt" = NULL,
      "lockExpiresAt" = NULL, "updatedAt" = NOW()
  WHERE "status" = 'LOCKED' AND "lockExpiresAt" < NOW();
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;
```

**ปัญหา 5 ข้อ:**

**(ก) ชื่อฟังก์ชันสื่อผิด** — ชื่อหัวข้อในไฟล์คือ *"Lock Timeout"* แต่นี่ไม่ใช่ `lock_timeout` ของ PostgreSQL (ซึ่งเป็น setting ที่ควบคุมการรอ row lock) — นี่คือ **Application-level Lock Expiry** คนละเรื่องกันโดยสิ้นเชิง → **ไม่มี `SET lock_timeout` ที่ไหนเลยในไฟล์**

**(ข) Race Condition กับการ Submit** — ลำดับเหตุการณ์ที่เป็นไปได้:

```
เวลา  ผู้ใช้ A (กำลัง Submit)              Cron (release_expired_locks)
─────────────────────────────────────────────────────────────────────
t1    BEGIN
t2    SELECT sheet WHERE id=X  (status=LOCKED)
t3                                          BEGIN
t4                                          UPDATE ... WHERE status='LOCKED'
                                              AND lockExpiresAt < NOW()  → จับ X ได้
t5                                          COMMIT  → X = PENDING
t6    UPDATE sheet SET status='ENTERED_1'   -- ✅ สำเร็จ! (ไม่มี row lock กัน)
t7    COMMIT
      → ผลลัพธ์: X = ENTERED_1 แต่ lockedById = NULL
```
→ **ข้อมูลไม่สอดคล้อง** แต่ยังไม่เสียหายมาก

**กรณีที่แย่กว่า:**
```
t5    Cron ปลด Lock → X = PENDING
t6    ผู้ใช้ B กด "หยิบงาน" → ได้ X → เริ่มคีย์
t7    ผู้ใช้ A กด Submit (ช้าไป) → เขียนทับ → X = ENTERED_1 ด้วยข้อมูลของ A
t8    ผู้ใช้ B กด Submit → ❌ Error หรือ เขียนทับ A
```
→ **งานของคนหนึ่งหาย** → ขัดกับ CLAUDE.md: *"การ Pick งานคีย์ข้อมูลต้องป้องกันผู้ใช้สองคนหยิบใบเดียวกัน"* และ *"Auto-save ต้องไม่ทำให้ข้อมูลสูญหาย"*

**แก้:** ตอน Submit ต้องตรวจ Lock ใน Transaction เดียวกัน:
```sql
UPDATE "paper_sheet"
SET status = 'ENTERED_1', ...
WHERE id = $1
  AND status = 'LOCKED'
  AND "lockedById" = $2          -- ⭐ ต้องเป็นคนที่ Lock อยู่
  AND "lockExpiresAt" > NOW();   -- ⭐ Lock ต้องยังไม่หมดอายุ
-- ถ้า ROW_COUNT = 0 → แจ้งผู้ใช้ว่า "Lock หมดอายุ กรุณาหยิบงานใหม่"
```

**(ค) ไม่มี `SKIP LOCKED`** — ถ้าแถวถูก lock โดย transaction อื่น (เช่น กำลัง Submit) → `release_expired_locks()` จะ **รอ** → Cron ค้าง → ถ้ารอนานเกิน จะสะสม

**แก้:** `SET LOCAL lock_timeout = '2s'` ในฟังก์ชัน หรือใช้ `FOR UPDATE SKIP LOCKED` + loop

**(ง) ไม่มี Audit** — BR-26 และ `AuditAction.UNLOCK` มีอยู่ (schema.prisma:143) แต่ Function นี้ไม่เขียน Audit Log → **ไม่มีร่องรอยว่าใบไหนถูกปลด Lock เมื่อไหร่** → เมื่อข้อมูลหายจะสืบไม่ได้

**(จ) ไม่จัดการ Draft** — ปลด Lock แล้ว Draft ของผู้ใช้เดิมอยู่ที่ไหน? (AMB-03)

**(ฉ) `SECURITY DEFINER` ไม่ได้ระบุ** — ฟังก์ชันจะรันด้วยสิทธิ์ของผู้เรียก → ถ้า App User ถูกจำกัดสิทธิ์ (ตามข้อ 6 ของ SQL) อาจเรียกไม่ได้

---

### ข้อ 10 — Trigger และ Function รองรับการรันซ้ำหรือไม่?

## ✅ **รองรับ — ส่วนนี้ทำได้ดี**

| ส่วน | วิธี | Idempotent? |
|---|---|---|
| `CREATE EXTENSION IF NOT EXISTS` | ✅ | ✅ |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | ✅ | ✅ |
| `CREATE OR REPLACE FUNCTION` | ✅ | ✅ |
| `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` | ✅ | ✅ **ถูกต้อง** (PostgreSQL ไม่มี `CREATE OR REPLACE TRIGGER` ก่อน v14) |
| `CREATE INDEX IF NOT EXISTS` | ✅ | ✅ |
| `CREATE OR REPLACE VIEW` | ⚠️ | ⚠️ มีข้อจำกัด (SQL-10) |
| **`ALTER TABLE ... ADD CONSTRAINT`** | ❌ | ❌ **ไม่ Idempotent** (SQL-03) |

---

### ข้อ 11 — Constraint มีโอกาสถูกสร้างซ้ำหรือไม่?

## 🔴 SQL-03 — BLOCKER: `ADD CONSTRAINT` ไม่ Idempotent — รันซ้ำ = Error ทันที

```sql
-- SQL:264-290 — ทั้ง 7 constraints ไม่มี IF NOT EXISTS
ALTER TABLE "household"
  ADD CONSTRAINT ck_member_count CHECK (...);
ALTER TABLE "vulnerable_person"
  ADD CONSTRAINT ck_age CHECK (...);
-- ... อีก 5 ตัว
```

**ปัญหา:** **PostgreSQL ไม่มี `ADD CONSTRAINT IF NOT EXISTS`** (ต่างจาก `ADD COLUMN IF NOT EXISTS` ที่มี)

**ผลลัพธ์เมื่อรันไฟล์ซ้ำ:**
```
ERROR:  constraint "ck_member_count" for relation "household" already exists
```
→ **Script หยุดทันที** → Constraint ที่เหลือ (`ck_age`, `ck_flood_depth`, `ck_flood_duration`, `ck_pregnancy_weeks`, `ck_risk_score`, `ck_risk_confidence`) **ไม่ถูกสร้าง**

**ทำไมถึงเป็น BLOCKER:**
- ไฟล์นี้ตั้งใจให้รันหลัง `prisma migrate` ทุกครั้ง → **จะรันซ้ำแน่นอน**
- ผิด CLAUDE.md: *"Master Data ต้อง Seed แบบ Idempotent"* (หลักการเดียวกันใช้กับ Migration)
- ถ้าใครแก้ปัญหาด้วยการ**ลบ Constraint ทั้งบล็อกออก** → ระบบจะไม่มี Validation ระดับ DB เลย

**แนวทางแก้ไข:**
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_member_count'
      AND conrelid = '"household"'::regclass
  ) THEN
    ALTER TABLE "household"
      ADD CONSTRAINT ck_member_count
        CHECK ("memberCount" IS NULL OR ("memberCount" >= 1 AND "memberCount" <= 50));
  END IF;
END $$;
```

**หรือ (สะอาดกว่า):**
```sql
ALTER TABLE "household" DROP CONSTRAINT IF EXISTS ck_member_count;
ALTER TABLE "household" ADD CONSTRAINT ck_member_count CHECK (...);
```
> ⚠️ วิธีนี้จะ **re-validate ทั้งตาราง**ทุกครั้ง → ช้าเมื่อข้อมูลเยอะ และต้อง `ACCESS EXCLUSIVE LOCK` → **ไม่เหมาะกับ Production**
> → **แนะนำวิธี `DO $$ ... IF NOT EXISTS`**

---

### 🟠 SQL-12 — HIGH: `ck_member_count` (1–50) จะปฏิเสธข้อมูลที่ถูกต้อง

```sql
-- SQL:264-266
CHECK ("memberCount" IS NULL OR ("memberCount" >= 1 AND "memberCount" <= 50))
```

**ปัญหา:** กระดาษ **ส่วนที่ 1 ข้อ 1** มีตัวเลือก **"โรงเรียน / สถานศึกษา"** และ **"ร้านค้า / บริษัท / โรงงาน"** และ **ข้อ 4** ถามว่า *"จำนวนสมาชิกในครัวเรือน/**หน่วยงาน** (ที่อาศัยอยู่จริง ณ ปัจจุบัน)"*

→ **โรงเรียนมีนักเรียนหลายร้อยคน / โรงงานมีคนงานหลายร้อยคน** → `memberCount = 500` → **INSERT ล้มเหลว**

**ผลกระทบ:** ผู้คีย์จะติดตายกลางงาน และอาจ**แก้ปัญหาด้วยการกรอก 50** → **ข้อมูลปลอม** → กระทบการวางแผนอพยพ (โรงเรียนคือจุดอพยพที่สำคัญ!)

**⚠️ สังเกต:** BR-05 อ้างว่า "สมาชิก 1-50" แต่ **BR-05 ไม่มีข้อความจริงในเอกสาร** (GAP-D01) → เป็นไปได้ว่าตัวเลข 50 เป็นการเดาของผู้เขียน Schema

**แนวทางแก้ไข:** ผ่อน CHECK เป็น `>= 0 AND <= 5000` (Sanity check) แล้วใช้ **Warning ที่ Application** เมื่อ > 50 สำหรับ `buildingType = HOUSE` → ต้องยืนยัน (ดู Q-31)

> **หมายเหตุ:** `>= 0` ไม่ใช่ `>= 1` เพราะบ้านร้าง/ร้านที่ไม่มีคนอยู่ประจำ อาจมี 0 คน

---

### ข้อ 12 — View ใดเปิดเผย PII หรือพิกัดรายบ้าน?

## 🟠 SQL-06 — HIGH: `v_household_geo` เปิดเผย L3 เต็มรูปแบบ

```sql
-- SQL:195-228
CREATE OR REPLACE VIEW v_household_geo AS
SELECT
  h.id, h."communityId",
  h."houseNo",        -- 🔴 L3 — บ้านเลขที่
  h."placeName",      -- 🔴 L3 — ชื่อร้าน (ระบุตัวตนได้)
  h."memberCount", h."hasVulnerable",
  h.latitude,         -- 🔴 L3 — พิกัดแม่นยำรายบ้าน
  h.longitude,        -- 🔴 L3
  h.location,         -- 🔴 L3
  ...
  frp."riskLevelFinal", frp."maxFloodDepthCm",
  (SELECT COUNT(*) ... ) AS "vulnerableCount",   -- 🔴 L4 (มีคนเปราะบางกี่คน)
  (SELECT COUNT(*) ... WHERE triageLevel = 'P1') AS "p1Count"  -- 🔴 L4
FROM "household" h ...
```

**ระดับข้อมูล:** ตาม Data Categories (system-analysis.md:668-673) — `houseNo` + `latitude/longitude` = **L3** และ `p1Count`/`vulnerableCount` = ข้อมูลกลุ่มเปราะบาง = **L4 โดยอนุมาน**

**⚠️ อันตรายเชิงความเป็นส่วนตัว:** View นี้ให้ **"บ้านเลขที่ + พิกัดแม่นยำ + มีคนเปราะบาง P1 กี่คน"** ในแถวเดียว
→ นี่คือข้อมูลที่ RK-P1 (*"หน้า Public ถูกใช้หาข้อมูลบ้านเป้าหมาย"*) กลัวที่สุด
→ และ RK-01 (*"ข้อมูลกลุ่มเปราะบางรั่ว"*) = ความเสี่ยงระดับ 🔴 วิกฤต

**✅ สิ่งที่ทำถูก:** ไม่มี `respondentName`, `respondentPhone` ✅ และกรอง `deletedAt IS NULL` ✅

**❌ ปัญหา:**
1. **ชื่อ View สื่อว่าใช้สำหรับ GeoJSON Export** (`-- View: ครัวเรือนพร้อมข้อมูลเสี่ยงสำหรับ GeoJSON Export`) → มีความเสี่ยงสูงที่จะถูกนำไปใช้กับ `GET /api/public/risk-heatmap` โดยตรง
2. **ไม่กรอง `ps.status = 'VERIFIED'`** → Risk ของข้อมูลที่ยังไม่ยืนยันจะรั่วขึ้น Map (ผิด FR-RSK-07)
3. **ไม่กรอง `hasDuplicateFlag`** → ใบซ้ำจะแสดง 2 หมุดบนแผนที่
4. **View ไม่มี RBAC** — View ใน PostgreSQL ไม่รู้จัก Role ของ Application → ใครก็ตามที่ Query ได้ จะเห็นทุกแถว

**แนวทางแก้ไข:**
1. **เปลี่ยนชื่อเป็น `v_household_geo_internal`** เพื่อสื่อว่าห้ามใช้กับ Public
2. เพิ่ม `WHERE ps.status = 'VERIFIED' AND h."hasDuplicateFlag" = false`
3. สร้าง **View แยกสำหรับ Public** ที่ Aggregate แล้วเท่านั้น (ดูข้อ 13)
4. พิจารณา **RLS** บน `household` เพื่อให้ View สืบทอดการกรอง

---

### ข้อ 13 — Public View ควร Aggregate ระดับใด?

## **ตอบ: Grid Aggregation + k-anonymity — ไม่ส่งพิกัดรายบ้านออกจาก Server เลย**

**สิ่งที่ Requirement กำหนด:**
- FR-PUB-06: "Heatmap ความเสี่ยงระดับ **Grid** (ไม่เจาะรายบ้าน)"
- FR-PUB-11: "**ห้ามแสดง PII ใดๆ** (ชื่อ, เบอร์, บ้านเลขที่, พิกัดแม่นยำรายบ้าน)"
- FR-PUB-12: "พิกัดในหน้า Public ต้อง Jitter ±50m **หรือ** แสดงเป็น Grid"
- BR-66: "ต้อง Jitter พิกัด ±50m **+** แสดงเป็น Grid **เท่านั้น**"
- BR-67: "หน้า Public ต้องแสดงเฉพาะข้อมูล **L1**"

**⚠️ FR-PUB-12 กับ BR-66 ขัดกัน** (AMB-01) — "หรือ" vs "และ...เท่านั้น"

**ข้อเสนอ: ใช้ Grid เท่านั้น — ไม่ใช้ Jitter**

**เหตุผลว่าทำไม Jitter ±50m ไม่ปลอดภัย:**

| ช่องโหว่ | คำอธิบาย |
|---|---|
| **Averaging Attack** | ถ้า Jitter สุ่มใหม่ทุก Request → เรียก 100 ครั้งแล้วเฉลี่ย → **ได้พิกัดจริง** |
| **Jitter คงที่ก็ยังรั่ว** | ในพื้นที่ที่บ้านห่างกัน >100m → บ้านที่ใกล้จุด Jitter ที่สุดคือบ้านจริง |
| **±50m ไม่พอในชนบท** | บ้านเดี่ยวกลางทุ่ง → Jitter 50m ยังชี้ไปที่บ้านหลังนั้นอยู่ดี |
| **ยังเป็นข้อมูลรายบ้าน** | ต่อให้ Jitter แล้ว 1 หมุด = 1 ครัวเรือน → **จำนวนหมุดในพื้นที่ = จำนวนครัวเรือนเปราะบาง** → ยังเป็น L3 |

**ข้อเสนอ View สำหรับ Public:**

```sql
CREATE VIEW v_public_risk_grid AS
WITH grid AS (
  SELECT
    -- ⭐ Snap พิกัดลง Grid ~500m (0.005° ≈ 550m ที่ละติจูด 7°)
    FLOOR(h.latitude  / 0.005) * 0.005 AS "gridLat",
    FLOOR(h.longitude / 0.005) * 0.005 AS "gridLng",
    COUNT(*) AS "householdCount",
    AVG(CASE frp."riskLevelFinal"
          WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 END) AS "avgRiskScore"
  FROM "household" h
  JOIN "paper_sheet" ps ON ps.id = h."sheetId"
  LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
  WHERE h."deletedAt" IS NULL
    AND h."hasDuplicateFlag" = false
    AND ps.status = 'VERIFIED'          -- ⭐ เฉพาะข้อมูลยืนยันแล้ว
    AND h.latitude IS NOT NULL
    AND frp."riskConfidence" >= 0.6     -- ⭐ เฉพาะที่มั่นใจพอ
  GROUP BY 1, 2
)
SELECT "gridLat", "gridLng",
       -- ⭐ ไม่เปิดเผยจำนวนที่แน่นอน — แสดงเป็นช่วง
       CASE WHEN "householdCount" >= 20 THEN '20+'
            WHEN "householdCount" >= 10 THEN '10-19'
            ELSE '5-9' END AS "densityRange",
       ROUND("avgRiskScore", 1) AS "avgRiskScore"
FROM grid
WHERE "householdCount" >= 5;   -- ⭐ k-anonymity: k=5 — ตัด cell ที่มีน้อยกว่า 5 ครัวเรือน
```

**หลักการที่ใช้:**

| หลักการ | วิธี |
|---|---|
| **Grid Snapping** | ปัดพิกัดลง Grid ~500m → ไม่มีพิกัดรายบ้านออกจาก Server |
| **k-anonymity (k=5)** | Cell ที่มี < 5 ครัวเรือน **ไม่แสดงเลย** → ป้องกันการระบุตัวตนในพื้นที่เบาบาง |
| **ซ่อนจำนวนที่แน่นอน** | แสดงเป็นช่วง ("10-19") ไม่ใช่ "13" → ป้องกัน Differential Attack |
| **เฉพาะ VERIFIED** | ไม่รั่วข้อมูลที่ยังไม่ยืนยัน |
| **เฉพาะ Confidence สูง** | ไม่แสดง Risk ที่เชื่อถือไม่ได้ |
| **ไม่มี P1 Count** | ❌ **ห้ามใส่จำนวนกลุ่มเปราะบางเด็ดขาด** — แม้จะ Aggregate แล้ว เพราะ "Grid นี้มี P1 3 คน" ในพื้นที่ที่มี 5 บ้าน = ระบุได้เกือบแน่นอน |

**⚠️ ต้องยืนยัน:** ขนาด Grid และค่า k (ดู Q-06)

**สถิติ Aggregate สำหรับ FR-PUB-05:** ควรใช้ View แยกที่ให้เฉพาะระดับชุมชน (จำนวนครัวเรือน, จุดอพยพ, อาสาสมัคร) — **ห้ามมีพิกัด**

---

### ข้อ 14 — Spatial Index ถูกต้องหรือไม่?

## ✅ **ถูกต้อง**

```sql
CREATE INDEX IF NOT EXISTS ix_household_location ON "household" USING GIST ("location");     -- ✅
CREATE INDEX IF NOT EXISTS ix_evac_site_location ON "evacuation_site" USING GIST ("location"); -- ✅
CREATE INDEX IF NOT EXISTS ix_community_boundary ON "community" USING GIST ("boundary");     -- ✅
```

✅ **GIST เป็น Index ที่ถูกต้องสำหรับ geography/geometry**

**⚠️ ข้อเสนอปรับปรุง:**

1. **ควรเป็น Partial Index** — เพราะครัวเรือนจำนวนมากจะไม่มีพิกัด (BLANK/ILLEGIBLE) และที่ลบแล้วไม่ควรอยู่ใน Index:
```sql
CREATE INDEX ix_household_location ON "household" USING GIST ("location")
  WHERE "location" IS NOT NULL AND "deletedAt" IS NULL;
```
→ Index เล็กลงมาก + Query เร็วขึ้น (สำคัญต่อ NFR-P-02: Map 5,000 หมุด ≤3 วิ)

2. **ควรใช้ `CREATE INDEX CONCURRENTLY` ใน Production** — เพื่อไม่ Lock ตาราง (แต่รันใน Transaction ไม่ได้ → ต้องแยกไฟล์ ตามข้อ 6)

**GIN trgm Indexes (SQL:91-105) — ✅ ถูกต้องเช่นกัน:**
```sql
CREATE INDEX ix_household_search_name ON "household" USING GIN ("respondentName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;   -- ✅ Partial ถูกต้อง
```

**⚠️ แต่มี 3 ปัญหา:**
1. **`ix_vulnerable_search_name`** กรองเพียง `WHERE "isActive" = true` — **ไม่ได้เช็ค `household.deletedAt`** → ค้นหาชื่อจะเจอคนในครัวเรือนที่ถูกลบไปแล้ว 🔴 (สอดคล้องกับ SCH-02)
2. **ขัดแย้งกับ Encryption** — ถ้า `respondentName`/`fullName` ถูกเข้ารหัสตาม 🔒 → **Index เหล่านี้ไร้ประโยชน์ทันที** (ดู SCH-08)
3. **`ix_household_search_house_no`** — trigram บน `houseNo` ที่สั้นมาก (เช่น "99/1") → trigram อาจไม่มีประสิทธิภาพเท่า B-tree

---

### ข้อ 15 — Geography และ Geometry เลือกใช้เหมาะสมหรือไม่?

## ✅ **เหมาะสมสำหรับ Point — แต่ ⚠️ มีปัญหาสำคัญสำหรับ Polygon**

| คอลัมน์ | Type ปัจจุบัน | เหมาะสม? |
|---|---|---|
| `household.location` | `geography(Point, 4326)` | ✅ **เหมาะสมมาก** — คำนวณระยะทางเป็นเมตรบนทรงกลมได้ถูกต้อง (สำคัญต่อ `FAR_FROM_EVAC` และ "จุดอพยพใกล้สุด") |
| `evacuation_site.location` | `geography(Point, 4326)` | ✅ เหมาะสม |
| `community.boundary` | `geography(Polygon, 4326)` | ⚠️ **2 ปัญหา** |

**ปัญหาของ `geography(Polygon)`:**

### 🟠 SQL-07 — HIGH: `ST_Contains` **ไม่รองรับ geography**

**นี่คือกับดักที่สำคัญมาก:**

PostGIS **ไม่มี** `ST_Contains(geography, geography)` — ฟังก์ชันที่รองรับ geography มีจำกัด:
- ✅ `ST_Intersects`, `ST_Covers`, `ST_CoveredBy`, `ST_DWithin`, `ST_Distance`, `ST_Area`, `ST_Length`, `ST_Buffer`
- ❌ `ST_Contains`, `ST_Within`, `ST_Overlaps`, `ST_Touches`, `ST_Crosses`

**ผลกระทบ:** โค้ดที่เขียนว่า `ST_Contains(c.boundary, h.location)` จะได้:
```
ERROR: function st_contains(geography, geography) does not exist
```

**ทางแก้:**
```sql
-- ✅ ใช้ ST_Covers แทน (รองรับ geography)
SELECT * FROM community c, household h
WHERE ST_Covers(c.boundary, h.location);

-- ✅ หรือ cast เป็น geometry (แต่ระวังความหมายเปลี่ยน — planar vs spheroid)
WHERE ST_Contains(c.boundary::geometry, h.location::geometry);
```

> **หมายเหตุ:** `ST_Covers` กับ `ST_Contains` ต่างกันเล็กน้อยที่การจัดการจุดบนขอบ (boundary) — `ST_Covers` รวมจุดบนขอบ ซึ่ง**เหมาะกว่า**สำหรับกรณีนี้ (บ้านที่อยู่ติดขอบชุมชนควรนับเป็นในชุมชน)

**⚠️ นี่แก้ข้อความในเอกสาร [05-community-area-design.md](05-community-area-design.md)** ที่เขียนว่าใช้ `ST_Contains` → **ต้องใช้ `ST_Covers`** สำหรับ geography

### 🟡 SQL-08 — MEDIUM: `Polygon` ควรเป็น `MultiPolygon`

**เหตุผล:** ชุมชนอาจมีพื้นที่ไม่ต่อเนื่อง (ถูกคลอง/ถนนตัด — ชื่อเครือข่ายคือ "**สองคลอง**ควนลัง" ซึ่งบ่งชี้ว่ามีคลองตัดผ่านจริง) → `Polygon` เก็บได้ชิ้นเดียว
→ **`MultiPolygon` รองรับ Polygon เดี่ยวได้อยู่แล้ว** → ไม่เสียอะไร (ตอบข้อ 17)

**สรุปคำแนะนำ:**
```sql
-- ย้ายไปตาราง community_boundary (ตาม doc 05) + เปลี่ยนเป็น MultiPolygon
ALTER TABLE "community_boundary"
  ADD COLUMN IF NOT EXISTS "geom" geography(MultiPolygon, 4326);
```

---

### ข้อ 16 — SRID ใช้ถูกต้องหรือไม่?

## ✅ **ถูกต้องและสม่ำเสมอ — SRID 4326 ทุกที่**

| จุด | SRID | ✓ |
|---|---|---|
| `geography(Point, 4326)` × 2 | 4326 | ✅ |
| `geography(Polygon, 4326)` | 4326 | ✅ |
| `ST_SetSRID(ST_MakePoint(...), 4326)` × 2 | 4326 | ✅ |

✅ **4326 = WGS84** = ระบบพิกัดที่ GPS และ Google Maps ใช้ → ตรงกับคำแนะนำบนกระดาษ (*"ปักหมุดผ่าน Google Maps แล้วนำค่าพิกัดมาใส่"*) ✅
✅ ตรงกับ T1 ในเอกสาร (*"PostGIS ตั้งแต่วันแรก — geography(Point,4326)"*) ✅

**⚠️ ข้อควรทราบ:** `geography` **บังคับ SRID 4326 อยู่แล้ว** โดยปริยาย → การระบุชัดเจนเป็นเรื่องดี ✅

**✅ ลำดับ lng/lat ถูกต้อง:**
```sql
ST_MakePoint(NEW.longitude::float, NEW.latitude::float)
--            ^^^^^^^^^ X = lng     ^^^^^^^^ Y = lat    ✅ ถูกต้อง
```
→ นี่เป็นจุดที่ผิดกันบ่อยมาก — **ไฟล์นี้ทำถูก** ✅

---

### ข้อ 17 — Community Boundary รองรับ MultiPolygon หรือไม่?

## ❌ **ไม่รองรับ — ปัจจุบันเป็น `Polygon`**

ดู SQL-08 ด้านบน — **ควรเปลี่ยนเป็น `MultiPolygon`**

---

### ข้อ 18 — Query แบบ Bounding Box และ Distance มีแนวทางอย่างไร?

**ปัจจุบัน: ❌ ไม่มีตัวอย่าง Query เลยในไฟล์** — มีแต่ Index กับ View

**แนวทางที่เสนอ:**

#### Bounding Box (สำหรับ Map viewport — `GET /api/gis/households.geojson?bbox=...`)

```sql
-- ✅ ใช้ && operator (bounding box overlap) — ใช้ GIST index ได้
SELECT id, latitude, longitude, "riskLevelFinal"
FROM v_household_geo_internal
WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
LIMIT 5000;
```
> **`&&` เร็วกว่า `ST_Intersects`** เพราะเทียบเฉพาะกล่องครอบ (ไม่คำนวณเรขาคณิตจริง) → เหมาะกับ Map viewport ที่ต้องการความเร็ว (NFR-P-02: 5,000 หมุด ≤3 วิ)

#### Distance (จุดอพยพใกล้สุด + `FAR_FROM_EVAC`)

```sql
-- ✅ KNN — <-> operator ใช้ GIST index ได้ (เร็วมาก)
SELECT es.id, es.name,
       ST_Distance(h.location, es.location) AS "distanceMeters"
FROM "household" h
CROSS JOIN LATERAL (
  SELECT * FROM "evacuation_site" es
  WHERE es."isActive" = true
  ORDER BY es.location <-> h.location   -- ⭐ KNN operator
  LIMIT 1
) es
WHERE h.id = $1;
```

```sql
-- ✅ FAR_FROM_EVAC (>1 กม.) — ใช้ ST_DWithin (ใช้ index ได้)
SELECT h.id, NOT EXISTS (
  SELECT 1 FROM "evacuation_site" es
  WHERE es."isActive" = true
    AND ST_DWithin(h.location, es.location, 1000)  -- ⭐ 1000 เมตร
) AS "isFarFromEvac"
FROM "household" h WHERE h.location IS NOT NULL;
```

> **⚠️ สำคัญ:** ใช้ **`ST_DWithin(a, b, 1000)`** ไม่ใช่ `ST_Distance(a, b) > 1000`
> เพราะ `ST_Distance` ใน WHERE clause **ใช้ Index ไม่ได้** → Full scan → ช้ามากเมื่อถึง 50,000 ครัวเรือน
> **geography จะคืนค่าเป็นเมตรโดยอัตโนมัติ** ✅ (ถ้าใช้ geometry จะได้หน่วยเป็นองศา = ผิด)

#### จุดอพยพในชุมชน

```sql
-- ✅ ใช้ ST_Covers (ไม่ใช่ ST_Contains — ดู SQL-07)
SELECT es.* FROM "evacuation_site" es
JOIN "community_boundary" cb ON cb."communityId" = $1 AND cb."effectiveTo" IS NULL
WHERE ST_Covers(cb.geom, es.location);
```

---

### ข้อ 19 — Prisma จะ Query PostGIS ด้วย Raw SQL, Extension หรือ Service Layer อย่างไร?

**ข้อเสนอ: Service Layer ที่ห่อ `$queryRaw` ไว้ข้างใน — ไม่ให้ Feature เรียก Raw SQL ตรงๆ**

```typescript
// db/repositories/gis.repository.ts

import { Prisma } from '@prisma/client';

export type HouseholdGeoPoint = {
  id: string;
  latitude: number;
  longitude: number;
  riskLevelFinal: RiskLevel | null;
};

export class GisRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * ครัวเรือนใน viewport — ใช้ GIST index ผ่าน && operator
   * ⚠️ ต้องส่ง AuthContext เสมอ — DATA_ENTRY เรียกไม่ได้ (BR-58)
   */
  async findHouseholdsInBbox(
    ctx: AuthContext,
    bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  ): Promise<HouseholdGeoPoint[]> {
    assertCan(ctx, 'gis:viewHouseholds');   // ⭐ RBAC ที่ Server เสมอ

    const communityIds = await resolveScopedCommunityIds(ctx);  // ⭐ Community Scope

    return this.prisma.$queryRaw<HouseholdGeoPoint[]>`
      SELECT h.id, h.latitude::float, h.longitude::float, frp."riskLevelFinal"
      FROM "household" h
      JOIN "paper_sheet" ps ON ps.id = h."sheetId"
      LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
      WHERE h.location && ST_MakeEnvelope(
              ${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326
            )::geography
        AND h."deletedAt" IS NULL
        AND h."hasDuplicateFlag" = false
        AND ps.status = 'VERIFIED'
        AND h."communityId" IN (${Prisma.join(communityIds)})   -- ⭐ Scope
      LIMIT 5000
    `;
  }
}
```

**หลักการ:**

| หลักการ | เหตุผล |
|---|---|
| **`$queryRaw` (tagged template) เท่านั้น** | Parameterized โดยอัตโนมัติ → กัน SQL Injection ✅ **ห้ามใช้ `$queryRawUnsafe`** |
| **ห่อใน Repository** | Feature/UI ห้ามเขียน SQL → บังคับให้ผ่าน RBAC + Scope + Audit ทุกครั้ง (แก้ SCH-11) |
| **Return type ชัดเจน** | `$queryRaw` คืน `any` → ต้องประกาศ type + ตรวจด้วย Zod ที่ขอบ |
| **ไม่ใช้ Prisma Extension สำหรับ PostGIS** | ยังไม่มี Extension ที่เสถียรพอ และ `$queryRaw` เพียงพอ |
| **`::float` cast** | `Decimal` ของ Prisma กับ `numeric` ของ PG → cast ให้ชัดเจน |

**⚠️ ข้อควรระวังกับ `Unsupported()`:** คอลัมน์ `location` จะไม่อยู่ใน Prisma Client → `prisma.household.create()` จะไม่เขียน `location` → **ต้องพึ่ง Trigger** (ซึ่งมีอยู่แล้ว ✅ และนี่คือเหตุผลที่ Trigger นี้ถูกออกแบบมา — เป็นการตัดสินใจที่ดี ✅)

---

### ข้อ 20 — Custom SQL ควรอยู่ใน Prisma Migration หรือโฟลเดอร์แยก?

## **ตอบ: ต้องอยู่ใน Prisma Migration — ไม่ใช่โฟลเดอร์แยก**

**เหตุผลหลัก: Drift Detection (SQL-02)** — SQL ที่รันนอก Migration History จะทำให้ Prisma มองว่า DB "เพี้ยน" และเสนอให้ Reset

| แนวทาง | Drift? | Rollback? | CI/CD? | สรุป |
|---|---|---|---|---|
| **โฟลเดอร์แยก + รันมือ** (ปัจจุบัน) | 🔴 เกิด | ❌ ไม่ได้ | ❌ ต้องเขียน Script เอง | ❌ **ไม่แนะนำ** |
| **ใน Prisma Migration** | ✅ ไม่เกิด | ✅ ได้ | ✅ `prisma migrate deploy` | ✅ **แนะนำ** |
| **Hybrid** — Migration + ไฟล์ต้นฉบับใน `database/` เพื่ออ่านง่าย | ✅ | ✅ | ✅ | ✅ **ดีที่สุด** |

**ข้อเสนอ Hybrid:**
- **แหล่งความจริง** = `prisma/migrations/*/migration.sql` (สิ่งที่รันจริง)
- **`database/` = เอกสารประกอบ** ที่จัดกลุ่มให้อ่านง่าย + มี Test ตรวจว่าตรงกับ migration
- **ห้ามรัน `database/*.sql` ด้วยมือใน Production**

---

## แผนแยก SQL ที่เสนอ

> ⚠️ **รอบนี้เป็นเพียงแผน — ยังไม่รัน SQL**

### ลำดับการรัน

```
┌─────────────────────────────────────────────────────────────────┐
│ 0. datasource: extensions = [postgis, pg_trgm]                  │
│    → Prisma สร้าง Extension ให้เองใน Migration แรก ✅            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Migration: 0001_init                                         │
│    → CREATE EXTENSION postgis, pg_trgm  (Prisma สร้างให้)        │
│    → CREATE TABLE ทั้ง 49+ ตาราง                                 │
│    → Prisma Index + Unique Constraint                            │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Migration: 0002_postgis_columns                              │
│    → คอลัมน์ geography ผ่าน Unsupported() ใน schema.prisma       │
│      (Prisma สร้าง ALTER TABLE ให้เอง — ไม่มี Drift ✅)          │
│    → household.location, evacuation_site.location               │
│    → community_boundary.geom (MultiPolygon)                      │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Migration: 0003_functions_triggers  (--create-only + SQL มือ) │
│    → update_household_location() + trigger                       │
│    → update_evac_site_location() + trigger                       │
│    → update_batch_counts() + trigger  (แก้ INSERT/DELETE/ย้าย)   │
│    → prevent_audit_modification() + trigger  (แก้ให้ยอม DELETE)  │
│    → check_different_entry_person() + trigger  ⭐ ใหม่ (SCH-03)  │
│    → release_expired_locks()  (แก้ Race + Audit)                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Migration: 0004_constraints  (DO $$ IF NOT EXISTS ทุกตัว)     │
│    → ck_member_count (แก้ 1-50 → 0-5000)                        │
│    → ck_age, ck_flood_depth, ck_flood_duration                  │
│    → ck_pregnancy_weeks (ผ่อน หรือ ย้ายไป App)                  │
│    → ck_raw_score, ck_normalized_score  ⭐ แก้ 115 vs 100        │
│    → ck_community_total_households, ck_community_target_coverage │
│    → ux_community_primary_tambon (Partial Unique)               │
│    → ux_risk_version_active (Partial Unique)                    │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Migration: 0005_indexes                                      │
│    → GIST spatial (Partial: WHERE location IS NOT NULL          │
│                            AND deletedAt IS NULL)               │
│    → GIN trgm (แก้ ix_vulnerable_search_name ให้เช็ค deletedAt)  │
│    → Index ที่ขาด (deletedAt, discrepancy.resolution, FK ต่างๆ)  │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Migration: 0006_views  (DROP VIEW IF EXISTS ก่อนเสมอ)         │
│    → v_household_geo_internal  (เปลี่ยนชื่อ + กรอง VERIFIED)     │
│    → v_community_coverage      (แทน v_community_summary)        │
│    → v_public_risk_grid        ⭐ ใหม่ (Grid + k-anonymity)      │
│    → v_public_community_stats  ⭐ ใหม่ (Aggregate ล้วน)          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Seed (Idempotent)                                            │
└─────────────────────────────────────────────────────────────────┘
```

### โครงสร้างไฟล์ที่เสนอ

```
prisma/
└── migrations/                        ⭐ แหล่งความจริง — สิ่งที่รันจริง
    ├── 0001_init/migration.sql
    ├── 0002_postgis_columns/migration.sql
    ├── 0003_functions_triggers/migration.sql
    ├── 0004_constraints/migration.sql
    ├── 0005_indexes/migration.sql
    └── 0006_views/migration.sql

database/                              📖 เอกสารประกอบ (อ่านง่าย จัดกลุ่ม)
├── README.md                          ⚠️ "ห้ามรันไฟล์เหล่านี้ด้วยมือ — ดู prisma/migrations"
├── functions/
│   ├── update_household_location.sql
│   ├── update_batch_counts.sql
│   ├── check_different_entry_person.sql
│   └── release_expired_locks.sql
├── views/
│   ├── v_household_geo_internal.sql
│   ├── v_community_coverage.sql
│   └── v_public_risk_grid.sql
├── constraints/
│   └── check_constraints.sql
└── drafts/
    └── 00_postgis_extensions.sql      ⚠️ ไฟล์เดิม — เก็บไว้อ้างอิง ห้ามรัน
```

---

## ข้อ 9 (เพิ่มเติม) — 🟡 SQL-09: Audit Trigger ขัดกับ BR-30 (Retention 5 ปี)

```sql
-- SQL:125-129
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
```

**ปัญหา:** Trigger ห้าม **DELETE โดยสิ้นเชิง** → **BR-30 ("เก็บได้ไม่เกิน 5 ปี") ทำไม่ได้** → Audit Log จะโตไม่จำกัดและผิด PDPA (การเก็บข้อมูลเกินความจำเป็น)

**นอกจากนี้:**
- **`prevent_audit_modification()` ไม่ใช่ `SECURITY DEFINER`** → Superuser/Owner ยัง `ALTER TABLE ... DISABLE TRIGGER` ได้ → ไม่ใช่การป้องกันที่แท้จริง
- **วิธีที่ถูกต้องกว่า** — ใช้ **GRANT/REVOKE** (ซึ่งไฟล์นี้ comment ไว้แล้วที่บรรทัด 113-114 แต่**ไม่ได้เปิดใช้**):
```sql
REVOKE UPDATE, DELETE ON "audit_log" FROM app_user;
GRANT INSERT, SELECT ON "audit_log" TO app_user;
```
→ **นี่คือวิธีที่ถูกต้อง** เพราะแยกสิทธิ์ระดับ Role → App ลบไม่ได้ แต่ Retention Job (ที่ใช้ Role อื่น) ลบได้

**แนวทางแก้ไข:** ใช้ **GRANT/REVOKE เป็นหลัก** + Trigger ที่**อนุญาต DELETE เฉพาะแถวที่เก่ากว่า Retention**:
```sql
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit log records cannot be modified';
  END IF;
  -- DELETE: อนุญาตเฉพาะแถวที่เกิน Retention (BR-30: 5 ปี)
  IF TG_OP = 'DELETE' AND OLD."createdAt" > NOW() - INTERVAL '5 years' THEN
    RAISE EXCEPTION 'Audit log ที่ยังไม่เกิน 5 ปี ลบไม่ได้ (BR-30)';
  END IF;
  RETURN OLD;   -- ⭐ BEFORE DELETE ต้อง RETURN OLD ไม่ใช่ NULL
END;
$$ LANGUAGE plpgsql;
```

> ## 🔴 **บั๊กร้ายแรงที่ซ่อนอยู่ในโค้ดเดิม**
>
> ```sql
> -- SQL:117-123 — เดิม
> RETURNS TRIGGER AS $$
> BEGIN
>   RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
>   RETURN NULL;   -- ⚠️ บรรทัดนี้ไม่มีวันทำงาน (RAISE หยุดก่อน)
> END;
> ```
> โค้ดนี้ *"ทำงานได้"* เพราะ `RAISE EXCEPTION` หยุดทุกอย่าง → `RETURN NULL` เป็น dead code
> **แต่ถ้าใครแก้ให้ไม่ RAISE ในบางกรณี** (เช่น เพื่อรองรับ Retention ตามข้อเสนอ) แล้วลืมแก้ `RETURN NULL`
> → **`RETURN NULL` ใน `BEFORE DELETE` = ยกเลิกการลบเงียบๆ โดยไม่มี Error**
> → Retention Job จะรายงานว่า "ลบสำเร็จ 0 แถว" ทุกครั้ง โดยไม่มีใครรู้ว่าทำไม

---

## ตารางสรุปปัญหา (SQL)

| ID | ระดับ | ปัญหา | บรรทัด | Module |
|---|---|---|---|---|
| SQL-01 | 🔴 BLOCKER | ชื่อไฟล์ `00_` ขัดกับลำดับจริง — 94% ของไฟล์ต้องรันหลัง Migration | ทั้งไฟล์ | ทุก Module |
| SQL-02 | 🔴 BLOCKER | SQL นอก Migration → Prisma Drift → เสนอ Reset DB (ข้อมูลหาย) | ทั้งไฟล์ | ทุก Module |
| SQL-03 | 🔴 BLOCKER | `ADD CONSTRAINT` ไม่ Idempotent → รันซ้ำ Error → Constraint ที่เหลือไม่ถูกสร้าง | 264-290 | ทุก Module |
| SQL-04 | 🔴 BLOCKER | Batch Trigger รองรับแค่ UPDATE status — ย้าย Batch/INSERT/DELETE ไม่ทำงาน + `receivedCount` ไม่คำนวณเลย | 135-160 | M02, M06 |
| SQL-05 | 🟠 HIGH | `release_expired_locks()` มี Race Condition + ไม่มี lock_timeout + ไม่มี Audit | 168-186 | M02, M03 |
| SQL-06 | 🟠 HIGH | `v_household_geo` เปิด L3/L4 (houseNo + พิกัด + p1Count) + ไม่กรอง VERIFIED | 195-228 | M10, M00 |
| SQL-07 | 🟠 HIGH | `ST_Contains` ไม่รองรับ geography → ต้องใช้ `ST_Covers` | (แนวทางในอนาคต) | M10 |
| SQL-11 | 🟠 HIGH | `v_community_summary` — `SUM(memberCount)` fan-out + Coverage หาร 600 + ไม่กรอง Duplicate (= COV-01/02) | 231-258 | M11 |
| SQL-12 | 🟠 HIGH | `ck_member_count` 1-50 จะปฏิเสธโรงเรียน/โรงงาน | 264-266 | M03 |
| SQL-13 | 🟠 HIGH | `ck_risk_score` 0-100 vs น้ำหนัก 115 (= RISK-01) | 284-286 | M09 |
| SQL-08 | 🟡 MEDIUM | `boundary` เป็น `Polygon` ควรเป็น `MultiPolygon` + ควรย้ายไป `community_boundary` | 80-84 | M10 |
| SQL-09 | 🟡 MEDIUM | Audit Trigger ห้าม DELETE → ขัด BR-30 + `RETURN NULL` เป็นกับดัก + ควรใช้ GRANT/REVOKE | 108-129 | M18 |
| SQL-10 | 🟡 MEDIUM | `CREATE OR REPLACE VIEW` เปลี่ยนชื่อ/ลำดับ/ชนิด column ไม่ได้ → ต้อง DROP ก่อน | 195, 231 | M11 |
| SQL-14 | 🟡 MEDIUM | `pg_trgm` ไม่ได้ประกาศใน `datasource extensions` → Prisma อาจ DROP | schema.prisma:22, SQL:8 | ทุก Module |
| SQL-15 | 🟡 MEDIUM | `ix_vulnerable_search_name` ไม่เช็ค `household.deletedAt` → ค้นเจอคนในบ้านที่ลบแล้ว | 103-105 | M12 |
| SQL-16 | 🟡 MEDIUM | Spatial Index ไม่เป็น Partial → Index ใหญ่เกินจำเป็น | 42-43, 73-74 | M10 |
| SQL-17 | 🟡 MEDIUM | GIN trgm Index ขัดแย้งกับแผน Encryption (SCH-08) | 91-105 | M12, M18 |
| SQL-18 | 🟢 LOW | ไม่มีตัวอย่าง Query (bbox/distance) ในไฟล์ | — | M10 |
| SQL-19 | 🟢 LOW | `RETURN NEW` ใน AFTER trigger ควรเป็น `RETURN COALESCE(NEW, OLD)` | 152 | M02 |
| SQL-20 | 🟢 LOW | ไม่มี `CREATE INDEX CONCURRENTLY` สำหรับ Production | 42-105 | M16 |
