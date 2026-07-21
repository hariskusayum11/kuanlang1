// Server-only: ห้าม import จาก Client Component (พึ่ง next/headers ผ่าน auth-session)
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "../auth-session";
import { hasPermission } from "./access";
import { loadAuthorizationForUser } from "./load-authorization";
import type { Permission } from "./permissions";
import type { AuthorizationContext } from "./types";

export async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
  const user = await getActiveSessionUser();
  if (!user) return null;
  return loadAuthorizationForUser(user);
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthorizationContext> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  if (!hasPermission(ctx, permission)) redirect("/access-denied");
  return ctx;
}

export async function requireCommunityAccess(
  communityId: string,
): Promise<AuthorizationContext> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  if (!ctx.isGlobalScope && !ctx.communityIds.includes(communityId)) {
    redirect("/access-denied");
  }
  return ctx;
}
