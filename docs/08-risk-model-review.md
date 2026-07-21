# 08 — Risk Model Review

> ตอบภารกิจที่ 7 ทั้ง 12 ข้อ — ตรวจ `RiskWeightConfig` (seed.ts:309-330) + `FloodRiskProfile` (schema.prisma:945-1000) + CHECK Constraints (SQL:284-290) + สูตรในเอกสาร (system-analysis.md:884-893)
> **เสนอ Risk Model ที่ปลอดภัย แต่ยังไม่แก้โค้ด**

## สรุประดับปัญหา

| ระดับ | จำนวน |
|---|---|
| 🔴 BLOCKER | 3 |
| 🟠 HIGH | 6 |
| 🟡 MEDIUM | 4 |
| 🟢 LOW | 1 |

---

## ตอบคำถามภารกิจที่ 7 ทีละข้อ

---

### ข้อ 1 — น้ำหนักทั้งหมดรวมเท่าไร?

## **ตอบ: 115 คะแนน จาก 12 ปัจจัย** (ตรวจสอบด้วยการคำนวณแล้ว)

| # | `factorCode` | ชื่อไทย | weight | maxScore | ที่มาจากกระดาษ |
|---|---|---|---|---|---|
| 1 | `FLOOR_LEVEL` | ระดับพื้นเทียบถนน | **20** | 20 | ส่วนที่ 3 ข้อ 1 |
| 2 | `HAS_FLOODED` | ประวัติน้ำท่วม | **15** | 15 | ส่วนที่ 3 ข้อ 2 |
| 3 | `FLOOD_DEPTH` | ระดับน้ำสูงสุด | **15** | 15 | ส่วนที่ 3 ข้อ 3 ⭐ |
| 4 | `FLOOD_DURATION` | ระยะเวลาน้ำท่วม | **5** | 5 | ส่วนที่ 3 ข้อ 4 |
| 5 | `HAS_P1` | มีกลุ่มเปราะบาง P1 | **20** | 20 | ส่วนที่ 2 (Derived จาก Triage) |
| 6 | `HAS_P2` | มีกลุ่มเปราะบาง P2 | **10** | 10 | ส่วนที่ 2 (Derived) |
| 7 | `NO_VEHICLE` | ไม่มีพาหนะอพยพ | **8** | 8 | ส่วนที่ 3 ข้อ 9 |
| 8 | `NO_SURVIVAL_KIT` | ไม่มีถุงยังชีพ | **4** | 4 | ส่วนที่ 3 ข้อ 10 |
| 9 | `NO_RESOURCES` | ไม่มีทรัพยากรรับมือ | **3** | 3 | ส่วนที่ 3 ข้อ 11 ⚠️ |
| 10 | `UNKNOWN_EVAC_SITE` | ไม่รู้จุดอพยพ | **5** | 5 | ส่วนที่ 3 ข้อ 8 |
| 11 | `NO_DIGITAL_CHANNEL` | ไม่มีช่องทางรับข่าวดิจิทัล | **4** | 4 | ส่วนที่ 4 ข้อ 1 |
| 12 | `FAR_FROM_EVAC` | ระยะห่างจุดอพยพ >1 กม. | **6** | 6 | ❌ **ไม่ได้มาจากกระดาษ** (คำนวณจาก GIS) |
| | | **รวม** | **115** | **115** | |

✅ **ตรงกับเอกสาร** — `system-analysis.md:889` ระบุ "12 ปัจจัย รวมน้ำหนัก **115** คะแนน"
✅ **ตรงกับ Schema** — `FloodRiskProfile.riskFactorsTotal Int? @default(12)`

---

### ข้อ 2 — หากรวมเป็น 115 แต่ Schema กำหนด 0–100 จะเกิดปัญหาใด?

## 🔴 RISK-01 — BLOCKER: ความกำกวมระหว่าง Raw Score (สูงสุด 115) กับ Normalized Score (0–100)

**สิ่งที่มีอยู่ (ทุกแหล่งที่ขัดกัน):**

| แหล่ง | ข้อความ |
|---|---|
| `seed.ts:310-321` | น้ำหนักรวม **115** |
| `system-analysis.md:887` | `RiskScore (0-100) = Σ (Factor × Weight) / Σ (Weight ที่มีข้อมูล) × 100` |
| `system-analysis.md:889-890` | "12 ปัจจัย รวมน้ำหนัก 115 คะแนน / **Normalize เป็น 0-100**" |
| `schema.prisma:978` | `riskScoreAuto Float?  /// คะแนน **0-100**` |
| `SQL:284-286` | `CHECK ("riskScoreAuto" IS NULL OR ("riskScoreAuto" >= 0 AND "riskScoreAuto" <= 100))` |
| `CLAUDE.md` | "หากคะแนนดิบรวมเกิน 100 ให้แยก: `rawScore`, `maximumPossibleScore`, `normalizedScore`" |

**ปัญหาที่จะเกิด — แยกตามการตีความของผู้พัฒนา:**

#### กรณี ก: ผู้พัฒนาเก็บ Raw Score ลง `riskScoreAuto` (ตีความจาก seed ที่ `maxScore = weight`)

```
rawScore = Σ(Factor × Weight)  → สูงสุด = 115
INSERT INTO flood_risk_profile (riskScoreAuto) VALUES (115);
→ ❌ ERROR: new row violates check constraint "ck_risk_score"
```

**⚠️ นี่คือความล้มเหลวที่อันตรายที่สุดของทั้งระบบ:**

> **Constraint จะปฏิเสธเฉพาะครัวเรือนที่เสี่ยงที่สุด**
>
> ครัวเรือนที่ได้ 101–115 คะแนน = ครัวเรือนที่มีทั้งผู้ป่วยติดเตียง + พื้นต่ำกว่าถนน + เคยท่วม + ไม่มีพาหนะ + ไม่รู้จุดอพยพ
> = **คนที่ระบบนี้สร้างขึ้นมาเพื่อช่วยโดยเฉพาะ**
>
> ครัวเรือนเสี่ยงต่ำ (0–100) จะบันทึกได้ปกติ → ระบบดู "ทำงานได้" → บั๊กจะไม่ถูกพบใน Test ที่ใช้ข้อมูลทั่วไป
> แต่จะระเบิดตอน Production กับเคสที่สำคัญที่สุด และอาจถูกตีความว่าเป็น "ข้อมูลผิด" แล้วถูกข้ามไป

#### กรณี ข: ผู้พัฒนา Normalize ตามสูตรในเอกสาร

```
score = Σ(Factor × Weight) / Σ(Weight ที่มีข้อมูล) × 100  → ≤ 100 เสมอ ✅ CHECK ผ่าน
```
→ ไม่ error แต่**เกิดปัญหาอื่นที่ร้ายแรงกว่า** (ดู RISK-02 — Missing Data ทำให้คะแนนพุ่ง)

