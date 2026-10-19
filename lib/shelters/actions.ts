"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import { revokeHostShelter, updateHostShelter, verifyHostShelter, type ShelterResult } from "./core";

type ActionResult = ShelterResult | { ok: false; reason: "UNAUTHENTICATED" };

function refresh() {
  revalidatePath("/shelters");
  revalidatePath("/map");
  revalidatePath("/");
}

export async function verifyHostShelterAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await verifyHostShelter(ctx, input);
  if (result.ok) refresh();
  return result;
}

export async function updateHostShelterAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await updateHostShelter(ctx, input);
  if (result.ok) refresh();
  return result;
}

const revokeSchema = z.object({ siteId: z.string().min(1).max(64) });

export async function revokeHostShelterAction(input: unknown): Promise<ActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const result = await revokeHostShelter(ctx, parsed.data.siteId);
  if (result.ok) refresh();
  return result;
}
