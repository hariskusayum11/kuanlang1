# 43 — หัวหน้าชุมชนเป็น "แอดมินชุมชน"

**Owner Decision 2026-10-26** · สถานะ: **บังคับใช้แล้ว**

ต่อจาก [34](34-community-leader-status.md) (สถานะกลุ่มเปราะบาง) · [41](41-community-leader-scope.md) (แดชบอร์ด/ชุมชน/แผนที่) ·
[42](42-red-group.md) (กลุ่มสีแดง) — เจ้าของระบบเห็นว่าเมนูของหัวหน้าชุมชนน้อยเกินไป ให้ได้ "ฟีลแอดมินชุมชน"
**ทุกข้อด้านล่างจำกัดเฉพาะชุมชนที่ผูกใน `UserCommunityScope`** (ไม่ผูก = ไม่เห็น/แก้อะไร)

---

## 1. สิ่งที่เพิ่ม

| # | ความสามารถ | Permission | หน้า | ขอบเขต/ข้อจำกัด |
|---|---|---|---|---|
| 1 | แก้จำนวนครัวเรือนทั้งหมด (ตัวหาร Coverage) + แหล่งข้อมูล | `community.manage` | `/communities` ปุ่ม "ตั้งค่าประชากร" | **เป้า % แก้ไม่ได้** — เป็นนโยบายโครงการ (server คงค่าเดิมเสมอ) |
| 2 | เพิ่ม/แก้/ลบ จุดสำคัญ (จุดอพยพ โรงเรียน มัสยิด ฯลฯ) | `site.manage` (ใหม่) | `/map` ปุ่ม "เพิ่มจุดสำคัญ" | ทั้งชุมชนปลายทางและชุมชนเดิมของจุดต้องอยู่ในขอบเขต · ขึ้นหน้าสาธารณะทันที + Audit |
| 3 | ยืนยันบ้านพักพิง | `shelter.verify` | `/shelters` | รายการ/ยืนยัน/แก้/ยกเลิก กรองชุมชนแล้ว (เดิมไม่กรองเลย) |
| 4 | รายงานสรุปชุมชน (ตัวเลขรวม พิมพ์ได้ CSV ตัวเลขรวม) | `report.view` | `/reports` (เมนูชื่อ "รายงานสรุปชุมชน") | ไม่มีรายชื่อรายกลุ่ม (ไม่มี `report.segment.export` / `medical.report.export`) · **ไม่เห็น "ผลงานผู้กรอก"** — แยกเป็นสิทธิ์ `report.keyer.view` (เจ้าของระบบขอเอาออก) |
| 5 | ชื่อเมนูตามบทบาท | — | Sidebar | บัญชีจำกัดชุมชน: "ภาพรวมชุมชน" แทน "แดชบอร์ดผู้บริหาร" · หัวแดชบอร์ดเปลี่ยนตาม |
| 6 | รายการครัวเรือน + **เปิดดูใบเต็ม รวมรายละเอียดโรค** (อ่านอย่างเดียว) | `household.view` | `/households` · `/households/[id]` (ใหม่) | เฉพาะใบที่ตรวจแล้ว · ไม่มีปุ่มยืนยัน/แก้/ลบ/ตัดสินใบซ้ำ · Audit READ `household-view` ทุกครั้ง |
| 7 | ความเสี่ยงรายบ้าน + ชั้น "ลำดับการช่วยเหลือ" บนแผนที่ | `household.view` | `/risk` · `/map?help=on` | ลิงก์รหัสใบไปหน้าดูอย่างเดียว |
| 8 | รายชื่ออาสาสมัครในชุมชน (ชื่อ **เบอร์** ทักษะ) + Excel | `volunteer.list.view` (ใหม่) | `/community-volunteers` (ใหม่) | ชื่อ/เบอร์ = ผู้ให้ข้อมูลของบ้าน (แบบสอบถามถามระดับบ้าน) · กดเบอร์โทรได้ · Audit READ/EXPORT |
| 9 | **ย้ายออกทั้งบ้าน** ในครั้งเดียว | `vulnerable.status.update` | `/community-status` กล่องเปลี่ยนสถานะ | ติ๊กเอง (ไม่ติ๊กไว้ก่อน) · เปลี่ยนเฉพาะคนที่ยังต้องดูแล — คนที่บันทึกเสียชีวิตแล้วไม่ถูกเขียนทับ · Audit `vulnerable-household-moved-out` |
| 10 | **แจ้งเพิ่มคนเปราะบางรายใหม่** | `vulnerable.status.update` | `/community-status` ปุ่ม "แจ้งเพิ่มคนเปราะบาง" | ดูข้อ 3 |
| 11 | ความเคลื่อนไหวของหัวหน้าชุมชนบนแดชบอร์ดแอดมิน | (`user.manage` ฝั่งแอดมิน) | `/dashboard` | อ่านจาก Audit Log (14 วัน) — ไม่มีตารางใหม่ · ไม่มี PII ในข้อความ · ในระบบเท่านั้น (อีเมลปิดอยู่) |

