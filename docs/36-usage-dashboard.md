# 36 — สถิติการใช้งานบนหน้าตั้งค่าระบบ (Usage Dashboard)

> เฟส 5 ของแผนหลังประชุมเจ้าของระบบ 2026-10-19 · หน้า `/settings` · สิทธิ์ `settings.view` (ADMIN)

## 1. คำตัดสินของเจ้าของระบบ (2026-10-19)

* นับยอดเปิดหน้าเว็บเป็น **ตัวเลขรวมเท่านั้น** — **ไม่เก็บ IP ไม่เก็บ User Agent ไม่เก็บ userId**
  และไม่เก็บเวลารายครั้ง
* ข้อมูล Login/การใช้งานอื่น ให้ **ใช้ของที่มีอยู่แล้ว** (Audit Log, `User.lastLoginAt`,
  `RegistrationRequest`, `Household`) — ไม่สร้างการเก็บข้อมูลรายบุคคลเพิ่ม

## 2. การนับยอดเปิดหน้า

```
เบราว์เซอร์ (PageViewBeacon ใน app/layout.tsx)
  └─ เปลี่ยนหน้า → navigator.sendBeacon("/api/page-view", { path: pathname })
       └─ app/api/page-view/route.ts  (ตอบ 204 เสมอ)
            ├─ คัดทิ้ง: UA บอท/ว่าง · Sec-Purpose: prefetch · Sec-Fetch-Site ≠ same-origin
            │          · body ไม่ใช่ JSON / ไม่ผ่าน Zod / ยาวเกิน 1 KB
            ├─ audience = มี session จริงหรือไม่ (ตรวจฝั่ง server ไม่เชื่อ client)
            └─ lib/usage/page-view.ts → recordPageView()
                 ├─ normalisePagePath()  (domain/usage/page-path.ts)
                 └─ INSERT … ON CONFLICT (day, path, audience) DO UPDATE SET count = count + 1
```

### ตาราง `page_view_daily`

| คอลัมน์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `day` | `DATE` | วันตามเวลาไทย (UTC+7) |
| `path` | `VARCHAR(80)` | **รูปแบบเส้นทาง** เช่น `/verification/[householdId]` — CHECK `^/[A-Za-z0-9/_\[\]-]*$` |
| `audience` | `PageViewAudience` | `PUBLIC` (ไม่ได้ Login) / `SIGNED_IN` |
| `count` | `INTEGER` | CHECK `count >= 0` |

Primary key `(day, path, audience)` · Migration `20261019150000_page_view_daily` (เพิ่มอย่างเดียว ·
ย้อนกลับ: `DROP TABLE "page_view_daily"; DROP TYPE "PageViewAudience";`)

**ห้ามเพิ่มคอลัมน์ IP / UA / ผู้ใช้ / เวลา ภายหลังโดยไม่มีคำตัดสินใหม่** — เทสต์
`tests/integration/page-view.test.ts` ล็อกรายชื่อคอลัมน์ไว้

### ทำไม path เป็น whitelist

`normalisePagePath` จับคู่กับ `PAGE_ROUTES` เท่านั้น:

* เส้นทางที่รู้จัก → รูปแบบ (segment ที่เป็นรหัสกลายเป็น `[householdId]`, `[sheetId]`)
* query string / fragment / `/` ท้าย → ตัดทิ้ง (คำค้นอาจเป็นชื่อหรือเบอร์โทร)
* เส้นทางที่ไม่รู้จัก → `/_other` **ไม่เก็บข้อความดิบที่ client ส่งมาเด็ดขาด**
* `/api/*`, `/_next/*`, ไฟล์ที่มีนามสกุล → ไม่นับ

ผลคือไม่มีรหัสครัวเรือน/ใบ/คำค้นหลุดลงตาราง และแถวต่อวันมีจำกัด (จำนวนหน้า + 1) × 2

> ⚠️ **เพิ่มหน้าใหม่ในแอป = เพิ่มแถวใน `PAGE_ROUTES`** (`domain/usage/page-path.ts`)
> มิฉะนั้นจะถูกนับรวมใน "หน้าอื่น ๆ"

### ไม่บล็อกหน้าเว็บ

* `sendBeacon` ไม่รอผล · fallback เป็น `fetch(..., { keepalive: true })` ที่กลืน error
* route ตอบ 204 ทุกกรณี · `recordPageView` กลืน error และไม่ log path/รายละเอียด error
* React Strict Mode (dev) เรียก effect ซ้ำ → beacon กันส่ง path เดิมซ้ำภายใน 2 วินาที
* prefetch ของ `<Link>` ไม่ mount หน้า จึงไม่ถูกนับ

ข้อจำกัดที่รับทราบ: ยอดเป็น "จำนวนครั้งที่เปิดหน้า" ไม่ใช่ "จำนวนคน" (ไม่มีตัวระบุให้นับคนไม่ซ้ำ —
ตั้งใจ) · ผู้ปิด JavaScript ไม่ถูกนับ · ผู้ที่ตั้งใจยิง request เองยังปั่นยอดได้ แต่ทำได้เพียงเพิ่มตัวเลข
ของหน้าที่มีอยู่จริงเท่านั้น

