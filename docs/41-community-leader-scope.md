# 41 — หัวหน้าชุมชนเห็นแดชบอร์ด ข้อมูลชุมชน และแผนที่ เฉพาะชุมชนของตน

**Owner Decision 2026-10-19 (เฟส 4 ของแผนประชุม)** · สถานะ: **บังคับใช้แล้ว 2026-10-21**

ต่อจาก [34](34-community-leader-status.md) — หัวหน้าชุมชนเดิมมีแค่หน้า "สถานะกลุ่มเปราะบาง"
เจ้าของระบบให้เห็นภาพรวมของชุมชนตนเองด้วย และ **เห็นจุดรายบ้านบนแผนที่ของชุมชนตนได้**

---

## 1. สิทธิ์

| Permission | หน้า | หมายเหตุ |
|---|---|---|
| `vulnerable.status.update` | `/community-status` | เดิม (docs/34) |
| `dashboard.view` | `/dashboard` (หน้าแรกหลังเข้าระบบ) · `/priority-rules` (อ่านอย่างเดียว) | |
| `community.view` | `/communities` | ไม่มี `community.manage` — แก้จำนวนครัวเรือนไม่ได้ |
| `map.view` | `/map` | จุดรายบ้านพร้อมที่อยู่ของชุมชนตน |
| `vulnerable.red.view` | การ์ดเมนูลัดบน `/dashboard` · `/red-group/export` · `/map?red=on` | **เพิ่ม 2026-10-26** — รายชื่อกลุ่มสีแดงของชุมชนตน (ชื่อ เบอร์ พิกัด) ดู [42](42-red-group.md) |

**อัปเดต 2026-10-26:** เพิ่มชุดสิทธิ์ "แอดมินชุมชน" — `household.view` · `report.view` · `community.manage` ·
`site.manage` · `shelter.verify` · `volunteer.list.view` (ทั้งหมดเฉพาะชุมชนที่ผูกไว้) ดู [43](43-community-admin.md)
ยังไม่ให้: `medical.*` · `verification.view` · `survey.entry` · ส่งออกรายบุคคลทั่วไป · ตั้งค่า/จัดการผู้ใช้
· `settings.view` · `verification.view`

## 2. ขอบเขต — ข้อยกเว้นเดียวของ #R7-B

`buildAuthorization()` (`lib/authz/access.ts`) คืน `isGlobalScope: false` เมื่อ
`isCommunityScopedAccount(roles)`:

- บัญชีมี `COMMUNITY_LEADER` **และ** ทุก Role ที่เหลืออยู่ใน {`VOLUNTEER`, `FIELD_SURVEYOR`, `DATA_ENTRY`}
  (Role ที่ไม่มีหน้าข้อมูลชุมชนของตัวเอง — ผู้คีย์ถูกกรองด้วย `enteredById` ไม่ใช่ชุมชน)
- ถือ Role อื่นด้วย (เช่น OFFICER, ADMIN) → ทั้งระบบเหมือนเดิม เพราะ Role นั้นเห็นทุกชุมชนอยู่แล้ว
  · Role ใหม่ในอนาคตจะถูกนับเป็น "ทั้งระบบ" จนกว่าจะเพิ่มเข้ารายการโดยตั้งใจ
- `communityIds` มาจาก `UserCommunityScope` (`loadAuthorizationForUser`) · **ไม่ผูกชุมชน = ไม่เห็นอะไรเลย**
  ทุกโมดูลคืนว่างเมื่อ `isGlobalScope=false` และ `communityIds=[]` (ห้าม fallback เป็นทั้งระบบ)
- ธง `hasGlobalCommunityScope` ไม่มีผล (แม้ค้างค่า `true`)

บทบาทอื่นทุกตัวยังเป็น `isGlobalScope: true` ตาม #R7-B

## 3. จุดที่กรองตามขอบเขต (ตรวจแล้วทั้งหมด)

| หน้า | แหล่งข้อมูล | กรองอย่างไร |
|---|---|---|
| `/dashboard` | `fetchScopedDashboardCounts` · `fetchCommunityCoverage` · `fetchQuestionnaireAnalytics` (การ์ด กราฟ ตัวเลือกชุมชน ตาราง `byCommunity`) | `communityId IN scope` ใน `buildUsableHouseholdWhere` — ตัวกรอง `?community=` ของชุมชนอื่นได้ผลว่าง |
| `/dashboard` ปุ่ม "ดูรายละเอียด" | `/reports/detail-breakdown` | ไม่แสดง/403 — ต้องมี `medical.dashboard.view` |
| `/communities` | `listCommunities` | `id IN scope` |
| `/map` จุดบ้าน + ฮีตแมป + popup | `getHouseholdLayerMap` | `buildVerifiedMapHouseholdWhere(filters, scope)` · Audit `READ HouseholdLayerMap` ทุกครั้ง |
| `/map` กล่องข้อมูลชุมชน | `getCommunityMapSummaries` | coverage + กลุ่มเปราะบางตาม scope |
| `/map` ขอบเขตชุมชน | `getCurrentCommunityBoundaries({ communityIds: scopedCommunityIds(ctx) })` | |
| `/map` จุดสำคัญ | `getImportantSites(ctx, communityId)` | **แก้ในเฟสนี้** — เดิมไม่กรอง scope |
| `/map?help=on` | `getHelpPriority` | คืน `null` (ไม่มี `household.view`) |

ตำบล (ตัวเลือกตัวกรอง) และ Master Data ประเภทต่าง ๆ ไม่กรอง — เป็นข้อมูลอ้างอิง ไม่ใช่ข้อมูลสำรวจ

## 4. เทสต์

- `tests/integration/leader-scope.test.ts` — หัวหน้าชุมชน A เรียกทุกแหล่งข้อมูลข้างต้น แล้วตรวจว่า
  id/ชื่อ/รหัสชุมชน B บ้านเลขที่ และจุดสำคัญของ B ไม่อยู่ใน payload (รวมการขอ B ผ่านตัวกรอง) ·
  หัวหน้าที่ไม่ผูกชุมชน (ธงเดิม `true`) ได้ว่างทุกจุด · OFFICER ยังเห็นทั้งสองชุมชน
- `tests/unit/authz.test.ts` — สิทธิ์ที่ได้/ห้ามได้ · กติกา Role ผสม · เมนู
- `tests/unit/entry.test.ts` — หน้าแรกของหัวหน้าชุมชนคือ `/dashboard`

## 5. ยังไม่ได้ทำ

- หน้า `/priority-rules` แสดงชื่อผู้แก้กฎ (เจ้าหน้าที่) ให้หัวหน้าชุมชนเห็นด้วย เหมือน EXECUTIVE/RESEARCHER — ไม่ใช่ข้อมูลประชาชน
- ตัวเลือก "ตำบล" แสดงทุกตำบลในระบบ (ไม่ใช่เฉพาะตำบลของชุมชนตน) — เลือกตำบลอื่นแล้วได้ผลว่าง ไม่รั่ว