**ยังไม่ให้:** คีย์/ตรวจใบ (`survey.entry`, `verification.view`) · หน้าสุขภาพ (`medical.*`) · ส่งออกรายบุคคลทั่วไป
(`report.personal.export`, `report.segment.export`) · จัดการผู้ใช้/ตั้งค่า · แก้กฎการจัดลำดับ

### คำตัดสินที่เปลี่ยนกฎเดิม

- **ข้อ 6** — เดิม (docs/34) หัวหน้าชุมชน "ไม่เห็นรายละเอียดโรค" · **เจ้าของระบบเลือก "ทั้งใบ รวมรายละเอียดโรค"**
  หน้า `/community-status` ยังไม่แสดงรายละเอียดโรคเหมือนเดิม (ไม่จำเป็นต่อการบันทึกสถานะ) แต่เปิดใบเต็มได้ที่ `/households/[id]`
- **ข้อ 10** — ระบบใช้หลัก "นับเฉพาะข้อมูลที่ตรวจแล้ว" · **เจ้าของระบบเลือก "นับทันที พร้อมป้าย"**
  คนที่แจ้งเพิ่มนับทันทีถ้าบ้านนั้นตรวจแล้ว (บ้านที่ยังไม่ตรวจก็ยังไม่ถูกนับตามเดิม)

## 2. ขอบเขต — ช่องโหว่ที่ปิดระหว่างทำ

`buildVerifiedWhere` (`lib/household/list.ts`) เดิม spread ขอบเขตและตัวกรอง `?community=` ลงคีย์ `communityId` เดียวกัน
→ ตัวกรองจาก URL **เขียนทับขอบเขต** (หัวหน้าชุมชนเลือกดูชุมชนอื่นได้) · ไม่เคยเกิดจริงเพราะก่อนหน้านี้ไม่มีบัญชีจำกัดชุมชนที่มี
`household.view` · แก้เป็น `AND` แยกกัน + เทสต์ unit/integration

หน้า `/admin/sheets` (ถังขยะ) เดิมเช็ค `household.view` → เปลี่ยนเป็น `user.manage` ให้ตรงกับเมนู

`tests/integration/leader-scope.test.ts` ตรวจทุกแหล่งข้อมูลข้างต้นด้วยบัญชีหัวหน้าชุมชน A ว่าไม่มีข้อมูลชุมชน B หลุด
รวมการขอชุมชน B ตรง ๆ ผ่าน URL และการเปิดใบ/แก้จุดสำคัญของชุมชน B ด้วย id

## 3. แจ้งเพิ่มคนเปราะบาง (ข้อ 10)

| | |
|---|---|
| เก็บที่ | `VulnerablePerson.reportedAt` (ตัวบ่งชี้หลัก) + `reportedById` |
| ลำดับ | `seq` ตั้งแต่ **1001** — แถวกระดาษใช้ 1… · CHECK `ck_vulnerable_reported_seq` บังคับ · หา seq ถัดไปหลังล็อกแถวบ้าน (`FOR UPDATE`) กันเลขซ้ำเมื่อเพิ่มพร้อมกัน |
| แก้ใบกระดาษภายหลัง | `lib/entry/save.ts` ลบ/สร้างใหม่เฉพาะแถว `reportedAt IS NULL` → แถวแจ้งเพิ่มอยู่ครบ (เทสต์) |
| ข้อมูล | คำนำหน้า ชื่อ นามสกุล อายุ (ปี / เดือนถ้า 0 ปี) เบอร์ ลักษณะ + รายละเอียดต่อลักษณะ — ชื่อ/เบอร์/รายละเอียด **เข้ารหัส** |
| ไม่มีช่อง "หมายเหตุ" อิสระ | โดยตั้งใจ — คอลัมน์ `notes` ไม่เข้ารหัส แต่คนมักพิมพ์ข้อมูลสุขภาพ ให้ใช้ "อื่นๆ" + รายละเอียด (เข้ารหัส) แทน |
| อายุครรภ์/อายุลูก | วันที่อ้างอิง = วันที่แจ้ง (`referenceDate`) ไม่ใช่วันสำรวจของบ้าน — กลุ่มสีแดงนับต่อจากวันแจ้ง |
| ป้าย | "หัวหน้าชุมชนแจ้งเพิ่ม" ในหน้าสถานะ หน้าใบ (ผู้ตรวจจะได้ไม่เทียบกับกระดาษ) |
| Audit | `CREATE` · `VulnerablePerson` · `vulnerable-person-reported` — `{ householdId, typeCount }` |

