"use server";

// Server Actions — จัดการแบบสอบถามโดย ADMIN (Soft Delete / กู้คืน)
// ห้ามรับ userId/role จาก client — โหลดจาก session จริงเสมอ (RBAC ตรวจใน core)
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  restoreHousehold,
  softDeleteHousehold,
  type RestoreHouseholdResult,
  type SoftDeleteHouseholdResult,
} from "./admin-soft-delete";

const householdIdSchema = z.string().cuid();

export type SoftDeleteHouseholdActionResult =
  | SoftDeleteHouseholdResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** ลบแบบสอบถาม (soft delete) — เฉพาะ ADMIN */
export async function softDeleteHouseholdAction(
  householdId: string,
): Promise<SoftDeleteHouseholdActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return softDeleteHousehold(ctx, parsed.data);
}

export type RestoreHouseholdActionResult =
  | RestoreHouseholdResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** กู้คืนแบบสอบถามที่ถูกลบ — เฉพาะ ADMIN */
export async function restoreHouseholdAction(
  householdId: string,
): Promise<RestoreHouseholdActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return restoreHousehold(ctx, parsed.data);
}
