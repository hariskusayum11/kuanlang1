"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "../authz/context";
import { saveFlagCriteria, type FlagCriteriaSaveResult } from "./flag-criteria";

type Unauthenticated = { ok: false; reason: "UNAUTHENTICATED" };

export async function saveFlagCriteriaAction(input: unknown): Promise<FlagCriteriaSaveResult | Unauthenticated> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await saveFlagCriteria(ctx, input);
  if (result.ok) for (const path of ["/", "/flag-criteria"]) revalidatePath(path);
  return result;
}
