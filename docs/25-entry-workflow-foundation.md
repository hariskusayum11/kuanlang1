# 25 — Entry Workflow Foundation (Vertical Slice รอบแรก)

> รอบงาน: 2026-07-22 · ต่อจาก docs/24 (Design) — สร้างจริงเท่าที่ Schema + Owner Decisions รองรับ
> สถานะ: **พัฒนาเสร็จ ยังไม่ commit** (รอ review)
>
> ⚠️ **Superseded บางส่วนโดย Owner Decision (docs/26):** สมมติฐาน "Work Queue — ระบบแจกใบงาน"
> ในเอกสารนี้ (หยิบงาน/คืนใบ/claimNextSheet/ResumeCard countdown) **ถูกแทนที่ด้วย
> Paper Batch Assignment Workflow** — หัวหน้าแจกปึกกระดาษ เจ้าหน้าที่เปิดใบด้วยรหัส (`openSheetByCode`)
> ส่วน Lock atomic, Wizard, Design System, guards และ tests ยังใช้ต่อทั้งหมด — ดู docs/26 §16

## 1. Architecture ที่เลือกและเหตุผล

| การตัดสินใจ | เหตุผล |
|---|---|
| **Core แยกจาก Server Actions** — logic อยู่ `lib/entry/claim.ts` รับ `AuthorizationContext` เป็น parameter; `lib/entry/actions.ts` ("use server") เป็นชั้นบางที่โหลด ctx จาก session จริง | ทดสอบ concurrency/scope ด้วย vitest ได้ (vitest ไม่มี request context) — pattern เดียวกับ `load-authorization.ts` ใน docs/23 |
| **Atomic claim ด้วย conditional `updateMany`** (ไม่ใช้ raw SQL / FOR UPDATE) | `updateMany where (ยังว่าง) → count===1` เป็น atomic ใน PostgreSQL — แพ้การแข่งขันได้ count 0 แล้วลองใบถัดไป; ไม่ต้องพึ่ง advisory lock, พิสูจน์ด้วย integration test ยิงพร้อมกัน |
| **Lock หมดอายุ = งานว่าง (takeover ตอน claim)** — ไม่มี cron รอบนี้ | พฤติกรรมถูกต้องโดยไม่มี background job: เงื่อนไข claim ยอมรับ `LOCKED && lockExpiresAt <= now` — cron ปลด lock เป็น optimization ภายหลัง |
| **Route group แยก**: `/surveys` อยู่ใน `(dashboard)` (มี sidebar), `/surveys/entry/[sheetId]` อยู่ `(entry)` (เต็มจอ) | Entry Console ต้องไร้สิ่งรบกวน (docs/24 §4) — path ไม่ชนกันเพราะคนละ segment |
| **Layout guard เปลี่ยนจาก "ต้องมี dashboard.view" → "ต้องมีเมนูที่มองเห็น ≥1"** และให้แต่ละ page enforce permission ของตัวเอง | DATA_ENTRY ไม่มี `dashboard.view` (docs/10 🔸) แต่ต้องเข้า `/surveys` ได้ — สิทธิ์รายหน้า: `/dashboard` = dashboard.view (ไม่มี → redirect `defaultLandingPath`), `/surveys` = `requirePermission(survey.entry)` |
| **ไม่เพิ่ม permission string ใหม่** | `survey.entry` ที่มีอยู่ครอบคลุมทั้ง slice — least privilege ไม่ต้องขยาย role ใด |
| **Wizard config เป็นข้อมูล** (`lib/entry/steps.ts`) render ผ่าน `FieldInput` generic | ฟิลด์/ลำดับ/ตัวเลือกตรวจกับ docs/03 ได้เป็น unit test — กัน drift จากกระดาษ |

## 2. Entry Workflow ที่สร้างจริง

