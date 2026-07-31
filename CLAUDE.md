# SKL-FRIS Project Instructions

## Project overview

SKL-FRIS คือระบบสารสนเทศการจัดการภัยพิบัติโดยชุมชนเป็นฐาน
ชื่อเต็ม: Song Khlong Khuan Lang Flood Resilience Information System

ระบบใช้สำหรับจัดเก็บ ตรวจสอบ วิเคราะห์ และนำเสนอข้อมูลครัวเรือน ความเปราะบาง ความเสี่ยงจากอุทกภัย ทรัพยากรชุมชน จุดอพยพ การเตือนภัย อาสาสมัคร และการช่วยเหลือในสถานการณ์ภัยพิบัติ

กระบวนการเก็บข้อมูลเริ่มต้นเป็นแบบ Paper-first:

1. ผู้สำรวจลงพื้นที่เก็บข้อมูลด้วยแบบสอบถามกระดาษ
2. เจ้าหน้าที่รับแบบสอบถามและจัดเป็น Batch
3. เจ้าหน้าที่คีย์ข้อมูลรอบเดียว (Single-Entry — ไม่คีย์ซ้ำสองรอบ)
4. Verifier ตรวจสอบข้อมูลที่คีย์ และสามารถแก้ไขข้อมูลได้โดยตรงหากพบข้อผิดพลาด (ทุกการแก้ไขต้องมี Audit Log เก็บค่าก่อน/หลังแก้ไข)
5. เมื่อ Verifier ยืนยันแล้ว ข้อมูลจึงเป็น VERIFIED
6. ข้อมูลที่ VERIFIED แล้วจึงนำไปคำนวณความเสี่ยง
7. ข้อมูลที่ผ่านการตรวจสอบจึงนำไปใช้ใน Dashboard, GIS, Reports และ Incident Management

หมายเหตุ (Owner Decision, 2026-07-22): เดิมออกแบบเป็น Blind Double-Entry (คีย์ 2 รอบโดยคนละคนแล้วเทียบหา Discrepancy) โครงสร้างฐานข้อมูลที่รองรับแนวทางนี้ (`EntryAttempt.attemptNo/isBlind`, `CriticalFieldConfig`, `Discrepancy`) ยังคงเก็บไว้ในสคีมาเผื่อเปิดใช้อีกครั้งในอนาคต (เช่น เฉพาะบางฟิลด์วิกฤต) แต่ปิดการใช้งานอยู่ในขณะนี้ — Flow ที่ใช้งานจริงคือ Single-Entry + Verifier ตรวจ/แก้ไขได้ตามข้างต้น

ก่อนวิเคราะห์หรือแก้ไขโค้ดทุกครั้ง ต้องอ่านไฟล์ที่เกี่ยวข้องในโฟลเดอร์ `docs/`, `prisma/` และ `database/`

## Initial communities

ระบบเริ่มต้นใช้งานกับชุมชน 5 แห่ง ในอำเภอหาดใหญ่ จังหวัดสงขลา

1. ชุมชนท่าเคียน

   * ตำบลควนลัง
   * อำเภอหาดใหญ่
   * จังหวัดสงขลา

2. ชุมชนประสานมิตร

   * ตำบลควนลัง
   * อำเภอหาดใหญ่
   * จังหวัดสงขลา

3. ชุมชนควนสันติ

   * ครอบคลุมตำบลควนลังและตำบลหาดใหญ่
   * อำเภอหาดใหญ่
   * จังหวัดสงขลา

4. ชุมชนปลักหว้า

   * ตำบลควนลัง
   * อำเภอหาดใหญ่
   * จังหวัดสงขลา

5. ชุมชนหน้าควน

   * ตำบลควนลัง
   * อำเภอหาดใหญ่
   * จังหวัดสงขลา

ระบบต้องรองรับการเพิ่มจังหวัด อำเภอ ตำบล หมู่บ้าน และชุมชนอื่นในอนาคต

