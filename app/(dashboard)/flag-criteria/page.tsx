import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getFlagCriteriaPageData } from "@/lib/water/flag-criteria";
import { getSongKhlongStations } from "@/lib/water/thaiwater";
import { PageHero } from "@/components/layout/page-hero";
import { FlagCriteriaEditor, type LiveLevels } from "@/components/admin/flag-criteria-editor";

export const metadata = { title: "เกณฑ์ธงเตือนภัย" };
export const dynamic = "force-dynamic";

/**
 * แก้เกณฑ์ธงเตือนภัยชุมชนที่หน้าแรกใช้ประเมินธง (Owner Decision 2026-11-09 · docs/44)
 * ADMIN เท่านั้น (flag-criteria.manage — ตรวจซ้ำใน server action) · ทุกการบันทึกเป็นฉบับใหม่ + Audit Log
 */
export default async function FlagCriteriaPage() {
  const ctx = await requirePermission(PERMISSIONS.FLAG_CRITERIA_MANAGE);
  const data = await getFlagCriteriaPageData(ctx);
  if (!data) redirect("/access-denied");
  const { active, history } = data;

  // ระดับน้ำตอนนี้ของทุกสถานีในเกณฑ์ — ให้เห็นผลก่อนบันทึก (ข้อมูลสาธารณะจากคลังข้อมูลน้ำแห่งชาติ)
  const feed = await getSongKhlongStations(active.config.bridges.map((b) => b.stationCode));
  const live: LiveLevels = Object.fromEntries(
    feed.readings.map((r) => [r.code, { levelMsl: r.levelMsl, bankMsl: r.bankMsl, name: r.name, measuredAt: r.measuredAt }]),
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="เกณฑ์ธงเตือนภัย"
        tone="brand"
        description="ระดับธงและเกณฑ์ยกธงรายสะพานที่หน้าแรกใช้ประเมิน “ธงโดยประมาณ” — เพิ่มระดับธง ปรับเกณฑ์ และปรับระดับท้องสะพานได้ ทุกการแก้เป็นฉบับใหม่ บันทึกว่าใครแก้ เมื่อไร เพราะอะไร"
        badge={active.versionNo > 0 ? `ฉบับที่ ${active.versionNo} · ${active.createdByName ?? "ระบบ"}` : "ยังใช้ค่าตั้งต้นของระบบ"}
      />
      <p className="text-sm text-slate-600">
        ผลการแก้แสดงที่ <Link href="/#flags" className="font-semibold text-brand-700 underline underline-offset-2">หน้าแรก — ส่วนธงเตือนภัยชุมชน</Link> ทันทีหลังบันทึก ·
        ธงบนหน้าแรกเป็นการประเมินของระบบ ไม่ใช่ธงที่กลุ่มประกาศ
        {feed.error ? <span className="block text-sun-700">ดึงระดับน้ำตอนนี้ไม่ได้ ({feed.error}) — ยังแก้และบันทึกเกณฑ์ได้ตามปกติ</span> : null}
      </p>
      <FlagCriteriaEditor versionNo={active.versionNo} initial={active.config} live={live} history={history} />
    </div>
  );
}
