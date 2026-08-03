"use server";

// Server Actions — ชั้นบางที่โหลด Authorization Context จาก session จริง
// แล้วส่งต่อให้ core (lib/entry/claim.ts, lib/entry/save.ts) — ห้ามรับ userId/role/scope จาก client
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  claimSheetById,
  openSheetByCode,
  releaseSheet,
  renewLock,
} from "./claim";
import type { OpenSheetResult } from "./claim";
import { entryPayloadSchema } from "./payload";
import {
  saveDraft,
  submitEntry,
  type SaveDraftResult,
  type SubmitEntryResult,
} from "./save";

const sheetIdSchema = z.string().cuid();
// รหัสใบจากกระดาษ: ตัวอักษร/ตัวเลข/ขีด เท่านั้น (กัน input แปลกปลอม) ยาวไม่เกิน 64
const sheetCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/);

export type OpenSheetActionResult =
  | OpenSheetResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/**
 * เปิดใบที่มีอยู่แล้วจากรหัสบนกระดาษ — ใช้เมื่อกลับมาคีย์ใบเดิมต่อ
 * ใบใหม่ใช้ startSheetAction (ระบบออกรหัสให้) ไม่ผ่านทางนี้
 */
export async function openSheetAction(
  code: string,
): Promise<OpenSheetActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsedCode = sheetCodeSchema.safeParse(code);
  if (!parsedCode.success) return { ok: false, reason: "INVALID" };
  return openSheetByCode(ctx, parsedCode.data);
}

export type ClaimActionResult =
  | { ok: true; sheetId: string; resumed: boolean }
  | { ok: false; reason: "FORBIDDEN" | "NO_WORK" | "UNAUTHENTICATED" | "INVALID" };

/** เปิดใบที่ระบุด้วย id (ใช้จากหน้า gate/กลับมาคีย์ต่อ — ไม่ใช่การแจกงาน) */
export async function claimSheetAction(sheetId: string): Promise<ClaimActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = sheetIdSchema.safeParse(sheetId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return claimSheetById(ctx, parsed.data);
}

/** หยุดคีย์ใบนี้ (ปลด lock) — เฉพาะเจ้าของ lock */
export async function releaseSheetAction(
  sheetId: string,
): Promise<{ ok: boolean }> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false };
  const parsed = sheetIdSchema.safeParse(sheetId);
  if (!parsed.success) return { ok: false };
  return { ok: await releaseSheet(ctx, parsed.data) };
}

export type SaveDraftActionResult =
  | SaveDraftResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** บันทึกร่างแบบฟอร์ม — payload ถูกเข้ารหัสฝั่ง server ก่อนเก็บเสมอ */
export async function saveDraftAction(
  sheetId: string,
  payload: unknown,
): Promise<SaveDraftActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsedId = sheetIdSchema.safeParse(sheetId);
  const parsedPayload = entryPayloadSchema.safeParse(payload);
  if (!parsedId.success || !parsedPayload.success) {
    return { ok: false, reason: "INVALID" };
  }
  return saveDraft(ctx, parsedId.data, parsedPayload.data);
}

export type SubmitEntryActionResult =
  | SubmitEntryResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

/** ส่งใบ — สร้าง Household + ปิดใบเป็น ENTERED_1 */
export async function submitEntryAction(
  sheetId: string,
  payload: unknown,
): Promise<SubmitEntryActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsedId = sheetIdSchema.safeParse(sheetId);
  const parsedPayload = entryPayloadSchema.safeParse(payload);
  if (!parsedId.success || !parsedPayload.success) {
    return { ok: false, reason: "INVALID" };
  }
  return submitEntry(ctx, parsedId.data, parsedPayload.data);
}

export async function renewLockAction(
  sheetId: string,
): Promise<{ ok: boolean; lockExpiresAt?: string }> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false };
  const parsed = sheetIdSchema.safeParse(sheetId);
  if (!parsed.success) return { ok: false };
  const result = await renewLock(ctx, parsed.data);
  return result.ok
    ? { ok: true, lockExpiresAt: result.lockExpiresAt?.toISOString() }
    : { ok: false };
}
