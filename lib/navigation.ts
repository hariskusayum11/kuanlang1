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
  /** ชื่อเมนูเมื่อบัญชีถูกจำกัดชุมชน (หัวหน้าชุมชน · docs/43) — ไม่ระบุ = ใช้ label */
  scopedLabel?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    group: "overview",
    label: "แดชบอร์ดผู้บริหาร",
    scopedLabel: "ภาพรวมชุมชน",
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
    // หน้าเดียวของหัวหน้าชุมชน — แอดมินเห็นด้วยเพื่อคืนสถานะที่บันทึกผิด (docs/34)
    group: "data",
    label: "สถานะกลุ่มเปราะบาง",
    href: "/community-status",
    permission: PERMISSIONS.VULNERABLE_STATUS_UPDATE,
    implemented: true,
    iconHref: "/community-status",
  },
  {
    // บ้านที่ติ๊กยินยอมเป็นจุดพักพิง → เจ้าหน้าที่ยืนยันก่อนเป็นจุดพักพิงจริง (docs/38)
    group: "data",
    label: "ยืนยันบ้านพักพิง",
    href: "/shelters",
    permission: PERMISSIONS.SHELTER_VERIFY,
    implemented: true,
    iconHref: "/shelters",
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
  // "กฎการจัดลำดับ" (/priority-rules) ไม่มีเมนูแยกแล้ว (2026-10-21) — เกณฑ์แสดงบนหน้าที่ใช้จริง
  // /medical และ /risk พร้อมปุ่มแก้ของ ADMIN · หน้าเดิมยังเปิดได้จากลิงก์ "ฉบับเต็ม" (docs/40)
  {
    // รายชื่ออาสาสมัครที่ชาวบ้านแจ้งไว้ในแบบสอบถาม — ใช้เรียกคนช่วยตอนเกิดภัย (docs/43)
    group: "analysis",
    label: "อาสาสมัครในชุมชน",
    href: "/community-volunteers",
    permission: PERMISSIONS.VOLUNTEER_LIST_VIEW,
    implemented: true,
    iconHref: "/volunteer",
  },
  {
    group: "analysis",
    label: "รายงานและส่งออก",
    scopedLabel: "รายงานสรุปชุมชน",
    href: "/reports",
    permission: PERMISSIONS.REPORT_VIEW,
    implemented: true,
  },
  {
    group: "analysis",
    label: "ผลงานผู้กรอก",
    href: "/keyer-performance",
    permission: PERMISSIONS.KEYER_PERFORMANCE_VIEW,
    implemented: true,
    iconHref: "/reports",
  },
  {
    // อยู่กลุ่ม "ภาพรวม" เพราะเป็นหน้าแรกและหน้าเดียวของอาสาสมัคร
    group: "overview",
    label: "ศูนย์อาสาสมัคร",
    href: "/volunteer",
    permission: PERMISSIONS.VOLUNTEER_PORTAL_VIEW,
    implemented: true,
    iconHref: "/volunteer",
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
    // การ์ดลิงก์ระบบภายนอกบนหน้าสาธารณะ (docs/37)
    group: "system",
    label: "ลิงก์ระบบภายนอก",
    href: "/admin/links",
    permission: PERMISSIONS.SETTINGS_VIEW,
    implemented: true,
    iconHref: "/admin/links",
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
  options: { scoped?: boolean } = {},
): NavItem[] {
  return NAV_ITEMS.flatMap((item) => {
    const label = options.scoped && item.scopedLabel ? item.scopedLabel : item.label;
    if (permissions.includes(item.permission)) return [{ ...item, label }];
    if (item.fallback && permissions.includes(item.fallback.permission)) {
      return [{ ...item, label, href: item.fallback.href }];
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
