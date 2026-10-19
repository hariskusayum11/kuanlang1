// Server-only: ข้อมูลหน้า "สถิติการใช้งาน" บนหน้าตั้งค่าระบบ (docs/36)
// ทุกตัวเลขเป็นยอดรวม — ไม่มีรายชื่อ/อีเมล/IP ของใครออกจากฟังก์ชันนี้
import { AuditAction, DuplicateResolutionEnum, PageViewAudience, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import {
  buildDailySeries,
  groupSensitiveAccess,
  summariseRegistrations,
  summariseSeries,
  topPages,
  usageWindow,
  type DailyPoint,
  type RankedList,
  type RegistrationSummary,
  type SensitiveAccessSummary,
  type SeriesSummary,
  type UsageWindow,
} from "../../domain/usage/aggregate";

export type PageViewKey = "PUBLIC" | "SIGNED_IN";
export type LoginKey = "LOGINS";
export type SheetKey = "KEYED" | "VERIFIED";

export interface UsageDashboard {
  window: UsageWindow;
  pageViews: {
    series: DailyPoint<PageViewKey>[];
    summary: SeriesSummary;
    publicTotal: number;
    signedInTotal: number;
    topPages: RankedList;
  };
  logins: {
    series: DailyPoint<LoginKey>[];
    summary: SeriesSummary;
    /** บัญชีที่ Login อย่างน้อย 1 ครั้งในช่วง (จาก AuditLog LOGIN) */
    distinctUsers: number;
    /** บัญชี active ที่ lastLoginAt อยู่ในช่วง 7 / 30 วัน */
    activeLast7: number;
    activeLast30: number;
    /** ตัวหาร: บัญชี active ทั้งหมด */
    activeAccounts: number;
    /** บัญชี active ที่ยังไม่เคย Login เลย */
    neverLoggedIn: number;
  };
  sensitive: SensitiveAccessSummary;
  registrations: RegistrationSummary & { createdInWindow: number };
  sheets: {
    series: DailyPoint<SheetKey>[];
    keyedInWindow: number;
    verifiedInWindow: number;
    /** ตัวหารทั้งระบบ (ทุกช่วงเวลา) — ใบที่ใช้งานได้ / ใบที่ตรวจแล้ว */
    keyedAllTime: number;
    verifiedAllTime: number;
  };
}

export type UsageDashboardResult =
  | { ok: true; data: UsageDashboard }
  | { ok: false; reason: "FORBIDDEN" };

/** timestamp(3) ของ Prisma เก็บเป็น UTC ไม่มี time zone → ส่งเป็นข้อความ UTC เพื่อไม่พึ่ง TimeZone ของ session */
function utcTimestampParam(at: Date): string {
  return at.toISOString().replace("Z", "");
}

/** ใบที่ใช้งานได้ — ตรงกับ buildUsableHouseholdWhere (ไม่ถูกลบ ไม่ใช่ใบซ้ำที่ยืนยันแล้ว) */
const USABLE_HOUSEHOLD = {
  deletedAt: null,
  OR: [{ duplicateResolution: null }, { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE }],
};

export async function loadUsageDashboard(
  ctx: AuthorizationContext,
  now: Date = new Date(),
): Promise<UsageDashboardResult> {
  // RBAC ฝั่ง server — หน้าเรียก requirePermission แล้ว แต่ข้อมูลชั้นนี้ต้องกันตัวเองด้วย
  if (!hasPermission(ctx, PERMISSIONS.SETTINGS_VIEW)) return { ok: false, reason: "FORBIDDEN" };

  const window = usageWindow(now);
  const since = utcTimestampParam(window.startInstant);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    pageViewRows,
    loginRows,
    loginDistinct,
    activeAccounts,
    activeLast7,
    activeLast30,
    neverLoggedIn,
    sensitiveRows,
    registrationRows,
    registrationsInWindow,
    keyedRows,
    verifiedRows,
    keyedAllTime,
    verifiedAllTime,
  ] = await Promise.all([
    prisma.pageViewDaily.findMany({
      where: { day: { gte: new Date(`${window.startDay}T00:00:00.000Z`) } },
      select: { day: true, path: true, audience: true, count: true },
    }),
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') AS "day", COUNT(*) AS "count"
      FROM "audit_log"
      WHERE "action" = 'LOGIN' AND "createdAt" >= ${since}::timestamp
      GROUP BY 1
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "userId") AS "count"
      FROM "audit_log"
      WHERE "action" = 'LOGIN' AND "createdAt" >= ${since}::timestamp AND "userId" IS NOT NULL
    `,
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, lastLoginAt: { gte: last7 } } }),
    prisma.user.count({ where: { isActive: true, lastLoginAt: { gte: window.startInstant } } }),
    prisma.user.count({ where: { isActive: true, lastLoginAt: null } }),
    prisma.auditLog.groupBy({
      by: ["action", "entityType"],
      where: {
        action: { in: [AuditAction.READ, AuditAction.EXPORT] },
        createdAt: { gte: window.startInstant },
      },
      _count: { _all: true },
    }),
    prisma.registrationRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.registrationRequest.count({ where: { createdAt: { gte: window.startInstant } } }),
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(h."enteredAt" + interval '7 hours', 'YYYY-MM-DD') AS "day", COUNT(*) AS "count"
      FROM "household" h
      WHERE h."deletedAt" IS NULL
        AND (h."duplicateResolution" IS NULL OR h."duplicateResolution" = 'NOT_DUPLICATE')
        AND h."enteredAt" >= ${since}::timestamp
      GROUP BY 1
    `,
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(h."verifiedAt" + interval '7 hours', 'YYYY-MM-DD') AS "day", COUNT(*) AS "count"
      FROM "household" h
      JOIN "paper_sheet" s ON s."id" = h."sheetId"
      WHERE h."deletedAt" IS NULL
        AND (h."duplicateResolution" IS NULL OR h."duplicateResolution" = 'NOT_DUPLICATE')
        AND s."status" = 'VERIFIED'
        AND h."verifiedAt" >= ${since}::timestamp
      GROUP BY 1
    `,
    prisma.household.count({ where: USABLE_HOUSEHOLD }),
    prisma.household.count({ where: { ...USABLE_HOUSEHOLD, sheet: { status: SheetStatus.VERIFIED } } }),
  ]);

  const pageViewSeries = buildDailySeries<PageViewKey>(
    pageViewRows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      key: row.audience === PageViewAudience.SIGNED_IN ? "SIGNED_IN" : "PUBLIC",
      count: row.count,
    })),
    window.days,
    ["PUBLIC", "SIGNED_IN"],
  );
  const loginSeries = buildDailySeries<LoginKey>(
    loginRows.map((row) => ({ day: row.day, key: "LOGINS" as const, count: Number(row.count) })),
    window.days,
    ["LOGINS"],
  );
  const sheetSeries = buildDailySeries<SheetKey>(
    [
      ...keyedRows.map((row) => ({ day: row.day, key: "KEYED" as const, count: Number(row.count) })),
      ...verifiedRows.map((row) => ({ day: row.day, key: "VERIFIED" as const, count: Number(row.count) })),
    ],
    window.days,
    ["KEYED", "VERIFIED"],
  );

  return {
    ok: true,
    data: {
      window,
      pageViews: {
        series: pageViewSeries,
        summary: summariseSeries(pageViewSeries),
        publicTotal: pageViewSeries.reduce((sum, point) => sum + point.values.PUBLIC, 0),
        signedInTotal: pageViewSeries.reduce((sum, point) => sum + point.values.SIGNED_IN, 0),
        topPages: topPages(pageViewRows.map((row) => ({ path: row.path, count: row.count })), 10),
      },
      logins: {
        series: loginSeries,
        summary: summariseSeries(loginSeries),
        distinctUsers: Number(loginDistinct[0]?.count ?? 0),
        activeLast7,
        activeLast30,
        activeAccounts,
        neverLoggedIn,
      },
      sensitive: groupSensitiveAccess(
        sensitiveRows.map((row) => ({
          action: row.action === AuditAction.EXPORT ? "EXPORT" : "READ",
          entityType: row.entityType,
          count: row._count._all,
        })),
      ),
      registrations: {
        ...summariseRegistrations(registrationRows.map((row) => ({ status: row.status, count: row._count._all }))),
        createdInWindow: registrationsInWindow,
      },
      sheets: {
        series: sheetSeries,
        keyedInWindow: sheetSeries.reduce((sum, point) => sum + point.values.KEYED, 0),
        verifiedInWindow: sheetSeries.reduce((sum, point) => sum + point.values.VERIFIED, 0),
        keyedAllTime,
        verifiedAllTime,
      },
    },
  };
}
