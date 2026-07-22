# 26 — Product Architecture & Paper Entry Redesign

> รอบงาน: 2026-07-22 · Owner Decision เปลี่ยนสมมติฐาน Entry Workflow จาก "ระบบแจกงาน (Work Queue)" → "หัวหน้าแจกปึกกระดาษ เจ้าหน้าที่เปิดใบด้วยรหัส (Paper Batch Assignment)"
> สถานะ: **พัฒนาเสร็จ ยังไม่ commit** (รอ review)

## 1. Product Vision

SKL-FRIS = แพลตฟอร์มข้อมูลครัวเรือนและการจัดการภัยพิบัติ 3 บริบท:
- **A. Public** — ประชาชนเข้าถึงข้อมูลภาพรวมที่ไม่อ่อนไหวได้โดยไม่ login (mobile-first, โหลดเร็ว)
- **B. Survey Operations** — เจ้าหน้าที่คีย์/ตรวจ/บริหารข้อมูลจากกระดาษ (desktop-first, keyboard-first)
- **C. Emergency Operations** — เจ้าหน้าที่ที่มีสิทธิ์ใช้ข้อมูลวางแผนช่วยเหลือ (least privilege + audit)

โทน: Modern Government / Enterprise · Premium but restrained · Calm · Data-focused

## 2. Public vs Authenticated Experience

| | Public (`/`) | Authenticated (`/dashboard`, `/surveys`, …) |
|---|---|---|
| เข้าถึง | ไม่ต้อง login · ISR 5 นาที (เร็ว, ไม่ยิง DB ทุก request) | Session + isActive + RBAC + Community Scope ทุก request |
| ข้อมูล | Aggregate ระดับพื้นที่ + ข้อมูลราชการเท่านั้น | ตามสิทธิ์รายหน้า |
| Design | เป็นมิตร ตัวใหญ่ mobile-first — DNA เดียวกับฝั่งใน | Enterprise operations platform |
| Data layer | `lib/public/stats.ts` แยกขาดจาก internal — select เฉพาะ field ที่ประกาศ | `lib/entry/*`, `lib/dashboard/*` |

**Public Home ที่สร้างจริง (`app/page.tsx` — แทน redirect เดิม):** Hero สถานะพื้นที่ (badge "อยู่ระหว่างการสำรวจ" — ตามจริง) · เบอร์ฉุกเฉินจากตาราง `EmergencyContact` (**ยังไม่มี seed → แสดง empty state ที่ออกแบบแล้ว — ไม่ปั้นข้อมูลปลอม**; กด `tel:` โทรได้เมื่อมีข้อมูล) · สถิติจริง (ชุมชน 5 / ตำบล 2 / ครัวเรือน VERIFIED 0 พร้อมหมายเหตุตรงไปตรงมา / จุดพักพิง 0) · ความรู้เตรียมพร้อมน้ำท่วม 3 ช่วง (เนื้อหาความรู้ ไม่ใช่ master data) · placeholder แผนที่ระบุชัดว่ายังไม่เปิด · footer: timestamp + แหล่งข้อมูล + disclaimer "ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ"

## 3. Public Map & Privacy (Design — ยังไม่ implement)

**Data Classification:**
- **Public:** aggregate ระดับชุมชน/ตำบล · จุดสาธารณะ (EvacuationSite) · ขอบเขต/ระดับความเสี่ยงที่อนุมัติแล้ว · ประกาศ
- **Restricted (login + permission):** จุดครัวเรือนแบบลดความละเอียด/aggregate รายพื้นที่ · สรุปกลุ่มเปราะบางรายโซน
- **Sensitive (permission + purpose + audit):** พิกัดบ้านจริง · ชื่อ/เบอร์ · สุขภาพ/พิการ/ครรภ์/ติดเตียง · ความต้องการช่วยเหลือรายบุคคล

**Privacy Boundary (บังคับใช้แล้วในโค้ด):** Public layer แยกไฟล์+แยก select · ไม่มี Household ID / Sheet ID / พิกัดใน public response · ไม่ส่ง sensitive ไป client แล้วซ่อนด้วย UI · `PUBLIC_MIN_AGGREGATE = 5` (k-anonymity suppression threshold) ประกาศเป็นกติกากลาง + test กำกับ
**Map:** ต้องใช้ Leaflet/MapLibre = dependency ใหม่ → ตามกติกา HALT จึง**ยังไม่ติดตั้ง** — เสนอ MapLibre GL + OpenStreetMap raster tiles (ODbL, ฟรี) หรือ tile server ภายในเมื่อ production; แผนที่ public แสดงเฉพาะ polygon ระดับพื้นที่ + จุดสาธารณะ

