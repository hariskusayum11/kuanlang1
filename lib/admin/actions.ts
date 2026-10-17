"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/registration/actions.ts)
// ห้ามรับ userId/role/scope ของ "ผู้กระทำ" จาก client — โหลดจาก session จริงเสมอ

import { UserRoleEnum } from "@prisma/client";
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  resetUserPassword,
  type ResetUserPasswordResult,
} from "./user-password";
import {
  deleteUser,
  recoverUser,
  setUserActive,
  setUserGlobalScope,
  setUserRoles,
  type DeleteUserResult,
  type RecoverUserResult,
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

const userIdSchema = z.object({ userId: z.string().min(1).max(64) });

export type DeleteUserActionResult =
  | DeleteUserResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** ลบบัญชีผู้ใช้ (hard delete + soft fallback) — ตรวจ RBAC + guard ฝั่ง server ใน core */
export async function deleteUserAction(
  input: unknown,
): Promise<DeleteUserActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return deleteUser(ctx, parsed.data.userId);
}

export type ResetUserPasswordActionResult =
  | ResetUserPasswordResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/**
 * ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้รายอื่น — ตรวจ RBAC ฝั่ง server ใน core
 * คืนรหัสกลับไปแสดงบนหน้าจอครั้งเดียว: ห้ามนำค่านี้ไป log หรือเก็บที่ใด
 */
export async function resetUserPasswordAction(
  input: unknown,
): Promise<ResetUserPasswordActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return resetUserPassword(ctx, parsed.data.userId);
}

export type RecoverUserActionResult =
  | RecoverUserResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** กู้คืนบัญชีที่ถูกปฏิเสธ/ยกเลิก (อนุมัติใหม่) — ตรวจ RBAC + guard ฝั่ง server ใน core */
export async function recoverUserAction(
  input: unknown,
): Promise<RecoverUserActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };

  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  return recoverUser(ctx, parsed.data.userId);
}
