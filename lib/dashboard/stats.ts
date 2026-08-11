import { Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";

// ตัวเลขภาพรวม — เลือกเฉพาะที่ "เชื่อถือได้และสำคัญ" ต่อการติดตามงานจริง
// (เดิมมี หมู่/จุดอพยพ ซึ่งเป็น master data สมมติ/ยังไม่เปิดใช้ → ถอดออก)
export type DashboardCounts = {
  communities: number;
  /** ครัวเรือนที่คีย์เข้าระบบแล้ว (ยังไม่ลบ) */
  keyed: number;
  /** ตรวจสอบแล้ว (VERIFIED) — ไม่นับใบสงสัยซ้ำ */
  verified: number;
  /** ยังไม่ผ่านตรวจ = คีย์แล้วทั้งหมด − ตรวจแล้ว (รวมใบที่กำลังเปิดแก้/LOCKED) */
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
  };
}

export function derivePendingCount(keyed: number, verified: number): number {
  return Math.max(0, keyed - verified);
}

async function computeCounts(communityIds?: string[]): Promise<Omit<DashboardCounts, "communities">> {
  const w = householdWhere(communityIds);
  // อ่านจาก snapshot เดียว ป้องกันยอดเหลื่อมเมื่อมีคนส่ง/ยืนยันใบระหว่าง query
  const [keyed, verified, keyerGroups] = await prisma.$transaction([
    prisma.household.count({ where: w.keyed }),
    prisma.household.count({ where: w.verified }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: w.keyed,
      orderBy: { enteredById: "asc" },
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return {
    keyed,
    verified,
    pending: derivePendingCount(keyed, verified),
    keyers: keyerGroups.length,
  };
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
    { key: "pending", label: "ยังไม่ผ่านตรวจ", value: counts.pending },
    { key: "keyers", label: "ผู้คีย์", value: counts.keyers },
  ];
}
