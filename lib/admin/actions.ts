"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/registration/actions.ts)
// ห้ามรับ userId/role/scope ของ "ผู้กระทำ" จาก client — โหลดจาก session จริงเสมอ

import { UserRoleEnum } from "@prisma/client";
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  setUserActive,
  setUserGlobalScope,
  setUserRoles,
  type SetActiveResult,
  type SetGlobalScopeResult,
  type SetRolesResult,
} from "./users";

const setRolesSchema = z.object({
  userId: z.string().min(1).max(64),
  roles: z.array(z.nativeEnum(UserRoleEnum)).max(10),
});

const setGlobalScopeSchema = z.object({
  userId: z.string().min(1).max(64),
  hasGlobalCommunityScope: z.boolean(),
});

export type SetUserRolesActionResult =
  | SetRolesResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function setUserRolesAction(
  input: unknown,
): Promise<SetUserRolesActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = setRolesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return setUserRoles(ctx, parsed.data.userId, parsed.data.roles);
}

export type SetUserGlobalScopeActionResult =
  | SetGlobalScopeResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function setUserGlobalScopeAction(
  input: unknown,
): Promise<SetUserGlobalScopeActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = setGlobalScopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return setUserGlobalScope(
    ctx,
    parsed.data.userId,
    parsed.data.hasGlobalCommunityScope,
  );
}

const setActiveSchema = z.object({
  userId: z.string().min(1).max(64),
  isActive: z.boolean(),
});

export type SetUserActiveActionResult =
  | SetActiveResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function setUserActiveAction(
  input: unknown,
): Promise<SetUserActiveActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return setUserActive(ctx, parsed.data.userId, parsed.data.isActive);
}
