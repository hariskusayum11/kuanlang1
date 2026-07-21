# 22 — Authentication Foundation & UI Shell (รอบ 2026-07-21)

> **วัตถุประสงค์:** บันทึกงานรอบ "Authentication Foundation + UI Shell แรก" — Login, Session, Route Protection, Layout, Dashboard ภาพรวม
> **ขอบเขต:** Session-auth เท่านั้น — **ยังไม่มี RBAC / ไม่ผูก `UserRole`** (งานรอบถัดไป) · ไม่มีโมดูลสำรวจครัวเรือน · ไม่แตะ schema/migrations/seeds
> **สถานะ:** เสร็จ — ยังไม่ commit (รอคำสั่งเจ้าของ)

---

## 1. สถาปัตยกรรมรวม

- **Next.js 16.2.11 (App Router)** — Server Components เป็นค่าเริ่มต้น, Client Components เฉพาะจุดที่มี interaction (login form, logout, sidebar)
- **Better Auth 1.6.23** — email/password credential เท่านั้น (ไม่มี social/signup/forgot ใน UI)
- **Prisma 5.22.0** — ต่อ Development DB เดิม (ไม่แก้ schema)
- **Tailwind CSS 4.3.3** (`@tailwindcss/postcss`) — ไม่มี shadcn/RHF/TanStack/icon lib รอบนี้ (ตามคำอนุมัติเจ้าของ)
- Business logic แยกจาก UI: `lib/` (auth, session helper, validations, errors, dashboard stats) — UI import จาก `lib/` เท่านั้น

### Version Matrix (ติดตั้งจริง)

| Package | Version | ประเภท |
|---|---|---|
| next | 16.2.11 | runtime |
| react / react-dom | 19.2.8 | runtime |
| zod | 4.4.3 | runtime |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | dev |
| @types/react | 19.2.17 | dev |
| @types/react-dom | 19.2.3 | dev |
| postcss | 8.5.21 | dev |
| better-auth (เดิม) | 1.6.23 | runtime — ไม่เปลี่ยน |
| prisma / @prisma/client (เดิม) | 5.22.0 | ไม่เปลี่ยน |
| vitest (เดิม) | 2.1.8 | ไม่เปลี่ยน |

ติดตั้งแบบปกติ (ไม่ใช้ `--force` / `--legacy-peer-deps`) — ไม่มี peer conflict

---

## 2. โครงสร้าง Route

```
app/
├── layout.tsx                     # root layout (lang="th", globals.css)
├── page.tsx                       # / → redirect("/dashboard")
├── globals.css                    # @import "tailwindcss" + Thai font stack
├── api/auth/[...all]/route.ts     # toNextJsHandler(auth) — GET/POST
├── (auth)/login/page.tsx          # หน้า Login (server; มี session active → /dashboard)
└── (dashboard)/
    ├── layout.tsx                 # Protected layout — getActiveSessionUser() || redirect("/login")
    ├── error.tsx                  # Error boundary — ข้อความกลาง ไม่มี stack trace
    └── dashboard/
        ├── page.tsx               # ภาพรวม (force-dynamic, Prisma counts จริง)
        └── loading.tsx            # skeleton
components/
├── auth/login-form.tsx            # client — zod validate + authClient.signIn.email
├── auth/logout-button.tsx         # client — authClient.signOut → /login
└── layout/app-sidebar.tsx, app-header.tsx
lib/
├── prisma.ts                      # PrismaClient singleton (server-only)
├── auth.ts                        # betterAuth instance + inactive-blocking hook
├── auth-client.ts                 # createAuthClient (client)
├── auth-session.ts                # getServerSession / getActiveSessionUser
├── validations/auth.ts            # loginSchema (zod)
├── errors.ts                      # SAFE_ERROR_MESSAGES + safeErrorMessage
├── dashboard/stats.ts             # fetchDashboardCounts + toStatCards (pure)
└── app-config.ts                  # APP_NAME ฯลฯ + APPLIED_MIGRATION_COUNT = 3
scripts/create-dev-user.ts         # สร้าง Development Test User (Option B)
```

---

## 3. Session Flow & Route Protection

1. Login form (client) → zod validate → `authClient.signIn.email()` → Better Auth API route → session cookie
2. **Protected layout** `app/(dashboard)/layout.tsx` (server) เรียก `getActiveSessionUser()` **ทุก request**:
   - ไม่มี session → `redirect("/login")`
   - มี session แต่ user ไม่พบ หรือ `isActive=false` → `redirect("/login")`
