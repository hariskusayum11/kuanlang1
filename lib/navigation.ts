import { PERMISSIONS, type Permission } from "./authz/permissions";

export interface NavItem {
  group: "overview" | "data" | "analysis" | "system";
  label: string;
  href: string;
  permission: Permission;
  implemented: boolean;
  activeHrefs?: readonly string[];
  fallback?: { permission: Permission; href: string };
  iconHref?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    group: "overview",
    label: "แดชบอร์ดผู้บริหาร",
    href: "/dashboard",
    permission: PERMISSIONS.DASHBOARD_VIEW,
    implemented: true,
  },
  {
    group: "data",
    label: "คีย์แบบสอบถาม",
    href: "/surveys",
    permission: PERMISSIONS.SURVEY_ENTRY,
    implemented: true,
    iconHref: "/surveys",
  },
  {
    group: "data",
    label: "รอตรวจสอบ",
    href: "/verification",
    permission: PERMISSIONS.VERIFICATION_VIEW,
    implemented: true,
  },
  {
    group: "data",
    label: "ข้อมูลครัวเรือน",
    href: "/households",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: true,
  },
  {
    group: "data",
    label: "ถังขยะแบบสอบถาม",
    href: "/admin/sheets",
    permission: PERMISSIONS.USER_MANAGE,
    implemented: true,
    iconHref: "/admin/sheets",
  },
  {
    group: "analysis",
    label: "ข้อมูลชุมชน",
    href: "/communities",
    permission: PERMISSIONS.COMMUNITY_VIEW,
    implemented: true,
  },
  {
    group: "analysis",
    label: "ข้อมูลสุขภาพและกลุ่มเปราะบาง",
    href: "/medical",
    permission: PERMISSIONS.MEDICAL_CASE_VIEW,
    implemented: true,
  },
  {
    group: "analysis",
    label: "แผนที่ข้อมูลสำรวจ",
    href: "/map",
    permission: PERMISSIONS.MAP_VIEW,
    implemented: true,
    iconHref: "/map",
  },
  {
    group: "analysis",
    label: "ความเสี่ยงและการช่วยเหลือ",
    href: "/risk",
    permission: PERMISSIONS.HOUSEHOLD_VIEW,
    implemented: true,
  },
  {
    group: "analysis",
    label: "รายงานและส่งออก",
    href: "/reports",
    permission: PERMISSIONS.REPORT_VIEW,
    implemented: true,
  },
  {
    group: "analysis",
    label: "ผลงานผู้กรอก",
    href: "/keyer-performance",
    permission: PERMISSIONS.REPORT_VIEW,
    implemented: true,
    iconHref: "/reports",
  },
  {
    group: "system",
    label: "ผู้ใช้และสิทธิ์",
    href: "/admin/users",
    permission: PERMISSIONS.USER_MANAGE,
    implemented: true,
    iconHref: "/admin",
  },
  {
    group: "system",
    label: "คำขอลงทะเบียน",
    href: "/admin/registrations",
    permission: PERMISSIONS.REGISTRATION_MANAGE,
    implemented: true,
    iconHref: "/admin/registrations",
  },
  {
    group: "system",
    label: "ตั้งค่าระบบ",
    href: "/settings",
    permission: PERMISSIONS.SETTINGS_VIEW,
    implemented: true,
  },
];

export function visibleNavItems(
  permissions: readonly Permission[],
): NavItem[] {
  return NAV_ITEMS.flatMap((item) => {
    if (permissions.includes(item.permission)) return [item];
    if (item.fallback && permissions.includes(item.fallback.permission)) {
      return [{ ...item, href: item.fallback.href }];
    }
    return [];
  });
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