```
Login → /dashboard (ไม่มี dashboard.view → redirect /surveys อัตโนมัติ)
  → /surveys  คิวงาน: งานที่ถือค้าง (Resume/หยิบกลับ/คืนใบ) + ปุ่มหยิบงาน + ตาราง Batch (aggregate)
  → หยิบงาน (atomic claim, lock 10 นาที) → /surveys/entry/[sheetId]
  → Wizard 9 ขั้น (ตรงกระดาษ) — เดินหน้า/ย้อนกลับ/คลิกข้าม step, progress bar,
    นับถอยหลัง lock + ต่ออายุ (อัตโนมัติเมื่อเปลี่ยน step + ปุ่ม manual),
    F2 = อ่านไม่ออก, F3 = ว่างในกระดาษ (ต่อฟิลด์), skip logic กลุ่มเปราะบาง,
    ตารางเปราะบางเพิ่ม/ลบแถว, ช่อง detail ตาม requiresDetail ของ Master Data
  → คืนใบ (release → PENDING) หรือ lock หมดอายุ → overlay หยิบกลับ/กลับคิว
  → ปุ่ม "ส่งใบ" ปิดไว้ (ยังไม่สร้าง Household — ดู §6)
```

สถานะใบที่ผู้ใช้เห็น: ว่าง (PENDING) · ถูกล็อกโดยตน (นับถอยหลัง) · ล็อกหมดอายุ · ถูกผู้อื่นใช้งาน · สถานะอื่น (ENTERED_1 ฯลฯ — ข้อความไทยอธิบายต่อสถานะ)

## 3. Permission & Community Scope (บังคับฝั่ง server ทุกจุด)

- ทุก query/mutation ผ่าน core ที่ตรวจ `hasPermission(ctx, survey.entry)` ก่อนเสมอ — ctx มาจาก session จริง (`getAuthorizationContext`) ไม่รับจาก client
- Scope: global (ADMIN/EXECUTIVE) เห็นทุกชุมชน · scoped เห็นเฉพาะ `UserCommunityScope` · **scope ว่าง = ไม่มีงาน ไม่ fallback**
- IDOR: เข้าใบนอก scope → ตอบ `NOT_FOUND` (ไม่บอกว่าใบมีจริง) · `sheetId` ตรวจ zod cuid ก่อนใช้
- หน้า `/surveys` แสดงเฉพาะ aggregate ของ Batch (code/ชุมชน/ตัวเลข) — **ไม่มี PII ในหน้ารายการ**

## 4. Lock Lifecycle & Concurrency

| เหตุการณ์ | กลไก |
|---|---|
| หยิบงาน | `updateMany` เงื่อนไข `PENDING` หรือ `LOCKED+หมดอายุ` → ตั้ง `lockedById/lockedAt/lockExpiresAt(+10นาที)` — count 1 = ได้, 0 = แพ้แข่ง → ลองใบถัดไป (สูงสุด 5 candidate) |
| ถือได้ครั้งละ 1 ใบ | claim ใหม่ขณะถือ lock ที่ยังไม่หมดอายุ → คืนใบเดิม (`resumed: true`) — กันกักตุน |
| ต่ออายุ | เจ้าของ + ยังไม่หมดอายุเท่านั้น — เรียกอัตโนมัติเมื่อเปลี่ยน step |
| หมดอายุ | เจ้าของเดิมเห็น `LOCK_EXPIRED` (หยิบกลับได้ถ้ายังว่าง) · ผู้อื่น takeover ผ่าน claim ปกติ |
| คืนใบ | เจ้าของเท่านั้น → `PENDING` + ล้าง lock fields ทั้งหมด |
| Batch status | ใบแรกถูกหยิบ → `READY_FOR_ENTRY → IN_PROGRESS` (conditional — idempotent) |

## 5. Route / หน้าจอ / ไฟล์

