# 33 — หน้าแผนที่ `/map`: แผนที่เต็มจอ + แผงชั้นข้อมูล

สถานะ: ใช้งานแล้ว (แบบที่เจ้าของระบบอนุมัติ 2026-10-18)

## ปัญหาเดิม

1. แผนที่สูงตายตัว 580px อยู่ใต้ PageHero + ฟอร์มตัวกรอง + การ์ดตัวเลข 6 ช่อง ต้องเลื่อนลงถึงจะเห็น
2. ตัวกรองแยกสองที่: ฟอร์มด้านบน (ต้องกด "แสดงผล") กับ checkbox อีกแถวเหนือแผนที่
3. จุดสำคัญ (โรงเรียน/วัด/ศูนย์อพยพ ฯลฯ) เปิด/ปิดได้ทั้งก้อนเท่านั้น กรองตามประเภทไม่ได้
4. ฟอร์มแอดมินจัดการจุดสำคัญต่อท้ายใต้แผนที่ ปนกับมุมมองของผู้ใช้ทั่วไป
5. ทุกครั้งที่ติ๊ก checkbox แผนที่ถูกสร้างใหม่ทั้งก้อน (กระพริบ มุมกล้องกระโดด)

## โครงหน้าใหม่

| ส่วน | ตำแหน่ง | เนื้อหา |
| --- | --- | --- |
| แผนที่ | เต็มพื้นที่ใต้ header (`100dvh − 4rem`) | ไม่มี PageHero — ชื่อหน้าอยู่ที่ AppHeader แล้ว |
| แผง "ชั้นข้อมูล" | ลอยขวา (เดสก์ท็อป) · แผ่นดึงขึ้นจากล่าง (มือถือ < 768px) | แผนที่พื้นฐาน → พื้นที่ → ครัวเรือน → จุดสำคัญ · "เปิด X จาก Y ชั้น" · พับได้ |
| คำอธิบายสัญลักษณ์ | ลอยซ้ายล่าง ย่อได้ (จอ < 1024px เริ่มแบบย่อ) | ตัวเลขสำคัญ (เปราะบาง/อาสา/พักพิง) + "ไม่มีพิกัด N หลัง" + สัญลักษณ์เฉพาะชั้นที่เปิด |
| ปุ่ม "เพิ่มจุดสำคัญ" | ลอยซ้ายบน ข้างปุ่มซูม | เฉพาะ `canManageImportantSites` · เปิด Modal: แท็บเพิ่มจุดใหม่ / จุดที่มีอยู่ (ค้นหา แก้ ลบ) |

- **Y ชั้น** = ชั้นครัวเรือน 4 (เปราะบาง/อาสา/พักพิง/ฮีตแมป) + ประเภทจุดสำคัญตาม `IMPORTANT_SITE_TYPES`
  แผนที่พื้นฐานไม่นับ (ต้องมีหนึ่งชั้นเสมอ)
- จำนวนกำกับในแผง = หลัง/จุด **ที่มีพิกัดบนแผนที่** · ตัวเลขในคำอธิบายสัญลักษณ์ = ทุกหลังที่ตรวจแล้ว
  (รวมหลังที่ไม่มีพิกัด) พร้อมบอกจำนวนที่ไม่มีพิกัดเป็น Denominator
- ช่วงวันที่ซ่อนใน "ตัวกรองขั้นสูง" (เปิดเองอัตโนมัติเมื่อมีค่าหรือช่วงไม่ถูกต้อง)

## สถานะใน URL (`lib/geo/map-view-state.ts`)

| พารามิเตอร์ | ค่า | ค่าเริ่มต้น (ไม่เขียนลง URL) |
| --- | --- | --- |
| `community`, `tambon` | id | ทุกชุมชน / ทุกตำบล |
| `from`, `to` | `YYYY-MM-DD` | ไม่จำกัด |
| `base` | `street` \| `satellite` | `street` |
| `layers` | `vulnerable,volunteer,host,heat` หรือ `none` | `vulnerable,volunteer,host` |
| `skill` | รหัสทักษะอาสา | ทุกทักษะ |
| `sites` | ประเภทจุดสำคัญคั่นจุลภาค หรือ `none` | ทุกประเภท |

