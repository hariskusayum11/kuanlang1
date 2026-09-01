import { UserRoleEnum } from "@prisma/client";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "./permissions";

// อ้างอิง docs/10-rbac-pdpa-matrix.md — ให้สิทธิ์ขั้นต่ำสำหรับ role ที่ matrix ยังไม่ชัดเจน
export const ROLE_PERMISSIONS: Record<UserRoleEnum, readonly Permission[]> = {
  [UserRoleEnum.ADMIN]: ALL_PERMISSIONS,
  [UserRoleEnum.EXECUTIVE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.MAP_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.MEDICAL_DASHBOARD_VIEW,
    PERMISSIONS.MEDICAL_CASE_VIEW,
    PERMISSIONS.MEDICAL_MAP_VIEW,
    PERMISSIONS.MEDICAL_REPORT_EXPORT,
    PERMISSIONS.PERSONAL_REPORT_EXPORT,
  ],
  [UserRoleEnum.OFFICER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.COMMUNITY_MANAGE,
    PERMISSIONS.HOUSEHOLD_VIEW,
    PERMISSIONS.MAP_VIEW,
    PERMISSIONS.VERIFICATION_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.COORDINATOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.COMMUNITY_MANAGE,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.VERIFIER]: [PERMISSIONS.VERIFICATION_VIEW],
  [UserRoleEnum.DATA_ENTRY]: [PERMISSIONS.SURVEY_ENTRY],
  [UserRoleEnum.VOLUNTEER]: [PERMISSIONS.DASHBOARD_VIEW],
  [UserRoleEnum.RESEARCHER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.FIELD_SURVEYOR]: [],
};

// Community Scope ถูกยกเลิกทั้งระบบแล้ว (Owner Decision 2026-08-03 #R7-B)
// ทุกบัญชีเห็นทุกชุมชน — รายการนี้จึงไม่มีความหมายอีกต่อไป และถูกถอดออก
// การจำกัดที่ยังเหลืออยู่คือ Permission และกฎ "ผู้คีย์เห็นเฉพาะใบของตน"
