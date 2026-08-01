import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listReceivableCommunities } from "@/lib/batch/core";
import { ReceiveBatchForm } from "@/components/batch/receive-batch-form";
import { PageHero, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "รับแบบสอบถามเป็นปึก" };
export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
  const ctx = await requirePermission(PERMISSIONS.BATCH_MANAGE);
  const communities = await listReceivableCommunities(ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-7 animate-fade-in">
      <div>
        <Link
          href="/batches"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          กลับหน้าเอกสารภาคสนาม
        </Link>
        <div className="mt-3">
          <PageHero
            title="รับแบบสอบถามเป็นปึก"
            tone="brand"
            description="ใช้เมื่อเอกสารถูกแบ่งเป็นกองจริง — นับกระดาษ กรอกเลขใบ แล้วระบบจะจำให้เองว่าเลขไหนอยู่ปึกไหน"
          />
        </div>
      </div>

      {communities.length === 0 ? (
        <div className="card">
          <EmptyState
            title="ไม่มีขอบเขตชุมชนที่คุณรับเอกสารได้"
            description="กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"
          />
        </div>
      ) : (
        <section className="card p-6">
          <ReceiveBatchForm communities={communities} />
        </section>
      )}
    </div>
  );
}
