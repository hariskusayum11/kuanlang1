"use server";

// Server Actions — ชั้นบางที่โหลด Authorization Context จาก session จริง
// แล้วส่งต่อให้ core (lib/verification/review.ts) — ห้ามรับ userId/role/scope จาก client
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import { verifyHousehold, type VerifyResult } from "./review";

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