#### กรณี ค: ผู้พัฒนา Clamp ค่า

```typescript
riskScoreAuto = Math.min(rawScore, 100);  // ❌ ซ่อนข้อมูล
```
→ ครัวเรือนที่ได้ 103 กับ 115 จะกลายเป็น 100 เท่ากัน → **แยกลำดับความเร่งด่วนไม่ได้** ในกลุ่มที่เร่งด่วนที่สุด

**ผลกระทบร่วม:** ไม่มีใครรู้ว่า `riskScoreAuto = 75` หมายถึงอะไร — Raw 75/115 (65%) หรือ Normalized 75/100 (75%)? → **ตัวเลขบน Dashboard ไม่มีความหมายที่ตรวจสอบได้**

**แนวทางแก้ไข:** แยก 3 ฟิลด์ตาม CLAUDE.md (ดูข้อ 3)

**ต้องใช้ข้อมูลเพิ่มเติม:** ยืนยันสูตร Normalize (ดู Q-25)

**Module ที่กระทบ:** M09, M11, M10, M16

---

### ข้อ 3 — ควรใช้ Raw Score และ Normalized Score หรือไม่?

## **ตอบ: ต้องใช้ — และต้องเก็บทั้ง 3 ค่าตาม CLAUDE.md**

```prisma
model FloodRiskProfile {
  // ═══ Risk Score (เสนอใหม่) ═══

  /// คะแนนดิบ = Σ(Factor × Weight) ของปัจจัยที่มีข้อมูล — สูงสุด 115
  rawScore              Float?

  /// คะแนนเต็มที่เป็นไปได้ = Σ(Weight ของปัจจัยที่มีข้อมูล)
  /// ⚠️ ไม่ใช่ 115 เสมอ — ถ้ามีข้อมูล 8/12 ปัจจัย ค่านี้จะน้อยกว่า 115
  maximumPossibleScore  Float?

  /// คะแนนมาตรฐาน 0-100 = rawScore / maximumPossibleScore × 100
  normalizedScore       Float?

  /// ⭐ คะแนนเทียบกับน้ำหนักเต็มระบบ = rawScore / 115 × 100
  /// ใช้เปรียบเทียบข้ามครัวเรือนที่มีข้อมูลไม่เท่ากัน (ดู RISK-02)
  absoluteScore         Float?

  riskLevelAuto         RiskLevel?
  riskConfidence        Float?   /// 0.0-1.0
  riskFactorsUsed       Int?     /// จำนวนปัจจัยที่มีข้อมูล
  riskFactorsTotal      Int?     /// จำนวนปัจจัยทั้งหมดใน Version นั้น (ไม่ hardcode 12)

  /// ⭐ Version ของสูตร/น้ำหนักที่ใช้คำนวณ
  riskFormulaVersion    String?  /// เช่น "1.0"
  riskWeightVersion     Int?     /// FK → RiskWeightVersion

  computedAt            DateTime?
}
```

**CHECK Constraint ที่เสนอ:**
```sql
-- rawScore: 0 ถึง 115 (หรือมากกว่าถ้าเพิ่มปัจจัยในอนาคต → ไม่ควร hardcode)
ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_raw_score
    CHECK ("rawScore" IS NULL OR "rawScore" >= 0);

-- rawScore ต้องไม่เกิน maximumPossibleScore
ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_raw_le_max
    CHECK ("rawScore" IS NULL OR "maximumPossibleScore" IS NULL
           OR "rawScore" <= "maximumPossibleScore");

-- normalizedScore และ absoluteScore: 0-100 ✅
ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_normalized_score
    CHECK ("normalizedScore" IS NULL OR ("normalizedScore" >= 0 AND "normalizedScore" <= 100));
```

> **หมายเหตุ:** ห้าม Hardcode `<= 115` ใน CHECK เพราะน้ำหนักปรับได้ (FR-RSK-05) → ถ้าเพิ่มปัจจัยใหม่หรือปรับน้ำหนักขึ้น CHECK จะพังทันที
> → ใช้ `rawScore <= maximumPossibleScore` แทน ซึ่งเป็นความจริงเชิงคณิตศาสตร์เสมอ

---

### ข้อ 4 — ระดับ LOW, MEDIUM, HIGH และ CRITICAL ควรอิงคะแนนใด?

## 🟠 RISK-03 — HIGH: Threshold ปัจจุบันมีช่องว่าง และไม่ระบุว่าอิงคะแนนไหน

**สิ่งที่มี:** `schema.prisma:119-124`
```prisma
enum RiskLevel {
  LOW       // ต่ำ (0-25)
  MEDIUM    // ปานกลาง (26-50)
  HIGH      // สูง (51-75)
  CRITICAL  // สูงมาก (76-100)
}
```

**ปัญหา 3 ข้อ:**

**(ก) มีช่องว่าง — คะแนนเป็น `Float` แต่ Threshold เป็นจำนวนเต็ม**

| คะแนน | ตกอยู่ระดับไหน? |
|---|---|
| 25.0 | LOW ✅ |
| **25.5** | ❌ **ไม่มีระดับ** (>25 แต่ <26) |
| 26.0 | MEDIUM ✅ |
| **50.7** | ❌ **ไม่มีระดับ** |
| **75.3** | ❌ **ไม่มีระดับ** |

→ `riskScoreAuto Float?` (schema.prisma:978) จะมีทศนิยมเสมอเมื่อ Normalize → **คะแนนจำนวนมากจะตกในช่องว่าง**

**(ข) ไม่ระบุว่าอิงคะแนนไหน** — Raw (0–115), Normalized (0–100), หรือ Absolute?

**(ค) Threshold อยู่ใน Comment ของ Enum** → เปลี่ยนไม่ได้โดยไม่แก้โค้ด → ขัดกับ FR-RSK-05 ("ปรับได้")

**แนวทางแก้ไข:**

1. **ใช้ Half-open Interval** — ปิดช่องว่างอย่างสมบูรณ์:

| ระดับ | ช่วง | เงื่อนไข |
|---|---|---|
| `LOW` | `[0, 25]` | `score <= 25` |
| `MEDIUM` | `(25, 50]` | `score > 25 && score <= 50` |
| `HIGH` | `(50, 75]` | `score > 50 && score <= 75` |
| `CRITICAL` | `(75, 100]` | `score > 75` |

2. **อิง `absoluteScore`** (rawScore / 115 × 100) — **ไม่ใช่ `normalizedScore`** → ดูเหตุผลใน RISK-02

