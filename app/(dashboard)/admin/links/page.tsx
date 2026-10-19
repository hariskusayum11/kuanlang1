import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listAllExternalLinks } from "@/lib/external-links/core";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { ExternalLinkManager } from "@/components/admin/external-link-manager";

export const metadata = { title: "ลิงก์ระบบภายนอก" };
export const dynamic = "force-dynamic";

/**
 * ลิงก์ระบบภายนอกที่แสดงเป็นการ์ดบนหน้าสาธารณะ (Owner Decision 2026-10-19 · docs/37)
 * เก็บในฐานข้อมูลตามกฎ "ห้าม Hardcode Master Data" — แอดมินเพิ่ม/แก้/ซ่อนได้เอง
 */
export default async function ExternalLinksPage() {
  const ctx = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  const links = await listAllExternalLinks(ctx);
  if (!links) redirect("/access-denied");
  const active = links.filter((l) => l.isActive).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <PageHero
        title="ลิงก์ระบบภายนอก"
        tone="ink"
        description="การ์ดลิงก์บนหน้าสาธารณะ ให้ประชาชนกดไปดูเรดาร์ฝน ระดับน้ำ และภาพดาวเทียมจากหน่วยงานอื่นได้ทันที — ทุกการแก้ไขบันทึก Audit Log"
        badge={<>แสดงอยู่ {active} / {links.length} ลิงก์</>}
      />
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="รายการลิงก์" tone="brand" />
        </div>
        <ExternalLinkManager links={links} />
      </section>
    </div>
  );
}
