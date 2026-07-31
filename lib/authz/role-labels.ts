import { UserRoleEnum } from "@prisma/client";

/** ชื่อบทบาทภาษาไทย — ใช้ร่วมกันทุกหน้า (ห้าม hardcode ซ้ำในคอมโพเนนต์) */
export const ROLE_LABELS: Record<UserRoleEnum, string> = {
  [UserRoleEnum.ADMIN]: "ผู้ดูแลระบบ",
  [UserRoleEnum.EXECUTIVE]: "ผู้บริหาร",
  [UserRoleEnum.OFFICER]: "เจ้าหน้าที่",
  [UserRoleEnum.COORDINATOR]: "ผู้ประสานงาน",
  [UserRoleEnum.VERIFIER]: "ผู้ตรวจสอบข้อมูล",
  [UserRoleEnum.DATA_ENTRY]: "เจ้าหน้าที่คีย์ข้อมูล",
  [UserRoleEnum.FIELD_SURVEYOR]: "ผู้สำรวจภาคสนาม",
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
  [UserRoleEnum.RESEARCHER]: "นักวิจัย",
};

/**
 * บทบาทที่ "ใช้งานได้จริงแล้ว" — มี permission และมีหน้าจอรองรับ
 * ใช้จัดกลุ่มในหน้าจัดการผู้ใช้ เพื่อให้แอดมินเลือกถูกโดยไม่ต้องเดา
 */
export const ACTIVE_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.ADMIN,
  UserRoleEnum.EXECUTIVE,
  UserRoleEnum.OFFICER,
  UserRoleEnum.DATA_ENTRY,
];

/**
 * บทบาทที่ **เลิกใช้ในชั้นแอปพลิเคชันแล้ว** (Owner Decision 2026-07-31 #R6-D)
 *
 * ยังคงอยู่ใน PostgreSQL enum เพื่อให้บัญชีเก่าอ่านได้จนกว่าจะรัน Data Migration
 * แต่ **ห้ามมอบหมายใหม่** — ทั้งจากหน้าจัดการผู้ใช้และจากการเรียก Server Action ตรง
 *
 *  - COORDINATOR → ยุบเข้า OFFICER (permission ของ OFFICER ครอบคลุมอยู่แล้ว)
 *  - VERIFIER    → ยุบเข้า OFFICER + ต้องได้ `hasGlobalCommunityScope=true`
 *                  เพื่อคงพฤติกรรมเดิมที่เห็นคิวทุกชุมชน (ผ่านธงรายบัญชี ไม่ใช่ชื่อ Role)
 */
export const LEGACY_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.COORDINATOR,
  UserRoleEnum.VERIFIER,
];

/** บทบาทนี้ถูกเลิกใช้แล้วหรือไม่ — ใช้ตรวจทั้งฝั่ง server และตอนเรนเดอร์ UI */
export function isLegacyRole(role: UserRoleEnum): boolean {
  return LEGACY_ROLES.includes(role);
}

/** บทบาทที่ควรย้ายไปแทน — ใช้แสดงคำแนะนำและเป็นฐานของ Migration ใน commit ถัดไป */
export const LEGACY_ROLE_REPLACEMENT: Record<string, UserRoleEnum> = {
  [UserRoleEnum.COORDINATOR]: UserRoleEnum.OFFICER,
  [UserRoleEnum.VERIFIER]: UserRoleEnum.OFFICER,
};

/**
 * บทบาทที่ประกาศไว้ตาม requirement แต่ยังไม่มีโมดูลรองรับ (มอบหมายได้แต่ยังทำอะไรไม่ได้)
 *  - FIELD_SURVEYOR: รอโมดูล FieldQuery (ตอบกลับเมื่อคนคีย์อ่านลายมือไม่ออก) — 0 permission
 *  - VOLUNTEER: รอโมดูล Incident / Rescue Task — ปัจจุบันเห็นได้แค่ภาพรวม
 *  - RESEARCHER: รอโมดูล Reports (ข้อมูล Anonymized)
 * เก็บไว้ในระบบตาม CLAUDE.md §Authentication and roles ที่ระบุว่า "ต้องรองรับอย่างน้อย" 9 บทบาท
 */
export const RESERVED_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.FIELD_SURVEYOR,
  UserRoleEnum.VOLUNTEER,
  UserRoleEnum.RESEARCHER,
];

/** คำอธิบายสั้น ๆ ต่อบทบาท — ช่วยแอดมินเลือกได้ถูกตั้งแต่ครั้งแรก */
export const ROLE_HINTS: Record<UserRoleEnum, string> = {
  [UserRoleEnum.ADMIN]: "ทั้งระบบ + จัดการผู้ใช้และบทบาท",
  [UserRoleEnum.EXECUTIVE]: "ดูภาพรวมทั้งระบบ อ่านอย่างเดียว แก้ข้อมูลไม่ได้",
  [UserRoleEnum.OFFICER]: "จัดการชุมชน/ปึกที่รับผิดชอบ + ตรวจสอบข้อมูลได้",
  [UserRoleEnum.COORDINATOR]: "บทบาทเดิม — ยุบเข้า “เจ้าหน้าที่” แล้ว มอบหมายใหม่ไม่ได้",
  [UserRoleEnum.VERIFIER]:
    "บทบาทเดิม — ยุบเข้า “เจ้าหน้าที่” แล้ว มอบหมายใหม่ไม่ได้ (ผู้ที่ต้องเห็นทุกชุมชนให้เปิดสิทธิ์พื้นที่รายบัญชี)",
  [UserRoleEnum.DATA_ENTRY]: "คีย์แบบสอบถาม เปิดใบจากรหัสบนกระดาษได้ทุกชุมชน",
  [UserRoleEnum.FIELD_SURVEYOR]: "รอโมดูลตอบคำถามกลับ — ยังไม่มีสิทธิ์ใด ๆ",
  [UserRoleEnum.VOLUNTEER]: "รอโมดูลเหตุการณ์/ภารกิจกู้ภัย — ปัจจุบันเห็นแค่ภาพรวม",
  [UserRoleEnum.RESEARCHER]: "รอโมดูลรายงาน — ปัจจุบันเห็นแค่ภาพรวม",
};

/** ลำดับที่แสดงในหน้าจัดการผู้ใช้ — ใช้งานได้จริง → รอโมดูล → บทบาทเดิมที่เลิกใช้ */
export const ROLE_DISPLAY_ORDER: readonly UserRoleEnum[] = [
  ...ACTIVE_ROLES,
  ...RESERVED_ROLES,
  ...LEGACY_ROLES,
];