3. **ไม่ใช้ middleware** — ตรวจใน server layout เพราะต้องอ่าน DB (`isActive`) ทุกครั้ง ซึ่ง middleware (edge) ทำไม่เหมาะ
4. **Inactive user ถูกบล็อก 2 ชั้น:**
   - ชั้นที่ 1 (ตอน sign-in): `databaseHooks.session.create.before` ใน `lib/auth.ts` — โยน `APIError("FORBIDDEN")` ถ้า `isActive=false` → session ไม่ถูกสร้างเลย
   - ชั้นที่ 2 (ทุก request): `getActiveSessionUser()` เช็ค `isActive` จาก DB
5. หน้า Login ใช้ `getActiveSessionUser()` (ไม่ใช่ raw session) ตัดสิน redirect → ไม่เกิด redirect loop กับ user ที่ถูกปิดบัญชีภายหลัง
6. Logout: `authClient.signOut()` → `/login`
7. ไม่มี open redirect — redirect target hardcode เป็น `/dashboard` / `/login` เท่านั้น

---

## 4. หน้า Login

- ภาษาไทย, card กลางจอ, autoComplete `email` / `current-password`, Enter submit ได้ (`noValidate` + onSubmit)
- Error ทุกกรณี (email ไม่พบ / รหัสผิด / inactive) แสดง**ข้อความกลางเดียวกัน**: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" — ไม่เปิดเผยว่า field ไหนผิดหรือสถานะบัญชี
- ไม่มีลิงก์สมัครสมาชิก / ลืมรหัสผ่าน / social login
- ปุ่ม submit ล็อกระหว่างส่ง (กันส่งซ้ำ)

## 5. UI Shell

- **Sidebar** (slate-800): เมนู 7 รายการ — เปิดใช้เฉพาะ **ภาพรวม**; ชุมชน/ครัวเรือน/แบบสอบถาม/การตรวจสอบข้อมูล/รายงาน/ตั้งค่าระบบ = disabled + badge "เร็ว ๆ นี้" · mobile drawer
- **Header**: ชื่อหน้า + ชื่อ/อีเมลผู้ใช้ + ปุ่มออกจากระบบ
- **Dashboard**: การ์ด 5 ใบจาก Prisma counts จริง — ชุมชน 5, ตำบล 2, หมู่ 5, ครัวเรือน 0, จุดอพยพ 0 (สองใบหลัง flag `pending` โทนเทา "โมดูลอยู่ระหว่างพัฒนา") · สถานะระบบ: Migration = `APPLIED_MIGRATION_COUNT` (ค่าคงที่ใน `lib/app-config.ts` — **ไม่** query `_prisma_migrations`) · `force-dynamic`
- Loading state = skeleton · Error boundary = ข้อความกลาง + ปุ่มลองใหม่ (ไม่มี stack trace)

---

## 6. Environment Variables (ชื่อเท่านั้น — ไม่บันทึกค่า)

| ตัวแปร | ที่อยู่ | หมายเหตุ |
|---|---|---|
| `BETTER_AUTH_SECRET` | `.env` (gitignored) | สร้างด้วย crypto.randomBytes(32) base64url — ไม่เคยถูกพิมพ์/log |
| `BETTER_AUTH_URL` | `.env` | `http://localhost:3000` (local เท่านั้น) |
| `DEV_AUTH_EMAIL` | `.env` | `dev-admin@test.invalid` (synthetic เท่านั้น) |
| `DEV_AUTH_PASSWORD` | `.env` | ≥12 ตัวอักษร random — ไม่เคยถูกพิมพ์/log |

- `.env.example` มี placeholder ครบ (ค่าว่างสำหรับ secret) — committable
- ไม่มีตัวแปร secret ใดใช้ prefix `NEXT_PUBLIC_`

## 7. Development Test User (Option B)

- `npm run auth:create-dev-user` → `scripts/create-dev-user.ts` ผ่าน `auth.api.signUpEmail` (Better Auth hash เอง — ไม่ hash เอง, ไม่แตะ seed)
- Safety gates: `DATABASE_URL` + `BETTER_AUTH_URL` ต้อง localhost, email ต้อง `@test.invalid`, password ≥12, idempotent, ไม่พิมพ์ password
- **ผลจริง:** สร้างสำเร็จ — DB ยืนยัน `dev-admin@test.invalid` · `isActive=t` · Account `providerId=credential` มี hash (ไม่ใช่ plaintext)

---

## 8. Security ที่ตรวจแล้ว

- ไม่ log password / token / auth request body ที่ใดในโค้ดที่สร้างรอบนี้
- `DATABASE_URL` / secret ไม่ถูกส่งเข้า Client Component (Prisma อยู่ใน server เท่านั้น; ตรวจ HTML จริงแล้วไม่มี `postgresql://`, `BETTER_AUTH_SECRET`, รหัส DB)
- `safeErrorMessage()` ไม่สะท้อนเนื้อหา error ภายใน (มี unit test ยืนยัน connection string ไม่รั่ว)
- signup ถูกปิดใน production (`disableSignUp: NODE_ENV === "production"`) — dev เปิดไว้เฉพาะเพื่อ script + integration tests
- **ยังไม่มี RBAC** — ทุก role ที่ login ได้เห็น dashboard เหมือนกัน (ข้อจำกัดที่ตั้งใจ รอบถัดไปผูก `UserRole`)