| ส่วน | ไฟล์ |
|---|---|
| Core | `lib/entry/lock.ts` (pure), `lib/entry/claim.ts` (queries+mutations), `lib/entry/actions.ts` (server actions + zod), `lib/entry/steps.ts` (wizard config), `lib/entry/master-data.ts` |
| หน้า | `app/(dashboard)/surveys/page.tsx` (คิวงาน), `app/(entry)/surveys/entry/[sheetId]/page.tsx` (guard + wizard), `app/(entry)/layout.tsx` |
| Components | `components/entry/entry-wizard.tsx`, `field-input.tsx`, `vulnerable-grid.tsx`, `claim-button.tsx`, `resume-card.tsx`, `sheet-gate.tsx` |
| ปรับเดิม | `app/(dashboard)/layout.tsx` (guard ใหม่), `app/(dashboard)/dashboard/page.tsx` (landing redirect), `components/layout/app-header.tsx` (title ตามเมนู), `lib/navigation.ts` (`defaultLandingPath` + surveys implemented) |
| Dev tooling | `scripts/create-dev-batch.ts` + npm `dev:create-batch` + `.env.example` placeholders |
| Tests | `tests/unit/entry.test.ts` (14), `tests/integration/entry.test.ts` (12), แก้ assertion 1 ข้อใน `tests/unit/authz.test.ts` |

## 6. สิ่งที่บันทึก / ตั้งใจไม่บันทึก (Security Boundary)

**บันทึกลง DB:** เฉพาะสถานะ workflow บน `PaperSheet` (`status`, `lockedById`, `lockedAt`, `lockExpiresAt`) และ `PaperBatch.status` — ไม่มีข้อมูลจากแบบสอบถามแม้แต่ฟิลด์เดียว

**ตั้งใจไม่บันทึก (Owner Decision — payload plaintext ยังไม่อนุมัติ):**
- คำตอบทุกช่องของ wizard อยู่ใน **client memory เท่านั้น** — banner แจ้งชัด "โหมดทดลองคีย์ ปิดหน้าแล้วข้อมูลหาย" + เตือน `beforeunload`
- ไม่สร้าง `EntryAttempt` (จึงไม่มี payload), ไม่สร้าง `Household`, ไม่สร้าง `FieldStatus`
- ปุ่ม "ส่งใบ" ปิดใช้งาน — Submit จะเปิดเมื่อกลไกจัดเก็บที่อนุมัติแล้วพร้อม
- ไม่มี encryption ชั่วคราว (ห้ามตามคำสั่ง)

## 7. Tests (พิสูจน์พฤติกรรมสำคัญ)

- **Unit (14):** lock helpers · step config ตรง data dictionary (ไม่มี `lastFloodYear`/`lineUserId`, ชื่อไม่ซ้ำ, masterKey ถูก, critical ⭐ ครบ, ระดับน้ำ 2 ช่องดิบ, skip logic, risk 3 ตัวเลือก) · `defaultLandingPath`
- **Integration (12, sequential):** no-permission → FORBIDDEN · scope ว่าง → NO_WORK ไม่ fallback · overview เห็นเฉพาะ scope · **หยิบพร้อมกัน 2 คนใบเดียว → เจ้าของคนเดียว** (Promise.all, ไม่มี sleep/retry) · resume ใบเดิม · owner OK / non-owner NOT_OWNER / นอก scope NOT_FOUND (IDOR) · renew เฉพาะเจ้าของ · expired → LOCK_EXPIRED + takeover + renew ไม่ได้ · release เฉพาะเจ้าของ + ล้าง lock · claimSheetById ตาม scope · batch → IN_PROGRESS · **ไม่มี Household/EntryAttempt เกิดขึ้น** · fixtures สังเคราะห์ (`test-entry-*@test.invalid`, `TEST-ENTRY-*`) ลบครบใน afterAll

## 8. ผล Verification (2026-07-22)

| รายการ | ผล |
|---|---|
| docker compose ps | healthy |
| prisma validate / migrate status | ผ่าน · 3 migrations ไม่มี drift (ไม่แตะ schema) |
| Unit tests | 69/69 |
| Integration tests | 43/43 |
| tsc --noEmit | ผ่าน |
| next build | ผ่าน — เพิ่ม `/surveys`, `/surveys/entry/[sheetId]` |
| dev:create-batch | รัน 2 ครั้ง idempotent (BATCH-DEV-TK01-001, 5 ใบ) |
| Browser (ไม่ login) | `/surveys` และ `/surveys/entry/*` → redirect `/login` · ไม่มี secret ใน HTML · ไม่มี server error · ปิด server แล้ว |

