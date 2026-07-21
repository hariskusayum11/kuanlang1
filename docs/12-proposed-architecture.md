# 12 — Proposed Architecture

> ตอบภารกิจที่ 10 — เสนอ Architecture และ Project Structure
> **ยังไม่สร้างโปรเจกต์ ไม่ติดตั้ง Package ไม่รัน Docker**

---

## 1. ภาพรวมสถาปัตยกรรม

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🌊 PUBLIC ZONE — ไม่ต้อง Login / ต้องรอดแม้ Server หลักล่ม (NFR-PUB-02)   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js ISR (revalidate 5 นาที) + CDN Cache                       │  │
│  │  Landing · จุดอพยพ · เบอร์ฉุกเฉิน · สถานะเหตุ · สมัครอาสา            │  │
│  │  ⭐ อ่านจาก Materialized View / Snapshot เท่านั้น — ไม่แตะตารางหลัก   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTPS (TLS 1.3)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  🔐 AUTHENTICATED ZONE                                                    │
│  Entry Console · Verification · Dashboard · Map · Volunteer · Incident    │
│  · Admin                                                                  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Next.js App Router (Docker)                                             │
│                                                                          │
│  ┌── Presentation ──────────────────────────────────────────────────┐   │
│  │  Server Components (default) · Client Components (เฉพาะ Entry)    │   │
│  │  ⚠️ Entry Console = Client ล้วน (T6: ห้าม round-trip ระหว่างช่อง)  │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
│                                 ▼                                        │
│  ┌── Application ───────────────────────────────────────────────────┐   │
│  │  Server Actions (mutation) · Route Handlers (Export/GeoJSON/API) │   │
│  │  🔴 ทุกตัวเริ่มด้วย: assertCan(ctx, action) + Zod.parse(input)    │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
│                                 ▼                                        │
│  ┌── Domain (Pure Functions — ไม่แตะ DB/HTTP) ───────────────────────┐   │
│  │  risk-engine · triage · coverage · discrepancy · coordinate       │   │
│  │  · field-status · pregnancy · anonymize                           │   │
│  │  ⭐ ทุกตัวต้องมี Unit Test (CLAUDE.md)                             │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
│                                 ▼                                        │
│  ┌── Authorization ─────────────────────────────────────────────────┐   │
│  │  policies/* · scope-resolver · audit-decorator                    │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
│                                 ▼                                        │
│  ┌── Data Access ───────────────────────────────────────────────────┐   │
│  │  Repositories (รับ AuthContext เสมอ) · Prisma · $queryRaw (GIS)   │   │
│  │  🔴 ESLint: ห้ามเรียก prisma.* นอก db/repositories/               │   │
│  └──────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────┼────────────────────────────────────────┘
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 16 + PostGIS 3.4                                             │
│  · 49+ tables · RLS (household, vulnerable_person) · Triggers · Views    │
│  · Audit append-only (GRANT/REVOKE + Trigger)                            │
└──────────────────────────────────────────────────────────────────────────┘
        │                    │                      │
   ┌────▼────┐        ┌──────▼──────┐       ┌──────▼──────┐
   │  Redis  │        │  MinIO/S3   │       │   Worker    │
   │  Cache  │        │ สแกน+Export │       │   BullMQ    │
   │ + BullMQ│        │  (SSE + 🔒) │       │             │
   └─────────┘        └─────────────┘       └─────────────┘
                                                    │
                        ┌───────────────────────────┼──────────────┐
                        ▼                           ▼              ▼
                   Lock Cleanup              Export/PDF      Notification
                   Risk Recalc               Stats           (LINE/SMS)
                   Retention (BR-30)         Snapshot
```

---

## 2. องค์ประกอบทีละส่วน

### 2.1 Next.js App Router

| หลักการ | รายละเอียด |
|---|---|
| **Server Components เป็นค่าเริ่มต้น** | ตาม CLAUDE.md — ลด JS bundle, ดีต่อ NFR-PUB-01 (โหลด ≤2 วิ บน 3G) |
| **Client Components เฉพาะที่ต้อง Interaction** | Entry Console, Map, Grid Mode, Form |
| **⭐ Entry Console = Client ล้วน** | T6: *"ห้ามมี Server Round-trip ระหว่างช่อง"* → NFR-E-02 (Tab latency ≤50ms) |
| **Route Groups** | `(public)` / `(auth)` / `(app)` — แยก Layout และ Middleware |
| **ISR สำหรับ Public** | T8: revalidate 5 นาที → NFR-PUB-03 (≥10,000 concurrent) |

**⚠️ ประเด็นสำคัญ: NFR-PUB-02 "หน้า Landing ใช้ได้แม้ Server หลักล่ม"**

ISR ยังต้องพึ่ง Next.js server → **ถ้า Server ล่ม ISR ก็ล่ม** → ต้องมีชั้นเพิ่ม:

| ทางเลือก | ได้ NFR-PUB-02? | ความซับซ้อน |
|---|---|---|
| ISR อย่างเดียว | ❌ ไม่ได้ | ต่ำ |
| ISR + CDN (`stale-while-revalidate` นาน) | 🟡 ได้บางส่วน — CDN serve cache เก่าต่อได้ | ต่ำ |
| **SSG + Build ใหม่ทุก 5 นาที** | ✅ ได้ — HTML นิ่งบน CDN | กลาง |
| **แยก Public เป็น App คนละตัว** | ✅ ได้เต็มที่ | สูง |

**ข้อเสนอ:** ISR + CDN ที่ตั้ง `stale-while-revalidate` ยาว (เช่น 24 ชม.) → ถ้า Origin ล่ม CDN จะ serve cache เก่าต่อ พร้อมแสดง Timestamp ว่า *"ข้อมูล ณ HH:MM"*
→ **เพราะข้อมูลเก่า 1 ชั่วโมงยังดีกว่าหน้าเว็บล่มตอนน้ำท่วมตี 2** — ตรงกับ RK-02 (Analog Fallback mindset)
⚠️ ต้องยืนยัน (ดู Q-34)

### 2.2 Authentication

| ประเด็น | ข้อเสนอ |
|---|---|
| Library | **Better Auth** (ตาม CLAUDE.md — ห้ามเปลี่ยน) |
| **⚠️ ต้องตรึงเวอร์ชันก่อน** | SCH-09 — Schema requirement ต่างกันระหว่างเวอร์ชัน (Q-19) |
| Schema generation | ใช้ `@better-auth/cli generate` **แทนการเขียนมือ** → ป้องกันไม่ตรงกัน |
| Password | Argon2 (NFR-S-03) |
| Session | Database session + `expiresAt` 30 นาที (FR-AUTH-06) |
| 2FA | plugin `twoFactor` สำหรับ ADMIN (FR-AUTH-05) — ต้องเพิ่มตาราง |
| Rate limit / Lockout | 5 ครั้ง (FR-AUTH-12) — Redis-based |
| **Role/Scope** | ⭐ **ใช้ `UserRole` + `UserCommunityScope`/`UserAreaScope` ของเราเอง** ไม่ใช่ admin plugin — เพราะต้องการ M:N + Community Scope ที่ plugin ไม่รองรับ |

### 2.3 Authorization

```
Request
  → Middleware (ตรวจ session, redirect ถ้าไม่ login)
  → Server Action / Route Handler
      → buildAuthContext(session)  → { userId, roles[], communityIds[], areaScopes[] }
      → assertCan(ctx, 'household:readPii', { householdId })   🔴 บังคับ
      → Zod.parse(input)                                        🔴 บังคับ
      → Repository(ctx, ...)  → inject scope filter             🔴 บังคับ
          → Prisma / $queryRaw
          → RLS (ชั้นสุดท้าย)                                    ✅ แนะนำ
      → auditLog(ctx, action, entity)  ใน Transaction เดียวกัน  📝 บังคับ
```

**หลักการบังคับใช้:**

| กฎ | วิธีบังคับ |
|---|---|
| ทุก Server Action ต้อง `assertCan()` | Code Review + ESLint custom rule + Test |
| Repository ต้องรับ `AuthContext` เป็น param แรก | TypeScript (ไม่มี default value) |
| ห้ามเรียก `prisma.*` นอก repositories | **ESLint `no-restricted-imports`** |
| Audit ต้องอยู่ใน Transaction เดียวกัน | Repository decorator |
| **RLS เป็นชั้นสุดท้าย** | เพราะ NFR-S-06 (DATA_ENTRY Query ไม่ได้) เป็น **Security Requirement** ไม่ใช่แค่ Feature → ต้อง Defense in Depth |

### 2.4 Prisma + PostgreSQL + PostGIS

| ประเด็น | ข้อเสนอ |
|---|---|
| **PostGIS columns** | ⭐ ใช้ `Unsupported("geography(Point, 4326)")` ใน schema.prisma → **หลีกเลี่ยง Drift** (SQL-02) |
| **Custom SQL** | ⭐ อยู่ใน `prisma/migrations/*/migration.sql` **เท่านั้น** — ไม่ใช่โฟลเดอร์แยกที่รันมือ |
| **Spatial Query** | `$queryRaw` (tagged template — parameterized) ห่อใน `GisRepository` |
| **ห้ามใช้** | `$queryRawUnsafe` — เสี่ยง SQL Injection |
| **Extension** | ประกาศ `extensions = [postgis, pg_trgm]` → Prisma สร้างให้ใน Migration แรก |
| **Transaction** | `prisma.$transaction()` สำหรับ: Pickup (SELECT FOR UPDATE SKIP LOCKED), Submit, Resolve, Merge, Version create |
| **Connection Pool** | PgBouncer เมื่อ scale (NFR-P-04: ≥50 concurrent) |

**⭐ Pickup Pattern (T7) — ป้องกัน 2 คนหยิบใบเดียวกัน:**

```typescript
// db/repositories/entry.repository.ts
async pickupSheet(ctx: AuthContext, batchId?: string): Promise<PaperSheet | null> {
  return this.prisma.$transaction(async (tx) => {
    // ⭐ FOR UPDATE SKIP LOCKED — คนอื่นที่ขอพร้อมกันจะข้ามแถวนี้ไป
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT ps.id FROM "paper_sheet" ps
      WHERE ps.status = 'PENDING'
        ${batchId ? Prisma.sql`AND ps."batchId" = ${batchId}` : Prisma.empty}
      ORDER BY ps."batchId", ps.sequence
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return null;

    return tx.paperSheet.update({
      where: { id: rows[0].id },
      data: {
        status: 'LOCKED',
        lockedById: ctx.userId,
        lockedAt: new Date(),
        lockExpiresAt: new Date(Date.now() + lockTimeoutMs),
      },
    });
  });
}

