# 23 — RBAC + Community Scope Foundation

> รอบงาน: 2026-07-22 · ต่อจาก docs/22 (Authentication & UI Foundation)
> ขอบเขต: Permission model กลาง + Authorization context ฝั่ง Server + Route protection + Sidebar ตามสิทธิ์ + Dashboard แบบ Scoped + Dev access script
> ไม่รวม: การแก้ schema/migration/seed, Audit logging (ดู §10), CRUD modules, UI จัดการผู้ใช้/มอบหมาย role

## 1. สรุปสถาปัตยกรรม

- **Single source of truth**: สิทธิ์ทั้งหมดประกาศที่ `lib/authz/permissions.ts` + `lib/authz/role-permissions.ts` — ห้ามเช็ค role กระจายตามหน้า
- **Server เป็นผู้ตัดสิน**: ทุกการตรวจสิทธิ์เกิดฝั่ง Server (layout / page / helper) — Sidebar เป็นแค่การแสดงผล ไม่ใช่ Authorization
- **Scope 2 ระดับ**: Global scope (เห็นทั้งระบบ) กับ Community scope (เห็นเฉพาะชุมชนใน `UserCommunityScope`)
- ไม่แตะ `prisma/schema.prisma`, migrations, seeds — ใช้ตาราง `UserRole` / `UserCommunityScope` ที่มีอยู่แล้วทั้งหมด

## 2. ไฟล์ที่สร้าง/แก้ไข

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `lib/authz/permissions.ts` | สร้าง | ประกาศ `PERMISSIONS` const + `Permission` type (8 สิทธิ์) |
| `lib/authz/role-permissions.ts` | สร้าง | `ROLE_PERMISSIONS` (role → permissions) + `GLOBAL_SCOPE_ROLES` |
| `lib/authz/types.ts` | สร้าง | `AuthorizationContext` interface |
| `lib/authz/access.ts` | สร้าง | Pure functions: `buildAuthorization`, `hasPermission`, `hasAnyPermission`, `canAccessCommunity` |
| `lib/authz/load-authorization.ts` | สร้าง | `loadAuthorizationForUser` — โหลด role/scope จาก DB (แยกไฟล์เพื่อให้ vitest เรียกได้) |
| `lib/authz/context.ts` | สร้าง | Server-only: `getAuthorizationContext`, `requirePermission`, `requireCommunityAccess` |
| `lib/navigation.ts` | สร้าง | `NAV_ITEMS` (เมนู + permission + implemented flag) + `visibleNavItems` |
| `lib/dashboard/get-dashboard-stats.ts` | สร้าง | `fetchScopedDashboardCounts` — ตัวเลข Dashboard ตาม scope |
| `app/access-denied/page.tsx` | สร้าง | หน้าปฏิเสธสิทธิ์ (ภาษาไทย, ไม่รั่วรายละเอียดภายใน) |
| `scripts/assign-dev-access.ts` | สร้าง | ผูก role/scope ให้ dev user (localhost-only, idempotent) |
| `app/(dashboard)/layout.tsx` | แก้ | ตรวจ session → `dashboard.view` → ส่งเมนูที่กรองแล้วให้ Sidebar |
| `app/(dashboard)/dashboard/page.tsx` | แก้ | ใช้ scoped counts + แสดงหมายเหตุ scope |
| `components/layout/app-sidebar.tsx` | แก้ | รับ `items` prop จาก Server — ลบ `MENU_ITEMS` hardcode |
| `.env.example` | แก้ | เพิ่ม placeholder `DEV_AUTH_ROLE` / `DEV_AUTH_COMMUNITIES` |
| `package.json` | แก้ | เพิ่ม script `auth:assign-dev-access` |
| `tests/unit/authz.test.ts` | สร้าง | 19 unit tests |
| `tests/integration/rbac.test.ts` | สร้าง | 10 integration tests |

## 3. Permission model

8 สิทธิ์: `dashboard.view`, `community.view`, `household.view`, `survey.entry`, `verification.view`, `report.view`, `settings.view`, `user.manage`

หลักการ: สร้างเฉพาะสิทธิ์ที่มีเมนู/งานรองรับใน docs/10 — ไม่สร้างสิทธิ์ล่วงหน้าสำหรับโมดูลที่ยังไม่ออกแบบ

## 4. Role → Permission matrix (ตาม docs/10, ให้สิทธิ์ขั้นต่ำเมื่อไม่ชัด)

