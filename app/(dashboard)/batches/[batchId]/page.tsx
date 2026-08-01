import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getBatchDetail } from "@/lib/batch/core";
import { BatchTransitionButton } from "@/components/batch/batch-actions";
import { Mascot } from "@/components/brand/mascot";
import { SectionTitle } from "@/components/layout/page-hero";

export const metadata = { title: "รายละเอียดปึก" };
export const dynamic = "force-dynamic";

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "รับแล้ว — ยังไม่เปิดให้คีย์", cls: "badge-neutral" },
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
    <div className="mx-auto max-w-4xl space-y-7 animate-fade-in">
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

        <div className="animate-slide-up mt-3 flex flex-wrap items-center justify-between gap-4 rounded-3xl band-ink px-6 py-6 md:px-8">
          <div className="min-w-0">
            <h2 className="font-mono text-2xl font-bold text-white">{batch.code}</h2>
            <p className="mt-1 text-sm text-brand-100">{batch.communityName}</p>
            <span className={`badge mt-3 ${status.cls}`}>{status.label}</span>
          </div>
        </div>
      </div>

      {/* สรุปตัวเลข */}
      <section className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="รับมา (นับได้)" value={batch.expectedCount} tone="brand" />
        <StatCard label="รอคีย์" value={batch.awaiting} tone="sun" />
        <StatCard label="คีย์แล้ว" value={batch.entered} tone="alert" />
        <StatCard label="ยืนยันแล้ว" value={batch.verified} tone="mint" />
      </section>

      {/* ความคืบหน้า + การจัดการ */}
      <section className="card space-y-4 p-6">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-700">ความคืบหน้าการคีย์</span>
            <span className="font-bold tabular-nums text-emerald-700">{done}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
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

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-slate-100 pt-4">
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
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="เลขใบที่ยังไม่ถูกคีย์"
            tone="sun"
            aside={
              <span className="badge badge-neutral tabular-nums">
                {batch.awaiting.toLocaleString("th-TH")} ใบ
              </span>
            }
          />
        </div>
        {batch.awaitingNumbers.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Mascot role="entry" mood="happy" tone="mint" motion="float" size={84} decorative />
            <p className="mt-4 text-[15px] font-bold text-slate-800">ทุกใบถูกคีย์แล้ว</p>
            <p className="mt-1 text-sm text-slate-500">รอ Verifier ตรวจสอบความถูกต้องต่อไป</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 px-6 py-5">
            {batch.awaitingNumbers.map((no) => (
              <span
                key={no}
                className="rounded-lg border-2 border-sun-200 bg-sun-50 px-2.5 py-1 font-mono text-xs font-bold text-sun-800"
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

const STAT_TONE = {
  brand: { bar: "bg-brand-400", value: "text-brand-700" },
  sun: { bar: "bg-sun-400", value: "text-sun-700" },
  alert: { bar: "bg-alert-400", value: "text-alert-600" },
  mint: { bar: "bg-emerald-400", value: "text-emerald-700" },
} as const;

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className="card card-interactive p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className={`h-4 w-1.5 rounded-full ${STAT_TONE[tone].bar}`} aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-2 text-[28px] font-bold leading-none tabular-nums ${STAT_TONE[tone].value}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-start">
      <dt className="shrink-0 font-medium text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-800 sm:text-left">{value}</dd>
    </div>
  );
}
