import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getBatchDetail } from "@/lib/batch/core";
import { BatchTransitionButton } from "@/components/batch/batch-actions";

export const metadata = { title: "รายละเอียดปึก" };
export const dynamic = "force-dynamic";

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "รับปึกแล้ว — ยังไม่เปิดให้คีย์", cls: "badge-neutral" },
  READY_FOR_ENTRY: { label: "พร้อมคีย์", cls: "badge-brand" },
  IN_PROGRESS: { label: "กำลังคีย์", cls: "badge-warning" },
  CLOSED: { label: "ปิดแล้ว", cls: "badge-success" },
};

const DATE_FMT = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.BATCH_MANAGE);
  const { batchId } = await params;
  const batch = await getBatchDetail(ctx, batchId);
  if (!batch) notFound();

  const status = BATCH_STATUS[batch.status] ?? {
    label: batch.status,
    cls: "badge-neutral",
  };
  const done = batch.totalSheets > 0
    ? Math.round(((batch.entered + batch.verified) / batch.totalSheets) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div>
        <Link
          href="/batches"
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          ← กลับหน้าปึกกระดาษ
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-xl font-bold text-slate-900">{batch.code}</h2>
          <span className={`badge ${status.cls}`}>{status.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{batch.communityName}</p>
      </div>

      {/* สรุปตัวเลข */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="รับมา (นับได้)" value={batch.expectedCount} />
        <StatCard label="รอคีย์" value={batch.awaiting} />
        <StatCard label="คีย์แล้ว" value={batch.entered} />
        <StatCard label="ยืนยันแล้ว" value={batch.verified} />
      </section>

      {/* ความคืบหน้า + การจัดการ */}
      <section className="card space-y-4 p-6">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">ความคืบหน้าการคีย์</span>
            <span className="tabular-nums text-slate-500">{done}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${done}%` }}
            />
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <MetaRow label="รับเมื่อ" value={DATE_FMT.format(batch.receivedAt)} />
          <MetaRow label="ผู้รับ" value={batch.receivedByName} />
          <MetaRow label="ผู้ส่งมอบ" value={batch.handedOverBy ?? "—"} />
          <MetaRow label="ที่เก็บกระดาษ" value={batch.storageLocation ?? "—"} />
          {batch.note && <MetaRow label="หมายเหตุ" value={batch.note} />}
          {batch.problem > 0 && (
            <MetaRow
              label="ใบมีปัญหา (หาย/แก้ไม่ได้/ซ้ำ)"
              value={batch.problem.toLocaleString("th-TH")}
            />
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {batch.status === "RECEIVED" && (
            <BatchTransitionButton batchId={batch.id} kind="open" />
          )}
          {batch.status !== "CLOSED" && (
            <BatchTransitionButton batchId={batch.id} kind="close" />
          )}
          {batch.status === "RECEIVED" && (
            <p className="text-xs text-slate-500">
              เปิดปึกแล้ว เจ้าหน้าที่คีย์จะเห็นและเริ่มเปิดใบจากรหัสได้ทันที
            </p>
          )}
        </div>
      </section>

      {/* เลขใบที่ยังไม่ถูกคีย์ — ไว้ไล่ใบค้าง/หาใบหาย */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">
            เลขใบที่ยังไม่ถูกคีย์
          </h3>
          <span className="text-xs tabular-nums text-slate-500">
            {batch.awaiting.toLocaleString("th-TH")} ใบ
          </span>
        </div>
        {batch.awaitingNumbers.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            ทุกใบถูกคีย์แล้ว 🎉
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-6 py-4">
            {batch.awaitingNumbers.map((no) => (
              <span
                key={no}
                className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600"
              >
                {no}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-start">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800 sm:text-left">{value}</dd>
    </div>
  );
}
