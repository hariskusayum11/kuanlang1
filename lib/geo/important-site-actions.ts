"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authz/context";
import { deleteImportantSite, saveImportantSite } from "./important-sites";

function optionalInt(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

function requiredNumber(value: FormDataEntryValue | null): number {
  const text = String(value ?? "").trim();
  return text ? Number(text) : Number.NaN;
}

export async function saveImportantSiteAction(formData: FormData): Promise<void> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  const result = await saveImportantSite(ctx, {
    id: String(formData.get("id") ?? "") || undefined,
    communityId: String(formData.get("communityId") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    address: String(formData.get("address") ?? ""),
    latitude: requiredNumber(formData.get("latitude")),
    longitude: requiredNumber(formData.get("longitude")),
    capacity: optionalInt(formData.get("capacity")),
  });
  if (!result.ok) redirect(`/map?siteError=${encodeURIComponent(result.error)}`);
  revalidatePath("/map");
  redirect("/map?siteSaved=1");
}

export async function deleteImportantSiteAction(formData: FormData): Promise<void> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  const result = await deleteImportantSite(ctx, String(formData.get("id") ?? ""));
  if (!result.ok) redirect(`/map?siteError=${encodeURIComponent(result.error)}`);
  revalidatePath("/map");
  redirect("/map?siteDeleted=1");
}
