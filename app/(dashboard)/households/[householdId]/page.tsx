import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { loadHouseholdForReview } from "@/lib/verification/review";
import { SheetSections, VulnerablePeopleSection } from "@/components/household/sheet-view";

export const metadata = { title: "ข้อมูลแบบสอบถาม" };
export const dynamic = "force-dynamic";

/**
 * ดูใบแบบสอบถามที่ตรวจแล้วแบบอ่านอย่างเดียว (docs/43)
 * สำหรับผู้มี household.view ที่ไม่ใช่ผู้ตรวจ (เช่น หัวหน้าชุมชน — เฉพาะชุมชนที่ผูกไว้)
 * ไม่มีปุ่มแก้/ยืนยัน/ลบ · นอกขอบเขตหรือยังไม่ตรวจ → 404 (ไม่บอกว่ามีใบนี้) · Audit READ ทุกครั้ง
 */
export default async function HouseholdViewPage({ params }: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await params;
  const ctx = await requirePermission(PERMISSIONS.HOUSEHOLD_VIEW);
  const review = await loadHouseholdForReview(ctx, householdId, { purpose: "view" });
  if (!review) notFound();

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div>
        <Link
          href="/households"
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          กลับรายการครัวเรือน
        </Link>
        <div className="animate-slide-up mt-3 rounded-3xl band-ink px-6 py-6 md:px-8">
          <h2 className="flex flex-wrap items-center gap-2 font-mono text-2xl font-bold text-white">
            {review.sheetNo}
            <span className="badge badge-success">ตรวจสอบแล้ว</span>
          </h2>
          <p className="mt-1.5 text-sm font-medium text-brand-100">
            {review.communityName} · ตรวจโดย {review.verifiedByName ?? "—"}
            {review.verifiedAt ? ` · ${review.verifiedAt.toLocaleDateString("th-TH")}` : ""}
          </p>
          <p className="mt-3 text-xs text-brand-100">
            ดูได้อย่างเดียว — ถ้าข้อมูลไม่ตรงกับความจริง แจ้งเจ้าหน้าที่ให้แก้ · คนที่เสียชีวิต/ย้ายออก บันทึกได้ที่เมนู “สถานะกลุ่มเปราะบาง”
          </p>
        </div>
      </div>

      <SheetSections sections={review.sections} />
      <VulnerablePeopleSection people={review.vulnerablePersons} />
    </div>
  );
}
