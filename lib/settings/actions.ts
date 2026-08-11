"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "../authz/context";
import { saveSystemPreferences } from "./core";
import type { SurveyStatusFilter } from "../household/trusted-where";

export async function saveSystemPreferencesAction(formData: FormData): Promise<void> {
  const ctx = await getAuthorizationContext();
  if (!ctx) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const status = String(formData.get("dashboardDefaultStatus") ?? "VERIFIED") as SurveyStatusFilter;
  const result = await saveSystemPreferences(ctx, {
    notice: String(formData.get("notice") ?? ""),
    dashboardDefaultStatus: status,
    mapDefaultLat: Number(formData.get("mapDefaultLat")),
    mapDefaultLng: Number(formData.get("mapDefaultLng")),
    mapDefaultZoom: Number(formData.get("mapDefaultZoom")),
  });
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/map");
  redirect("/settings?saved=1");
}
