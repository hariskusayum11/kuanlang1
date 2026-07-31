// สถานะบัญชีผู้ใช้ — Pure Function (tests: tests/unit/account-status.test.ts)
// ---------------------------------------------------------------------------
// `User.isActive = false` มีความหมายมากกว่าหนึ่งอย่างในระบบนี้:
//   - บัญชีที่เพิ่งสมัคร ยังไม่มีใครอนุมัติ
//   - บัญชีที่ถูกปฏิเสธ
//   - บัญชีที่เคยใช้งานได้แล้วถูก ADMIN ปิดภายหลัง
//
// ห้ามแสดง "รออนุมัติ" เป็น "ถูกปิดใช้งาน" เพราะสองอย่างนี้สั่งงานคนละแบบ:
// อย่างแรกต้องไปกดอนุมัติ อย่างหลังคือคนที่ถูกตัดสิทธิ์โดยตั้งใจ
//
// แยกได้โดย**ไม่ต้องเพิ่มคอลัมน์** เพราะ RegistrationRequest.userId เป็น @unique
// (1 คำขอต่อบัญชี) จึงใช้สถานะคำขอเป็นตัวชี้ขาดได้

/** สถานะคำขอสมัคร เท่าที่จำเป็นต่อการตัดสินสถานะบัญชี */
export type RegistrationStatusLike =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type AccountStatus =
  | "ACTIVE" /// ใช้งานอยู่
  | "PENDING_APPROVAL" /// สมัครแล้ว รอ ADMIN อนุมัติ
  | "REJECTED" /// คำขอถูกปฏิเสธ — ไม่เคยใช้งานได้
  | "CANCELLED" /// คำขอถูกยกเลิก
  | "DEACTIVATED"; /// เคยใช้งานได้ แล้วถูกปิดภายหลัง

/**
 * ตัดสินสถานะบัญชีจาก isActive + สถานะคำขอสมัคร (ถ้ามี)
 *
 * บัญชีที่สร้างด้วย script (ไม่มีคำขอสมัคร) และถูกปิด → DEACTIVATED
 * เพราะไม่เคยอยู่ในคิวรออนุมัติ จึงไม่ใช่ "รออนุมัติ"
 */
export function deriveAccountStatus(
  isActive: boolean,
  registrationStatus: RegistrationStatusLike | null,
): AccountStatus {
  if (isActive) return "ACTIVE";
  switch (registrationStatus) {
    case "PENDING":
      return "PENDING_APPROVAL";
    case "REJECTED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    // APPROVED = เคยเปิดใช้งานแล้ว การที่ตอนนี้ปิดอยู่แปลว่าถูกปิดภายหลัง
    // null = ไม่เคยผ่านคิวสมัคร (script/seed) — ปิดอยู่ก็คือปิดใช้งาน
    default:
      return "DEACTIVATED";
  }
}

/** บัญชีที่ "เคยเปิดใช้งาน" เท่านั้นที่ควรมีปุ่มเปิด/ปิดในหน้าจัดการผู้ใช้ */
export function canToggleActivation(status: AccountStatus): boolean {
  return status === "ACTIVE" || status === "DEACTIVATED";
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "ใช้งานอยู่",
  PENDING_APPROVAL: "รออนุมัติ",
  REJECTED: "ถูกปฏิเสธ",
  CANCELLED: "ยกเลิกคำขอ",
  DEACTIVATED: "ปิดใช้งาน",
};