ห้าม Hardcode ระบบให้รองรับเฉพาะจังหวัดสงขลา อำเภอหาดใหญ่ หรือตำบลควนลัง

ชุมชนหนึ่งแห่งสามารถครอบคลุมมากกว่าหนึ่งตำบลได้

## Coverage rules

ยกเลิกสมมติฐานว่าแต่ละชุมชนมีเป้าหมาย 600 ครัวเรือน

เป้าหมายจริงคือสำรวจให้ได้มากกว่าร้อยละ 60 ของจำนวนครัวเรือนทั้งหมดในแต่ละชุมชน

ระบบต้องเก็บ:

* จำนวนครัวเรือนทั้งหมดของชุมชน
* เปอร์เซ็นต์เป้าหมายการสำรวจ
* จำนวนแบบสอบถามที่ได้รับ
* จำนวนแบบสอบถามที่คีย์แล้ว
* จำนวนข้อมูลที่ VERIFIED แล้ว
* Survey Coverage
* Verified Coverage

ในช่วงเริ่มต้นยังไม่ทราบจำนวนครัวเรือนทั้งหมดของแต่ละชุมชน ดังนั้น `totalHouseholds` ต้อง Nullable ได้

ค่าเริ่มต้นของ `targetCoveragePercent` คือ 60

หาก Business Rule ใช้คำว่า “มากกว่าร้อยละ 60” เงื่อนไขการผ่านเป้าหมายต้องเป็น:

`coveragePercent > 60`

ห้ามนับข้อมูลสถานะ Draft, Duplicate, Cancelled, Rejected หรือ Invalid เป็น Verified Coverage

## Required technology

* Next.js App Router
* TypeScript strict mode
* PostgreSQL 16
* PostGIS
* Prisma ORM
* Better Auth
* Zod
* React Hook Form
* Tailwind CSS
* shadcn/ui
* TanStack Table
* Leaflet หรือ MapLibre
* Docker Compose
* Vitest
* Playwright

Redis, BullMQ และ MinIO/S3 ให้ใช้เมื่อมีความจำเป็นตาม Module เท่านั้น

ห้ามเปลี่ยน Technology Stack โดยไม่ได้รับอนุญาต

## Architecture rules

* ใช้ Next.js App Router
* ใช้ Server Components เป็นค่าเริ่มต้น
* ใช้ Client Components เฉพาะหน้าที่ต้องมี Interaction
* Business Logic ต้องแยกออกจาก UI
* Validation ต้องใช้ Zod ทั้งฝั่ง Client และ Server
* ห้ามเชื่อถือข้อมูลจาก Client
* RBAC ต้องตรวจฝั่ง Server ทุกครั้ง
* การซ่อนปุ่มใน UI ไม่ถือว่าเป็น Authorization
* ห้าม Hardcode Master Data ที่สามารถเก็บในฐานข้อมูลได้
* ห้ามใช้ `any` เว้นแต่มีเหตุผลและมี Comment อธิบาย
* Risk Calculation ต้องเป็น Pure Function และต้องมี Unit Test
* Database Operations ที่มีการแข่งขันกันต้องใช้ Transaction
* การ Pick งานคีย์ข้อมูลต้องป้องกันผู้ใช้สองคนหยิบใบเดียวกัน

## Authentication and roles

ระบบต้องรองรับบทบาทอย่างน้อย:

* DATA_ENTRY
* FIELD_SURVEYOR
* VERIFIER
* COORDINATOR
* OFFICER
* RESEARCHER
* EXECUTIVE
* VOLUNTEER หรือ RESCUE_VOLUNTEER
* ADMIN

ก่อนเริ่มพัฒนา ต้องตรวจสอบและกำหนดชื่อ Role ให้เป็นมาตรฐานเดียวกันทั้งเอกสาร Schema และ Code

ทุก Role ต้องรองรับ Community Scope หรือ Area Scope ตามสิทธิ์ที่กำหนด

## Privacy and security rules