// ⭐ Entry 2 Pickup — ต้องกรองคนที่คีย์ Entry 1 ออก (BR-44 / SoD-01)
async pickupForVerify(ctx: AuthContext): Promise<PaperSheet | null> {
  return this.prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT ps.id FROM "paper_sheet" ps
      WHERE ps.status = 'ENTERED_1'
        AND NOT EXISTS (                          -- 🔴 SoD-01
          SELECT 1 FROM "entry_attempt" ea
          WHERE ea."sheetId" = ps.id
            AND ea."enteredById" = ${ctx.userId}
        )
      ORDER BY ps."batchId", ps.sequence
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    // ... lock + return
  });
}
```

### 2.5 Encryption Strategy

> ⚠️ **นี่คือส่วนที่ต้องตัดสินใจก่อน Phase 2** — เพราะกระทบโครงสร้างข้อมูล (ดู SCH-08)

| ชั้น | วิธี | ใช้กับ | กระทบ Search? |
|---|---|---|---|
| **1. At-rest (baseline)** | Volume/Disk Encryption + Backup Encryption | ทุกอย่าง | ❌ ไม่กระทบ |
| **2. Column (Randomized AES-256-GCM)** | Prisma Extension | `PersonVulnerability.detail`, `AssistanceNeed.detail`, `pregnancy*`, `EntryAttempt.payload`, `HouseholdVersion.snapshot`, `FieldQuery.answer`, `Discrepancy.value1/2` | ❌ (ไม่ต้องค้น) |
| **3. Blind Index (HMAC-SHA256)** | Column แยก `xxxHash` | `respondentPhone`, `houseNo` (ต้องค้นแบบ exact) | ✅ ค้น exact ได้ |
| **4. ไม่เข้ารหัส + RBAC/RLS/Audit** | — | `respondentName`, `VulnerablePerson.fullName` | ✅ ค้น trigram ได้ |
| **5. Object Storage** | S3 SSE + Signed URL อายุสั้น | `scanPdfUrl`, `scanImageUrl`, `ConsentRecord.scanUrl` | — |

**🔴 การแลกเปลี่ยนที่ต้องยอมรับ:** ชั้นที่ 4 หมายถึง **ชื่อจะไม่ถูกเข้ารหัสใน DB** เพื่อแลกกับ FR-SRC (ค้นหาชื่อด้วย trigram)
→ **ขัดกับ NFR-S-02 ตามตัวอักษร** → ต้องให้เจ้าของระบบ/นิติกรตัดสิน (Q-20)

**ทางเลือกถ้ายืนยันว่าต้องเข้ารหัสชื่อ:** ยอมเสียการค้นหาแบบ fuzzy → ค้นได้เฉพาะ exact match ผ่าน Blind Index → **ต้องแจ้ง Officer ว่าค้น "สมชา" แล้วจะไม่เจอ "สมชาย"**

### 2.6 File Storage

| ประเด็น | ข้อเสนอ |
|---|---|
| Storage | MinIO (dev) / S3-compatible (prod) |
| ใช้เมื่อ | **เมื่อจำเป็นตาม Module** (CLAUDE.md) → Phase 5 (สแกน) และ Phase 15 (Export) |
| เนื้อหา | สแกนกระดาษ (**L4** — BR-62), ใบ Consent (**L3**), Export files |
| Access | **Signed URL อายุสั้น (5 นาที)** — ห้าม Public bucket เด็ดขาด |
| Audit | ทุกการเข้าถึงสแกน = ดู PII → ต้อง Audit (BR-26) |
| Retention | Export หมดอายุ 7 วัน (`EXPORT_EXPIRY_DAYS`) → Worker ลบ |

### 2.7 Background Jobs (BullMQ + Redis)

| Job | ความถี่ | หน้าที่ | Phase |
|---|---|---|---|
| `release-expired-locks` | ทุก 1 นาที | ปลด Lock ค้าง (แก้ Race — SQL-05) + **Audit** | 5 |
| `compute-entry-stats` | ทุกชั่วโมง | `EntryStats` + Throughput + ETA | 9 |
| `recalculate-risk` | เมื่อ VERIFIED / เมื่อสร้าง RiskWeightVersion ใหม่ | คำนวณ Risk (**เฉพาะ VERIFIED**) | 10 |
| `flag-stale-triage` | ทุกวัน | `triageStale` + อายุครรภ์เกิน 42 สัปดาห์ | 10 |
| `refresh-public-snapshot` | ทุก 5 นาที | Materialized View / Snapshot สำหรับ Public | 13 |
| `export-job` | on-demand | Excel/PDF/CSV | 15 |
| `send-notification` | on-demand | LINE/SMS | 14 |
| `cleanup-exports` | ทุกวัน | ลบไฟล์เกิน 7 วัน | 15 |
| `pdpa-retention` | ทุกเดือน | ลบข้อมูลเกิน 5 ปี (BR-30) | 16 |
| `backup-verify` | ทุกวัน | ตรวจว่า Backup restore ได้จริง | 16 |

**⚠️ Redis/BullMQ ใช้เมื่อจำเป็น** (CLAUDE.md) → **Phase 5 เป็นต้นไป** — Phase 1-4 ยังไม่ต้องใช้

### 2.8 Audit Logging

| ประเด็น | ข้อเสนอ |
|---|---|
| Append-only | **GRANT/REVOKE เป็นหลัก** (app_user มีแค่ INSERT/SELECT) + Trigger เป็นชั้นเสริม |
| Retention | Trigger อนุญาต DELETE เฉพาะแถวเกิน 5 ปี (แก้ SQL-09 ที่ขัดกับ BR-30) |
| บังคับเขียน | Repository decorator — ถ้า Policy บอก `mustAudit: true` แต่ไม่มีการเขียน → **throw ที่ระดับ Type** |
| Transaction | Audit ต้องอยู่ใน Transaction เดียวกับการกระทำ → **ถ้า Audit ล้ม ต้อง Rollback** |
| ⚠️ ห้าม Log | **ชื่อ เบอร์ ข้อมูลสุขภาพ Consent พิกัดรายบ้าน** ลง Application Log (CLAUDE.md) — `AuditLog.changes` เก็บใน DB (ควบคุมได้) ไม่ใช่ stdout |

**⚠️ ประเด็นที่ต้องระวัง:** `AuditLog.changes Json` จะเก็บ old→new ซึ่ง**มี PII/L4** → ต้องเข้ารหัสหรือเก็บเฉพาะชื่อฟิลด์ที่เปลี่ยน (ไม่เก็บค่า) → **ต้องตัดสินใจ** (Q-35)

### 2.9 Reporting

| ประเด็น | ข้อเสนอ |
|---|---|
| PDF ไทย | **Puppeteer + HTML** (T3) — ทดสอบตั้งแต่ Sprint 1 (RK-11: PDF ไทยพัง) |
| Excel/CSV | `exceljs` / stream |
| **Coverage Watermark** | 🔴 **บังคับทุกฉบับ** (FR-CVG-05) — รวมถึงกรณี "ยังคำนวณไม่ได้" |
| Async | ผ่าน `ExportJob` + BullMQ (ไฟล์ใหญ่ไม่ควร block request) |
| Anonymize | RESEARCHER → บังคับผ่าน Anonymizer (BR-27) |
| Audit | ทุก Export ต้อง Audit + เก็บ `filterCriteria` |

### 2.10 GIS

| ประเด็น | ข้อเสนอ |
|---|---|
| Library | **MapLibre GL** (Open Source — ตรงข้อจำกัดงบประมาณ) หรือ Leaflet |
| Tiles | OSM (fallback) — Google Maps มีค่าใช้จ่าย |
| Mini map ตอนคีย์ | **Static Map API** (T9) — ประหยัด + เร็ว |
| Query | `$queryRaw` + GIST index + `&&` (bbox) + `ST_DWithin` (distance) |
| ⚠️ | ใช้ **`ST_Covers`** ไม่ใช่ `ST_Contains` สำหรับ geography (SQL-07) |
| Public | **Grid Aggregation + k≥5** — ไม่ส่งพิกัดรายบ้าน (AMB-01) |

### 2.11 Notification

| ประเด็น | ข้อเสนอ |
|---|---|
| ช่องทาง | LINE Messaging API, SMS Gateway, In-app |
| Template | `NotificationTemplate` (DB) — ไม่ Hardcode |
| Queue | BullMQ + retry |
| ⚠️ | **ห้ามใส่ PII ในข้อความ** — ส่ง Link ให้เข้ามาดูในระบบแทน |

### 2.12 Deployment

```yaml
# docker-compose.yml (ข้อเสนอ — ยังไม่รัน)
services:
  app:        # Next.js
  db:         # postgis/postgis:16-3.4
  cache:      # redis:7-alpine
  storage:    # minio/minio
  worker:     # BullMQ
  proxy:      # caddy:2-alpine (auto SSL)
  backup:     # postgres:16-alpine (pg_dump daily)