3. **ย้าย Threshold ไป DB** (`RiskThresholdConfig` หรือ `SystemSetting`) พร้อม Version

**⚠️ ต้องยืนยัน:** Threshold 25/50/75 ไม่มีที่มา — ต้องได้รับการรับรอง (ดู Q-26)

---

### ข้อ 5 — Missing Data มีผลต่อคะแนนอย่างไร?

## 🔴 RISK-02 — BLOCKER: สูตร Normalize ปัจจุบันทำให้ข้อมูลขาด → คะแนนเสี่ยง "พุ่ง" แทนที่จะ "ไม่แน่ใจ"

**สูตรในเอกสาร (`system-analysis.md:887`):**
```
RiskScore (0-100) = Σ (Factor × Weight) / Σ (Weight ที่มีข้อมูล) × 100
                                          ^^^^^^^^^^^^^^^^^^^^^^
                                          ตัวหารเปลี่ยนตามข้อมูลที่มี
```

**ปัญหา:** ตัวหารคือ **น้ำหนักของปัจจัยที่มีข้อมูลเท่านั้น** → ยิ่งข้อมูลน้อย ตัวหารยิ่งเล็ก → **คะแนนยิ่งสุดโต่ง**

**ตัวอย่างที่พิสูจน์ปัญหา:**

| กรณี | ข้อมูลที่มี | rawScore | Σ(Weight มีข้อมูล) | Normalized | ระดับ |
|---|---|---|---|---|---|
| **A: ข้อมูลครบ** | 12/12 ปัจจัย — เสี่ยงสูงจริง | 90 | 115 | **78.3** | CRITICAL |
| **B: ข้อมูลขาดมาก** | 1/12 ปัจจัย — รู้แค่ "พื้นต่ำกว่าถนน" | 20 | 20 | **100.0** | **CRITICAL** ⚠️ |
| **C: ข้อมูลขาดมาก** | 1/12 ปัจจัย — รู้แค่ "พื้นสูงกว่าถนน" | 0 | 20 | **0.0** | **LOW** ⚠️ |
| **D: ข้อมูลครบ** | 12/12 — เสี่ยงปานกลาง | 45 | 115 | **39.1** | MEDIUM |

**ผลลัพธ์ที่ผิดพลาด:**
- **กรณี B ได้ 100 คะแนน (CRITICAL) สูงกว่ากรณี A ที่ข้อมูลครบและเสี่ยงจริง (78.3)** — ทั้งที่เรารู้เกี่ยวกับ B แค่ปัจจัยเดียว!
- **กรณี C ได้ 0 (LOW)** ทั้งที่ไม่รู้อะไรเลยนอกจากพื้นสูง — อาจมีผู้ป่วยติดเตียงอยู่ก็ได้
- → **ครัวเรือนที่ข้อมูลขาดจะกระจายไปสุดขั้วทั้งสองด้าน** และไปปะปนกับครัวเรือนที่มีข้อมูลครบ ทำให้ **Priority List (P1) เชื่อถือไม่ได้**

**ทำไมถึงร้ายแรงเป็นพิเศษในระบบนี้:**
- ข้อมูลขาดจะมี**จำนวนมาก** — PE4 (ลายมืออ่านไม่ออก) และ PE5 (กระดาษเว้นว่าง) เป็นปัญหาระดับ 🟠 สูง
- `FAR_FROM_EVAC` (weight 6) ต้องใช้พิกัด + ข้อมูลจุดอพยพ ซึ่ง**ยังไม่มีใน Seed เลย** → **ปัจจัยนี้จะขาดสำหรับทุกครัวเรือนตั้งแต่วันแรก**
- พิกัดจดด้วยมือ (ข้อเท็จจริงข้อ 7) → ขาดบ่อย

**แนวทางแก้ไขที่เสนอ — ใช้ 2 คะแนนคู่กัน:**

| คะแนน | สูตร | ใช้ทำอะไร |
|---|---|---|
| **`absoluteScore`** | `rawScore / 115 × 100` (ตัวหารคงที่) | ⭐ **ใช้จัดระดับ LOW/MEDIUM/HIGH/CRITICAL และเรียงลำดับ** — เปรียบเทียบข้ามครัวเรือนได้อย่างยุติธรรม เพราะตัวหารเท่ากันเสมอ |
| **`normalizedScore`** | `rawScore / Σ(weight มีข้อมูล) × 100` | ใช้ตอบว่า "เท่าที่รู้ ครัวเรือนนี้เสี่ยงกี่ %" — แสดงคู่กับ Confidence เท่านั้น |

**ผลของ `absoluteScore` ต่อตัวอย่างข้างต้น:**

| กรณี | rawScore | absoluteScore | ระดับ | Confidence | การตีความ |
|---|---|---|---|---|---|
| A | 90 | **78.3** | CRITICAL | 100% | เสี่ยงสูงมาก มั่นใจ ✅ |
| B | 20 | **17.4** | LOW | 17% | **คะแนนต่ำแต่ Confidence ต่ำมาก → ต้องไปเก็บข้อมูลเพิ่ม** ✅ |
| C | 0 | **0.0** | LOW | 17% | คะแนนต่ำ Confidence ต่ำ → ต้องเก็บเพิ่ม ✅ |
| D | 45 | **39.1** | MEDIUM | 100% | ปานกลาง มั่นใจ ✅ |

→ กรณี B ไม่ปลอมตัวเป็น CRITICAL อีกต่อไป ✅ และ Confidence ต่ำเป็นสัญญาณให้ไปเก็บข้อมูลเพิ่ม

**⚠️ ข้อจำกัดที่ต้องยอมรับ:** `absoluteScore` จะ **ประเมินความเสี่ยงต่ำเกินจริง (Underestimate)** เมื่อข้อมูลขาด (เพราะปัจจัยที่ไม่รู้ถูกนับเป็น 0) → **ต้องชดเชยด้วยกฎ:**

> **ห้ามแสดง Risk Level เมื่อ `riskConfidence < RISK_MIN_CONFIDENCE` (0.6)** — ให้แสดงเป็น **"ข้อมูลไม่พอประเมิน"** แทน
> `SystemSetting.RISK_MIN_CONFIDENCE = 0.6` มีอยู่แล้ว (seed.ts:345) ✅ แต่**ยังไม่มีโค้ดใช้งาน**

---

### ข้อ 6 — ILLEGIBLE และ BLANK_IN_PAPER มีผลต่อคะแนนอย่างไร?

## 🟠 RISK-04 — HIGH: ไม่มีกฎเลย — และปัจจัย "NO_*" ตีความ Blank ผิดได้ง่ายมาก

