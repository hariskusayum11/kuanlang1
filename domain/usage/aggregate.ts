// ตัวช่วยรวมตัวเลขของหน้า "สถิติการใช้งาน" (docs/36) — Pure Function ล้วน ไม่แตะฐานข้อมูล
// ทุกตัวเลขที่คืนต้องมีตัวหาร/ช่วงเวลากำกับได้ (กฎ "ทุก Dashboard ต้องแสดง Denominator")

import { pagePathLabel } from "./page-path";

/** ช่วงเวลามาตรฐานของหน้าสถิติ */
export const USAGE_WINDOW_DAYS = 30;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 ไม่มี DST
const DAY_MS = 24 * 60 * 60 * 1000;

/** วันตามเวลาไทยของเวลาใด ๆ ในรูป YYYY-MM-DD */
export function bangkokDayKey(at: Date): string {
  return new Date(at.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export interface UsageWindow {
  /** วันในช่วง เรียงเก่า → ใหม่ (รวมวันนี้) */
  days: string[];
  startDay: string;
  endDay: string;
  /** เวลาเริ่มต้นของ startDay ตามเวลาไทย (ใช้กรอง timestamp ใน DB) */
  startInstant: Date;
}

/** ช่วง `days` วันล่าสุดตามเวลาไทย นับรวมวันนี้ */
export function usageWindow(now: Date, days: number = USAGE_WINDOW_DAYS): UsageWindow {
  const span = Number.isInteger(days) && days > 0 ? days : USAGE_WINDOW_DAYS;
  const today = bangkokDayKey(now);
  const todayMidnightUtc = Date.parse(`${today}T00:00:00.000Z`);
  const list: string[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    list.push(new Date(todayMidnightUtc - offset * DAY_MS).toISOString().slice(0, 10));
  }
  return {
    days: list,
    startDay: list[0],
    endDay: list[list.length - 1],
    startInstant: new Date(Date.parse(`${list[0]}T00:00:00.000Z`) - BANGKOK_OFFSET_MS),
  };
}

export interface DayCountRow<K extends string> {
  day: string;
  key: K;
  count: number;
}

export interface DailyPoint<K extends string> {
  day: string;
  values: Record<K, number>;
  total: number;
}

function safeCount(value: unknown): number {
  const n = Number(value); // รองรับ bigint จาก COUNT(*) ของ $queryRaw ด้วย
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * แถวจาก DB (มีเฉพาะวันที่มีข้อมูล) → อนุกรมครบทุกวันในช่วง (วันที่ไม่มี = 0)
 * แถวนอกช่วงหรือ key ที่ไม่รู้จักถูกทิ้ง ไม่ปนเข้ายอด
 */
export function buildDailySeries<K extends string>(
  rows: readonly DayCountRow<K>[],
  days: readonly string[],
  keys: readonly K[],
): DailyPoint<K>[] {
  const index = new Map<string, Record<K, number>>();
  for (const day of days) {
    index.set(day, Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>);
  }
  for (const row of rows) {
    const bucket = index.get(row.day);
    if (!bucket || !keys.includes(row.key)) continue;
    bucket[row.key] += safeCount(row.count);
  }
  return days.map((day) => {
    const values = index.get(day)!;
    const total = keys.reduce((sum, key) => sum + values[key], 0);
    return { day, values, total };
  });
}

export interface SeriesSummary {
  total: number;
  /** จำนวนวันในช่วง (ตัวหารของค่าเฉลี่ย) */
  days: number;
  averagePerDay: number;
  peakDay: string | null;
  peakCount: number;
  /** จำนวนวันที่มีอย่างน้อย 1 ครั้ง */
  activeDays: number;
}

export function summariseSeries<K extends string>(series: readonly DailyPoint<K>[]): SeriesSummary {
  let total = 0;
  let peakDay: string | null = null;
  let peakCount = 0;
  let activeDays = 0;
  for (const point of series) {
    total += point.total;
    if (point.total > 0) activeDays += 1;
    if (point.total > peakCount) {
      peakCount = point.total;
      peakDay = point.day;
    }
  }
  return {
    total,
    days: series.length,
    averagePerDay: series.length === 0 ? 0 : Math.round((total / series.length) * 10) / 10,
    peakDay,
    peakCount,
    activeDays,
  };
}

export interface RankedItem {
  key: string;
  label: string;
  count: number;
  /** ร้อยละของ total (ตัวหาร) — 0 เมื่อ total = 0 */
  share: number;
}

export interface RankedList {
  items: RankedItem[];
  /** ผลรวมทุกแถว (ไม่ใช่แค่ที่แสดง) — ใช้เป็นตัวหาร */
  total: number;
  /** จำนวนรายการทั้งหมดก่อนตัด limit */
  distinct: number;
}

function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

function rank(entries: Map<string, number>, labelOf: (key: string) => string, limit: number): RankedList {
  const total = [...entries.values()].reduce((sum, n) => sum + n, 0);
  const items = [...entries.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: labelOf(key), count, share: share(count, total) }));
  return { items: items.slice(0, Math.max(0, limit)), total, distinct: items.length };
}

/** หน้าที่ถูกเปิดมากที่สุด — "หน้าอื่น ๆ" ถูกจัดอันดับตามจริง ไม่ซ่อน */
export function topPages(rows: readonly { path: string; count: number }[], limit = 10): RankedList {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.path, (totals.get(row.path) ?? 0) + safeCount(row.count));
  }
  return rank(totals, pagePathLabel, limit);
}

