"use server";

import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "../authz/context";
import { previewRuleChange, saveRuleVersion, type RulePreviewResult, type RuleSaveResult } from "./core";

type Unauthenticated = { ok: false; reason: "UNAUTHENTICATED" };

export async function previewRuleChangeAction(input: unknown): Promise<RulePreviewResult | Unauthenticated> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  return previewRuleChange(ctx, input);
}

export async function saveRuleVersionAction(input: unknown): Promise<RuleSaveResult | Unauthenticated> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const result = await saveRuleVersion(ctx, input);
  if (result.ok) {
    // ทุกหน้าที่คำนวณความเร่งด่วน/ความเสี่ยงจากกฎ
    for (const path of ["/priority-rules", "/risk", "/map", "/dashboard", "/medical"]) revalidatePath(path);
  }
  return result;
}
