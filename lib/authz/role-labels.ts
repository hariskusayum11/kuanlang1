import { UserRoleEnum } from "@prisma/client";

/** ชื่อบทบาทภาษาไทย — ใช้ร่วมกันทุกหน้า (ห้าม hardcode ซ้ำในคอมโพเนนต์) */
export const ROLE_LABELS: Record<UserRoleEnum, string> = {
  [UserRoleEnum.ADMIN]: "ผู้ดูแลระบบ",
  [UserRoleEnum.EXECUTIVE]: "ผู้บริหาร/แพทย์",
  [UserRoleEnum.OFFICER]: "เจ้าหน้าที่",
  [UserRoleEnum.COORDINATOR]: "ผู้ประสานงาน",
  [UserRoleEnum.VERIFIER]: "ผู้ตรวจสอบข้อมูล",
  [UserRoleEnum.DATA_ENTRY]: "เจ้าหน้าที่คีย์ข้อมูล",
  [UserRoleEnum.FIELD_SURVEYOR]: "ผู้สำรวจภาคสนาม",
  [UserRoleEnum.VOLUNTEER]: "อาสาสมัคร",
  [UserRoleEnum.RESEARCHER]: "นักวิจัย",
  [UserRoleEnum.COMMUNITY_LEADER]: "หัวหน้าชุมชน",
};

/**
 * บทบาทที่ "ใช้งานได้จริงแล้ว" — มี permission และมีหน้าจอรองรับ
 * ใช้จัดกลุ่มในหน้าจัดการผู้ใช้ เพื่อให้แอดมินเลือกถูกโดยไม่ต้องเดา
 *
 * **ลำดับ = ความสำคัญ/ระดับสิทธิ์จากมากไปน้อย** (Owner Decision 2026-10-19)
 * เจ้าหน้าที่คีย์ข้อมูลอยู่ล่างสุด · อาสาสมัครย้ายมากลุ่มนี้เพราะมีหน้าศูนย์อาสาสมัครแล้ว
 */
export const ACTIVE_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.ADMIN,
  UserRoleEnum.EXECUTIVE,
  UserRoleEnum.OFFICER,
  UserRoleEnum.COMMUNITY_LEADER,
  UserRoleEnum.VOLUNTEER,
  UserRoleEnum.DATA_ENTRY,
];

/**
 * บทบาทที่ **เลิกใช้ในชั้นแอปพลิเคชันแล้ว** (Owner Decision 2026-07-31 #R6-D)
 *
 * ยังคงอยู่ใน PostgreSQL enum เพื่อให้บัญชีเก่าอ่านได้จนกว่าจะรัน Data Migration
 * แต่ **ห้ามมอบหมายใหม่** — ทั้งจากหน้าจัดการผู้ใช้และจากการเรียก Server Action ตรง
 *
 *  - COORDINATOR    → ยุบเข้า OFFICER (permission ของ OFFICER ครอบคลุมอยู่แล้ว)
 *  - VERIFIER       → ยุบเข้า OFFICER + ต้องได้ `hasGlobalCommunityScope=true`
 *                     เพื่อคงพฤติกรรมเดิมที่เห็นคิวทุกชุมชน (ผ่านธงรายบัญชี ไม่ใช่ชื่อ Role)
 *  - FIELD_SURVEYOR → **ไม่ใช่บัญชีผู้ใช้ระบบอีกต่อไป** (Owner Decision #R6-E)
 *                     ผู้สำรวจเป็น "ข้อมูลในแบบสอบถาม" (ชื่อ/เบอร์จากกระดาษ) ไม่ต้องมีบัญชี
 *                     จึง **ไม่มีบทบาททดแทน** — ห้ามแปลงเป็น OFFICER หรือ DATA_ENTRY อัตโนมัติ
 *                     เพราะไม่มีข้อมูลสนับสนุนว่าเจ้าของบัญชีควรได้สิทธิ์ใด
 */
export const LEGACY_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.COORDINATOR,
  UserRoleEnum.VERIFIER,
  UserRoleEnum.FIELD_SURVEYOR,
];

/** บทบาทนี้ถูกเลิกใช้แล้วหรือไม่ — ใช้ตรวจทั้งฝั่ง server และตอนเรนเดอร์ UI */
export function isLegacyRole(role: UserRoleEnum): boolean {
  return LEGACY_ROLES.includes(role);
}

