import { prisma } from "../prisma";

export type DashboardCounts = {
  communities: number;
  tambons: number;
  moos: number;
  households: number;
  evacuationSites: number;
};

export type StatCard = {
  key: keyof DashboardCounts;
  label: string;
  value: number;
  /** true = โมดูลที่เกี่ยวข้องยังไม่เปิดใช้งาน (แสดงโทนเทา) */
  pending: boolean;
};

/** อ่านตัวเลขภาพรวมจาก Development DB (read-only, ไม่มี PII) */
export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const [communities, tambons, moos, households, evacuationSites] = await Promise.all([
    prisma.community.count({ where: { deletedAt: null } }),
    prisma.tambon.count(),
    prisma.moo.count(),
    prisma.household.count(),
    prisma.evacuationSite.count(),
  ]);
  return { communities, tambons, moos, households, evacuationSites };
}

/** Pure mapping — แปลง counts เป็นการ์ดสถิติ (unit-testable, ไม่แตะ DB) */
export function toStatCards(counts: DashboardCounts): StatCard[] {
  return [
    { key: "communities", label: "ชุมชน", value: counts.communities, pending: false },
    { key: "tambons", label: "ตำบล", value: counts.tambons, pending: false },
    { key: "moos", label: "หมู่", value: counts.moos, pending: false },
    { key: "households", label: "ครัวเรือน", value: counts.households, pending: true },
    { key: "evacuationSites", label: "จุดอพยพ", value: counts.evacuationSites, pending: true },
  ];
}
