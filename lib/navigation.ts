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
    implemented: false,
  },
  {
    label: "ครัวเรือน",
    href: "/households",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: false,
  },
  {
    label: "แบบสอบถาม",
    href: "/surveys",
    permission: PERMISSIONS.SURVEY_ENTRY,
    implemented: false,
  },
  {
    label: "การตรวจสอบข้อมูล",
    href: "/verification",
    permission: PERMISSIONS.VERIFICATION_VIEW,
    implemented: false,
  },
  {
    label: "รายงาน",
    href: "/reports",
    permission: PERMISSIONS.REPORT_VIEW,
    implemented: false,
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