---

## 9. ผลการทดสอบ

| ชุด | ผล |
|---|---|
| `npx prisma validate` | ผ่าน |
| `npx prisma migrate status` | 3 migrations — up to date, ไม่มี drift |
| `npm test` (ทั้งหมด) | **57/57 ผ่าน · `it.todo` = 0** (5 ไฟล์) |
| — unit เดิม | 44 (coverage 7 + schema-structure 22 + db integration 15) — ไม่แตก |
| — `tests/unit/auth-ui.test.ts` (ใหม่) | 7 ผ่าน — loginSchema 4, toStatCards 2, safeErrorMessage 1 |
| — `tests/integration/auth.test.ts` (ใหม่) | 6 ผ่าน — signUp สร้าง user+credential(hash ไม่ใช่ plaintext), รหัสผิด reject + session=0, รหัสถูก สำเร็จ + session ใน DB, inactive ถูก hook บล็อก + session=0, fetchDashboardCounts = 5/2/5/0/0, dev-admin ไม่ถูกแตะ |
| `npx tsc --noEmit` | ผ่าน (รวมหลัง build ปรับ `jsx: react-jsx`) |
| `npm run build` | ผ่าน — routes: `/` (static), `/login`, `/dashboard`, `/api/auth/[...all]` (dynamic) |
| `npm audit --omit=dev` | ไม่มี critical runtime — critical/high ทั้งหมดอยู่ในสาย vitest/vite/esbuild (devDependencies เดิม, ห้าม upgrade รอบนี้) → ไม่เข้าเงื่อนไข HALT |

- Integration tests gate ด้วย `describe.skipIf(!isLocalDevDb)` + fixtures `test-auth-*@test.invalid` ลบใน beforeAll/afterAll — ไม่แตะ `dev-admin@test.invalid`

## 10. Manual Verification (dev server จริง)

| ข้อ | ผล |
|---|---|
| `/login` render ครบ (โลโก้/ฟอร์ม/ข้อความ) | ✅ ตรวจใน browser |
| `/dashboard` ไม่มี session → redirect `/login` | ✅ pathname ปลายทาง = `/login` |
| รหัสผ่านผิด → ข้อความกลาง "อีเมลหรือรหัสผ่านไม่ถูกต้อง" | ✅ API ตอบ 401, UI แสดงข้อความกลาง (ใช้รหัส dummy) |
| ไม่มี secret ใน HTML/console | ✅ ตรวจ outerHTML + console แล้ว |
| Login สำเร็จ / inactive ถูกบล็อก / logout | ⚠️ ยืนยันผ่าน **integration tests** แทน (นโยบายความปลอดภัย: ไม่พิมพ์รหัสผ่านจริงลง browser) — signIn สำเร็จ+session, inactive reject, signOut เป็น API มาตรฐาน Better Auth |
| Dev server หยุดหลังทดสอบ | ✅ |

## 11. ข้อจำกัดที่ทราบ (Known Limitations)

1. ไม่มี `lint` script ใน repo — ข้าม lint step (ไม่ติดตั้ง eslint เพิ่มเพราะนอกขอบเขตอนุมัติ)
2. ไม่มี DOM test environment (jsdom) — ทดสอบ UI component ตรง ๆ ไม่ได้ ใช้ auth helper + data layer tests แทน
3. Login สำเร็จ/logout ใน browser ไม่ได้ verify ด้วยมือ (เหตุผลข้อ 10) — ครอบคลุมด้วย integration tests
4. `next build` ปรับ `tsconfig.json` อัตโนมัติ (`jsx: react-jsx`) และสร้าง `next-env.d.ts` (gitignored)
5. `lastLoginAt` ประกาศใน additionalFields แต่ยังไม่มี logic อัปเดต (รอรอบ RBAC/audit)
6. หัวข้อ header ตายตัว "ภาพรวม" (มีหน้าเดียว) — ทำ dynamic เมื่อมีหลายหน้า

## 12. งานถัดไปที่แนะนำ

1. ผูก RBAC (`UserRole` + Community Scope) ตรวจฝั่ง server
2. อัปเดต `lastLoginAt` + Audit log การ login
3. เพิ่ม jsdom + component tests เมื่อ UI ซับซ้อนขึ้น
4. Custom SQL formalize ที่เหลือ (GIST/GIN 0005, views 0006)
