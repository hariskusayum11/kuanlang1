"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/entry/actions.ts)
// ห้ามรับ userId/role/scope จาก client — โหลดจาก session จริงเสมอ

import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import { startSheet, type StartSheetResult } from "./create";

const startSheetSchema = z.object({
  communityId: z.string().cuid(),
});

export type StartSheetActionResult =
  | StartSheetResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" };

export async function startSheetAction(
  input: unknown,
): Promise<StartSheetActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = startSheetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return startSheet(ctx, parsed.data);
}
