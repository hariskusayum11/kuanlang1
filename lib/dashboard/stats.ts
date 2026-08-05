import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";

// ตัวเลขภาพรวม — เลือกเฉพาะที่ "เชื่อถือได้และสำคัญ" ต่อการติดตามงานจริง
// (เดิมมี หมู่/จุดอพยพ ซึ่งเป็น master data สมมติ/ยังไม่เปิดใช้ → ถอดออก)
export type DashboardCounts = {
  communities: number;
  /** ครัวเรือนที่คีย์เข้าระบบแล้ว (ยังไม่ลบ) */
  keyed: number;
  /** ตรวจสอบแล้ว (VERIFIED) — ไม่นับใบสงสัยซ้ำ */
  verified: number;
  /** รอตรวจ (คีย์เสร็จ ENTERED_1 แต่ยังไม่ผ่านตรวจ) */
  pending: number;
  /** จำนวนผู้คีย์ (บัญชีที่มีการคีย์อย่างน้อย 1 ใบ) */
  keyers: number;
};

export type StatCard = {
  key: keyof DashboardCounts;
  label: string;
  value: number;
};

/** เงื่อนไข where ของครัวเรือน + scope (optional) — รวมที่เดียวกันความจริง */
function householdWhere(communityIds?: string[]) {
  const scope = communityIds ? { communityId: { in: communityIds } } : {};
  return {
    keyed: { deletedAt: null, ...scope },
    verified: {
      deletedAt: null,
      hasDuplicateFlag: false,
      sheet: { status: SheetStatus.VERIFIED },
      ...scope,
    },
    pending: { deletedAt: null, sheet: { status: SheetStatus.ENTERED_1 }, ...scope },
  } as const;
}

async function computeCounts(communityIds?: string[]): Promise<Omit<DashboardCounts, "communities">> {
  const w = householdWhere(communityIds);
  const [keyed, verified, pending, keyerGroups] = await Promise.all([
    prisma.household.count({ where: w.keyed }),
    prisma.household.count({ where: w.verified }),
    prisma.household.count({ where: w.pending }),
    prisma.household.groupBy({ by: ["enteredById"], where: w.keyed }),
  ]);
  return { keyed, verified, pending, keyers: keyerGroups.length };
}

/** อ่านตัวเลขภาพรวมทั้งระบบ (read-only, ไม่มี PII) */
export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const [communities, rest] = await Promise.all([
    prisma.community.count({ where: { deletedAt: null } }),
    computeCounts(),
  ]);
  return { communities, ...rest };
}

/** อ่านตัวเลขเฉพาะชุมชนในสิทธิ์ (ใช้เมื่อ scope ไม่ใช่ global) */
export async function fetchScopedCounts(communityIds: string[]): Promise<DashboardCounts> {
  const [communities, rest] = await Promise.all([
    prisma.community.count({ where: { id: { in: communityIds }, deletedAt: null } }),
    computeCounts(communityIds),
  ]);
  return { communities, ...rest };
}

/** Pure mapping — แปลง counts เป็นการ์ดสถิติ (ไม่แตะ DB) */
export function toStatCards(counts: DashboardCounts): StatCard[] {
  return [
    { key: "communities", label: "ชุมชน", value: counts.communities },
    { key: "keyed", label: "คีย์แล้ว", value: counts.keyed },
    { key: "verified", label: "ตรวจแล้ว", value: counts.verified },
    { key: "pending", label: "รอตรวจ", value: counts.pending },
    { key: "keyers", label: "ผู้คีย์", value: counts.keyers },
  ];
}