**ปัญหาหลัก:** ปัจจัย 5 ตัวเป็นแบบ **"ไม่มี X = เสี่ยง"** — `NO_VEHICLE`, `NO_SURVIVAL_KIT`, `NO_RESOURCES`, `NO_DIGITAL_CHANNEL`, `UNKNOWN_EVAC_SITE` (รวมน้ำหนัก **24/115 = 21%**)

**ความเสี่ยงเชิงตรรกะ:** ถ้าผู้พัฒนาเขียนโค้ดแบบตรงไปตรงมา:

```typescript
// ❌ ผิด — ตีความ "ไม่มีข้อมูล" เป็น "ไม่มีของ"
const noVehicle = household.evacuationVehicles.length === 0;
if (noVehicle) rawScore += 8;
```

→ ครัวเรือนที่ผู้สำรวจ**ข้ามข้อ 9** (BLANK_IN_PAPER) จะได้คะแนนเสี่ยง +8 เท่ากับครัวเรือนที่**ยืนยันว่าไม่มีรถจริง** → **สร้างความเสี่ยงปลอมจากความว่างเปล่า**

**ตารางการตีความที่ถูกต้อง (เสนอ):**

| สถานะฟิลด์ | ความหมาย | ผลต่อ Risk | ผลต่อ Confidence |
|---|---|---|---|
| `HAS_VALUE` | มีค่าจริง | ✅ คำนวณตามค่า | ✅ นับเป็น "มีข้อมูล" |
| `EXPLICIT_NONE` | ติ๊ก "ไม่มี" จริง | ✅ **คำนวณเป็นความเสี่ยง** (เช่น ไม่มีรถ → +8) | ✅ นับเป็น "มีข้อมูล" |
| `BLANK_IN_PAPER` | กระดาษเว้นว่าง | ❌ **ไม่คำนวณ** — ตัดปัจจัยออก | ❌ **ไม่นับ** → ลด Confidence |
| `ILLEGIBLE` | อ่านไม่ออก | ❌ **ไม่คำนวณ** — ตัดปัจจัยออก | ❌ **ไม่นับ** → ลด Confidence |

> **หลักการ:** `EXPLICIT_NONE` = ข้อมูล (เป็นความเสี่ยง) / `BLANK` + `ILLEGIBLE` = ไม่มีข้อมูล (ลด Confidence)
> **นี่คือเหตุผลทั้งหมดที่ระบบต้องแยก 4 สถานะตั้งแต่แรก (T10)** — ถ้า Risk Engine ไม่ใช้ความแตกต่างนี้ การลงทุนใน Field Status Model จะสูญเปล่า

**🔴 ปัญหาที่ทำให้กฎนี้ใช้ไม่ได้จริงในปัจจุบัน:**

| ปัจจัย | ต้องแยก EXPLICIT_NONE จาก BLANK ได้หรือไม่? | Schema รองรับ? |
|---|---|---|
| `NO_RESOURCES` | ต้อง — กระดาษมี "☐ ไม่มี" | ❌ **ไม่รองรับ** (QM-09 — ไม่มีฟิลด์ `hasNoResources`) |
| `NO_VEHICLE` | ต้อง — แต่กระดาษข้อ 9 **ไม่มีตัวเลือก "ไม่มี"** | ❌ **แยกไม่ได้เลย** — ถ้าไม่ติ๊กอะไร แปลว่า "ไม่มีพาหนะ" หรือ "ไม่ได้ถาม"? |
| `NO_SURVIVAL_KIT` | ✅ กระดาษมี "☐ เตรียม ☐ ไม่ได้เตรียม" | ✅ `hasSurvivalKit Boolean?` (null = BLANK) ✅ |
| `NO_DIGITAL_CHANNEL` | ต้อง — กระดาษข้อ 4.1 ไม่มี "ไม่มีช่องทาง" | ❌ แยกไม่ได้ |
| `UNKNOWN_EVAC_SITE` | ✅ กระดาษมี "☐ ไม่ทราบ" | ✅ `NearestEvacSiteType.UNKNOWN` ✅ |

**→ 3 ใน 5 ปัจจัยแบบ "NO_*" แยก "ไม่มี" จาก "ไม่ได้ถาม" ไม่ได้** (รวมน้ำหนัก 15/115)

**แนวทางแก้ไข:**
1. เพิ่ม `Household.hasNoResources Boolean?` (QM-09)
2. สำหรับ `NO_VEHICLE` และ `NO_DIGITAL_CHANNEL` ที่กระดาษไม่มีช่อง "ไม่มี" → **ต้องตัดสินใจเชิงนโยบาย** ว่าจะตีความอย่างไร (ดู Q-27) — ข้อเสนอ: ถือเป็น **BLANK (ไม่นับ)** ปลอดภัยกว่า เพราะการสร้างความเสี่ยงปลอมจะทำให้ Priority List เจือจาง
3. **แก้กระดาษรอบหน้า** ให้ทุกข้อมีตัวเลือก "ไม่มี" ชัดเจน

---

### ข้อ 7 — ข้อมูล Unverified ควรคำนวณ Risk หรือไม่?

## **ตอบ: ไม่ควร — และเอกสารระบุชัดแล้ว แต่ยังบังคับไม่ได้**

**สิ่งที่เอกสารระบุ:**
- FR-RSK-07: *"ต้องไม่คำนวณ Risk จนกว่า VERIFIED"* (system-analysis.md:483)
- BR-46 (อ้างใน schema.prisma:977): "เมื่อ VERIFIED เท่านั้น"
- CLAUDE.md: *"ห้ามใช้ข้อมูล Draft หรือ Unverified ในการคำนวณ Risk Final"*
- BP-03: `ตรงกัน → VERIFIED → คำนวณ Risk/Triage → ขึ้น Dashboard/Map`

**ปัญหา — ไม่มีอะไรบังคับ:**
1. ❌ ไม่มี Constraint/Trigger ที่ห้ามเขียน `riskScoreAuto` เมื่อ sheet ยังไม่ VERIFIED
2. ❌ `v_household_geo` (SQL:195-228) ดึง `riskLevelFinal`, `riskScoreAuto` **โดยไม่กรอง `ps.status = 'VERIFIED'`** → ถ้ามีค่าเขียนไว้ จะรั่วขึ้น Map ทันที
3. ❌ `v_community_summary` นับ `criticalRiskCount`/`highRiskCount` **จากทุกครัวเรือนโดยไม่กรอง VERIFIED** (SQL:242-245) → **Dashboard จะนับ Risk ของข้อมูลที่ยังไม่ยืนยัน**

**⚠️ ประเด็นที่ลึกกว่านั้น — AMB-02:** "VERIFIED" ไม่ได้แปลว่าทั้งใบผ่านการตรวจสอบ

**คำนวณผลกระทบเชิงตัวเลข:**

