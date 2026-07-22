import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listReceivableCommunities } from "@/lib/batch/core";
import { ReceiveBatchForm } from "@/components/batch/receive-batch-form";

export const metadata = { title: "รับปึกใหม่" };
export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
  const ctx = await requirePermission(PERMISSIONS.BATCH_MANAGE);
  const communities = await listReceivableCommunities(ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/batches"
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          ← กลับหน้าปึกกระดาษ
        </Link>
        <h2 className="mt-2 text-xl font-bold text-slate-900">รับปึกใหม่</h2>
        <p className="mt-1 text-sm text-slate-500">
          นับกระดาษ กรอกเลขใบ แล้วระบบจะจำให้เองว่าเลขไหนอยู่ปึกไหน
        </p>
      </div>

      {communities.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            ไม่มีขอบเขตชุมชนที่คุณรับปึกได้
          </p>
          <p className="mt-1 text-xs text-slate-500">
            กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ
          </p>
        </div>
      ) : (
        <section className="card p-6">
          <ReceiveBatchForm communities={communities} />
        </section>
      )}
    </div>
  );
}
