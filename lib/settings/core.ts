import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import type { SurveyStatusFilter } from "../household/trusted-where";

const KEYS = {
  notice: "SYSTEM_NOTICE",
  dashboardStatus: "DASHBOARD_DEFAULT_STATUS",
  mapLat: "MAP_DEFAULT_LAT",
  mapLng: "MAP_DEFAULT_LNG",
  mapZoom: "MAP_DEFAULT_ZOOM",
} as const;

export interface SystemPreferences {
  notice: string;
  dashboardDefaultStatus: SurveyStatusFilter;
  mapDefaultLat: number;
  mapDefaultLng: number;
  mapDefaultZoom: number;
}

export const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
  notice: "",
  dashboardDefaultStatus: "VERIFIED",
  mapDefaultLat: 7.0075,
  mapDefaultLng: 100.42,
  mapDefaultZoom: 14,
};

function jsonNumber(value: Prisma.JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function getSystemPreferences(): Promise<SystemPreferences> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
    select: { key: true, value: true },
  });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const status = values.get(KEYS.dashboardStatus);
  return {
    notice: typeof values.get(KEYS.notice) === "string" ? values.get(KEYS.notice) as string : "",
    dashboardDefaultStatus: status === "PENDING" || status === "ALL" || status === "VERIFIED" ? status : "VERIFIED",
    mapDefaultLat: jsonNumber(values.get(KEYS.mapLat), DEFAULT_SYSTEM_PREFERENCES.mapDefaultLat),
    mapDefaultLng: jsonNumber(values.get(KEYS.mapLng), DEFAULT_SYSTEM_PREFERENCES.mapDefaultLng),
    mapDefaultZoom: jsonNumber(values.get(KEYS.mapZoom), DEFAULT_SYSTEM_PREFERENCES.mapDefaultZoom),
  };
}

export type SaveSystemPreferencesResult = { ok: true } | { ok: false; error: string };

export async function saveSystemPreferences(
  ctx: AuthorizationContext,
  input: SystemPreferences,
): Promise<SaveSystemPreferencesResult> {
  if (!hasPermission(ctx, PERMISSIONS.SETTINGS_VIEW)) return { ok: false, error: "ไม่มีสิทธิ์ตั้งค่าระบบ" };
  const notice = input.notice.trim();
  if (notice.length > 500) return { ok: false, error: "ประกาศระบบยาวเกิน 500 ตัวอักษร" };
  if (!Number.isFinite(input.mapDefaultLat) || input.mapDefaultLat < -90 || input.mapDefaultLat > 90) {
    return { ok: false, error: "ละติจูดไม่ถูกต้อง" };
  }
  if (!Number.isFinite(input.mapDefaultLng) || input.mapDefaultLng < -180 || input.mapDefaultLng > 180) return { ok: false, error: "ลองจิจูดไม่ถูกต้อง" };
  if (!Number.isInteger(input.mapDefaultZoom) || input.mapDefaultZoom < 5 || input.mapDefaultZoom > 19) {
    return { ok: false, error: "ระดับซูมต้องอยู่ระหว่าง 5–19" };
  }
  if (!["VERIFIED", "PENDING", "ALL"].includes(input.dashboardDefaultStatus)) {
    return { ok: false, error: "สถานะเริ่มต้นไม่ถูกต้อง" };
  }

  const entries: { key: string; value: Prisma.InputJsonValue; description: string }[] = [
    { key: KEYS.notice, value: notice, description: "ประกาศที่แสดงบนแดชบอร์ด" },
    { key: KEYS.dashboardStatus, value: input.dashboardDefaultStatus, description: "สถานะเริ่มต้นของแดชบอร์ด" },
    { key: KEYS.mapLat, value: input.mapDefaultLat, description: "ละติจูดเริ่มต้นของแผนที่" },
    { key: KEYS.mapLng, value: input.mapDefaultLng, description: "ลองจิจูดเริ่มต้นของแผนที่" },
    { key: KEYS.mapZoom, value: input.mapDefaultZoom, description: "ระดับซูมเริ่มต้นของแผนที่" },
  ];
  await prisma.$transaction(entries.map((entry) => prisma.systemSetting.upsert({
    where: { key: entry.key },
    create: { ...entry, updatedBy: ctx.userId },
    update: { value: entry.value, description: entry.description, updatedBy: ctx.userId },
  })));
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "SystemSetting",
    reason: "แก้ไขตั้งค่าระบบจากหน้า ADMIN",
    changes: { keys: entries.map((entry) => entry.key) },
  });
  return { ok: true };
}