## 4. Authentication

ของเดิมผ่านเกณฑ์ส่วนใหญ่ (generic error ไม่เปิดเผยการมีอยู่ของบัญชี, inactive ถูกบล็อกที่ hook + ทุก request, mobile OK, a11y OK) · Login เข้าจาก Public Home ผ่านปุ่ม "เจ้าหน้าที่เข้าสู่ระบบ" — แยกชัดแต่เข้าถึงง่าย
**ยังไม่มี (รอ schema/นโยบาย):** สถานะ "บัญชีรออนุมัติ/ถูกระงับ" (schema ไม่มี field สถานะดังกล่าว — มีแต่ `isActive`) · session-expired toast · security logging (`AuditAction` มี LOGIN/LOGOUT แต่การ log ฝั่ง Better Auth hook ยังไม่ต่อ — Phase ถัดไป)

## 5. Registration / Provisioning (Design — HALT ก่อนแตะ DB)

Audit: schema **ไม่มี** RegistrationRequest model · Better Auth มี `signUpEmail` (ใช้เฉพาะ dev script — ไม่มี public UI ✓)
**ข้อเสนอ (เรียงตามความปลอดภัย):**
1. **ปัจจุบัน (ใช้ได้เลย):** Admin-created (script → อนาคตเป็น Admin UI) — ปลอดภัยสุด เหมาะช่วงเริ่มระบบ
2. **แนะนำระยะถัดไป:** Registration Request + Admin approval — ต้องเพิ่ม model ใหม่ (`RegistrationRequest`: ชื่อ, อีเมล/โทร, หน่วยงาน, ตำแหน่ง, พื้นที่, เหตุผล, การยอมรับนโยบาย, สถานะ PENDING/APPROVED/REJECTED, ผู้อนุมัติ+เวลา) + Admin กำหนด Role/Scope ตอนอนุมัติ → **ต้องแก้ schema → HALT รออนุมัติ migration**
3. Invitation-based — ต้องมี token store → แก้ schema เช่นกัน
**ห้าม:** public self-registration ที่ใช้งานได้ทันที (ระบบมีข้อมูลสุขภาพ)

## 6. Role-based Landing (ใช้จริงผ่าน `defaultLandingPath`)

| Role | Landing | เหตุผล |
|---|---|---|
| DATA_ENTRY | `/surveys` (หน้าคีย์ Sheet ID) | ไม่มี dashboard.view (docs/10) |
| ADMIN, EXECUTIVE, OFFICER, COORDINATOR, VOLUNTEER, RESEARCHER | `/dashboard` | มี dashboard.view |
| VERIFIER | `/access-denied` ชั่วคราว (เมนู verification ยังไม่สร้าง) | จะเป็นคิวตรวจสอบเมื่อ Phase F |
| FIELD_SURVEYOR | `/access-denied` | ไม่มี permission ใด (least privilege) |

Emergency Operator ไม่มีใน `UserRoleEnum` → ไม่สร้าง role ใหม่เอง; งานฉุกเฉิน map ไปที่ OFFICER/COORDINATOR ตามสิทธิ์เดิม

## 7. Paper Batch Workflow (Owner Decision — แทน Work Queue)

```
หัวหน้ารับปึก (PaperBatch) → แจกกระดาษให้เจ้าหน้าที่ (นอกระบบ)
เจ้าหน้าที่: Login → /surveys → เห็นปึกในพื้นที่ + ความคืบหน้า
  → หยิบกระดาษใบถัดไปจากปึกของตน → พิมพ์รหัสใบ (หรือเลขลำดับในปึก) → Enter
  → ระบบตรวจ: มีจริง? ใน scope? ปึกเปิด? สถานะ PENDING? ใครถืออยู่? → จองใบ (lock) → เปิด Wizard
  → คีย์ → (อนาคต: Save Draft/Submit) → กลับหน้าคีย์ → ใบถัดไป
```
ระบบ**ไม่**สุ่มแจกใบ · ไม่มี "หยิบงานใหม่/คืนใบ" ใน flow ปกติ (มี "หยุดคีย์ใบนี้" เป็น escape hatch)