ระบบมีข้อมูลส่วนบุคคล ข้อมูลสุขภาพ ข้อมูลกลุ่มเปราะบาง และพิกัดครัวเรือน

ข้อกำหนด:

* Public Portal ห้ามแสดงชื่อ เบอร์โทร บ้านเลขที่ หรือพิกัดรายบ้าน
* ห้ามเปิดเผยข้อมูลสุขภาพรายบุคคลใน Public API
* Volunteer เห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ
* DATA_ENTRY เห็นเฉพาะใบที่ตนเปิดคีย์อยู่ทีละใบ (เปิดจากรหัสบนกระดาษ) — ค้นหาครัวเรือนทั้งหมดหรือ Export ไม่ได้
* EXECUTIVE ดูข้อมูลภาพรวมได้ แต่แก้ข้อมูลไม่ได้
* ผู้ใช้ต้องไม่สามารถเข้าถึงข้อมูลข้าม Community Scope โดยไม่มีสิทธิ์
* ข้อยกเว้น Community Scope (Owner Decision 2026-07-24): **การคีย์ข้อมูล (DATA_ENTRY) ไม่ผูก Community Scope** — เจ้าหน้าที่คีย์เปิดใบจากรหัสบนกระดาษที่ถืออยู่ จึงคีย์ชุมชนไหนก็ได้ (ยังปลอดภัยเพราะเห็นได้แค่ใบเดียวที่เปิด ค้น/Export ไม่ได้ และใบ PENDING ไม่มีข้อมูลบุคคล)
* Global Community Scope เป็น **ธงระดับบัญชี** (`User.hasGlobalCommunityScope`) ไม่ใช่ระดับ Role (Owner Decision 2026-07-31) — ผู้ตรวจที่ต้องเห็นคิวทุกชุมชนให้เปิดธงนี้เป็นรายคน **ห้ามเพิ่ม Role ใดเข้า `GLOBAL_SCOPE_ROLES` เพื่อให้เห็นทั้งระบบ** โดยเฉพาะ Legacy Role ที่ยังค้างอยู่ใน enum และ **ห้ามใส่ OFFICER เข้า `GLOBAL_SCOPE_ROLES`** (`GLOBAL_SCOPE_ROLES` = ADMIN + EXECUTIVE เท่านั้น ตาม docs/10 §1)
* ธง Global Scope แก้ได้เฉพาะผู้มีสิทธิ์ `user.manage` **และห้ามแก้ของตนเอง** (กันยกระดับสิทธิ์ตัวเอง) ทุกครั้งต้องมี Audit Log ค่าก่อน/หลัง
* เมื่อผู้ตรวจเห็นได้กว้าง หน้าคิวตรวจสอบต้องจัดกลุ่มเป็นลำดับชั้น **ชุมชน → ปึก (Batch) → คนกรอก** พร้อมตัวกรอง เพื่อให้ยังตรวจง่ายแม้คิวยาว (ดู `domain/verification/group-queue.ts`) ทั้งนี้ **Dashboard/Reports/การจัดการชุมชนและปึกยังบังคับ Community Scope เข้มตามปกติ**
* ทุกการเปิดดู แก้ไข หรือ Export ข้อมูลอ่อนไหวต้องมี Audit Log
* ห้ามบันทึก Secret หรือรหัสผ่านลง Git
* ห้าม Log ชื่อ เบอร์โทร ข้อมูลสุขภาพ Consent หรือพิกัดรายบ้าน
* ใช้ Soft Delete เป็นค่าเริ่มต้น
* ห้าม Hard Delete เว้นแต่เป็นกระบวนการ PDPA ที่ได้รับอนุญาต
* ข้อมูลที่ระบุว่าเข้ารหัสต้องมีการเข้ารหัสจริง ไม่ใช่เพียง Comment ใน Schema

## Data-entry rules