| Role | Permissions | Scope |
|---|---|---|
| ADMIN | ทั้ง 8 | Global |
| EXECUTIVE | dashboard.view, community.view, report.view | Global (อ่านอย่างเดียวโดยธรรมชาติ — ยังไม่มีสิทธิ์แก้ไขใด) |
| OFFICER | dashboard.view, community.view, household.view, verification.view, report.view | Community |
| COORDINATOR | dashboard.view, community.view, report.view | Community |
| VERIFIER | verification.view | Sheet-level (matrix 🔸 เห็นเฉพาะคิวตัวเอง → ไม่ให้ dashboard.view) |
| DATA_ENTRY | survey.entry | Sheet-level (matrix 🔸 สถิติตัวเองเท่านั้น → ไม่ให้ dashboard.view) |
| VOLUNTEER | dashboard.view | Community (matrix 📊 aggregate ชุมชนตัวเอง) |
| RESEARCHER | dashboard.view, report.view | Anonymized/aggregate |
| FIELD_SURVEYOR | (ไม่มี) | matrix ❌ dashboard — ยังไม่มีโมดูล query ของตนเอง |

การจำแนก: อนุมัติแล้ว = ADMIN/EXECUTIVE/OFFICER (ชัดใน matrix) · ยังไม่ชัด → สิทธิ์ขั้นต่ำ = VERIFIER/DATA_ENTRY/VOLUNTEER/RESEARCHER/FIELD_SURVEYOR · Phase ถัดไป = สิทธิ์แก้ไขข้อมูล, export, การมอบหมาย role ผ่าน UI

## 5. Global scope

`GLOBAL_SCOPE_ROLES = [ADMIN, EXECUTIVE]` — อ้าง docs/10 §1 ที่ระบุระดับการมองเห็น "ทั้งระบบ" สำหรับสอง role นี้เท่านั้น role อื่นทั้งหมดขึ้นกับ `UserCommunityScope`

## 6. Authorization context (ฝั่ง Server)

- `loadAuthorizationForUser(user)` — อ่าน `UserRole` เฉพาะ `isActive: true` + `UserCommunityScope` ทั้งหมดของ user → สร้าง context ด้วย `buildAuthorization`
- `getAuthorizationContext()` — ต่อยอด `getActiveSessionUser()` (session + isActive check จาก docs/22) — คืน `null` เมื่อไม่มี session หรือ user inactive
- `requirePermission(p)` — null → `/login`, ไม่มีสิทธิ์ → `/access-denied`
- `requireCommunityAccess(id)` — สำหรับหน้าราย-ชุมชนในอนาคต
- ไม่อ่านสิทธิ์จาก query string / cookie / localStorage / client ใด ๆ ทั้งสิ้น

## 7. Route protection

| สถานการณ์ | ผล |
|---|---|
| ไม่มี session | redirect `/login` |
| user inactive (แม้มี session ค้าง) | redirect `/login` (ผ่าน `getActiveSessionUser`) |
| ไม่มี active role (permissions ว่าง) | redirect `/access-denied` |
| มี role แต่ไม่มี `dashboard.view` | redirect `/access-denied` |

`/access-denied` — หน้า standalone นอก protected layout: ข้อความไทยทั่วไป (ไม่บอก role matrix / user id / รายละเอียด DB), ปุ่มกลับหน้าภาพรวมแสดงเฉพาะเมื่อมี `dashboard.view`, ปุ่มออกจากระบบเสมอ; เข้าโดยไม่ login → redirect `/login`

## 8. Sidebar ตาม permission

- `lib/navigation.ts` เป็นแหล่งเดียวของเมนู (label/href/permission/implemented)
- Layout ฝั่ง Server กรองด้วย `visibleNavItems(ctx.permissions)` แล้วส่งเป็น prop
- เมนูไม่มีสิทธิ์ → ไม่แสดงเลย · มีสิทธิ์แต่โมดูลยังไม่สร้าง → แสดง "เร็ว ๆ นี้" (disabled)
- `AppSidebar` ไม่มี logic สิทธิ์เหลืออยู่ — เป็น presentational component

## 9. Dashboard scoped counts

`fetchScopedDashboardCounts({ isGlobalScope, communityIds })`:

- Global → ใช้ `fetchDashboardCounts()` เดิม (นับทั้งระบบ)
- Scope ว่าง (ไม่ global) → คืน 0 ทั้งหมดโดยไม่ query — **ห้าม fallback เป็น global เด็ดขาด**
- Scoped → ชุมชน: `id IN scope AND deletedAt IS NULL` · ครัวเรือน/จุดอพยพ: `communityId IN scope` (FK ตรง) · ตำบล: distinct `tambonId` ผ่าน `CommunityTambon` (M:N)
- **หมู่ (Moo) ไม่มี FK ไปชุมชน** — schema ผูก `Moo → Tambon` เท่านั้น จึงนับ "หมู่ทั้งหมดของตำบลที่ชุมชนใน scope ครอบคลุม" ตัวเลขนี้อาจกว้างกว่าหมู่ที่ชุมชนครอบคลุมจริง — เป็นข้อจำกัดของ schema ปัจจุบัน บันทึกไว้เพื่อพิจารณาในรอบ GIS/Boundary

หน้า Dashboard แสดงหมายเหตุ: global = "แสดงข้อมูลทั้งระบบ" · scoped = "แสดงเฉพาะชุมชนในสิทธิ์ของคุณ (N ชุมชน)"

## 10. Audit logging — ตัดสินใจไม่ implement รอบนี้

