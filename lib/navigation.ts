import { PERMISSIONS, type Permission } from "./authz/permissions";

export interface NavItem {
  label: string;
  href: string;
  permission: Permission;
  implemented: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "ภาพรวม",
    href: "/dashboard",
    permission: PERMISSIONS.DASHBOARD_VIEW,
    implemented: true,
  },
  {
    label: "ชุมชน",
    href: "/communities",
    permission: PERMISSIONS.COMMUNITY_VIEW,
    implemented: true,
  },
  {
    label: "ครัวเรือน",
    href: "/households",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: true,
  },
  {
    label: "แบบสอบถาม",
    href: "/surveys",
    permission: PERMISSIONS.SURVEY_ENTRY,
    implemented: true,
  },
  {
    label: "การตรวจสอบข้อมูล",
    href: "/verification",
    permission: PERMISSIONS.VERIFICATION_VIEW,
    implemented: true,
  },
  {
    label: "ความเสี่ยง",
    href: "/risk",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: true,
  },
  {
    label: "แผนที่การสำรวจ",
    href: "/map",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: true,
  },
  {
    label: "รายงาน",
    href: "/reports",
    permission: PERMISSIONS.REPORT_VIEW,
    implemented: true,
  },
  // เมนูเดียวรวมงานผู้ดูแล — ผู้ใช้/บทบาท + คำขอลงทะเบียน (Owner request 2026-08-04)
  // เฉพาะ ADMIN เท่านั้นที่มีทั้ง user.manage และ registration.manage
  // href ชี้กลุ่ม /admin (redirect → /admin/users) แล้วสลับหน้าในกลุ่มด้วยแท็บ
  {
    label: "จัดการผู้ใช้งาน",
    href: "/admin",
    permission: PERMISSIONS.USER_MANAGE,
    implemented: true,
  },
  {
    label: "ตั้งค่าระบบ",
    href: "/settings",
    permission: PERMISSIONS.SETTINGS_VIEW,
    implemented: false,
  },
];

export function visibleNavItems(
  permissions: readonly Permission[],
): NavItem[] {
  return NAV_ITEMS.filter((item) => permissions.includes(item.permission));
}

/**
 * หน้าแรกที่เหมาะกับสิทธิ์ของผู้ใช้ — เมนูแรกที่มองเห็นและสร้างแล้ว
 * (เช่น DATA_ENTRY ไม่มี dashboard.view → ไป /surveys)
 * คืน null เมื่อไม่มีหน้าใดให้เข้า
 */
export function defaultLandingPath(
  permissions: readonly Permission[],
): string | null {
  const first = visibleNavItems(permissions).find((item) => item.implemented);
  return first?.href ?? null;
}