```

| ประเด็น | ข้อเสนอ |
|---|---|
| 1 คำสั่ง | `docker compose up` (NFR-M-02) |
| TZ | `Asia/Bangkok` — **⚠️ สำคัญต่อ `surveyedAt`** (QM-02) |
| Secret | `.env` (**ห้าม Commit** — CLAUDE.md) |
| Migration | `prisma migrate deploy` (ไม่ใช่ `dev`) ใน Production |

### 2.13 Backup & Monitoring

| ประเด็น | ข้อเสนอ | เกณฑ์ |
|---|---|---|
| Backup | Daily `pg_dump` + WAL archiving | 30 วัน (NFR-R-01) |
| **⭐ Restore Test** | ทดสอบ restore จริงทุกสัปดาห์ | **Backup ที่ restore ไม่ได้ = ไม่มี Backup** |
| RPO/RTO | ≤24 ชม. / ≤4 ชม. | NFR-R-02 |
| Uptime | ≥99.0% ปกติ / ≥99.9% Incident | NFR-A-01/02 |
| Monitoring | Health check, Error rate, P95 latency, Queue depth, **Lock ค้าง**, **Coverage** | |
| Alert | Server down, Disk >80%, Queue backlog, **Failed login spike**, **PII access spike** | |
| ⚠️ Log | **ห้าม Log PII** (CLAUDE.md) → ต้องมี Redaction Filter | |

### 2.14 Error Handling

| ชั้น | วิธี |
|---|---|
| Validation | Zod → error ภาษาไทยที่ผู้ใช้เข้าใจ |
| Domain | Result type (`{ ok, error }`) — ไม่ throw สำหรับ business error |
| Authorization | 403 + Audit (**ห้ามบอกว่า resource มีอยู่จริงหรือไม่** — ป้องกัน enumeration) |
| DB | Transaction rollback + retry (deadlock) |
| UI | Loading / Empty / Error states **ทุกหน้า** (Definition of Done) |
| Logging | Structured + **Redact PII** |
| ⚠️ | **ห้ามแสดง Stack trace ให้ผู้ใช้** |

---

## 3. Project Structure ที่เสนอ

```
skl-fris/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example                      # ⚠️ ห้าม commit .env
│
├── docs/                             # 📖 Documentation
│   ├── system-analysis.md            # (เดิม — v3.0)
│   ├── questionnaire.pdf             # (เดิม — Source of Truth)
│   ├── business-rules.md             # ⭐ ต้องสร้าง (GAP-D01)
│   ├── 01-system-summary.md … 15-database-fix-plan.md
│   └── adr/                          # ⭐ Architecture Decision Records
│       ├── 0001-volunteer-role-naming.md
│       ├── 0002-encryption-strategy.md
│       ├── 0003-postgis-unsupported-vs-raw-sql.md
│       └── 0004-coverage-computed-not-stored.md
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                   # ⭐ แหล่งความจริงของ SQL ทั้งหมด
│   │   ├── 0001_init/
│   │   ├── 0002_postgis_columns/
│   │   ├── 0003_functions_triggers/
│   │   ├── 0004_constraints/
│   │   ├── 0005_indexes/
│   │   └── 0006_views/
│   ├── seed.ts                       # Entry point
│   └── seeds/
│       ├── production/               # 01-areas … 06-critical-fields
│       └── development/              # ⚠️ ข้อมูลสังเคราะห์เท่านั้น
│
├── database/                         # 📖 เอกสารประกอบ (ห้ามรันมือ)
│   ├── README.md                     # ⚠️ "ดู prisma/migrations"
│   ├── functions/ · views/ · constraints/
│   └── drafts/00_postgis_extensions.sql   # ไฟล์เดิม — เก็บอ้างอิง
│
├── src/
│   ├── app/                          # ═══ App Routes ═══
│   │   ├── (public)/                 # 🌊 ไม่ต้อง Login — ISR
│   │   │   ├── page.tsx · evacuation/ · emergency/ · volunteer/register/
│   │   ├── (auth)/                   # login · forgot-password · reset-password
│   │   ├── (app)/                    # 🔐 ต้อง Login
│   │   │   ├── entry/ · verify/ · discrepancies/ · batches/
│   │   │   ├── entry-dashboard/ · field-queries/ · duplicates/
│   │   │   ├── households/ · vulnerable/ · dashboard/ · map/
│   │   │   ├── resources/ · reports/ · incidents/ · my-tasks/
│   │   │   ├── volunteer/ · admin/ · profile/
│   │   └── api/
│   │       ├── public/               # ⚠️ ต้องผ่าน View ที่ Aggregate แล้ว
│   │       ├── auth/[...all]/
│   │       ├── gis/ · exports/ · stats/
│   │
│   ├── features/                     # ═══ Features (UI + Actions) ═══
│   │   ├── public-portal/ · volunteer/ · batch/ · data-entry/
│   │   ├── verification/ · discrepancy/ · field-query/ · duplicate-merge/
│   │   ├── household/ · vulnerable/ · coverage/ ⭐ · risk/ · gis/
│   │   ├── dashboard/ · report/ · incident/ · admin/
│   │   └── */
│   │       ├── components/           # Client Components
│   │       ├── actions.ts            # 🔴 Server Actions (assertCan + Zod)
│   │       └── queries.ts            # Server-side data fetching
│   │
│   ├── domain/                       # ═══ Domain Services (Pure) ═══
│   │   ├── risk/
│   │   │   ├── risk-engine.ts        # 🔴 Pure + Unit Test
│   │   │   ├── risk-engine.test.ts
│   │   │   ├── hard-rules.ts · thresholds.ts · confidence.ts
│   │   ├── triage/                   # triage.ts (อิง surveyedAt)
│   │   ├── coverage/                 # ⭐ coverage.ts (ห้ามหารศูนย์)
│   │   ├── discrepancy/              # compare.ts · normalize.ts
│   │   ├── coordinate/               # parser.ts ⭐ (QM-04) · validator.ts
│   │   ├── field-status/             # field-status.ts
│   │   ├── pregnancy/                # ⭐ pregnancy.ts (QM-06)
│   │   ├── flood-depth/              # ⭐ depth.ts (QM-08)
│   │   ├── buddhist-date/            # ⭐ date.ts (QM-02)
│   │   └── anonymize/                # anonymize.ts (BR-27)
│   │
│   ├── db/                           # ═══ Data Access ═══
│   │   ├── prisma.ts
│   │   ├── extensions/               # encryption.ts · soft-delete.ts
│   │   └── repositories/             # 🔴 ที่เดียวที่เรียก prisma.* ได้
│   │       ├── base.repository.ts    # AuthContext + audit decorator
│   │       ├── household · vulnerable · batch · sheet · entry
│   │       ├── discrepancy · community · coverage · risk
│   │       ├── gis.repository.ts     # $queryRaw + PostGIS
│   │       ├── incident · volunteer · audit · export
│   │
│   ├── authz/                        # ═══ Authorization ═══
│   │   ├── context.ts                # buildAuthContext()
│   │   ├── assert.ts                 # assertCan()
│   │   ├── scope-resolver.ts         # ⭐ Community + Area Scope
│   │   └── policies/                 # household · sheet · entry · discrepancy
│   │                                 # · export · incident · volunteer · admin
│   │
│   ├── schemas/                      # ═══ Zod (Single Source of Truth — T2) ═══
│   │   ├── questionnaire/            # ⭐ เรียงตามกระดาษ
│   │   │   ├── section-0.schema.ts … section-5.schema.ts
│   │   │   └── surveyor-section.schema.ts
│   │   ├── batch · entry · discrepancy · volunteer · incident · export
│   │   └── common/                   # phone · coordinate · thai-date
│   │
│   ├── lib/
│   │   ├── auth/                     # Better Auth config
│   │   ├── crypto/                   # ⭐ encrypt.ts · blind-index.ts
│   │   ├── audit/                    # audit.ts
│   │   ├── storage/                  # s3.ts (signed URL)
│   │   ├── queue/                    # bullmq.ts
│   │   ├── pdf/                      # puppeteer.ts (Thai font)
│   │   └── logger.ts                 # ⭐ PII redaction
│   │
│   ├── components/ui/                # shadcn/ui
│   ├── config/                       # settings.ts (อ่านจาก SystemSetting)
│   └── middleware.ts
│
├── worker/                           # BullMQ jobs
│   ├── index.ts
│   └── jobs/                         # release-locks · recalc-risk · export
│                                     # · notification · retention · snapshot
│
└── tests/                            # ═══ Tests ═══
    ├── unit/                         # domain/* (Vitest)
    ├── integration/                  # repositories · actions · policies
    │   └── security/                 # 🔴 RBAC bypass · DATA_ENTRY · VOLUNTEER
    ├── e2e/                          # Playwright
    │   ├── entry-keyboard.spec.ts    # 🔴 คีย์ 1 ใบไม่แตะเมาส์
    │   ├── entry-speed.spec.ts       # 🔴 ≤4 นาที
    │   ├── double-entry.spec.ts · batch-close.spec.ts
    │   └── public-portal.spec.ts     # 🔴 3G ≤2 วิ + ไม่มี PII
    └── fixtures/                     # ⚠️ ข้อมูลสังเคราะห์เท่านั้น
