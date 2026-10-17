// "บัญชีคุ้มครอง" — กฎว่าใครแตะบัญชีไหนได้ (Owner Decision 2026-10-17)
// Pure Function ล้วน ไม่แตะฐานข้อมูล จึงทดสอบทุกเส้นทางได้โดยไม่ต้องมี DB
//
// ปัญหาที่แก้: เดิม ADMIN ทุกคนเท่ากันหมด ด่านที่มีคือ "ห้ามทำกับตัวเอง" และ
// "ต้องเหลือ ADMIN ที่ active ≥ 1" ซึ่งไม่ได้ปกป้องบัญชีใดเป็นการเฉพาะ —
// ถ้ามี ADMIN 3 คน ใครก็ลบอีกคนได้ และ (หลังมีฟีเจอร์ตั้งรหัสชั่วคราว)
// ตั้งรหัสให้บัญชีนั้นแล้วเข้าระบบในชื่อเขาได้ด้วย
//
// ธงนี้ **ไม่ใช่ Role และไม่ให้สิทธิ์เพิ่มใด ๆ** — ให้เพียง "ความคุ้มกัน"

/**
 * การกระทำที่ "ทำลายหรือยึด" บัญชีผู้อื่น — ทุกอันต้องผ่าน guard นี้
 *
 * รายการนี้คือสัญญาที่เทสต์ยึดไว้: `tests/integration/protected-account.test.ts`
 * ไล่ทุกค่าในรายการว่าถูกปฏิเสธจริง — เพิ่มการกระทำใหม่ต้องเพิ่มที่นี่ด้วย
 * มิฉะนั้นเทสต์จะฟ้องว่าไม่มีเคสครอบคลุม (กันลืมใส่ guard ในฟีเจอร์อนาคต)
 */
export const PROTECTED_ACTIONS = [
  "delete-user",
  // ครอบทั้งการปิดและการเปิดบัญชี — กฎอ่านง่ายกว่าว่า "ADMIN ธรรมดาแก้บัญชีคุ้มครองไม่ได้เลย"
  // และไม่มีผลเสีย เพราะบัญชีคุ้มครองถูกปิดไม่ได้อยู่แล้ว (ห้ามปิดตัวเอง + ผู้อื่นก็ปิดไม่ได้)
  "set-active",
  "set-roles",
  "reset-password",
  "set-global-scope",
] as const;

export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

export interface ProtectedAccountCheck {
  /** ผู้กระทำเป็นบัญชีคุ้มครองหรือไม่ */
  actorIsProtected: boolean;
  /** เป้าหมายเป็นบัญชีคุ้มครองหรือไม่ */
  targetIsProtected: boolean;
  /** ผู้กระทำกับเป้าหมายเป็นคนเดียวกันหรือไม่ */
  isSelf: boolean;
}

/**
 * true = ต้องปฏิเสธการกระทำนี้เพราะเป้าหมายเป็นบัญชีคุ้มครอง
 *
 * กฎ (Owner Decision 2026-10-17 — "บัญชีคุ้มครองจัดการกันเองได้"):
 *  - เป้าหมายไม่ใช่บัญชีคุ้มครอง → ไม่เกี่ยวกับกฎนี้ ปล่อยให้ guard เดิมตัดสิน
 *  - ทำกับตัวเอง → ไม่เกี่ยวกับกฎนี้ (กฎเดิม SELF_* จัดการแยกอยู่แล้ว
 *    และถ้าบล็อกที่นี่ด้วย บัญชีคุ้มครองจะถอดธงของตัวเองไม่ได้ตลอดกาล)
 *  - เป้าหมายเป็นบัญชีคุ้มครอง → ผู้กระทำต้องเป็นบัญชีคุ้มครองด้วย
 */
export function isBlockedByProtectedAccount(
  check: ProtectedAccountCheck,
): boolean {
  if (!check.targetIsProtected) return false;
  if (check.isSelf) return false;
  return !check.actorIsProtected;
}

/**
 * true = ผู้กระทำมีสิทธิ์ตั้ง/ถอดธงบัญชีคุ้มครองของผู้อื่น
 *
 * เฉพาะบัญชีคุ้มครองเท่านั้น — มิฉะนั้น ADMIN ธรรมดาจะแต่งตั้งตัวเอง
 * แล้วเดินผ่านกฎทั้งหมดข้างบนได้ภายในคลิกเดียว
 */
export function canManageProtectedFlag(actorIsProtected: boolean): boolean {
  return actorIsProtected;
}

/**
 * true = การถอดธงครั้งนี้จะทำให้ระบบไม่เหลือบัญชีคุ้มครองเลย
 *
 * ต้องกันไว้ด้วยเหตุผลเดียวกับ LAST_ACTIVE_ADMIN — เหลือศูนย์เมื่อใด
 * จะไม่มีใครตั้งกลับคืนได้จากในระบบอีก ต้องไปรันสคริปต์บนเซิร์ฟเวอร์
 */
export function isLastProtectedAccount(input: {
  /** จำนวนบัญชีคุ้มครอง "รายอื่น" (ไม่นับเป้าหมาย) */
  otherProtectedCount: number;
  /** กำลังจะตั้งเป็น true หรือ false */
  nextValue: boolean;
}): boolean {
  if (input.nextValue) return false; // การ "ตั้ง" ไม่เคยทำให้เหลือศูนย์
  return input.otherProtectedCount === 0;
}
