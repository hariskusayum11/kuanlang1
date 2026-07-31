import { prisma } from "../prisma";
import { buildAuthorization } from "./access";
import type { AuthorizationContext } from "./types";

// แยกจาก context.ts เพื่อให้ vitest เรียกได้โดยไม่ติด server-only / next/headers
//
// ความปลอดภัย (Owner Decision 2026-07-31 #R6-C): ฟังก์ชันนี้ตรวจ `isActive` เอง
// ไม่ฝากความปลอดภัยไว้กับ caller — เดิมมันคำนวณสิทธิ์จาก Role/Scope อย่างเดียว
// ทำให้โค้ดใหม่ที่เรียกตรงโดยข้าม getActiveSessionUser() เปิดช่องให้บัญชีที่ถูกปิด
// ทำงานต่อได้เงียบ ๆ ซึ่งเป็นกับดักที่มองไม่เห็นจากจุดที่เขียนโค้ด
//
// ต้องการอ่าน "สิทธิ์ที่บัญชีหนึ่งเคยมี" เพื่อแสดงผลในหน้าแอดมิน ให้ใช้ listUsers()
// (lib/admin/users.ts) อย่าใช้ Authorization Context ซึ่งมีไว้สำหรับผู้ทำคำขอเท่านั้น

/**
 * โหลดสิทธิ์ของผู้ใช้สำหรับใช้เป็น Authorization Context ของคำขอ
 *
 * คืน `null` เมื่อบัญชีไม่มีอยู่จริงหรือถูกปิดใช้งาน — caller ต้อง redirect /login
 */
export async function loadAuthorizationForUser(user: {
  id: string;
  name: string;
  email: string;
}): Promise<AuthorizationContext | null> {
  const [account, userRoles, scopes] = await Promise.all([
    // อ่านสดทุก request ไม่เก็บใน session — เพิกถอนสิทธิ์หรือปิดบัญชีแล้ว
    // ต้องมีผลทันที ไม่ต้องรอผู้ใช้ logout
    prisma.user.findUnique({
      where: { id: user.id },
      select: { isActive: true, hasGlobalCommunityScope: true },
    }),
    prisma.userRole.findMany({
      where: { userId: user.id, isActive: true },
      select: { role: true },
    }),
    prisma.userCommunityScope.findMany({
      where: { userId: user.id },
      select: { communityId: true },
    }),
  ]);

  // บัญชีถูกปิด (หรือถูกลบ) → ไม่มีสิทธิ์ใดเลย ห้ามคืน context ที่ใช้งานได้
  if (!account || !account.isActive) return null;

  const roles = userRoles.map((r) => r.role);
  const { permissions, isGlobalScope } = buildAuthorization(roles, {
    hasGlobalCommunityScope: account.hasGlobalCommunityScope,
  });

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles,
    permissions,
    isGlobalScope,
    communityIds: scopes.map((s) => s.communityId),
  };
}