```

---

## 4. ตารางแยกความรับผิดชอบตามที่คำสั่งกำหนด

| สิ่งที่ต้องแยก | ตำแหน่ง | หลักการ |
|---|---|---|
| **App routes** | `src/app/` | Route Groups: `(public)` / `(auth)` / `(app)` |
| **Features** | `src/features/*/` | UI + Server Actions ต่อ Module |
| **Domain services** | `src/domain/*/` | 🔴 **Pure Function + Unit Test — ไม่แตะ DB/HTTP** |
| **Database repositories** | `src/db/repositories/` | 🔴 **ที่เดียวที่เรียก `prisma.*` ได้** + รับ `AuthContext` เสมอ |
| **Validation schemas** | `src/schemas/` | Zod = Single Source of Truth (T2) — ใช้ทั้ง Client + Server |
| **Authorization policies** | `src/authz/policies/` | Pure Function + Unit Test ครบทุก Role |
| **Risk engine** | `src/domain/risk/` | 🔴 Pure + Unit Test (CLAUDE.md บังคับ) |
| **GIS services** | `src/db/repositories/gis.repository.ts` + `src/domain/coordinate/` | Query แยกจาก Logic |
| **Audit services** | `src/lib/audit/` + `src/db/repositories/base.repository.ts` | Decorator บังคับ |
| **Tests** | `tests/` | unit / integration / integration-security / e2e |
| **Documentation** | `docs/` + `docs/adr/` | ADR บันทึกการตัดสินใจ |

---

## 5. หลักการสถาปัตยกรรมที่บังคับ (สรุปจาก CLAUDE.md)

| # | หลักการ | วิธีบังคับ |
|---|---|---|
| 1 | Server Components เป็นค่าเริ่มต้น | Code Review |
| 2 | **Business Logic แยกจาก UI** | `domain/` ห้าม import จาก `features/` หรือ `app/` — **ESLint** |
| 3 | **Validation ด้วย Zod ทั้ง Client และ Server** | Schema เดียวใช้ 2 ที่ |
| 4 | **ห้ามเชื่อข้อมูลจาก Client** | ทุก Action `Zod.parse()` |
| 5 | **RBAC ตรวจฝั่ง Server ทุกครั้ง** | `assertCan()` + Test |
| 6 | **ซ่อนปุ่มไม่ใช่ Authorization** | Security Test |
| 7 | **ห้าม Hardcode Master Data** | Code Review + ไม่มี constant ที่ซ้ำกับ DB |
| 8 | **ห้ามใช้ `any`** (เว้นแต่มี Comment) | `tsconfig` strict + ESLint |
| 9 | **Risk = Pure Function + Unit Test** | โครงสร้าง `domain/risk/` |
| 10 | **Transaction สำหรับงานที่แข่งกัน** | Pickup/Submit/Resolve/Merge |
| 11 | **Pickup ต้องกัน 2 คนหยิบใบเดียวกัน** | `FOR UPDATE SKIP LOCKED` (T7) |

---

## 6. Architecture Decision Records ที่ต้องบันทึก

| ADR | หัวข้อ | สถานะ |
|---|---|---|
| 0001 | ชื่อ Role: `VOLUNTEER` vs `RESCUE_VOLUNTEER` | ⏳ รอยืนยัน (Q-19/CONF-02) |
| 0002 | Encryption Strategy — ชื่อเข้ารหัสหรือไม่? | ⏳ รอยืนยัน (Q-20) |
| 0003 | PostGIS: `Unsupported()` vs Raw SQL | ✅ เสนอ: `Unsupported()` (SQL-02) |
| 0004 | Coverage: คำนวณ ไม่เก็บ | ✅ เสนอ (doc 06) |
| 0005 | Risk: `absoluteScore` สำหรับจัดระดับ | ⏳ รอยืนยัน (Q-25) |
| 0006 | Public Map: Grid + k-anonymity (ไม่ใช้ Jitter) | ⏳ รอยืนยัน (Q-06) |
| 0007 | Community ↔ Tambon: M:N + `isPrimary` | ✅ เสนอ (doc 05) |
| 0008 | Custom SQL อยู่ใน Prisma Migration | ✅ เสนอ (SQL-02) |
| 0009 | RLS เป็นชั้นที่ 4 | ⏳ รอยืนยัน |
| 0010 | Public Portal: ISR + CDN stale-while-revalidate | ⏳ รอยืนยัน (Q-34) |