| ปัจจัย | น้ำหนัก | ผ่าน Double-entry (⭐)? |
|---|---|---|
| `FLOOD_DEPTH` | 15 | ✅ (`maxFloodDepthCm` ⭐) |
| `HAS_P1` | 20 | ⚠️ บางส่วน (ชื่อ ⭐ แต่ประเภทความเปราะบางไม่ ⭐) |
| `HAS_P2` | 10 | ⚠️ บางส่วน |
| `FLOOR_LEVEL` | 20 | ❌ |
| `HAS_FLOODED` | 15 | ❌ |
| `FLOOD_DURATION` | 5 | ❌ |
| `NO_VEHICLE` | 8 | ❌ |
| `NO_SURVIVAL_KIT` | 4 | ❌ |
| `NO_RESOURCES` | 3 | ❌ |
| `UNKNOWN_EVAC_SITE` | 5 | ❌ |
| `NO_DIGITAL_CHANNEL` | 4 | ❌ |
| `FAR_FROM_EVAC` | 6 | ❌ (คำนวณจากพิกัด ⭐) |

> ## **น้ำหนัก 70 จาก 115 คะแนน (61%) มาจากฟิลด์ที่ไม่เคยผ่าน Double-entry**
>
> → `SheetStatus.VERIFIED` ให้ความมั่นใจกับ **39%** ของคะแนนความเสี่ยงเท่านั้น
> → แต่ระบบและผู้ใช้จะเข้าใจว่า "VERIFIED = ตรวจแล้วทั้งใบ"

**แนวทางแก้ไข:**
1. เพิ่ม Trigger/CHECK ที่ปฏิเสธการเขียน Risk เมื่อ sheet ≠ VERIFIED
2. แก้ View ทั้ง 2 ตัวให้กรอง `VERIFIED`
3. **Confidence ต้องสะท้อนว่าปัจจัยผ่าน Double-entry หรือไม่** (ดูข้อ 8)
4. ทำให้ Risk Engine เป็น Pure Function ที่รับเฉพาะ `VerifiedHouseholdInput` type — บังคับที่ TypeScript ด้วย ไม่ใช่แค่ runtime

---

### ข้อ 8 — Confidence Score คำนวณอย่างไร?

## 🟠 RISK-05 — HIGH: มี 2 นิยามที่ขัดกัน และทั้งคู่ยังไม่ดีพอ

**สิ่งที่มี:**

| แหล่ง | นิยาม |
|---|---|
| `system-analysis.md:891` | "Confidence Level = **% ปัจจัยที่มีข้อมูล**" → **นับจำนวน** |
| `schema.prisma:980-982` | `riskConfidence Float?` (0.0–1.0) + `riskFactorsUsed Int?` + `riskFactorsTotal Int? @default(12)` → **นับจำนวน** |
| `seed.ts:345` | `RISK_MIN_CONFIDENCE = 0.6` |

**ปัญหาของการนับจำนวน (Count-based):**

```
Confidence = riskFactorsUsed / riskFactorsTotal
```

| กรณี | ปัจจัยที่มี | Count-based Confidence | ความจริง |
|---|---|---|---|
| **X** | 6 ปัจจัยเบา: FLOOD_DURATION(5), NO_SURVIVAL_KIT(4), NO_RESOURCES(3), UNKNOWN_EVAC(5), NO_DIGITAL(4), FAR_FROM_EVAC(6) = **27/115** | **50%** | รู้แค่ 23% ของน้ำหนัก ⚠️ |
| **Y** | 3 ปัจจัยหนัก: FLOOR_LEVEL(20), HAS_P1(20), HAS_FLOODED(15) = **55/115** | **25%** | รู้ถึง 48% ของน้ำหนัก ⚠️ |

→ **กรณี Y รู้ข้อมูลสำคัญมากกว่า แต่ Confidence ต่ำกว่ากรณี X ครึ่งหนึ่ง** → ผิดความจริง

**ข้อเสนอ: ใช้ Weight-based Confidence + มิติที่ 2 (Verification)**

```typescript
// มิติที่ 1: ความครบของข้อมูล (ถ่วงน้ำหนัก)
const dataCompleteness = sumOfAvailableWeights / sumOfAllWeights;  // 0-1

// มิติที่ 2: ความน่าเชื่อถือของข้อมูล (ผ่าน Double-entry หรือไม่)
const verificationLevel = sumOfDoubleEnteredWeights / sumOfAvailableWeights;  // 0-1

// รวม — ถ่วงน้ำหนักตามนโยบาย (ต้องยืนยัน)
const riskConfidence = dataCompleteness * (0.7 + 0.3 * verificationLevel);
```

**ผลลัพธ์:**

| กรณี | dataCompleteness | verificationLevel | riskConfidence |
|---|---|---|---|
| X (6 ปัจจัยเบา) | 27/115 = 0.23 | 0/27 = 0.0 | **0.16** ✅ ต่ำ (ถูกต้อง) |
| Y (3 ปัจจัยหนัก) | 55/115 = 0.48 | 20/55 = 0.36 | **0.39** ✅ สูงกว่า X (ถูกต้อง) |
| ข้อมูลครบ + ผ่าน Double-entry ทั้งหมด | 1.0 | 1.0 | **1.0** ✅ |
| ข้อมูลครบ แต่ไม่มีอะไรผ่าน Double-entry | 1.0 | 0.0 | **0.7** ✅ สะท้อน AMB-02 |

**ฟิลด์ที่ต้องเพิ่ม:**
```prisma
riskDataCompleteness  Float?  /// 0-1 — % น้ำหนักที่มีข้อมูล
riskVerificationLevel Float?  /// 0-1 — % น้ำหนักที่ผ่าน Double-entry
riskConfidence        Float?  /// 0-1 — รวม (แสดงต่อผู้ใช้)
riskWeightAvailable   Float?  /// Σ(weight ที่มีข้อมูล) — เก็บไว้ตรวจสอบย้อนหลัง
```

**⚠️ ต้องยืนยัน:** สูตรรวม (0.7/0.3) ไม่มีที่มา — ต้องได้รับการรับรอง (ดู Q-28)

**กฎการใช้งาน (FR-RSK-08):**
- `riskConfidence >= 0.6` → แสดง Risk Level ปกติ
- `riskConfidence < 0.6` → **แสดง "ข้อมูลไม่พอประเมิน"** (สีเทา ตาม UI principle) + **ห้ามใช้ใน Priority List** + ควรเข้าคิว Field Query

---

### ข้อ 9 — Risk Formula ต้องมี Version หรือไม่?

## **ตอบ: ต้องมี — ปัจจุบันไม่มีเลย** 🔴

**เหตุผล:**

