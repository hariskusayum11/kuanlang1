import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listBatches } from "@/lib/batch/core";
import { PageHero, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ปึกกระดาษ" };
export const dynamic = "force-dynamic";

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "รับปึกแล้ว", cls: "badge-neutral" },
  READY_FOR_ENTRY: { label: "พร้อมคีย์", cls: "badge-brand" },
  IN_PROGRESS: { label: "กำลังคีย์", cls: "badge-warning" },
  CLOSED: { label: "ปิดแล้ว", cls: "badge-success" },
};

const DATE_FMT = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

export default async function BatchesPage() {
  // RBAC ฝั่ง server — เฉพาะผู้จัดการปึก (OFFICER/COORDINATOR/ADMIN)
  const ctx = await requirePermission(PERMISSIONS.BATCH_MANAGE);
  const batches = (await listBatches(ctx)) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-in">
      <PageHero
        title="ปึกกระดาษ"
        tone="ink"
        description="รับปึกแบบสอบถามเข้าระบบ เปิดให้คีย์ และติดตามความคืบหน้าจนปิดปึก"
        badge={
          <>
            <span className="live-dot" />
            {batches.length.toLocaleString("th-TH")} ปึกในขอบเขตของคุณ
          </>
        }
        actions={
          <Link href="/batches/new" className="btn btn-accent btn-md">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            รับปึกใหม่
          </Link>
        }
      />

      <section className="card overflow-hidden">
        {batches.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title="ยังไม่มีปึกกระดาษในขอบเขตของคุณ"
            description="เมื่อได้รับกระดาษแบบสอบถามจากผู้สำรวจ กด “รับปึกใหม่” เพื่อนำเข้าระบบ"
            action={
              <Link href="/batches/new" className="btn btn-primary btn-md">
                รับปึกใหม่
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ปึก</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4 text-right">ทั้งหมด</th>
                  <th className="py-3 pr-4 text-right">รอคีย์</th>
                  <th className="py-3 pr-4 text-right">คีย์แล้ว</th>
                  <th className="py-3 pr-4 text-right">ยืนยันแล้ว</th>
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
