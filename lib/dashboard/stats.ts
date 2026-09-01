import { DuplicateResolutionEnum, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";

// ตัวเลขภาพรวม — เลือกเฉพาะที่ "เชื่อถือได้และสำคัญ" ต่อการติดตามงานจริง
// (เดิมมี หมู่/จุดอพยพ ซึ่งเป็น master data สมมติ/ยังไม่เปิดใช้ → ถอดออก)
export type DashboardCounts = {
  communities: number;
  /** ใบที่รับเข้าระบบทั้งหมดก่อนตัดใบซ้ำจริง */
  received: number;
  /** ครัวเรือนที่คีย์เข้าระบบแล้ว (ยังไม่ลบ) */
  keyed: number;
  /** ตรวจสอบแล้ว (VERIFIED) — ไม่นับใบสงสัยซ้ำ */
  verified: number;
  /** ใบในคิวรอตรวจจริง ใช้เงื่อนไขเดียวกับหน้า /verification */
  pending: number;
  /** ใบที่อยู่ในคิวและกดตรวจได้ตอนนี้ */
  ready: number;
  /** ใบที่ยังไม่ตรวจแต่นอกคิวชั่วคราว เช่น กำลังเปิดแก้ */
  editing: number;
  /** ใบที่ผู้ตรวจยืนยันว่าเป็นใบซ้ำจริง */
  duplicates: number;
  /** จำนวนผู้คีย์ (บัญชีที่มีการคีย์อย่างน้อย 1 ใบ) */
  keyers: number;
};

export type StatCard = {
  key: "communities" | "keyed" | "verified" | "pending" | "keyers";
  label: string;
  value: number;
};

/** เงื่อนไข where ของครัวเรือน + scope (optional) — รวมที่เดียวกันความจริง */
function householdWhere(communityIds?: string[]) {
  const scope = communityIds ? { communityId: { in: communityIds } } : {};
  // ใบที่เพียง "สงสัยซ้ำ" ยังต้องนับและเข้าคิวตรวจตามปกติ
  // ตัดออกจากยอดต่อเมื่อผู้ตรวจตัดสินเป็น CONFIRMED_DUPLICATE แล้วเท่านั้น
  const notConfirmedDuplicate = {
    OR: [
      { duplicateResolution: null },
      { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
    ],
  };
  return {
    received: { deletedAt: null, ...scope },
    keyed: { deletedAt: null, ...notConfirmedDuplicate, ...scope },
    keyers: {
      deletedAt: null,
      ...notConfirmedDuplicate,
      ...scope,
    },
    verified: {
      deletedAt: null,
      sheet: { status: SheetStatus.VERIFIED },
      ...notConfirmedDuplicate,
      ...scope,
    },
    ready: {
      deletedAt: null,
      sheet: { status: SheetStatus.ENTERED_1 },
      ...notConfirmedDuplicate,
      ...scope,
    },
  };
}

async function computeCounts(communityIds?: string[]): Promise<Omit<DashboardCounts, "communities">> {
  const w = householdWhere(communityIds);
  // อ่านจาก snapshot เดียว ป้องกันยอดเหลื่อมเมื่อมีคนส่ง/ยืนยันใบระหว่าง query
  const [received, keyed, verified, ready, keyerGroups] = await prisma.$transaction([
    prisma.household.count({ where: w.received }),
    prisma.household.count({ where: w.keyed }),
    prisma.household.count({ where: w.verified }),
    prisma.household.count({ where: w.ready }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: w.keyers,
      orderBy: { enteredById: "asc" },
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return {
    received,
    keyed,
    verified,
    // รวมใบที่กำลังเปิดแก้/อยู่ระหว่างดำเนินการด้วย เพื่อให้ยอดรวมตรวจสอบย้อนกลับได้
    pending: Math.max(0, keyed - verified),
    ready,
    editing: Math.max(0, keyed - verified - ready),
    duplicates: Math.max(0, received - keyed),
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
    { key: "keyed", label: "ข้อมูลใช้งานจริง", value: counts.keyed },
    { key: "verified", label: "ตรวจแล้ว", value: counts.verified },
    { key: "pending", label: "ยังไม่ตรวจ", value: counts.pending },
    { key: "keyers", label: "ผู้คีย์", value: counts.keyers },
  ];
}
