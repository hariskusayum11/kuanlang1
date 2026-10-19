# 38 — ยืนยันบ้านพักพิงจากแบบสอบถาม

**Owner Decision 2026-10-19** (ประชุม ข้อ 1 และ 5) · สถานะ: **บังคับใช้แล้ว**

## หลักการ
1. ติ๊ก "ยินยอมเป็นจุดพักพิง" ในแบบสอบถาม (`FloodRiskProfile.canBeHostHouse`) = **แค่เสนอตัว** ยังไม่ใช่จุดพักพิง
2. เจ้าหน้าที่ **ติดต่อเจ้าของบ้าน** ยืนยันความจุและสิ่งอำนวยความสะดวก แล้วกดยืนยันที่เมนู **ยืนยันบ้านพักพิง** (`/shelters`)
   → สร้างจุดอพยพประเภท "บ้านพักพิง" (`EvacuationSite` `RELATIVE_HOME`) ที่พิกัดบ้าน ผูกด้วย `sourceHouseholdId` (unique)
3. **แสดงบนหน้าสาธารณะเฉพาะเมื่อเจ้าของยินยอมให้เผยแพร่อีกครั้ง** (`isPublic`) — การยินยอมเป็นจุดพักพิง
   ไม่ได้แปลว่ายินยอมให้เปิดเผยตำแหน่งบ้าน (บ้านส่วนตัว = ข้อมูลรายบ้าน)

## กฎที่บังคับ
| กฎ | ที่บังคับ |
|---|---|
| ต้องติดต่อเจ้าของก่อน (`ownerContacted: true`) | Zod `verifyShelterSchema` |
| ใบตรวจแล้ว + ติ๊กยินยอม + มีพิกัด | `verifyHostShelter` (NOT_ELIGIBLE / NO_COORDINATES) |
| บ้านหนึ่งยืนยันได้ครั้งเดียว (กันเจ้าหน้าที่ 2 คนกดพร้อมกัน) | UNIQUE `sourceHouseholdId` → ALREADY_VERIFIED |
| บ้านพักพิงจากครัวเรือนต้องเป็นประเภทบ้านพักพิงและมีวันที่ยืนยัน | CHECK `ck_evacuation_site_host_shelter` |
| หน้าสาธารณะเห็นเฉพาะ `isPublic` | `getPublicMapData`, `getPublicStats`, `getBoundaryStats({ publicOnly })` |
| ตัวแก้ "จุดสำคัญ" ทั่วไปแก้/ลบบ้านพักพิงไม่ได้ | `saveImportantSite` / `deleteImportantSite` |
| ไม่เก็บชื่อ/เบอร์เจ้าของซ้ำ · ชื่อที่แสดงห้ามใส่ชื่อเจ้าของ | ฟอร์ม + ชื่อเริ่มต้น `defaultShelterName` |
| ยกเลิกไม่ลบจริง (isActive=false, isPublic=false) → กลับไปรอยืนยัน | `revokeHostShelter` |

สิทธิ์ `shelter.verify` = เจ้าหน้าที่ + ADMIN · Audit: `VERIFY` (host-shelter-verified) · `UPDATE` (updated/revoked)

## แผนที่ภายใน
- ชั้น "บ้านเสนอเป็นจุดพักพิง (ยังไม่ยืนยัน)" = ติ๊กยินยอมแต่ยังไม่ยืนยัน
- ยืนยันแล้ว → ย้ายไปเป็นจุดสำคัญ "บ้านพักพิง" (ไม่แสดงซ้ำในชั้นเสนอตัว)

## ฐานข้อมูล
Migration `20261020010000_host_shelter_verification` — เพิ่มคอลัมน์ `isPublic` (ค่าเริ่มต้น true = พฤติกรรมเดิมของจุดอพยพที่มีอยู่),
`sourceHouseholdId`, `verifiedAt`, `verifiedById` + CHECK · เพิ่มอย่างเดียว

## เทสต์
`tests/integration/host-shelters.test.ts`