หมายเหตุ: พฤติกรรมหลัง login พิสูจน์ด้วย integration tests (นโยบาย: ไม่กรอกรหัสผ่านจริงใน browser อัตโนมัติ) — ผู้ใช้ทดลองเองได้ด้วย dev-admin หลังรัน `npm run dev:create-batch`

## 8.1 Design System & Premium UI (รอบยกระดับ)

ยกระดับจาก inline slate/blue ที่กระจัดกระจาย → **Design Token System กลาง** ใน `app/globals.css` (Tailwind v4 `@theme`)
แนวทาง: *Modern Government / Enterprise · Calm · Trustworthy · Data-focused · Premium but restrained*

**Design Tokens ที่เพิ่ม/ปรับ:**
- **ฟอนต์:** IBM Plex Sans Thai (ผ่าน `next/font/google` — **self-host ตอน build ไม่มี runtime request ออกภายนอก**), weights 400/500/600/700, subset thai+latin → `--font-ibm-thai` → `--font-sans`
- **สี Brand:** สเกล denim/royal blue `--color-brand-50..950` (ไม่ใช่ฟ้า default ของ Tailwind) · **Ink** navy เกือบดำ `--color-ink-700..950` สำหรับ sidebar/หน้า login
- **Canvas** `#f4f6fb` (ไม่ใช่ขาวล้วน) · **Radii** `--radius-lg/xl/2xl` · **Shadows** `--shadow-xs..lg` (layered, restrained)
- **Status:** เขียว=emerald (สำเร็จ/verified) · เหลือง=amber (warning/ILLEGIBLE) · แดง=red (error/critical เท่านั้น) · เทา=slate (missing/BLANK) — ตรงกติกา CLAUDE.md
- **Animations:** `fade-in`, `step-in`, `rise`, `shimmer` (skeleton) — เคารพ `prefers-reduced-motion`

**Component Primitives (`@layer components`):** `.card`, `.btn` (+primary/secondary/ghost/warning · sm/md/lg), `.field`, `.label`, `.badge` (+brand/success/warning/danger/neutral), `.skeleton`, `.kbd` — แหล่งเดียวของภาษาออกแบบ

**UX improvements:**
- Sidebar navy พร้อมไอคอนเส้น + แถบ active accent · Header sticky + avatar initials · title ตามหน้า
- Login: หน้า navy พร้อม grid pattern/radial glow นิ่ง ๆ + การ์ดลอย
- Queue "งานคีย์ของฉัน": summary tiles สีตามสถานะ (รอคีย์/กำลังคีย์/คีย์แล้ว) + ResumeCard นับถอยหลังสด + ตาราง Batch มี progress bar + empty state ออกแบบ
- Wizard: รางซ้าย (ข้อมูลใบ + lock countdown แบบ bar สงบ เขียว→เหลือง→แดง + step nav มี ✓ เมื่อผ่าน) · step transition (`animate-step-in`) · progress bar · แถบ "โหมดทดลองคีย์" + kbd hints (F2/F3) · radio เป็น chip มีเลขกำกับ · boolean เป็น segmented control · checkbox chips · vulnerable grid การ์ดต่อคน
- States ครบ: Loading (skeleton `loading.tsx`), Empty (queue/batch), Error (login alert), Disabled (ปุ่มส่งใบ), Success (toast/redirect), Lock-expired overlay, not-found page

**Accessibility:** `:focus-visible` ring ทั้งระบบ · `aria-current` บน nav/step · `role="alert"`/`role="status"` · contrast ผ่าน (navy/white, brand-600 บนขาว) · keyboard: Tab + F2/F3 + ปุ่มลัด · line-height 1.6 สำหรับสระไทยบน/ล่าง

