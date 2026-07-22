"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/entry/actions.ts)
// ห้ามรับ userId/role/scope จาก client — โหลดจาก session จริงเสมอ

import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  closeBatch,
  createBatch,
  openBatchForEntry,
  type BatchTransitionResult,
  type CreateBatchResult,
} from "./core";
import { MAX_SHEETS_PER_BATCH } from "./sheet-numbers";

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const createBatchSchema = z.object({
  communityId: z.string().cuid(),
  handedOverBy: optionalTrimmed(200),
  storageLocation: optionalTrimmed(100),
  note: optionalTrimmed(1000),
  numbering: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("PRINTED"),
      // เพดานความยาวข้อความ กัน payload ใหญ่ผิดปกติ (เลขจริงยาว ~7 ตัว/ใบ)
      numbersText: z.string().min(1).max(MAX_SHEETS_PER_BATCH * 40),
    }),
    z.object({
      mode: z.literal("AUTO"),
      count: z.number().int().min(1).max(MAX_SHEETS_PER_BATCH),
    }),
  ]),
});

export type CreateBatchActionResult =
  | CreateBatchResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function createBatchAction(
  input: unknown,
): Promise<CreateBatchActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return createBatch(ctx, parsed.data);
}

const batchIdSchema = z.string().cuid();

export type BatchTransitionActionResult =
  | BatchTransitionResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function openBatchAction(
  batchId: string,
): Promise<BatchTransitionActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = batchIdSchema.safeParse(batchId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return openBatchForEntry(ctx, parsed.data);
}

export async function closeBatchAction(
  batchId: string,
): Promise<BatchTransitionActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = batchIdSchema.safeParse(batchId);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return closeBatch(ctx, parsed.data);
}
