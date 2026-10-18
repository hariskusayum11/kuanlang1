"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authz/context";
import { deleteImportantSite, saveImportantSite } from "./important-sites";

/**
 * ผลลัพธ์ส่งกลับให้หน้าต่างจัดการจุดสำคัญ (useActionState)
 *
 * เดิม action redirect ไป `/map?siteSaved=1` ซึ่งล้างตัวกรอง/ชั้นข้อมูลใน URL ทิ้งทุกครั้ง
 * ตอนนี้คืนผลแทน แล้วให้ revalidatePath ส่งข้อมูลแผนที่ชุดใหม่กลับมาในคำขอเดียวกัน
 * มุมมองที่ผู้ใช้ตั้งไว้จึงอยู่ครบ — สิทธิ์ยังตรวจที่ saveImportantSite/deleteImportantSite ฝั่ง server
 */
export type ImportantSiteActionState =
  | { ok: true; message: string; at: number }
  | { ok: false; error: string; at: number }
  | null;

function optionalInt(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

function requiredNumber(value: FormDataEntryValue | null): number {
  const text = String(value ?? "").trim();
  return text ? Number(text) : Number.NaN;
}

export async function saveImportantSiteAction(
  _previous: ImportantSiteActionState,
  formData: FormData,
): Promise<ImportantSiteActionState> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  const id = String(formData.get("id") ?? "") || undefined;
  const result = await saveImportantSite(ctx, {
    id,
    communityId: String(formData.get("communityId") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    address: String(formData.get("address") ?? ""),
    latitude: requiredNumber(formData.get("latitude")),
    longitude: requiredNumber(formData.get("longitude")),
    capacity: optionalInt(formData.get("capacity")),
  });
  if (!result.ok) return { ok: false, error: result.error, at: Date.now() };
  revalidatePath("/map");
  return { ok: true, message: id ? "บันทึกการแก้ไขจุดสำคัญแล้ว" : "เพิ่มจุดสำคัญบนแผนที่แล้ว", at: Date.now() };
}

export async function deleteImportantSiteAction(
  _previous: ImportantSiteActionState,
  formData: FormData,
): Promise<ImportantSiteActionState> {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  const result = await deleteImportantSite(ctx, String(formData.get("id") ?? ""));
  if (!result.ok) return { ok: false, error: result.error, at: Date.now() };
  revalidatePath("/map");
  return { ok: true, message: "ลบจุดสำคัญออกจากระบบแล้ว ไม่สามารถกู้คืนจากหน้านี้ได้", at: Date.now() };
}