`AuditAction` enum ปัจจุบัน = CREATE READ UPDATE DELETE EXPORT LOGIN LOGOUT LOCK UNLOCK VERIFY RESOLVE MERGE APPROVE REJECT — **ไม่มีค่า AUTHORIZATION_DENIED หรือเทียบเท่า** การเพิ่มค่า enum = migration = ต้องขออนุมัติ จึงข้าม logging เหตุการณ์ปฏิเสธสิทธิ์ในรอบนี้ตามเงื่อนไขที่กำหนด → รอรอบที่ได้รับอนุมัติแก้ schema

## 11. Dev access script

`npm run auth:assign-dev-access` (`scripts/assign-dev-access.ts`):

- Safety gates: `DATABASE_URL` ต้องเป็น localhost · `DEV_AUTH_EMAIL` ต้องลงท้าย `@test.invalid`
- `DEV_AUTH_ROLE` ตรวจกับ `UserRoleEnum` จริง · `DEV_AUTH_COMMUNITIES` = รหัสชุมชนคั่น comma (แต่ละรหัสต้องมีจริง มิฉะนั้น error)
- upsert `UserRole` + `UserCommunityScope` — idempotent (รันซ้ำได้ id เดิม) · ไม่สร้าง user · ไม่ลบข้อมูลใด · ไม่พิมพ์ credential
- ผลการรันจริง: dev-admin ได้ role `ADMIN` (global, ไม่ผูก community scope) — รันซ้ำยืนยัน idempotent แล้ว

## 12. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| Unit `tests/unit/authz.test.ts` | 19/19 ผ่าน (mapping ครบทุก role, union, global scope, canAccessCommunity, visibleNavItems) |
| Integration `tests/integration/rbac.test.ts` | 10/10 ผ่าน (no-role, inactive-role, ADMIN, multi-role, scoped user, cross-scope denied, global counts = ทั้งระบบ, empty scope = 0, scoped counts ตรง query อิสระ, dev-admin/seed intact) |
| ทั้งระบบ `npm test` | **86/86 ผ่าน** (เดิม 57 + authz 19 + rbac 10) · skipped/todo = 0 |
| `prisma validate` / `tsc --noEmit` / `next build` | ผ่านทั้งหมด — build มี route `/access-denied` เพิ่ม |
| Fixtures หลังเทสต์ | 0 แถว (`test-rbac-%`, `test-auth-%`) |

## 13. Manual verification (browser)

| รายการ | ผล |
|---|---|
| `/dashboard` โดยไม่ login | redirect `/login` ✓ |
| `/access-denied` โดยไม่ login | redirect `/login` ✓ |
| HTML หน้า login | ไม่มี secret / role matrix / enum รั่ว ✓ |
| Server error log | ว่าง ✓ · ปิด dev server หลังทดสอบแล้ว ✓ |

ข้อจำกัด: การ login ผ่าน browser ไม่ทำ (นโยบายไม่กรอกรหัสผ่านจริงในเบราว์เซอร์อัตโนมัติ) — พฤติกรรมหลัง login (sidebar ตามสิทธิ์, scoped counts, access-denied เมื่อไม่มีสิทธิ์) ยืนยันผ่าน integration tests แทน

## 14. Security checklist

- ✅ Authorization ทุกจุดอยู่ฝั่ง Server — client ไม่มีอำนาจตัดสิน
- ✅ ไม่เชื่อ role/permission จาก client (ไม่มีการอ่านจาก cookie/query/localStorage)
- ✅ Scope ว่าง → ปฏิเสธ/ศูนย์เสมอ ไม่ fallback เป็น global
- ✅ `/access-denied` ไม่รั่วโครงสร้างสิทธิ์ภายใน
- ✅ Script dev มี localhost + synthetic-email gates, ไม่พิมพ์ credential
- ✅ ไม่มี secret ใน git (`.env` ignored — เพิ่มเฉพาะ `.env.example` placeholder)
- ✅ ไม่แตะ schema/migration/seed · ไม่ commit/push ในรอบนี้

## 15. งานที่เหลือ / รอบถัดไป

- Audit logging เหตุการณ์ปฏิเสธสิทธิ์ (ต้องเพิ่มค่า `AuditAction` → รออนุมัติ migration)
- `requireCommunityAccess` ยังไม่มีหน้าใช้จริง (เตรียมไว้สำหรับหน้าราย-ชุมชน)
- `canEdit` ใน `UserCommunityScope` ยังไม่ถูกใช้ (รอโมดูลแก้ไขข้อมูล)
- UI จัดการผู้ใช้/มอบหมาย role (ADMIN) — ตอนนี้ใช้ script dev เท่านั้น
- Dashboard ราย role ที่ละเอียดกว่า (VERIFIER คิวตัวเอง, DATA_ENTRY สถิติตัวเอง) — รอโมดูลจริง
- ทบทวนการนับ "หมู่" ต่อชุมชน เมื่อมีข้อมูล boundary/GIS
