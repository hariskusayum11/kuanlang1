"use server";

// Server Actions — ชั้นบางเหนือ core (pattern เดียวกับ lib/entry/actions.ts)
// ห้ามรับ userId/role/scope จาก client — โหลดจาก session จริงเสมอ
import { z } from "zod";
import { getAuthorizationContext } from "../authz/context";
import { updatePopulation, type UpdatePopulationResult } from "./core";

const populationSchema = z.object({
  // null = ยังไม่ทราบ · client ส่งเลขหรือ null (core ตรวจ int>0 อีกชั้น)
  totalHouseholds: z.number().int().nonnegative().nullable(),
  targetCoveragePercent: z.number().finite(),
  dataSource: z.string().max(200).nullish(),
  dataNote: z.string().max(200).nullish(),
});

export type UpdatePopulationActionResult =
  | UpdatePopulationResult
  | { ok: false; reason: "UNAUTHENTICATED" | "INVALID"; error?: string };

export async function updatePopulationAction(
  communityId: string,
  input: unknown,
): Promise<UpdatePopulationActionResult> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return { ok: false, reason: "UNAUTHENTICATED" };
  const id = z.string().cuid().safeParse(communityId);
  if (!id.success) return { ok: false, reason: "INVALID" };
  const parsed = populationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  return updatePopulation(ctx, id.data, parsed.data);
}