- พื้นที่/วันที่ → `router.replace` ดึงข้อมูลใหม่จาก server ทันทีที่เลือก (ไม่มีปุ่ม "แสดงผล")
- ชั้นข้อมูล/แผนที่พื้นฐาน/ทักษะ → กรองฝั่ง client แล้วเขียน URL ด้วย `history.replaceState`
  ไม่โหลดข้อมูลซ้ำและไม่เพิ่ม Audit Log `HouseholdLayerMap` ทุกคลิก
- ค่าแปลกปลอมใน URL ถูกทิ้ง (id ต้องเป็น `[A-Za-z0-9_-]`, วันที่ต้องเป็น ISO) · เทสต์ `tests/unit/map-view-state.test.ts`

## จุดสำคัญ: action คืนผลแทน redirect

`saveImportantSiteAction` / `deleteImportantSiteAction` เดิม redirect ไป `/map?siteSaved=1`
ซึ่งล้างตัวกรองทุกครั้ง — ตอนนี้คืน `ImportantSiteActionState` ให้ `useActionState`
และ `revalidatePath("/map")` ส่งข้อมูลชุดใหม่มาในคำขอเดียวกัน มุมมองจึงอยู่ครบ
สิทธิ์ ADMIN ยังตรวจใน `saveImportantSite`/`deleteImportantSite` ฝั่ง server ทุกครั้ง
ลบแบบยืนยันสองจังหวะในหน้าต่างเดิม (ไม่ซ้อน modal)

## ข้อบังคับที่คงไว้

- RBAC: `requirePermission(PERMISSIONS.MAP_VIEW)` ที่ page · ปุ่มจัดการจุดซ่อนเป็นแค่ UX
- Privacy: popup แสดงที่อยู่เพื่อนำทาง ไม่มีชื่อ/เบอร์โทร (เหมือนเดิม) · หน้าอยู่หลังล็อกอิน
- Modal เรนเดอร์ผ่าน `components/ui/modal.tsx` (Portal) — เพิ่ม `size="lg"` สำหรับฟอร์มหลายช่อง
- กล่องแผนที่ใช้ `isolation: isolate` ขัง z-index ของ Leaflet (400–1000) ไม่ให้ทับ header/modal
- `leaflet.css` ไม่อยู่ใน cascade layer จึงต้องใช้ `!` เมื่อ override คลาสของ Leaflet ด้วย Tailwind

## แผนที่ดาวเทียม (Esri World Imagery)

แสดง attribution "Powered by Esri · Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User
Community" ตามเงื่อนไขของ Esri · **ต้องตรวจเงื่อนไขการใช้งานของ Esri (ปริมาณการเรียก/การใช้ในหน่วยงาน)
ก่อนเปิดใช้งานวงกว้างในระบบจริง** — หากไม่ผ่านให้ถอด `satellite` ออกพร้อมกันทั้ง `BASE_MAPS`
(`components/geo/household-layer-map.tsx`), `BASE_MAP_KEYS`/`parseMapViewState` (`lib/geo/map-view-state.ts`)
และปุ่มในแผง (`components/geo/map-workspace.tsx`)

## ไฟล์

`app/(dashboard)/map/page.tsx` · `app/(dashboard)/map/loading.tsx` ·
`components/geo/map-workspace.tsx` (แผง/legend/URL) · `components/geo/household-layer-map.tsx` (Leaflet) ·
`components/geo/important-site-manager.tsx` (Modal จัดการจุด) · `lib/geo/map-view-state.ts` ·
`lib/geo/important-site-actions.ts`