* ลำดับฟิลด์ต้องตรงกับแบบสอบถามกระดาษ
* ฟอร์มต้องสามารถใช้งานด้วย Keyboard ได้
* Tab order ต้องถูกต้อง
* Ctrl+Enter ใช้ส่งแบบฟอร์ม
* F2 ใช้ระบุ ILLEGIBLE
* F3 ใช้ระบุ BLANK_IN_PAPER
* ห้ามบังคับให้ผู้คีย์เดาค่าที่อ่านไม่ออก
* Auto-save ต้องไม่ทำให้ข้อมูลสูญหาย
* คีย์ข้อมูลรอบเดียว (Single-Entry) — ไม่บังคับคีย์ซ้ำสองรอบแบบ Blind Entry
* Verifier ตรวจสอบข้อมูลที่คีย์แล้ว และมีสิทธิ์แก้ไขข้อมูลได้โดยตรงเมื่อพบข้อผิดพลาด
* ทุกการแก้ไขของ Verifier ต้องบันทึก Audit Log แบบเก็บค่าก่อน/หลังแก้ไข (old → new) เพื่อให้ตรวจสอบย้อนหลังได้ — ห้ามแก้ไขแบบไม่มีร่องรอย
* กลไก Double-Entry เดิม (`EntryAttempt`/`CriticalFieldConfig`/`Discrepancy`) ยังคงอยู่ในสคีมาแต่ปิดใช้งาน เผื่อเปิดใช้เฉพาะบางฟิลด์วิกฤตในอนาคต
* ข้อมูลจะเป็น VERIFIED ได้เมื่อ Verifier ตรวจสอบ (และแก้ไขถ้าจำเป็น) แล้วยืนยันความถูกต้อง

### Batch เป็น Optional Operational Metadata (Owner Decision 2026-07-31, #R6-B)

Batch (ปึก) คือ **ข้อมูลประกอบการบริหารงาน ไม่ใช่เงื่อนไขของการคีย์**

* ระบบต้องคีย์ข้อมูลได้โดยไม่มี Batch — เปิดแบบสอบถามด้วย Sheet ID ได้โดยตรง
* `batchId` ต้องเป็น Nullable
* Save Draft, Submit และ Verify **ห้ามขึ้นกับการมี Batch**
* เจ้าหน้าที่สร้าง Batch เฉพาะเมื่อมีการแบ่งกองกระดาษจริงเท่านั้น
* Batch ใช้ติดตามจำนวนแบบ / คีย์แล้ว / รอตรวจ / เสร็จแล้ว
* UI ห้ามบังคับเลือก Batch
* คำว่า "ปึก" ให้แสดงเฉพาะกรณีที่แบบสอบถามถูกผูกกับ Batch จริง

> สถานะปัจจุบัน: สคีมายัง **ไม่** ตรงกับคำตัดสินนี้ (`SurveySheet.batchId` / `Household.batchId` เป็น NOT NULL)
> — ดู `docs/16-owner-decisions.md` §6.7 ต้องแก้เป็นงานแยก ห้ามรวมกับงานปรับโครงสร้าง Role

สถานะข้อมูลแต่ละฟิลด์ควรรองรับ:

* HAS_VALUE
* EXPLICIT_NONE
* BLANK_IN_PAPER
* ILLEGIBLE

## Database rules

* ต้องรองรับ PostgreSQL และ PostGIS
* ต้องมี Foreign Key, Unique Constraint, Check Constraint และ Index ตามความเหมาะสม
* ชุมชนหนึ่งแห่งสามารถสัมพันธ์กับหลายตำบลได้
* Community กับ Tambon ควรใช้ความสัมพันธ์ Many-to-Many ผ่านตารางเชื่อม
* ตารางเชื่อมควรมี `isPrimary` สำหรับระบุตำบลหลัก
* ห้ามกำหนดจำนวนเป้าหมายครัวเรือนคงที่เป็น 600
* Master Data ต้อง Seed แบบ Idempotent
* ห้ามใช้ข้อมูลประชาชนจริงเป็น Seed Data
* Custom SQL ที่อ้างถึงตาราง Prisma ต้องรันหลัง Prisma Migration สร้างตารางแล้ว
* PostGIS Extension ต้องเปิดก่อนใช้ชนิดข้อมูลหรือฟังก์ชัน PostGIS
* Public View ต้องไม่เปิดเผย PII หรือพิกัดรายบ้าน
* Audit Log ต้องเป็น Append-only
* Migration ต้องสามารถตรวจสอบและย้อนกลับได้ตามแนวทางที่เหมาะสม

