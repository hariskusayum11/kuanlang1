import { AuditAction, DuplicateResolutionEnum, SheetStatus } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { prisma } from "../prisma";

export type DuplicateDecision = "CONFIRMED_DUPLICATE" | "NOT_DUPLICATE";

export function duplicateFlagForDecision(decision: DuplicateDecision): boolean {
  return decision === "CONFIRMED_DUPLICATE";
}

export type ResolveDuplicateResult =
  | { ok: true; decision: DuplicateDecision }
  | {
      ok: false;
      reason:
        | "NOT_ALLOWED"
        | "NOT_FOUND"
        | "SELF_RESOLVE"
        | "WRONG_STATUS"
        | "ALREADY_RESOLVED"
        | "ERROR";
    };

/**
 * Resolve an automatically raised duplicate flag. Confirmed duplicates stay excluded
 * from household totals; a NOT_DUPLICATE decision clears the exclusion flag.
 */
export async function resolveDuplicateFlag(
  ctx: AuthorizationContext,
  householdId: string,
  decision: DuplicateDecision,
): Promise<ResolveDuplicateResult> {
  if (!hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW)) {
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  const household = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    select: {
      id: true,
      communityId: true,
      enteredById: true,
      hasDuplicateFlag: true,
      duplicateResolution: true,
      sheet: { select: { status: true } },
    },
  });
  if (!household) return { ok: false, reason: "NOT_FOUND" };
  if (!ctx.isGlobalScope && !ctx.communityIds.includes(household.communityId)) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (household.enteredById === ctx.userId) {
    return { ok: false, reason: "SELF_RESOLVE" };
  }
  if (household.sheet.status !== SheetStatus.ENTERED_1) {
    return { ok: false, reason: "WRONG_STATUS" };
  }
  if (household.duplicateResolution !== null || !household.hasDuplicateFlag) {
    return { ok: false, reason: "ALREADY_RESOLVED" };
  }

  const resolution = DuplicateResolutionEnum[decision];
  const now = new Date();
  try {
    const updated = await prisma.household.updateMany({
      where: {
        id: household.id,
        deletedAt: null,
        hasDuplicateFlag: true,
        duplicateResolution: null,
      },
      data: {
        hasDuplicateFlag: duplicateFlagForDecision(decision),
        duplicateResolution: resolution,
        duplicateResolvedAt: now,
        duplicateResolvedById: ctx.userId,
      },
    });
    if (updated.count !== 1) return { ok: false, reason: "ALREADY_RESOLVED" };

    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.RESOLVE,
      entityType: "HouseholdDuplicateFlag",
      entityId: household.id,
      reason: "duplicate-review",
      changes: {
        duplicateResolution: { old: null, new: decision },
        hasDuplicateFlag: { old: true, new: duplicateFlagForDecision(decision) },
      },
    });
    return { ok: true, decision };
  } catch {
    console.error("[verification] resolveDuplicateFlag failed", { householdId });
    return { ok: false, reason: "ERROR" };
  }
}