## 3. ส่วนต่าง ๆ บนหน้า `/settings`

ช่วงข้อมูล **30 วันล่าสุดรวมวันนี้ ตามเวลาไทย** (`usageWindow` ใน `domain/usage/aggregate.ts`)
ทุกตัวเลขมีตัวหาร/ช่วงเวลากำกับ

| ส่วน | แหล่งข้อมูล | ตัวหาร |
| --- | --- | --- |
| การเปิดหน้าเว็บ (รายวัน ประชาชน/เจ้าหน้าที่ + หน้ายอดนิยม) | `page_view_daily` | ยอดรวมในช่วง · ร้อยละต่อยอดรวม |
| การเข้าสู่ระบบรายวัน + บัญชีไม่ซ้ำ | `audit_log` action `LOGIN` | 30 วัน |
| ใช้งานใน 7/30 วัน · ยังไม่เคย Login | `User.lastLoginAt` (`isActive = true`) | บัญชีที่เปิดใช้ทั้งหมด |
| การเปิดดู/ส่งออกข้อมูลอ่อนไหว ตามชนิดข้อมูล | `audit_log` action `READ` / `EXPORT` group by `entityType` | ยอดรวม READ / EXPORT ในช่วง |
| คำขอสมัคร รออนุมัติ/อนุมัติ/ปฏิเสธ/ยกเลิก | `registration_request` | คำขอทั้งหมด (ทุกช่วงเวลา) |
| แบบสอบถามที่คีย์/ตรวจรายวัน | `household.enteredAt` / `household.verifiedAt` (+ `paper_sheet.status = VERIFIED`) | ใบที่ใช้งานได้ทั้งระบบ |

หมายเหตุ:

* ส่วนข้อมูลอ่อนไหวแสดงเฉพาะ **ชนิดข้อมูล** (`entityType` ซึ่งมาจากโค้ด) ไม่แสดง `reason`
  เพราะบางจุดเป็นข้อความอิสระ · ไม่แสดงว่าใครเปิด
* "ตรวจแล้ว" นับเฉพาะใบที่ **ยังเป็น VERIFIED อยู่** — ใบที่ถูกแก้หลังตรวจกลับไปรอตรวจ (#R7-C)
  และไม่ถูกนับ ตัวเลขย้อนหลังจึงลดลงได้
* ใบที่ใช้งานได้ = ไม่ถูกลบ และไม่ใช่ใบซ้ำที่ยืนยันแล้ว (เหมือน `buildUsableHouseholdWhere`)
* ข้อมูล LOGIN และยอดเปิดหน้ามีเฉพาะตั้งแต่ระบบเริ่มบันทึก — ก่อนหน้านั้นแสดงเป็น "ยังไม่มี"
  ไม่สร้างตัวเลขสมมติ

กราฟเป็น HTML/CSS ล้วน (`components/usage/usage-charts.tsx`) ไม่มี charting library ·
มี hover/focus ดูตัวเลขรายวัน และ "ดูเป็นตาราง" ทุกกราฟ · คู่สีผ่าน palette validator
(brand-400/brand-600, brand-500/emerald-500)

สถานะหน้า: `loading.tsx` + `<Suspense>` (ฟอร์มตั้งค่าไม่ต้องรอ query สถิติ) · ถ้า query พัง
แสดงกล่อง error เฉพาะส่วนสถิติ ฟอร์มตั้งค่าด้านล่างยังใช้ได้ · ส่วนที่ไม่มีข้อมูลแสดงข้อความว่าง

## 4. RBAC

* หน้า: `requirePermission(SETTINGS_VIEW)`
* ข้อมูล: `loadUsageDashboard(ctx)` ตรวจ `settings.view` ซ้ำเองฝั่ง server → `FORBIDDEN`
  (เทสต์: EXECUTIVE / OFFICER / DATA_ENTRY ถูกปฏิเสธ)
* `POST /api/page-view` เปิดสาธารณะโดยตั้งใจ (ต้องนับผู้ชมที่ไม่ได้ Login) — เขียนได้อย่างเดียว
  คือ +1 ให้รูปแบบเส้นทางที่มีอยู่ ไม่คืนข้อมูลใด ๆ
* หน้านี้แสดงเฉพาะยอดรวม ไม่มี PII จึงไม่เขียน Audit READ ทุกครั้งที่เปิด

## 5. ไฟล์

* `prisma/schema.prisma` (`PageViewDaily`, `PageViewAudience`) · `prisma/migrations/20261019150000_page_view_daily/`
* `domain/usage/page-path.ts` · `domain/usage/aggregate.ts` (Pure Function)
* `lib/usage/page-view.ts` · `lib/usage/dashboard.ts`
* `app/api/page-view/route.ts` · `components/usage/page-view-beacon.tsx` · `app/layout.tsx`
* `components/usage/usage-charts.tsx` · `components/usage/usage-dashboard.tsx`
* `app/(dashboard)/settings/page.tsx` · `app/(dashboard)/settings/loading.tsx`
* เทสต์: `tests/unit/usage-dashboard.test.ts` · `tests/integration/page-view.test.ts`
