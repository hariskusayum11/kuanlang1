"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import {
  saveExternalLink,
  setExternalLinkActive,
  type SaveExternalLinkResult,
  type SetExternalLinkActiveResult,
} from "./core";

export async function saveExternalLinkAction(
  input: unknown,
): Promise<SaveExternalLinkResult | { ok: false; reason: "UNAUTHENTICATED" }> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await saveExternalLink(ctx, input);
  if (result.ok) {
    revalidatePath("/admin/links");
    revalidatePath("/");
  }
  return result;
}

const activeSchema = z.object({ id: z.string().min(1).max(64), isActive: z.boolean() });

export async function setExternalLinkActiveAction(
  input: unknown,
): Promise<SetExternalLinkActiveResult | { ok: false; reason: "UNAUTHENTICATED" | "INVALID" }> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const result = await setExternalLinkActive(ctx, parsed.data.id, parsed.data.isActive);
  if (result.ok) {
    revalidatePath("/admin/links");
    revalidatePath("/");
  }
  return result;
}
