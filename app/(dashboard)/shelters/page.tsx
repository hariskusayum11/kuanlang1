import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getShelterOverview } from "@/lib/shelters/core";
import { PageHero } from "@/components/layout/page-hero";
import { ShelterManager } from "@/components/shelters/shelter-manager";

export const metadata = { title: "ยืนยันบ้านพักพิง" };
export const dynamic = "force-dynamic";

/**
 * ยืนยันบ้านพักพิง (Owner Decision 2026-10-19 · docs/38)
 * ติ๊กในแบบสอบถาม = เสนอตัว → เจ้าหน้าที่ติดต่อเจ้าของแล้วยืนยัน → เป็นจุดพักพิงจริงบนแผนที่
 * แสดงต่อสาธารณะเฉพาะเมื่อเจ้าของยินยอมให้เผยแพร่อีกครั้ง
 */
export default async function SheltersPage() {
  const ctx = await requirePermission(PERMISSIONS.SHELTER_VERIFY);
  const data = await getShelterOverview(ctx);
  if (!data) redirect("/access-denied");

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <PageHero
        title="ยืนยันบ้านพักพิง"
        tone="ink"
        description="บ้านที่ยินยอมเป็นจุดพักพิงในแบบสอบถามยังเป็นแค่การเสนอตัว — ติดต่อเจ้าของบ้าน ยืนยันความจุและสิ่งอำนวยความสะดวก แล้วจึงกดยืนยันให้เป็นจุดพักพิงจริงบนแผนที่"
        badge={<>รอยืนยัน {data.candidates.length} · ยืนยันแล้ว {data.verified.length}</>}
      />
      <ShelterManager candidates={data.candidates} verified={data.verified} />
    </div>
  );
}