**Responsive (ตรวจด้วยสายตา 3 viewport):**
- **Desktop 1440:** wizard 2 คอลัมน์ (ราง 288 + เนื้อหา 780) · queue/dashboard max-w จัดกึ่งกลาง
- **Tablet 768:** wizard ยัง 2 คอลัมน์ · ตาราง scroll แนวนอนในกรอบตัวเอง
- **Mobile 375:** ทุกอย่าง stack · summary tiles เรียงแนวตั้ง · ResumeCard/labels wrap ไม่ล้น · Thai ไม่แตก · sidebar เป็น drawer

**Screens/routes ที่ตรวจด้วยสายตา:** `/login` (desktop) · Wizard step 1/2/4/5 (tablet — radio chips, boolean segmented, vulnerable grid, selected states, live lock countdown) · Queue (desktop + mobile) — ทั้งหมดผ่าน hydration ไม่มี error, countdown ไม่กระพริบ (แก้ด้วย `initialRemainingMs` จาก server)

> การตรวจสายตาใช้หน้า preview ชั่วคราว (dev-only, guard production, **ลบทิ้งแล้ว ไม่ commit**) render component จริงด้วย synthetic props — เพราะ policy ของ session นี้ไม่กรอกรหัสผ่านจริงใน browser · หน้าที่อยู่หลัง auth (dashboard, access-denied) ใช้ primitives ชุดเดียวกันที่ตรวจแล้ว + code review

**จุดที่ยังไม่ถึง Premium เต็มที่ (รอบถัดไป):** toast component จริง (ตอนนี้ใช้ redirect/inline) · keyboard เลข 1-9 เลือก radio (มีเลขกำกับแล้ว แต่ยังไม่ผูก key) · empty state ภาพประกอบ · dark mode · focus trap ใน modal overlay · virtualized table เมื่อ Batch เยอะ

## 9. Known Limitations

1. คำตอบไม่ถูกบันทึก — refresh/ปิดหน้า = หายทั้งหมด (by design ตาม Owner Decision)
2. ยังไม่มี auto-save/Draft/Resume ของคำตอบ (Phase C — รอกลไกเข้ารหัส)
3. Keyboard ยังมีเฉพาะ F2/F3 + Tab ปกติ — ยังไม่มีเลข 1-9 เลือกตัวเลือก, Ctrl+Enter (จะมีเมื่อ Submit เปิด)
4. ไม่มี cron ปลด lock ค้าง (takeover ตอน claim ทดแทนแล้ว — เพิ่มภายหลังได้)
5. หน้า Batch management (COORDINATOR สร้าง/ปิด Batch) ยังไม่มี — ใช้ dev script แทน
6. Validation เชิงธุรกิจ (เบอร์โทร, ช่วงตัวเลข, cross-check) ยังไม่ใส่ — รอรอบที่มีการบันทึกจริง (validate สิ่งที่ไม่ได้เก็บไม่มีความหมาย)
7. Mobile (<768px): ใช้ได้แบบ stack แต่ Entry Console ออกแบบเพื่อ desktop/notebook + คีย์บอร์ดจริง

## 10. สิ่งที่ถูก Block โดย Owner Decision

- **Draft persistence + Submit (สร้าง Household)** — ต้องเก็บคำตอบ (มี PII/สุขภาพ) ใน `EntryAttempt.payload` ซึ่ง schema ระบุ 🔒 ต้องเข้ารหัส → รอการอนุมัติกลไก encryption ที่เหมาะกับ Production
- Blind Entry 2 / Discrepancy / Verification — นอกเป้าหมายรอบนี้ (สถาปัตยกรรมรองรับแล้ว: `CriticalFieldConfig` + `EntryAttempt.attemptNo` + สถานะใบครบ)

## 11. Phase ถัดไปที่เสนอ

1. **ตัดสินใจกลไกจัดเก็บคำตอบ** (encryption at app-layer? pgcrypto? KMS?) → ปลดล็อก Draft + Submit
2. Submit Entry 1 (สร้าง Household + ตารางลูกใน transaction) + validation ชุดเต็ม (docs/24 §7)
3. Batch management UI สำหรับ COORDINATOR (แทน dev script)
4. Cron ปลด lock ค้าง + `EntryStats` รายวัน
5. Keyboard ครบชุด (เลข 1-9, Ctrl+Enter) + jsdom component tests
