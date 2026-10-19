# 37 — ลิงก์ระบบภายนอกบนหน้าสาธารณะ

**Owner Decision 2026-10-19** (ประชุม ข้อ 1) · สถานะ: **บังคับใช้แล้ว**

หน้าแรก (ไม่ต้องเข้าสู่ระบบ) มีหมวด **"ติดตามสถานการณ์ฝนและน้ำ"** เป็นการ์ดลิงก์ไปยังระบบของหน่วยงานอื่น
ต่อจากเบอร์ฉุกเฉิน กดแล้วเปิดแท็บใหม่ และแสดงชื่อโดเมนให้รู้ก่อนกดว่าจะไปเว็บไหน

## หลักการ
- เก็บในตาราง `external_link` (ไม่ฝังในโค้ด — กฎ "ห้าม Hardcode Master Data") แอดมินจัดการที่ **ผู้ใช้และระบบ → ลิงก์ระบบภายนอก** (`/admin/links`, สิทธิ์ `settings.view`)
- **https เท่านั้น** ตรวจ 2 ชั้น: Zod (`lib/external-links/validation.ts`) และ CHECK `ck_external_link_https` ในฐานข้อมูล — กันลิงก์ `javascript:`/`http:` บนหน้าสาธารณะ
- หมวด: ฝนและพายุ · ระดับน้ำ · ภาพดาวเทียมน้ำท่วม · หน่วยงานช่วยเหลือ · อื่น ๆ (CHECK `ck_external_link_category`)
- ไม่มีการลบจริง — ใช้ "ซ่อน" · ทุกการเพิ่ม/แก้/ซ่อนบันทึก Audit Log (ค่าก่อน/หลัง)
- ไม่มีข้อมูลส่วนบุคคล

## ลิงก์ตั้งต้น (seed — สร้างครั้งเดียว ไม่เขียนทับที่แอดมินแก้)
ตรวจแล้วว่าเปิดได้ 19 ต.ค. 2569: เรดาร์ตรวจอากาศหาดใหญ่ · Windy · กรมอุตุนิยมวิทยา · เฝ้าดูน้ำหาดใหญ่ (ควนลัง)
· ThaiWater · GISTDA ติดตามภัยพิบัติ · ปภ. · เทศบาลนครหาดใหญ่
— เว็บศูนย์อุทกวิทยาชลประทานภาคใต้เปิดไม่ได้ตอนตรวจ จึงยังไม่ใส่

**เซิร์ฟเวอร์จริง:** ต้องรัน seed หนึ่งครั้งหลัง deploy (`docker compose exec app npm run db:seed`) — ปลอดภัยเพราะทุกขั้นเป็น upsert

## ไฟล์
`prisma/migrations/20261020000000_external_links` · `lib/external-links/{validation,core,actions}.ts`
· `app/(dashboard)/admin/links/page.tsx` · `components/admin/external-link-manager.tsx`
· `components/public/external-link-cards.tsx` · เทสต์ `tests/integration/external-links.test.ts`
