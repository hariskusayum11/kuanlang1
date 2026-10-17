import type { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";

export interface AuthorizationContext {
  userId: string;
  name: string;
  email: string;
  roles: UserRoleEnum[];
  permissions: readonly Permission[];
  isGlobalScope: boolean;
  communityIds: string[];
  /**
   * "บัญชีคุ้มครอง" — ไม่ใช่สิทธิ์เพิ่ม แต่เป็นความคุ้มกันจากการถูก ADMIN รายอื่น
   * ลบ/ปิด/ถอดบทบาท/ตั้งรหัสผ่านให้ และเป็นเงื่อนไขของการตั้งธงนี้ให้ผู้อื่น
   * อ่านสดทุก request เช่นเดียวกับ isActive — ถอดธงแล้วต้องมีผลทันที
   */
  isProtectedAccount: boolean;
}
