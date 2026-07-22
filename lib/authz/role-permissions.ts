import { UserRoleEnum } from "@prisma/client";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "./permissions";

// อ้างอิง docs/10-rbac-pdpa-matrix.md — ให้สิทธิ์ขั้นต่ำสำหรับ role ที่ matrix ยังไม่ชัดเจน
export const ROLE_PERMISSIONS: Record<UserRoleEnum, readonly Permission[]> = {
  [UserRoleEnum.ADMIN]: ALL_PERMISSIONS,
  [UserRoleEnum.EXECUTIVE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.OFFICER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.HOUSEHOLD_VIEW,
    PERMISSIONS.BATCH_MANAGE,
    PERMISSIONS.VERIFICATION_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.COORDINATOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.BATCH_MANAGE,
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

// docs/10 §1: ADMIN และ EXECUTIVE มองเห็น "ทั้งระบบ"
export const GLOBAL_SCOPE_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.ADMIN,
  UserRoleEnum.EXECUTIVE,
];