1. **CLAUDE.md บังคับ:** *"ก่อนใช้ Risk Model ต้องตรวจสอบ: … **Version ของสูตรความเสี่ยง**"*
2. **น้ำหนักปรับได้** (FR-RSK-05) → เมื่อปรับแล้ว คะแนนเก่ากับใหม่จะเทียบกันไม่ได้
3. **ต้องอธิบายย้อนหลังได้** — เมื่อเกิดเหตุจริงแล้วมีคนถามว่า "ทำไมบ้านนี้ถูกจัดเป็น LOW ทั้งที่ท่วมหนัก" → ต้องตอบได้ว่าใช้สูตร/น้ำหนักอะไรตอนนั้น
4. **Audit/PDPA** — การตัดสินใจที่กระทบบุคคลต้องอธิบายได้

**สิ่งที่มี:** `RiskWeightConfig.effectiveFrom DateTime @default(now())` — มีเจตนาดี **แต่ใช้ไม่ได้** เพราะ `factorCode @unique` (ดูข้อ 12)

**สิ่งที่ต้องเพิ่ม:**
```prisma
model FloodRiskProfile {
  riskFormulaVersion  String?  /// เช่น "1.0" — Version ของ "สูตร" (logic)
  riskWeightVersionId String?  /// FK → RiskWeightVersion — Version ของ "น้ำหนัก" (data)
  computedAt          DateTime?
}
```

> **⚠️ ต้องแยก 2 Version:** "สูตร" (logic ใน code — เปลี่ยนเมื่อ deploy) กับ "น้ำหนัก" (data ใน DB — เปลี่ยนผ่าน Admin UI) → เปลี่ยนคนละจังหวะ และต้องบันทึกทั้งคู่

---

### ข้อ 10 — การเปลี่ยนน้ำหนักในอนาคตจะกระทบคะแนนเดิมอย่างไร?

## 🟠 RISK-06 — HIGH: คะแนนเดิมจะกลายเป็น "ตัวเลขกำพร้า" ที่ไม่มีใครอธิบายได้

**สถานการณ์:** Admin ปรับ `HAS_P1` จาก 20 → 30 (เพราะเห็นว่ากลุ่มเปราะบางสำคัญกว่าที่คิด)

**ผลกระทบกับ Schema ปัจจุบัน:**

| ประเด็น | ผลกระทบ |
|---|---|
| **คะแนนเก่าไม่เปลี่ยน** | `riskScoreAuto` ที่คำนวณไว้แล้วยังเป็นค่าเดิม → ในระบบจะมีคะแนน 2 ชุดที่คำนวณจากคนละน้ำหนัก **ปะปนกันโดยแยกไม่ออก** |
| **เทียบกันไม่ได้** | Dashboard เรียงลำดับความเสี่ยง → บ้าน A (สูตรเก่า 70) vs บ้าน B (สูตรใหม่ 72) → **เรียงผิด** |
| **`effectiveFrom` ถูกทับ** | `upsert` + `factorCode @unique` → ปรับน้ำหนักคือ **UPDATE ทับของเดิม** → **ประวัติหายถาวร** |
| **ไม่รู้ว่าต้องคำนวณใหม่** | ไม่มี Flag/Job → ต้อง Recalculate ทั้งระบบด้วยมือ และไม่รู้ว่าทำครบหรือยัง |
| **`updatedBy` เป็น String เปล่า** | ไม่รู้ว่าใครปรับ ไม่มี FK ไม่มี Audit |
| **`riskLevelFinal` ที่ Officer ยืนยันแล้ว** | ถ้าคำนวณใหม่แล้ว `riskLevelAuto` เปลี่ยน — `riskLevelFinal` ที่คนยืนยันไว้จะเป็นอย่างไร? **ไม่มีกฎ** |

**แนวทางแก้ไข:**

1. **น้ำหนักเป็น Immutable Version** — ไม่ UPDATE แต่สร้าง Version ใหม่ (ดูข้อ 12)
2. **บันทึก Version ที่ใช้คำนวณ** ในทุก `FloodRiskProfile`
3. **Recalculation Job** — เมื่อสร้าง Version ใหม่ → สร้าง Job คำนวณใหม่ทั้งระบบ + แสดง Progress
4. **ระหว่างคำนวณใหม่** → Dashboard ต้องเตือนว่ากำลังใช้คะแนนผสม 2 Version
5. **กฎสำหรับ `riskLevelFinal`** — เมื่อ Auto เปลี่ยน ต้อง Flag ให้ Officer ทบทวนใหม่ (ไม่ใช่ทับเงียบๆ) เพราะ BR-19 บอกว่า Final คือค่าที่ Officer ยืนยัน
6. **เก็บ Snapshot ของ Input** — `FloodRiskProfile.factorSnapshot Json?` เก็บค่าปัจจัยที่ใช้คำนวณ → คำนวณย้อนหลังได้โดยไม่ต้องอ่านข้อมูลดิบ (ซึ่งอาจถูกแก้ไปแล้ว)

---

### ข้อ 11 — Risk Weight ควรเป็น Seed Data หรือจัดการผ่าน Admin UI?

## **ตอบ: ทั้งคู่ — Seed ค่าเริ่มต้น (Version 1) + Admin UI สร้าง Version ใหม่**

| ประเด็น | ข้อเสนอ |
|---|---|
| **Version 1** | ✅ Seed — เพื่อให้ระบบทำงานได้ทันที และ Version 1 ต้องถูก**รับรองโดยเจ้าของระบบ**ก่อน (ปัจจุบันน้ำหนักไม่มีที่มา — SEED-04) |
| **Version 2+** | ✅ Admin UI — ตาม FR-RSK-05 ("ปรับได้") |
| **ใครปรับได้** | ADMIN เท่านั้น (ไม่ใช่ OFFICER) — เพราะกระทบทั้งระบบ |
| **ต้องมีอะไรก่อนบันทึก** | Preview ผลกระทบ ("ถ้าใช้น้ำหนักใหม่ ครัวเรือน 47 หลังจะเปลี่ยนระดับ") + เหตุผล (บังคับ) + Audit |
| **ห้ามทำ** | ❌ UPDATE ทับ Version เดิม / ❌ ลบ Version / ❌ ปรับโดยไม่ระบุเหตุผล |

**⚠️ ประเด็นสำคัญ:** น้ำหนักปัจจุบัน (115) **ไม่มีเอกสารอ้างอิงว่ามาจากไหน** — ไม่มีงานวิจัย ไม่มีมติที่ประชุม ไม่มีการอ้างอิงมาตรฐาน → **ต้องได้รับการรับรองก่อนใช้จริง** เพราะเป็นตัวเลขที่ตัดสินว่า "คืนนี้ไปช่วยใครก่อน" (ดู Q-29)

