"use server";

// Server Action — ชั้นบางเหนือ core · ผู้กระทำโหลดจาก session จริงเสมอ ไม่รับจาก client

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "../authz/context";
import { setVulnerableStatus, type SetStatusResult } from "./core";

export type SetVulnerableStatusActionResult =
  | SetStatusResult
  | { ok: false; reason: "UNAUTHENTICATED" };

export async function setVulnerableStatusAction(
  input: unknown,
): Promise<SetVulnerableStatusActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await setVulnerableStatus(ctx, input);
  if (result.ok) revalidatePath("/community-status");
  return result;
}
