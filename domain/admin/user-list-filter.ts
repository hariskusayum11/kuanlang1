// ตัวกรองและการเรียงรายชื่อผู้ใช้ในหน้า "ผู้ใช้และสิทธิ์" (Owner Decision 2026-10-19)
// Pure Function — ค่าตัวกรองมาจาก URL จึงต้องตรวจทุกค่า ค่าแปลกปลอมกลับเป็นค่าเริ่มต้น

import type { AccountStatus } from "./account-status";

export type UserSort = "newest" | "oldest" | "last-login" | "name";

export const USER_SORT_LABELS: Record<UserSort, string> = {
  newest: "สมัครล่าสุดก่อน",
  oldest: "สมัครก่อนสุดก่อน",
  "last-login": "เข้าใช้ล่าสุดก่อน",
  name: "ชื่อ ก–ฮ",
};

export interface UserListFilter {
  q: string;
  role: string | null;
  status: AccountStatus | null;
  sort: UserSort;
}

const STATUSES: readonly AccountStatus[] = ["ACTIVE", "PENDING_APPROVAL", "REJECTED", "CANCELLED", "DEACTIVATED"];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** อ่านตัวกรองจาก searchParams · roles = บทบาทที่ยอมรับ (กัน role ปลอม) */
export function parseUserListFilter(
  params: Record<string, string | string[] | undefined>,
  roles: readonly string[],
): UserListFilter {
  const q = first(params.q).slice(0, 100);
  const role = first(params.role);
  const status = first(params.status);
  const sort = first(params.sort);
  return {
    q,
    role: roles.includes(role) ? role : null,
    status: (STATUSES as readonly string[]).includes(status) ? (status as AccountStatus) : null,
    sort: sort in USER_SORT_LABELS ? (sort as UserSort) : "newest",
  };
}

export interface FilterableUser {
  name: string;
  email: string;
  roles: readonly string[];
  accountStatus: AccountStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function filterAndSortUsers<T extends FilterableUser>(users: readonly T[], filter: UserListFilter): T[] {
  const q = filter.q.toLocaleLowerCase("th-TH");
  const matched = users.filter((u) => {
    if (q && !u.name.toLocaleLowerCase("th-TH").includes(q) && !u.email.toLowerCase().includes(q)) return false;
    if (filter.role && !u.roles.includes(filter.role)) return false;
    if (filter.status && u.accountStatus !== filter.status) return false;
    return true;
  });
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "th");
  return [...matched].sort((a, b) => {
    switch (filter.sort) {
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime() || byName(a, b);
      case "last-login": {
        // ไม่เคยเข้าใช้ไว้ท้ายสุด
        const at = a.lastLoginAt?.getTime() ?? -Infinity;
        const bt = b.lastLoginAt?.getTime() ?? -Infinity;
        return bt - at || byName(a, b);
      }
      case "name":
        return byName(a, b);
      default:
        return b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b);
    }
  });
}