## Risk calculation rules

ก่อนใช้ Risk Model ต้องตรวจสอบ:

* ปัจจัยความเสี่ยงทั้งหมด
* น้ำหนักแต่ละปัจจัย
* คะแนนสูงสุด
* Threshold ของระดับ LOW, MEDIUM, HIGH และ CRITICAL
* วิธีจัดการข้อมูล Missing หรือ Unverified
* Confidence Score
* Version ของสูตรความเสี่ยง

หากคะแนนดิบรวมเกิน 100 ให้แยก:

* rawScore
* maximumPossibleScore
* normalizedScore

สูตร Normalized Score:

`normalizedScore = rawScore / maximumPossibleScore × 100`

ห้ามใช้ข้อมูล Draft หรือ Unverified ในการคำนวณ Risk Final

## UI principles

### Design system — "เตือนภัยมั่นใจ" (Civic Alert)

Owner Decision (2026-07-25): ระบบใช้ Design System แนว **Civic Alert** — คม มั่นใจ ระดับหน่วยงาน
นิยาม Token ทั้งหมดอยู่ใน `app/globals.css` (`@theme` + `@layer components`) ตาม Tailwind v4
แบบ CSS-first — **ไม่มี `tailwind.config.js`**

Token สี (ห้ามใส่ค่า Hex ตรงในคอมโพเนนต์ ให้ใช้ Token เสมอ):

| Token | ค่า | ใช้กับ |
| --- | --- | --- |
| `brand-*` | น้ำเงิน `#2563EB` → คราม `#2A2F86` | ตัวตนระบบ, ปุ่มหลัก, ลิงก์, ตัวชี้วัดหลัก |
| `alert-*` | ส้มเตือนภัย `#FF6A00` | CTA เด่น, จุดที่ต้องลงมือทำ, มาสคอต |
| `sun-*` | เหลืองสด `#FFCF1F` | **Warning / ILLEGIBLE / รอดำเนินการ** |
| `emerald-*` | มิ้นต์ `#14B8A6` | **สำเร็จ / VERIFIED / ผ่านเป้า** |
| `red-*` | แดง | **Critical หรือ Error เท่านั้น** |
| `slate-*` | เทาอมน้ำเงิน | ตัวหนังสือ, เส้นขอบ, **Missing / No Coverage** |
| `ink-*` | กรมท่า `#0B1437` | Sidebar, แถบหัวเรื่อง, พื้นลึก |
| `canvas` / `mist` | ฟ้าอ่อน `#EAF0FF` / `#F4F7FF` | พื้นหน้า / พื้นบล็อกให้ข้อมูล |

กฎความปลอดภัยของสี (สำคัญกว่าความสวยงาม):

* `alert` (ส้ม) หมายถึง "ต้องลงมือทำ" **ไม่ใช่** "คำเตือน" — คำเตือน/ILLEGIBLE ใช้ `sun` เสมอ
* `red` สงวนไว้ให้ Error/Critical เท่านั้น ห้ามใช้ตกแต่งหรือใช้แทน `alert`
* `slate` คือ Missing/No Coverage — ห้ามใช้สีสดแทน "ไม่มีข้อมูล"
* พื้นสีสด (`alert-500`, `sun-400`) ต้องใช้ตัวหนังสือ `ink-900` ไม่ใช่สีขาว
  (ขาวบนส้ม `#FF6A00` ได้ Contrast เพียง ~2.9:1 ไม่ผ่าน WCAG AA)