/** ชื่อไทยของชนิดข้อมูลอ่อนไหวใน AuditLog (entityType มาจากโค้ด ไม่ใช่ผู้ใช้กรอก) */
const SENSITIVE_ENTITY_LABELS: Record<string, string> = {
  Household: "ครัวเรือนรายใบ",
  HouseholdList: "รายการครัวเรือน",
  HouseholdLayerMap: "จุดบ้านบนแผนที่",
  VulnerablePerson: "รายชื่อกลุ่มเปราะบาง",
  VulnerableStatusList: "สถานะกลุ่มเปราะบาง (หัวหน้าชุมชน)",
  MedicalCaseRegistry: "ทะเบียนข้อมูลสุขภาพ",
  RiskList: "รายการความเสี่ยง",
  ExecutiveSummaryReport: "รายงานสรุปผู้บริหาร",
  KeyerProductivityReport: "รายงานผลงานผู้คีย์",
  PersonalQuestionnaireWorkbook: "แบบสอบถามรายบุคคล (Excel)",
  // รายละเอียดเจาะลึกจากหน้ารายงาน (reports/detail-breakdown)
  PersonVulnerability: "รายละเอียดความเปราะบางรายบุคคล",
  AssistanceNeed: "รายละเอียดความต้องการช่วยเหลือ",
  EvacuationVehicle: "รายละเอียดยานพาหนะอพยพ",
};

export function sensitiveEntityLabel(entityType: string): string {
  return SENSITIVE_ENTITY_LABELS[entityType] ?? entityType;
}

export interface SensitiveAccessRow {
  action: "READ" | "EXPORT";
  entityType: string;
  count: number;
}

export interface SensitiveAccessSummary {
  reads: RankedList;
  exports: RankedList;
}

export function groupSensitiveAccess(rows: readonly SensitiveAccessRow[], limit = 8): SensitiveAccessSummary {
  const reads = new Map<string, number>();
  const exports = new Map<string, number>();
  for (const row of rows) {
    const target = row.action === "EXPORT" ? exports : row.action === "READ" ? reads : null;
    if (!target) continue;
    target.set(row.entityType, (target.get(row.entityType) ?? 0) + safeCount(row.count));
  }
  return {
    reads: rank(reads, sensitiveEntityLabel, limit),
    exports: rank(exports, sensitiveEntityLabel, limit),
  };
}

export type RegistrationStatusKey = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RegistrationSummary {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  /** คำขอทั้งหมดทุกสถานะ — ตัวหาร */
  total: number;
}

export function summariseRegistrations(
  rows: readonly { status: string; count: number }[],
): RegistrationSummary {
  const summary: RegistrationSummary = { pending: 0, approved: 0, rejected: 0, cancelled: 0, total: 0 };
  for (const row of rows) {
    const count = safeCount(row.count);
    summary.total += count;
    if (row.status === "PENDING") summary.pending += count;
    else if (row.status === "APPROVED") summary.approved += count;
    else if (row.status === "REJECTED") summary.rejected += count;
    else if (row.status === "CANCELLED") summary.cancelled += count;
  }
  return summary;
}

/** ร้อยละแบบปลอดภัย — คืน null เมื่อไม่มีตัวหาร (ห้ามแสดงเป็น 0%) */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
