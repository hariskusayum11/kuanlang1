"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/entry/actions.ts)
// ห้ามรับ userId/role/scope จาก client — โหลดจาก session จริงเสมอ

import { headers } from "next/headers";
import { UserRoleEnum } from "@prisma/client";
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  approveRegistration,
  deleteRegistrationRequest,
  rejectRegistration,
  reopenRegistration,
  submitRegistration,
  type DecideRegistrationResult,
  type DeleteRegistrationRequestResult,
  type SubmitRegistrationResult,
} from "./core";
import { consumeRegistrationQuota } from "./rate-limit";
import { APPROVABLE_ROLES, registrationSchema } from "./validation";

export type SubmitRegistrationActionResult =
  | SubmitRegistrationResult
  | { ok: false; reason: "INVALID" | "RATE_LIMITED"; message?: string };

/** ยื่นคำขอลงทะเบียน (public — เรียกได้โดยไม่มี session) */
export async function submitRegistrationAction(
  input: unknown,
): Promise<SubmitRegistrationActionResult> {
  // Rate limit ต่อ IP — server action ไม่ผ่าน /api/auth จึงคุมเองที่นี่
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  if (!consumeRegistrationQuota(ip)) {
    return { ok: false, reason: "RATE_LIMITED" };
  }

  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "INVALID",
      message: parsed.error.issues[0]?.message,
    };
  }
  return submitRegistration(parsed.data);
}

const requestIdSchema = z.string().cuid();

/** บทบาทที่ ADMIN มอบได้ตอนอนุมัติ — ADMIN ไม่อยู่ในรายการ (ดู validation.ts) */
const grantedRoleSchema = z
  .nativeEnum(UserRoleEnum)
  .refine((r) => (APPROVABLE_ROLES as readonly UserRoleEnum[]).includes(r));
// เหตุผลการปฏิเสธ — บังคับกรอก (ผู้ขอควรได้รู้เหตุผลเมื่อติดต่อสอบถาม)
const rejectReasonSchema = z.string().trim().min(2).max(500);

export type DecideRegistrationActionResult =
  | DecideRegistrationResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function approveRegistrationAction(
  requestId: string,
  /** บทบาทที่ ADMIN เลือกมอบ — ไม่ส่ง = ใช้ตามที่ผู้สมัครเสนอ */
  grantedRole?: unknown,
): Promise<DecideRegistrationActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  // ห้ามเชื่อค่าจาก client — ตรวจว่าอยู่ใน whitelist ก่อนส่งต่อ (core ตรวจซ้ำอีกชั้น)
  let role: UserRoleEnum | undefined;
  if (grantedRole !== undefined && grantedRole !== null && grantedRole !== "") {
    const roleParsed = grantedRoleSchema.safeParse(grantedRole);
    if (!roleParsed.success) return { ok: false, reason: "INVALID" };
    role = roleParsed.data;
  }

  return approveRegistration(ctx, parsed.data, role);
}

export async function rejectRegistrationAction(
  requestId: string,
  reason: string,
): Promise<DecideRegistrationActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsedId = requestIdSchema.safeParse(requestId);
  const parsedReason = rejectReasonSchema.safeParse(reason);
  if (!parsedId.success || !parsedReason.success) {
    return { ok: false, reason: "INVALID" };
  }
  return rejectRegistration(ctx, parsedId.data, parsedReason.data);
}

/** กลับคำขอที่ถูกปฏิเสธ/ยกเลิกมาเป็นรอตรวจใหม่ (REJECTED/CANCELLED → PENDING) */
export async function reopenRegistrationAction(
  requestId: string,
): Promise<DecideRegistrationActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return reopenRegistration(ctx, parsed.data);
}

export type DeleteRegistrationRequestActionResult =
  | DeleteRegistrationRequestResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** ลบคำขอลงทะเบียนที่ตัดสินแล้ว (REJECTED/CANCELLED) — RBAC ตรวจใน core */
export async function deleteRegistrationRequestAction(
  requestId: string,
): Promise<DeleteRegistrationRequestActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return deleteRegistrationRequest(ctx, parsed.data);
}