คลาสร่วมที่ต้องใช้ซ้ำ (อย่าสร้างสไตล์ซ้ำเอง): `.card` `.card-flush` `.card-interactive`
`.card-mist` · `.btn` + `.btn-primary/-accent/-secondary/-ghost/-warning/-danger` +
`.btn-sm/-md/-lg` · `.field` `.label` · `.badge` + `-brand/-accent/-success/-warning/-danger/-neutral`
· `.chip` + `-md/-lg/-brand/-accent/-sun/-mint/-neutral` · `.skeleton` `.stagger` `.live-dot`
`.alert-ring` `.eyebrow` `.kbd`

คอมโพเนนต์โครงหน้าที่ต้องใช้ซ้ำทุกหน้า: `components/layout/page-hero.tsx`
(`PageHero`, `SectionTitle`, `EmptyState`)

### ระบบมาสคอตและโลโก้ (Owner Decision 2026-07-25)

**โลโก้** `components/brand/logo-mark.tsx` — บ้านยกพื้นเหนือระดับน้ำ เป็นรูปทรงเรขาคณิตล้วน
ใช้ currentColor · สื่อสองแกนของระบบพร้อมกัน (ครัวเรือน = หน่วยข้อมูล + ระดับน้ำ = ภัย)
เป็น "เครื่องหมายการค้า" ไม่ใช่ตัวละคร · ต้องอ่านออกที่ 16–32px จึงห้ามเติมรายละเอียด
ใช้ที่ Header/Sidebar/favicon เท่านั้น

**มาสคอต** `components/brand/mascot.tsx` — **ตัวละคร "คนอาสา" ชุดเดียว**
เปลี่ยนความหมายด้วยอุปกรณ์ที่ถือ ไม่ใช่เปลี่ยนตัวละคร
เรียกใช้ด้วย `role` (ความหมาย) ไม่ใช่ชื่ออุปกรณ์ เพื่อให้เปลี่ยน mapping ที่เดียวได้

| `role` | อุปกรณ์ | ความหมาย | สีเริ่มต้น |
| --- | --- | --- | --- |
| `notify` | โทรโข่ง | แจ้งเตือนภัย / ประกาศ / ช่องทางสื่อสาร | sun |
| `field` | คลิปบอร์ด | ลงพื้นที่สำรวจ (`FIELD_SURVEYOR`) | brand |
| `verify` | แว่นขยาย | ตรวจสอบข้อมูล (`VERIFIER`) | mint |
| `rescue` | เสื้อชูชีพ | ช่วยเหลือ / ต้องลงมือทำ (`VOLUNTEER`) | alert |
| `entry` | คีย์บอร์ด | คีย์ข้อมูล (`DATA_ENTRY`) | brand |

เพิ่มบทบาทใหม่ = วาดอุปกรณ์ชิ้นเดียว ไม่ต้องวาดตัวละครใหม่
และแบรนด์มี "หน้า" เดียวที่คนจำได้

**ประวัติการตัดสินใจ (อย่าย้อนกลับไปทำซ้ำ):**

* ❌ **หยดน้ำ** — มาสคอตกลายเป็นตัวภัยของระบบเอง (เหมือนระบบเตือนไฟป่าใช้เปลวไฟเป็นมาสคอต)
* ❌ **นกเขา** — เจ้าของตัดสินว่าไม่เข้ากับระบบ
* ❌ **ทีมมาสคอตหลายตัว** — ต้นทุนดูแล 10–16 ชิ้น และความจำแบรนด์แย่กว่าตัวเดียว
* ✅ **คนอาสา + อุปกรณ์** — มาสคอตเป็น "ฝ่ายเรา" (ความช่วยเหลือ/ความพร้อม) ไม่ใช่ตัวภัย
  และอุปกรณ์ผูกกับ Role ใน RBAC ทำให้มาสคอตกลายเป็นระบบสื่อความหมาย ไม่ใช่ของประดับ

