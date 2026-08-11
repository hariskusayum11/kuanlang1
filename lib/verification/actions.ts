"use server";

// Server Actions — ชั้นบางที่โหลด Authorization Context จาก session จริง
// แล้วส่งต่อให้ core (lib/verification/review.ts) — ห้ามรับ userId/role/scope จาก client
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import { verifyHousehold, type VerifyResult } from "./review";
import { applyHouseholdEdits, type EditResult } from "./edit";
import type { EditableFieldMark, EditableFormValue } from "./editable-fields";
import {
  resolveDuplicateFlag,
  type DuplicateDecision,
  type ResolveDuplicateResult,
} from "./duplicate-resolution";

const householdIdSchema = z.string().cuid();

export type VerifyActionResult =
  | VerifyResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** ยืนยันครัวเรือนเป็น VERIFIED (RBAC/scope/สถานะ ตรวจใน core ฝั่ง server) */
export async function verifyHouseholdAction(
  householdId: string,
): Promise<VerifyActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return verifyHousehold(ctx, parsed.data);
}

export type ResolveDuplicateActionResult =
  | ResolveDuplicateResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function resolveDuplicateFlagAction(
  householdId: string,
  decision: DuplicateDecision,
): Promise<ResolveDuplicateActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const id = householdIdSchema.safeParse(householdId);
  const parsedDecision = z.enum(["CONFIRMED_DUPLICATE", "NOT_DUPLICATE"]).safeParse(decision);
  if (!id.success || !parsedDecision.success) return { ok: false, reason: "INVALID" };
  return resolveDuplicateFlag(ctx, id.data, parsedDecision.data);
}

export type EditActionResult =
  | EditResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** แก้ไขฟิลด์ Household/FloodRiskProfile/รายการ M:N โดย Verifier (RBAC/scope/สถานะ/แยกหน้าที่ ตรวจใน core) */
export async function editHouseholdAction(
  householdId: string,
  edits: Record<string, EditableFormValue>,
  fieldMarks: Record<string, EditableFieldMark> = {},
): Promise<EditActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = householdIdSchema.safeParse(householdId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return applyHouseholdEdits(ctx, parsed.data, edits, fieldMarks);
}