Migration `20261026000000_vulnerable_reported_by_leader` — เพิ่มอย่างเดียว · ย้อนกลับได้ (ดูหัวไฟล์)

## 4. Audit ใหม่

| เหตุการณ์ | action · entityType · reason |
|---|---|
| เปิดใบแบบอ่านอย่างเดียว | `READ` · `Household` · `household-view` |
| รายชื่ออาสา / Excel | `READ`/`EXPORT` · `CommunityVolunteerList` |
| ย้ายออกทั้งบ้าน | `UPDATE` · `Household` · `vulnerable-household-moved-out` — `{ personCount, eventDate }` |
| แจ้งเพิ่มคน | `CREATE` · `VulnerablePerson` · `vulnerable-person-reported` |
| แจ้งเพิ่มนอกขอบเขต | `REJECT` · `Household` · `vulnerable-person-report-out-of-scope` |

## 5. ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/authz/permissions.ts` · `role-permissions.ts` | `site.manage` · `volunteer.list.view` · ชุดสิทธิ์หัวหน้าชุมชน |
| `lib/navigation.ts` (`scopedLabel`) · `app/(dashboard)/layout.tsx` | ชื่อเมนูตามขอบเขต · เมนู "อาสาสมัครในชุมชน" |
| `lib/geo/important-sites.ts` | สิทธิ์ + ตรวจชุมชนตอนเพิ่ม/แก้/ลบ |
| `lib/shelters/core.ts` | กรองชุมชนทุกคำสั่ง |
| `lib/community/core.ts` · `components/community/population-editor.tsx` | ล็อกเป้า % สำหรับบัญชีจำกัดชุมชน |
| `lib/verification/review.ts` (`purpose: "view"`) · `components/household/sheet-view.tsx` · `app/(dashboard)/households/[householdId]/` · `lib/household/sheet-link.ts` | หน้าดูใบอย่างเดียว ใช้ตัวแสดงร่วมกับหน้าตรวจ |
| `lib/community-volunteers/core.ts` · `app/(dashboard)/community-volunteers/` | รายชื่ออาสา + Excel |
| `domain/vulnerable/reported.ts` · `lib/vulnerable-status/{validation,core,actions}.ts` · `components/community-status/{status-list,report-person-dialog}.tsx` | ย้ายออกทั้งบ้าน · แจ้งเพิ่มคน |
| `domain/vulnerable/leader-activity.ts` · `lib/leader-activity/core.ts` · `components/dashboard/leader-activity-card.tsx` | ความเคลื่อนไหวบนแดชบอร์ดแอดมิน |
| `tests/unit/community-admin.test.ts` · `tests/integration/community-admin.test.ts` · `tests/integration/leader-scope.test.ts` | ล็อกกฎทั้งหมด |

## 6. ยังไม่ได้ทำ (ตามจริง)

- แจ้งเพิ่มได้เฉพาะ **บ้านที่สำรวจแล้ว** — บ้านใหม่ที่ไม่เคยสำรวจยังต้องผ่านแบบสอบถาม
- แจ้งเพิ่มแล้ว **แก้/ลบแถวนั้นยังไม่ได้** (ใช้ "เปลี่ยนสถานะ → ไม่เข้าเกณฑ์แล้ว" แทนการลบ)
- ความเคลื่อนไหวไม่มีสถานะ "อ่านแล้ว" และไม่มีการแจ้งเตือนนอกระบบ
- ย้ายออกทั้งบ้านบันทึกเฉพาะคนในตารางกลุ่มเปราะบาง (ครัวเรือนเองยังไม่มีสถานะ "ย้ายออก")
