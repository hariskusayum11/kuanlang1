import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getSheetSummary, listBatches, listReceivableCommunities } from "@/lib/batch/core";
import { RegisterSheetForm } from "@/components/batch/register-sheet-form";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "เอกสารภาคสนาม" };
export const dynamic = "force-dynamic";

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "รับแล้ว", cls: "badge-neutral" },
  READY_FOR_ENTRY: { label: "พร้อมคีย์", cls: "badge-brand" },
  IN_PROGRESS: { label: "กำลังคีย์", cls: "badge-warning" },
  CLOSED: { label: "ปิดแล้ว", cls: "badge-success" },
};

const SUMMARY_TONE = {
  brand: { bar: "bg-brand-500", value: "text-brand-700" },
  sun: { bar: "bg-sun-400", value: "text-slate-900" },
  alert: { bar: "bg-alert-500", value: "text-alert-700" },
  mint: { bar: "bg-emerald-400", value: "text-emerald-700" },
  neutral: { bar: "bg-slate-300", value: "text-slate-600" },
} as const;

const DATE_FMT = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

export default async function BatchesPage() {
  // RBAC ฝั่ง server — เฉพาะผู้รับเอกสาร (OFFICER/COORDINATOR/ADMIN)
  const ctx = await requirePermission(PERMISSIONS.BATCH_MANAGE);
  const [batches, communities, summary] = await Promise.all([
    listBatches(ctx).then((rows) => rows ?? []),
    listReceivableCommunities(ctx),
    getSheetSummary(ctx),
  ]);
  // ปึกที่ปิดแล้วรับใบเพิ่มไม่ได้ — ไม่ต้องเสนอให้เลือก
  const openBatches = batches
    .filter((b) => b.status !== "CLOSED")
    .map((b) => ({ id: b.id, code: b.code, communityId: b.communityId }));

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-in">
      <PageHero
        title="เอกสารภาคสนาม"
        tone="ink"
        description="ลงทะเบียนแบบสอบถามที่รับกลับมาจากภาคสนามได้ทันที — ไม่ต้องมีปึก หากมีการแบ่งกองเอกสารจริงค่อยเลือกปึกภายหลัง"
        badge={
          <>
            <span className="live-dot" />
            {(summary?.received ?? 0).toLocaleString("th-TH")} แบบสอบถามในขอบเขตของคุณ
          </>
        }
      />

      {/* พระเอกของหน้า — ลงทะเบียนได้เลยโดยไม่ต้องสร้างปึกก่อน (#R6-B/#R6-F) */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รับแบบสอบถามเข้าสู่ระบบ"
            tone="brand"
            aside={
              <span className="badge badge-neutral">
                ยืนยันว่ากระดาษมีอยู่จริงและอยู่ชุมชนใด
              </span>
            }
          />
        </div>
        <div className="p-6">
          {communities.length === 0 ? (
            <EmptyState
              title="ไม่มีขอบเขตชุมชนที่คุณลงทะเบียนแบบสอบถามได้"
              description="กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"
            />
          ) : (
            <RegisterSheetForm communities={communities} batches={openBatches} />
          )}
        </div>
      </section>

      {/* สรุปจำนวนแบบสอบถาม — นับทุกใบในขอบเขต ไม่ว่าจะอยู่ในปึกหรือไม่ */}
      {summary && summary.received > 0 && (
        <section className="space-y-3">
          <SectionTitle
            title="สรุปแบบสอบถามในขอบเขตของคุณ"
            tone="mint"
            aside={
              <span className="badge badge-neutral tabular-nums">
                นับทุกใบ {summary.received.toLocaleString("th-TH")} ใบ — รวมใบที่ไม่ได้จัดเข้าปึก
              </span>
            }
          />
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="รับแล้ว" value={summary.received} tone="brand" />
            <SummaryCard label="รอคีย์" value={summary.awaitingEntry} tone="sun" />
            <SummaryCard label="กำลังคีย์" value={summary.inEntry} tone="alert" />
            <SummaryCard label="รอตรวจ" value={summary.awaitingVerify} tone="neutral" />
            <SummaryCard label="ตรวจแล้ว" value={summary.verified} tone="mint" />
          </div>
          {summary.problem > 0 && (
            <p className="text-xs font-medium text-slate-500">
              มีอีก {summary.problem.toLocaleString("th-TH")} ใบที่หาย ซ้ำ หรือแก้ไขไม่ได้
              — ไม่ถูกนับในสี่ช่องหลัง
            </p>
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายการปึก (ถ้ามี)"
            tone="brand"
            aside={
              <Link href="/batches/new" className="btn btn-secondary btn-sm">
                รับแบบสอบถามเป็นปึก
              </Link>
            }
          />
        </div>
        {batches.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title="ยังไม่มีการจัดปึกเอกสาร"
            description="ลงทะเบียนแบบสอบถามได้เลยโดยไม่ต้องมีปึก — จัดปึกเมื่อมีการแบ่งกองเอกสารจริงเท่านั้น"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ปึก</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4 text-right">แบบสอบถาม</th>
                  <th className="py-3 pr-4 text-right">รอคีย์</th>
                  <th className="py-3 pr-4 text-right">คีย์แล้ว</th>
                  <th className="py-3 pr-4 text-right">ตรวจแล้ว</th>
                  <th className="py-3 pr-4">รับเมื่อ</th>
                  <th className="py-3 pr-6">ที่เก็บ</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {batches.map((b) => {
                  const status = BATCH_STATUS[b.status] ?? {
                    label: b.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-brand-50/50">
                      <td className="py-3 pl-6 pr-4">
                        <Link
                          href={`/batches/${b.id}`}
                          className="font-mono text-xs font-bold text-brand-700 hover:underline"
                        >
                          {b.code}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 font-medium text-slate-700">{b.communityName}</td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {b.totalSheets.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {b.awaiting.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {b.entered.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right font-bold tabular-nums text-emerald-700">
                        {b.verified.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-xs tabular-nums text-slate-500">
                        {DATE_FMT.format(b.receivedAt)}
                      </td>
                      <td className="py-3 pr-6 text-xs text-slate-500">
                        {b.storageLocation ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof SUMMARY_TONE;
}) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className={`h-4 w-1.5 rounded-full ${SUMMARY_TONE[tone].bar}`} aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-2 text-[28px] font-bold leading-none tabular-nums ${SUMMARY_TONE[tone].value}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}