**ข้อควรระวังเรื่องคอนทราสต์ (เจอจากการทดสอบจริง):** มาสคอตต้องวางบนแถบสีแบรนด์เข้ม
(`bg-brand-500` / `bg-ink-800`) ได้ จึงห้ามให้ส่วนใหญ่ของตัวละครเป็นสีเดียวกับพื้น —
แขน/ขาใช้ `UNIFORM` (slate-600) ไม่ใช่สีเข้มของโทน มิฉะนั้นจะกลืนหายบนพื้นกรมท่า

**กฎวางตำแหน่ง (กฎ F) — บังคับ:**

* มาสคอตอยู่ได้เฉพาะ **ฝั่งประชาชนและหน้าเปลี่ยนผ่าน**: หน้า Public, หน้า auth,
  Empty/Error/Success state, Modal ยืนยัน
* **หลังบ้านไม่มีมาสคอตในแถบ `PageHero`** — `mascotRole` เป็น opt-in ไม่ใส่ = ไม่มี
  เหตุผล: ตอนเกิดภัยจริง เจ้าหน้าที่เปิดหน้าคิวที่ขึ้นว่า "รอตรวจสอบ 240 ใบ"
  ตัวการ์ตูนยิ้มข้างตัวเลขนั้นอ่านได้เป็นการไม่รู้กาลเทศะ และความเร็วสำคัญกว่าความน่ารัก
* **ห้าม**อยู่ใน: แถวตาราง, cell, ปุ่ม, badge, sidebar item
* ของประดับต้องส่ง `decorative` (ใส่ `aria-hidden`) ไม่ให้ screen reader อ่านซ้ำ

**ข้อบังคับทางเทคนิคของ SVG แบรนด์:** ห้ามใช้ `<defs>`/gradient (id ชนกันเมื่อมีหลายตัวในหน้าเดียว)
ให้ทำมิติด้วยการซ้อนรูปทรงทึบ · ห้ามใช้ hook (ต้องเรนเดอร์ได้ทั้ง Server และ Client Component)

### ข้อมูลเป็นพระเอก (Data as hero)

หน้าที่ต้องโน้มน้าว (Dashboard, หน้านำเสนอ) ให้ **ตัวเลขจริงเป็นภาพหลัก** ไม่ใช่ภาพประดับ
`components/charts/coverage-gauge.tsx` — เกจ SVG ล้วน ไม่มี charting library
เรขาคณิตแยกเป็น Pure Function ที่ `domain/coverage/gauge-geometry.ts` + มี Unit Test

* `NOT_CALCULABLE` → แสดง "ยังไม่ทราบ" **ห้าม**วาดเป็น 0%
* ค่าเพี้ยน (NaN/Infinity) → วาดเป็น 0 ไม่ใช่ 100 (ห้ามโชว์ว่าผ่านเป้าจากข้อมูลที่เชื่อถือไม่ได้)
* ต้องมี Denominator กำกับทุกครั้ง
* **ห้ามสร้างกราฟจากข้อมูลสมมติ** เพื่อให้หน้าดูสวย — ถ้ายังไม่มีข้อมูลให้แสดงสภาพจริง

Motion — "สไลด์เด็ดขาด การ์ดเลื่อนเข้าเป็นจังหวะ แจ้งเตือนเต้นเป็นวงกระเพื่อม":

* ทำด้วย CSS Keyframes ใน `globals.css` เท่านั้น — ห้ามเพิ่ม Animation Library
* Utility: `animate-fade-in` `animate-step-in` `animate-rise` `animate-pop`
  `animate-slide-up` `animate-slide-in` `animate-drop-in` `animate-float` `animate-wiggle`
* ปุ่มมีฐานทึบ 2px กดแล้วยุบลง (`translateY(2px)`) — เป็นลายเซ็นของระบบ
* `.alert-ring` (วงกระเพื่อม) ใช้เฉพาะจุดที่ "รอดำเนินการจริง" ห้ามใช้ตกแต่ง
* Motion ทุกชิ้นต้องถูกปิดอัตโนมัติภายใต้ `@media (prefers-reduced-motion: reduce)`
  ซึ่งประกาศไว้แล้วใน `@layer base` — ห้ามเขียน Animation ที่หลบกฎนี้