## 8. Sheet ID Entry Flow (สร้างจริง)

- `openSheetByCode(ctx, code, batchId?)` ใน [lib/entry/claim.ts](../lib/entry/claim.ts): normalize (trim/uppercase — พิมพ์จากกระดาษ) → resolve (`sheetNo` unique หรือ `batchId+sequence` เมื่อพิมพ์เลขสั้น) → scope check (นอก scope = NOT_FOUND กัน enumeration) → batch open check → status check → **atomic claim** (conditional `updateMany`)
- ผลลัพธ์ typed: `NOT_FOUND / IN_USE / BATCH_NOT_OPEN / WRONG_STATUS(status)` → UI แสดงข้อความไทยเฉพาะกรณี เช่น "ใบนี้กำลังถูกคีย์โดยเจ้าหน้าที่ท่านอื่น — ข้ามไปใบถัดไปได้เลย"
- UI: `SheetOpenForm` — autofocus, Enter เปิด, monospace, เลือกปึกได้ (พิมพ์แค่เลขลำดับ), hint รองรับบาร์โค้ดอนาคต · `openSheetAction` validate ด้วย zod (`[A-Za-z0-9-]{1,64}`)

## 9. Lock Strategy (ลดบทบาทเป็น Infrastructure Safety)

- เกิดเมื่อเปิดใบ · atomic `updateMany` เดิม (ไม่ลดความปลอดภัย — พิสูจน์ด้วยเทสต์เปิดพร้อมกัน) · 10 นาที · **ต่ออายุอัตโนมัติจริง**: heartbeat ทุก 4 นาทีระหว่างฟอร์มเปิด + เมื่อเปลี่ยน step (server ยอมเฉพาะเจ้าของที่ยังไม่หมดอายุ — server time เป็น source of truth, client countdown เป็นเพียงการแสดงผล) · หมดอายุ = ผู้อื่นเปิดได้ (กันใบค้าง ไม่ต้องมี cron)
- **UI:** หน้า `/surveys` ไม่มี countdown — แถว resume เล็ก ๆ เท่านั้น · ใน Wizard = บรรทัดเดียว "จองใบไว้ให้คุณแล้ว (ต่ออายุอัตโนมัติ)" เตือน amber เมื่อ <2 นาที + ปุ่มต่ออายุ · overlay เมื่อหมดอายุ ("คีย์ใบนี้ต่อ" / กลับ)
- คำศัพท์ผู้ใช้: "จองใบ/เปิดใบ/หยุดคีย์ใบนี้/ออกจากแบบฟอร์ม" — เลิกใช้ "หยิบงาน/คืนใบ/lock"
- Release: manual ("ออกจากแบบฟอร์ม" + confirm เมื่อมีข้อมูลค้าง) — ปลอดภัยต่อ Draft อนาคตกว่า auto-release (ร่างจะผูกกับ lock holder)

## 10. Wizard Context

คงคุณภาพเดิมทั้งหมด (9 step ตรงกระดาษ, F2/F3, keyboard, premium) — ปรับ: Sheet/Batch/Community เด่นบนราง · lock เหลือหนึ่งบรรทัด · ปุ่มออกใช้ภาษาผู้ใช้ · ยังไม่บันทึกอะไรทั้งสิ้น (banner แจ้ง + `beforeunload`)

## 11. Emergency Operations (Design — ยังไม่ implement)

**ทำได้จากข้อมูลปัจจุบัน (เมื่อมี VERIFIED data):** filter พื้นที่ตาม scope · นับครัวเรือน/กลุ่มเปราะบาง aggregate · จุดพักพิง (EvacuationSite) · ค้นหาตามสิทธิ์+audit READ
**ต้องรอ:** Risk formula (WAITING_FOR_BUSINESS_RULE — ห้ามปั้น) · Incident data (Phase 3) · การจัดลำดับพื้นที่ (ต้องมี risk ก่อน) · แผนที่ (dependency)
หลัก: อ่าน aggregate ก่อน เปิดรายบุคคลต้อง permission + scope + เหตุผลภารกิจ + audit — sensitive ไม่ default

## 12–13. Data Classification & Security Boundaries (สรุปที่บังคับใช้แล้ว)