---

### ข้อ 12 — ต้องเก็บประวัติการเปลี่ยนน้ำหนักหรือไม่?

## **ตอบ: ต้อง — และ Schema ปัจจุบันบล็อกไว้**

## 🔴 RISK-07 — BLOCKER: `factorCode @unique` ทำให้เก็บหลาย Version ไม่ได้

```prisma
// prisma/schema.prisma:1109-1120 — ปัจจุบัน
model RiskWeightConfig {
  factorCode    String   @unique  // ❌ 1 ปัจจัย = 1 แถว เท่านั้น
  weight        Float
  maxScore      Float
  effectiveFrom DateTime @default(now())  // ⚠️ มีเจตนาทำ Version แต่ทำไม่ได้
  updatedBy     String?  // ❌ ไม่มี FK
  // ❌ ไม่มี effectiveTo, version, isActive, reason
  // ❌ ไม่มี createdAt/updatedAt
}
```

**ปัญหา:** `@unique` + `effectiveFrom` ในตารางเดียวกัน = **ความตั้งใจขัดกันเอง** — มี `effectiveFrom` แสดงว่าอยากทำ Versioning แต่ `@unique` บังคับให้มีได้แถวเดียวต่อปัจจัย → **`effectiveFrom` จะถูกทับทุกครั้งที่ปรับ → ประวัติหายถาวร**

**ข้อเสนอ — แยกเป็น 2 ตาราง:**

```prisma
/// ⭐ ใหม่ — ชุดน้ำหนัก 1 Version (Immutable)
model RiskWeightVersion {
  id            String   @id @default(cuid())
  version       Int      @unique      /// 1, 2, 3...
  name          String?  /// เช่น "ปรับตามมติที่ประชุม 15/1/2569"
  reason        String   /// เหตุผลที่สร้าง Version นี้ (บังคับ)
  formulaVersion String  @default("1.0") /// Version ของสูตร

  status        RiskVersionStatus @default(DRAFT) /// DRAFT → ACTIVE → SUPERSEDED
  effectiveFrom DateTime?
  effectiveTo   DateTime?

  createdById   String
  createdAt     DateTime @default(now())
  approvedById  String?
  approvedAt    DateTime?

  weights       RiskWeightConfig[]
  profiles      FloodRiskProfile[]

  @@index([status, effectiveFrom])
  @@map("risk_weight_version")
}

enum RiskVersionStatus {
  DRAFT       // กำลังร่าง — ยังไม่ใช้
  ACTIVE      // ใช้อยู่ (มีได้เพียง 1)
  SUPERSEDED  // ถูกแทนที่แล้ว — เก็บไว้อ้างอิง
}

/// น้ำหนักปัจจัย 1 ตัว ใน Version หนึ่ง
model RiskWeightConfig {
  id            String   @id @default(cuid())
  versionId     String
  factorCode    String   /// ❌ ไม่ @unique แล้ว
  factorNameTh  String
  weight        Float
  description   String?
  sortOrder     Int      @default(0)

  /// ⭐ ที่มาของปัจจัยนี้ — ตรวจสอบได้ว่ามาจากข้อไหนบนกระดาษ
  sourceSection String?  /// เช่น "3"
  sourceQuestion String? /// เช่น "1"
  requiresGis   Boolean  @default(false)  /// true = ต้องใช้ GIS (FAR_FROM_EVAC)

  version       RiskWeightVersion @relation(fields: [versionId], references: [id])

  @@unique([versionId, factorCode])   /// ⭐ unique ต่อ Version ไม่ใช่ global
  @@map("risk_weight_config")
}
```

**Constraint สำคัญ:**
```sql
-- มี ACTIVE ได้เพียง Version เดียว
CREATE UNIQUE INDEX ux_risk_version_active
  ON "risk_weight_version" ((1)) WHERE status = 'ACTIVE';
```

**⚠️ `maxScore` ถูกลบออก** — เพราะปัจจุบัน `maxScore = weight` ทุกแถว (ซ้ำซ้อน 100%) และการมี 2 ฟิลด์ที่ต้องเท่ากันเสมอคือแหล่งของบั๊ก → ถ้าจำเป็นให้คำนวณจาก `weight`

---

## ข้อเสนอ Risk Model ฉบับสมบูรณ์

### สูตรที่เสนอ

```
สำหรับแต่ละปัจจัย i:
  factorValue[i] ∈ [0, 1]   (0 = ไม่เสี่ยง, 1 = เสี่ยงเต็ม)
  available[i]   ∈ {true, false}  (มีข้อมูล HAS_VALUE หรือ EXPLICIT_NONE)

rawScore              = Σ (factorValue[i] × weight[i])  สำหรับ i ที่ available
maximumPossibleScore  = Σ (weight[i])                    สำหรับ i ที่ available
totalSystemWeight     = Σ (weight[i])                    สำหรับ i ทั้งหมด (= 115)

normalizedScore       = rawScore / maximumPossibleScore × 100   (เท่าที่รู้ เสี่ยงกี่ %)
absoluteScore         = rawScore / totalSystemWeight × 100      ⭐ ใช้จัดระดับ

dataCompleteness      = maximumPossibleScore / totalSystemWeight
verificationLevel     = Σ(weight[i] ที่ผ่าน Double-entry) / maximumPossibleScore
riskConfidence        = dataCompleteness × (0.7 + 0.3 × verificationLevel)

riskLevelAuto = classify(absoluteScore)   ถ้า riskConfidence >= 0.6
              = null (แสดง "ข้อมูลไม่พอประเมิน")  ถ้า riskConfidence < 0.6

// Hard Rules (ทับผลการคำนวณ)
if (มีผู้ป่วยติดเตียง OR มีผู้ป่วยฟอกไต)  → riskLevelAuto = max(riskLevelAuto, HIGH)
```

### Hard Rules — ต้องมีที่เก็บ

**สิ่งที่เอกสารระบุ:** `system-analysis.md:892` — *"Hard Rules: **ติดเตียง/ฟอกไต → บังคับ ≥ "สูง"**"*
**สถานะปัจจุบัน:** ❌ **ไม่มีที่เก็บเลย** — อยู่ใน Comment ของเอกสารเท่านั้น

**เช่นเดียวกับ:** `seed.ts:168` — *"P2, // **≥32 สัปดาห์ จะยกเป็น P1**"* → กฎ Triage อยู่ใน Comment

