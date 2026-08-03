export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  COMMUNITY_VIEW: "community.view",
  COMMUNITY_MANAGE: "community.manage",
  HOUSEHOLD_VIEW: "household.view",
  SURVEY_ENTRY: "survey.entry",
  VERIFICATION_VIEW: "verification.view",
  REPORT_VIEW: "report.view",
  SETTINGS_VIEW: "settings.view",
  USER_MANAGE: "user.manage",
  REGISTRATION_MANAGE: "registration.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);