- Public layer แยกไฟล์/แยก select — test whitelist field กำกับ (public.test.ts)
- Entry: ทุกฟังก์ชันตรวจ permission+scope ฝั่ง server · NOT_FOUND กลืนกรณีนอก scope · zod validate ทุก action input · ไม่สร้าง Household/EntryAttempt/payload ใด (Owner Decision R5 ยังบังคับ)
- ไม่มี dependency ใหม่ · ไม่แตะ schema/migration/seed

## 14. UX Decisions

Sheet-ID-first hero · ปึก+ความคืบหน้าเป็นบริบท ไม่ใช่คิว · ภาษาไทยเชิงงานจริง · public เป็นมิตร/ฝั่งในเป็น operations · empty/error states ออกแบบครบ · เลขลำดับสั้นเมื่อเลือกปึก (เร็วกว่าพิมพ์รหัสเต็ม 20+ ตัว)

## 15. Tests (117 ผ่าน: 69 unit + 48 integration)

- entry.test.ts (integration, 13): เขียนใหม่รอบ openSheetByCode — no-permission/no-scope → NOT_FOUND · ไม่มีจริง/นอก scope ไม่รั่ว · BATCH_NOT_OPEN · lowercase normalize · **เปิดพร้อมกัน 2 คน → เจ้าของเดียว** · resumed · guards เดิมครบ (NOT_OWNER/expired/takeover/renew/release) · เปิดด้วยเลขลำดับ · WRONG_STATUS · ไม่มี Household/payload · fixtures = 0
- public.test.ts (ใหม่, 4): field whitelist · ตัวเลขตรง query อิสระ (นับเฉพาะ VERIFIED) · contacts whitelist · threshold ≥ 5

## 16. Migration from Work Queue Assumption

| เดิม (docs/25 v1) | ใหม่ | เหตุผล |
|---|---|---|
| `claimNextSheet` สุ่มแจกใบ | **ลบออก** → `openSheetByCode` | ระบบไม่ใช่ผู้แจกงาน |
| ClaimButton "หยิบงานคีย์ใบถัดไป" | **ลบ** → `SheetOpenForm` | Sheet ID คือ primary action |
| ResumeCard hero + countdown สด | `ResumeRow` แถวเล็ก | lock ไม่ใช่ประสบการณ์หลัก |
| Copy "หยิบงาน/คืนใบ/คิวงาน" | "เปิดใบ/หยุดคีย์ใบนี้/หน้าคีย์แบบสอบถาม" | ภาษาตรงกับงานจริง |
| Lock countdown bar ใน Wizard rail | บรรทัดเดียว + auto-renew | ไม่กดดันผู้คีย์ |
| **คงไว้:** atomic lock, guards ทั้งหมด, Wizard, Design System, RBAC/scope, master data, dev scripts | | ไม่ได้ตั้งบนสมมติฐานผิด |

## 17. Known Limitations

1. คำตอบยังไม่ถูกบันทึก (Owner Decision R5 — รอกลไก encryption) · ปุ่มส่งใบปิด
2. เบอร์ฉุกเฉิน/จุดพักพิงยังไม่มีข้อมูล (ต้องการ seed ที่อนุมัติ) — แสดง empty state
3. VERIFIER/FIELD_SURVEYOR ยังไม่มีหน้า landing จริง
4. Registration/แผนที่/Emergency ops = design เท่านั้น (ติด schema/dependency)
5. ยังไม่มี audit log เหตุการณ์เข้าถึง (AuditAction ไม่มีค่า DENIED — ติด migration)
6. ประกาศ/แจ้งเตือนสาธารณะยังไม่มี model รองรับ

## 18. Recommended Roadmap

1. อนุมัติกลไกเก็บคำตอบ (encryption) → Draft + Submit + validation เต็ม (docs/24 Phase C–E)
2. อนุมัติ seed: EmergencyContact + EvacuationSite (+ CriticalFieldConfig สำหรับ Entry 2)
3. Migration ชุด: RegistrationRequest + AuditAction เพิ่มค่า + (option) announcement model → registration flow + audit + ประกาศสาธารณะ
4. Batch Management UI (COORDINATOR) แทน dev script
5. อนุมัติ MapLibre → Public Map + Emergency Operations Map
6. Verification module (Phase F) → VERIFIER landing จริง