/** บทบาทที่ควรย้ายไปแทน (null = ไม่มีบทบาททดแทน) — ฐานของ Data Migration */
export const LEGACY_ROLE_REPLACEMENT: Record<string, UserRoleEnum | null> = {
  [UserRoleEnum.COORDINATOR]: UserRoleEnum.OFFICER,
  [UserRoleEnum.VERIFIER]: UserRoleEnum.OFFICER,
  // null = ไม่มีบทบาททดแทน — ปิดของเดิมแล้วจบ ห้ามเดาสิทธิ์ให้
  [UserRoleEnum.FIELD_SURVEYOR]: null,
};

/**
 * บทบาทที่ประกาศไว้ตาม requirement แต่ยังไม่มีโมดูลรองรับ (มอบหมายได้แต่ยังทำอะไรไม่ได้)
 *  - RESEARCHER: รอโมดูล Reports (ข้อมูล Anonymized)
 * เก็บไว้ในระบบตาม CLAUDE.md §Authentication and roles ที่ระบุว่า "ต้องรองรับอย่างน้อย" 9 บทบาท
 */
export const RESERVED_ROLES: readonly UserRoleEnum[] = [
  UserRoleEnum.RESEARCHER,
];

/** คำอธิบายสั้น ๆ ต่อบทบาท — ช่วยแอดมินเลือกได้ถูกตั้งแต่ครั้งแรก */
export const ROLE_HINTS: Record<UserRoleEnum, string> = {
  [UserRoleEnum.ADMIN]: "ทั้งระบบ + จัดการผู้ใช้และบทบาท",
  [UserRoleEnum.EXECUTIVE]: "ดูภาพรวมทั้งระบบและข้อมูลสุขภาพที่ตรวจแล้ว อ่านอย่างเดียว แก้ข้อมูลไม่ได้",
  [UserRoleEnum.OFFICER]: "ตรวจสอบและแก้ไขแบบสอบถาม ดูข้อมูลครัวเรือน ชุมชน แผนที่ ความเสี่ยง และรายงาน",
  [UserRoleEnum.COORDINATOR]: "บทบาทเดิม — ยุบเข้า “เจ้าหน้าที่” แล้ว มอบหมายใหม่ไม่ได้",
  [UserRoleEnum.VERIFIER]:
    "บทบาทเดิม — ยุบเข้า “เจ้าหน้าที่” แล้ว มอบหมายใหม่ไม่ได้ (ผู้ที่ต้องเห็นทุกชุมชนให้เปิดสิทธิ์พื้นที่รายบัญชี)",
  [UserRoleEnum.DATA_ENTRY]: "คีย์แบบสอบถาม เปิดใบจากรหัสบนกระดาษได้ทุกชุมชน",
  [UserRoleEnum.FIELD_SURVEYOR]:
    "บทบาทเดิม — ปัจจุบันบันทึกผู้สำรวจเป็นข้อมูลในแบบสอบถาม โดยไม่ต้องมีบัญชีผู้ใช้",
  [UserRoleEnum.VOLUNTEER]: "หน้าศูนย์อาสาสมัคร: ข้อมูลของตนเองและเบอร์ฉุกเฉิน — ไม่เห็นข้อมูลครัวเรือน",
  [UserRoleEnum.RESEARCHER]: "รอโมดูลรายงาน — ปัจจุบันเห็นแค่ภาพรวม",
  [UserRoleEnum.COMMUNITY_LEADER]:
    "แอดมินชุมชน: ดูครัวเรือน (รวมข้อมูลสุขภาพ) แผนที่ ความเสี่ยง อาสาสมัคร รายงาน · บันทึกเสียชีวิต/ย้ายออก แจ้งเพิ่มคนเปราะบาง จัดการจุดอพยพ ยืนยันบ้านพักพิง — เฉพาะชุมชนที่กำหนด ไม่กำหนด = ไม่เห็นข้อมูลใดเลย",
};

/** ลำดับที่แสดงในหน้าจัดการผู้ใช้ — ใช้งานได้จริง → รอโมดูล → บทบาทเดิมที่เลิกใช้ */
export const ROLE_DISPLAY_ORDER: readonly UserRoleEnum[] = [
  ...ACTIVE_ROLES,
  ...RESERVED_ROLES,
  ...LEGACY_ROLES,
];