**ข้อเสนอ:**
```prisma
/// ⭐ ใหม่ — กฎบังคับที่ทับผลการคำนวณ
model RiskHardRule {
  id            String   @id @default(cuid())
  versionId     String   /// ผูกกับ RiskWeightVersion
  code          String   /// เช่น "BEDRIDDEN_MIN_HIGH"
  nameTh        String   /// "ผู้ป่วยติดเตียงต้องเป็นความเสี่ยงสูงขึ้นไป"
  conditionType String   /// "HAS_VULNERABILITY_TYPE" | "PREGNANCY_WEEKS_GTE" | ...
  conditionValue Json    /// { "vulnerabilityCode": "BEDRIDDEN" } | { "weeks": 32 }
  effect        String   /// "MIN_RISK_LEVEL" | "SET_TRIAGE"
  effectValue   String   /// "HIGH" | "P1"
  reason        String   /// ที่มาของกฎ
  isActive      Boolean  @default(true)

  @@unique([versionId, code])
  @@map("risk_hard_rule")
}
```

**⚠️ กฎที่ต้องมีอย่างน้อย (ต้องรับรอง):**
| กฎ | ที่มา | สถานะ |
|---|---|---|
| ติดเตียง → Risk ≥ HIGH | system-analysis.md:892 | ✅ ระบุแล้ว |
| ฟอกไต → Risk ≥ HIGH | system-analysis.md:892 | ✅ ระบุแล้ว |
| หญิงตั้งครรภ์ ≥32 สัปดาห์ → Triage P1 | seed.ts:168 (Comment) | ⚠️ ต้องรับรอง |
| ติดเตียง → Triage P1 | seed.ts:153 (`basePriority: P1`) | ✅ อยู่ใน Master Data แล้ว |

---

### สรุปฟิลด์ที่เสนอสำหรับ `FloodRiskProfile`

```prisma
model FloodRiskProfile {
  // ═══ Score (แยก 4 ค่า) ═══
  rawScore              Float?   /// Σ(Factor × Weight) — สูงสุด 115
  maximumPossibleScore  Float?   /// Σ(Weight ที่มีข้อมูล)
  normalizedScore       Float?   /// rawScore/maxPossible × 100 — "เท่าที่รู้"
  absoluteScore         Float?   /// ⭐ rawScore/115 × 100 — ใช้จัดระดับ

  // ═══ Confidence (3 มิติ) ═══
  riskDataCompleteness  Float?   /// 0-1
  riskVerificationLevel Float?   /// 0-1
  riskConfidence        Float?   /// 0-1 (แสดงต่อผู้ใช้)
  riskFactorsUsed       Int?
  riskFactorsTotal      Int?     /// ❌ ลบ @default(12) — อ่านจาก Version

  // ═══ Level ═══
  riskLevelAuto         RiskLevel?          /// null = ข้อมูลไม่พอประเมิน
  riskLevelSurveyor     SurveyorRiskLevel?  /// ⭐ enum ใหม่ 3 ระดับ (AMB-05)
  riskLevelFinal        RiskLevel?
  riskLevelOverrideReason String?
  needsReview           Boolean  @default(false)  /// ⭐ true = Auto เปลี่ยนหลัง Final ถูกยืนยัน

  // ═══ Traceability ═══
  riskFormulaVersion    String?
  riskWeightVersionId   String?
  factorSnapshot        Json?    /// ⭐ ค่าปัจจัยที่ใช้คำนวณ — อธิบายย้อนหลังได้
  appliedHardRules      String[] /// ⭐ กฎที่ถูกใช้
  computedAt            DateTime?
}
```

---

## ตารางสรุปปัญหา (Risk Model)

| ID | ระดับ | ปัญหา | ไฟล์ | Module |
|---|---|---|---|---|
| RISK-01 | 🔴 BLOCKER | น้ำหนัก 115 vs CHECK 0-100 — Constraint จะปฏิเสธครัวเรือนเสี่ยงสูงสุด | SQL:284-286, seed.ts:310-321 | M09 |
| RISK-02 | 🔴 BLOCKER | สูตร Normalize ทำให้ข้อมูลขาด → คะแนนพุ่ง 100 (CRITICAL ปลอม) | system-analysis.md:887 | M09, M11 |
| RISK-07 | 🔴 BLOCKER | `factorCode @unique` → เก็บ Version/ประวัติน้ำหนักไม่ได้ | schema.prisma:1111 | M09, M17 |
| RISK-03 | 🟠 HIGH | Threshold มีช่องว่าง (25.5 ไม่มีระดับ) + อยู่ใน Comment + ไม่ระบุอิงคะแนนไหน | schema.prisma:119-124 | M09 |
| RISK-04 | 🟠 HIGH | ไม่มีกฎ ILLEGIBLE/BLANK + 3/5 ปัจจัย "NO_*" แยก "ไม่มี" จาก "ไม่ได้ถาม" ไม่ได้ | — | M09, M03 |
| RISK-05 | 🟠 HIGH | Confidence นับจำนวน ไม่ถ่วงน้ำหนัก → ปัจจัยเบา 6 ตัวได้ Confidence สูงกว่าปัจจัยหนัก 3 ตัว | schema.prisma:980-982 | M09 |
| RISK-06 | 🟠 HIGH | เปลี่ยนน้ำหนัก → คะแนนเก่ากลายเป็นตัวเลขกำพร้า เทียบกันไม่ได้ | schema.prisma:1109-1120 | M09 |
| RISK-08 | 🟠 HIGH | ไม่มี `riskFormulaVersion` (CLAUDE.md บังคับ) | schema.prisma:945-1000 | M09 |
| RISK-09 | 🟠 HIGH | Hard Rules (ติดเตียง/ฟอกไต → ≥HIGH) ไม่มีที่เก็บ อยู่ใน Comment | system-analysis.md:892 | M09 |
| RISK-10 | 🟡 MEDIUM | 61% ของน้ำหนัก (70/115) มาจากฟิลด์ที่ไม่ผ่าน Double-entry แต่ VERIFIED บอกว่าตรวจแล้ว | — | M04, M09 |
| RISK-11 | 🟡 MEDIUM | `FAR_FROM_EVAC` (w=6) ต้องใช้ `EvacuationSite` ที่ยังไม่มีใน Seed → ขาดทุกครัวเรือนตั้งแต่วันแรก | seed.ts:321 | M09, M13 |
| RISK-12 | 🟡 MEDIUM | น้ำหนัก 115 ไม่มีที่มา/ไม่มีการรับรอง | seed.ts:309-322 | M09 |
| RISK-13 | 🟡 MEDIUM | Views ไม่กรอง VERIFIED → Risk ของข้อมูลไม่ยืนยันขึ้น Dashboard/Map | SQL:195-258 | M10, M11 |
| RISK-14 | 🟢 LOW | `maxScore` ซ้ำกับ `weight` ทุกแถว (ซ้ำซ้อน 100%) | seed.ts:310-321 | M09 |
