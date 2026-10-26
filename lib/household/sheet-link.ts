import { PERMISSIONS, type Permission } from "../authz/permissions";

/**
 * ลิงก์ "ดูใบ" ตามสิทธิ์ — ผู้ตรวจไปหน้าตรวจ (มีเครื่องมือ) · ผู้มีแค่ household.view ไปหน้าดูอย่างเดียว (docs/43)
 * null = ไม่มีสิทธิ์เปิดใบ (ไม่ต้องแสดงปุ่ม — server ตรวจซ้ำที่ปลายทางอยู่แล้ว)
 */
export function householdSheetHref(permissions: readonly Permission[], householdId: string): string | null {
  if (permissions.includes(PERMISSIONS.VERIFICATION_VIEW)) return `/verification/${householdId}?mode=view`;
  if (permissions.includes(PERMISSIONS.HOUSEHOLD_VIEW)) return `/households/${householdId}`;
  return null;
}
