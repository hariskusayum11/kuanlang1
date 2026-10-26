// ความเคลื่อนไหวของหัวหน้าชุมชนบนแดชบอร์ดแอดมิน (docs/43 ข้อ 11)
// แจ้งในระบบเท่านั้น (ระบบอีเมลปิดอยู่) — อ่านจาก Audit Log ที่มีอยู่แล้ว ไม่มีตารางใหม่
import { UserRoleEnum } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import {
  activityHouseholdId,
  describeLeaderActivity,
  LEADER_ACTIVITY_REASONS,
  type LeaderActivityKind,
} from "../../domain/vulnerable/leader-activity";

export interface LeaderActivityItem {
  id: string;
  at: Date;
  userName: string;
  kind: LeaderActivityKind;
  text: string;
  householdId: string | null;
}

export interface LeaderActivityFeed {
  days: number;
  total: number;
  items: LeaderActivityItem[];
}

/** แอดมินเท่านั้น (user.manage) — null = ไม่มีสิทธิ์ (ไม่แสดงการ์ด) */
export async function getLeaderActivity(
  ctx: AuthorizationContext,
  options: { days?: number; limit?: number; now?: Date } = {},
): Promise<LeaderActivityFeed | null> {
  if (!hasPermission(ctx, PERMISSIONS.USER_MANAGE)) return null;
  const days = options.days ?? 14;
  const since = new Date((options.now ?? new Date()).getTime() - days * 86_400_000);
  const where = {
    createdAt: { gte: since },
    reason: { in: [...LEADER_ACTIVITY_REASONS] },
    user: { userRoles: { some: { role: UserRoleEnum.COMMUNITY_LEADER, isActive: true } } },
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 8,
      select: {
        id: true,
        createdAt: true,
        entityType: true,
        entityId: true,
        reason: true,
        changes: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  return {
    days,
    total,
    items: rows.map((row) => {
      const described = describeLeaderActivity(row.reason ?? "", row.changes);
      return {
        id: row.id,
        at: row.createdAt,
        userName: row.user?.name ?? "—",
        kind: described.kind,
        text: described.text,
        householdId: activityHouseholdId(row.entityType, row.entityId, row.changes),
      };
    }),
  };
}
