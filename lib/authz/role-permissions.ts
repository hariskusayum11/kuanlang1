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
    // ผู้บริหารเปิดรายชื่อและส่งออกกลุ่มทั่วไปจากรายงานได้ด้วย
    PERMISSIONS.REPORT_SEGMENT_EXPORT,
  ],
  [UserRoleEnum.OFFICER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.COMMUNITY_MANAGE,
    PERMISSIONS.HOUSEHOLD_VIEW,
    PERMISSIONS.MAP_VIEW,
    PERMISSIONS.VERIFICATION_VIEW,
    PERMISSIONS.REPORT_VIEW,
    // ดูรายชื่อ + ส่งออก Excel รายกลุ่ม (กลุ่มทั่วไป) — กลุ่มสุขภาพยังจำกัดที่ EXECUTIVE/ADMIN
    PERMISSIONS.REPORT_SEGMENT_EXPORT,
    // ยืนยันบ้านพักพิง (docs/38) — เจ้าหน้าที่เห็นข้อมูลครัวเรือนอยู่แล้ว
    PERMISSIONS.SHELTER_VERIFY,
  ],
  [UserRoleEnum.COORDINATOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.COMMUNITY_VIEW,
    PERMISSIONS.COMMUNITY_MANAGE,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.VERIFIER]: [PERMISSIONS.VERIFICATION_VIEW],
  [UserRoleEnum.DATA_ENTRY]: [PERMISSIONS.SURVEY_ENTRY],
  // อาสาสมัครเห็นเฉพาะหน้าของตัวเอง (Owner Decision 2026-10-18)
  // เดิมมี dashboard.view ทำให้เห็น "แดชบอร์ดผู้บริหาร" พร้อมตัวเลขรวมทั้งระบบ
  // ทั้งที่ยังไม่มีโมดูลภารกิจให้ทำอะไร — ขัดกฎ "Volunteer เห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ"
  [UserRoleEnum.VOLUNTEER]: [PERMISSIONS.VOLUNTEER_PORTAL_VIEW],
  [UserRoleEnum.RESEARCHER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  [UserRoleEnum.FIELD_SURVEYOR]: [],
  // หัวหน้าชุมชน (Owner Decision 2026-10-19) — สิทธิ์เดียว: เปลี่ยนสถานะกลุ่มเปราะบาง
  // ในชุมชนที่ผูกไว้ ไม่แก้ข้อมูลกระดาษ และเข้าหน้าอื่นไม่ได้ (docs/34)
  [UserRoleEnum.COMMUNITY_LEADER]: [PERMISSIONS.VULNERABLE_STATUS_UPDATE],
};

// Community Scope ถูกยกเลิกทั้งระบบแล้ว (Owner Decision 2026-08-03 #R7-B)
// ทุกบัญชีเห็นทุกชุมชน — รายการนี้จึงไม่มีความหมายอีกต่อไป และถูกถอดออก
// การจำกัดที่ยังเหลืออยู่คือ Permission และกฎ "ผู้คีย์เห็นเฉพาะใบของตน"
