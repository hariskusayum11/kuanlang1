import { prisma } from "../prisma";
import { buildAuthorization } from "./access";
import type { AuthorizationContext } from "./types";

// แยกจาก context.ts เพื่อให้ vitest เรียกได้โดยไม่ติด server-only / next/headers
export async function loadAuthorizationForUser(user: {
  id: string;
  name: string;
  email: string;
}): Promise<AuthorizationContext> {
  const [userRoles, scopes] = await Promise.all([
    prisma.userRole.findMany({
      where: { userId: user.id, isActive: true },
      select: { role: true },
    }),
    prisma.userCommunityScope.findMany({
      where: { userId: user.id },
      select: { communityId: true },
    }),
  ]);

  const roles = userRoles.map((r) => r.role);
  const { permissions, isGlobalScope } = buildAuthorization(roles);

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
