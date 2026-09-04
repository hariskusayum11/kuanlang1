export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  COMMUNITY_VIEW: "community.view",
  COMMUNITY_MANAGE: "community.manage",
  HOUSEHOLD_VIEW: "household.view",
  MAP_VIEW: "map.view",
  SURVEY_ENTRY: "survey.entry",
  VERIFICATION_VIEW: "verification.view",
  REPORT_VIEW: "report.view",
  MEDICAL_DASHBOARD_VIEW: "medical.dashboard.view",
  MEDICAL_CASE_VIEW: "medical.case.view",
  MEDICAL_MAP_VIEW: "medical.map.view",
  MEDICAL_REPORT_EXPORT: "medical.report.export",
  PERSONAL_REPORT_EXPORT: "report.personal.export",
  // ดูรายชื่อรายกลุ่ม + ดาวน์โหลด Excel เฉพาะกลุ่ม (กลุ่มทั่วไป ไม่ใช่ข้อมูลสุขภาพ)
  // กลุ่มอ่อนไหวด้านสุขภาพ/เปราะบางใช้ MEDICAL_REPORT_EXPORT แทน (Owner Decision เฟส 1)
  REPORT_SEGMENT_EXPORT: "report.segment.export",
  // แก้ค่ารายการสำคัญโดยตรงจากรายชื่อในรายงาน — ADMIN เท่านั้นผ่าน ALL_PERMISSIONS
  REPORT_QUICK_EDIT: "report.quick-edit",
  SETTINGS_VIEW: "settings.view",
  USER_MANAGE: "user.manage",
  REGISTRATION_MANAGE: "registration.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);