* มาสคอต "น้องหยดน้ำ" เป็น SVG ล้วนและไม่มี State จึงใช้ได้ทั้ง Server และ Client Component

### Back-office

* Desktop-first
* ใช้ภาษาไทย
* Sidebar คงที่
* ตารางและ Filter ต้องอ่านง่าย
* เน้นความเร็วในการทำงาน
* Density ปานกลางถึงสูง
* สีแดงใช้เฉพาะ Error หรือ Critical
* สีเหลืองใช้ Warning หรือ ILLEGIBLE
* สีเทาใช้ Missing หรือ No Coverage
* ทุก Dashboard ต้องแสดง Coverage และ Denominator
* ทุกหน้าเริ่มด้วย `PageHero` และแบ่งหมวดด้วย `SectionTitle` เพื่อให้หน้าตาเป็นระบบเดียวกัน

### Public portal

* Mobile-first
* เปิดได้โดยไม่ Login
* ปุ่มใหญ่ อ่านง่าย
* เบอร์ฉุกเฉินต้องกดโทรได้
* แผนที่และจุดอพยพต้องเข้าถึงง่าย
* รองรับอินเทอร์เน็ตความเร็วต่ำ
* ห้ามเปิดเผยข้อมูลรายบ้าน

### Incident command

* แสดงระดับเหตุการณ์ชัดเจน
* มีแผนที่เหตุการณ์
* มี Rescue Task
* มี Priority P1–P4
* มี Timeline
* มีสถานะงานค้าง กำลังดำเนินการ และเสร็จสิ้น

## Development workflow

ก่อนเขียนโค้ดทุกงาน:

1. อ่านไฟล์ที่เกี่ยวข้อง
2. ตรวจสอบ Requirement และ Business Rule
3. ตรวจสอบ Schema และความสัมพันธ์
4. อธิบายแผนการเปลี่ยนแปลง
5. ระบุไฟล์ที่จะสร้างหรือแก้
6. ตรวจผลกระทบต่อ Database, RBAC, Privacy และ GIS
7. จึงเริ่มแก้ไขหลังได้รับคำสั่งให้พัฒนา

หลังเขียนโค้ด:

1. Run prisma format
2. Run prisma validate
3. Run typecheck
4. Run lint
5. Run unit tests
6. Run integration tests ที่เกี่ยวข้อง
7. Run E2E tests ที่เกี่ยวข้อง
8. ตรวจ Migration
9. สรุปไฟล์ที่เปลี่ยน
10. รายงานสิ่งที่ยังไม่เสร็จตามจริง

## Git rules

* ทำงานทีละ Feature
* ห้ามรวมหลาย Module ที่ไม่เกี่ยวข้องใน Commit เดียว
* ใช้ Conventional Commits
* ห้าม Commit `.env`, Secret, Database Dump หรือข้อมูลประชาชนจริง
* ก่อนแก้ Schema หรือ Migration ครั้งใหญ่ต้องสร้าง Git Commit สำรอง
* ห้าม Rewrite Git History โดยไม่ได้รับอนุญาต

## Definition of done

งานถือว่าเสร็จเมื่อ:

* TypeScript ไม่มี Error
* Prisma Schema Validate ผ่าน
* Lint ผ่าน
* Tests ที่เกี่ยวข้องผ่าน
* RBAC ตรวจฝั่ง Server
* Validation มีทั้ง Client และ Server
* มี Loading, Empty และ Error States
* ไม่มีข้อมูลอ่อนไหวรั่วใน Log หรือ Response
* Documentation ที่เกี่ยวข้องได้รับการอัปเดต
* Migration และ Custom SQL อยู่ในลำดับที่ถูกต้อง
