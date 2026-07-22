import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listBatches } from "@/lib/batch/core";

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
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ปึกกระดาษ</h2>
          <p className="mt-1 text-sm text-slate-500">
            รับปึกแบบสอบถามเข้าระบบ เปิดให้คีย์ และติดตามความคืบหน้าจนปิดปึก
          </p>
        </div>
        <Link href="/batches/new" className="btn btn-primary btn-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          รับปึกใหม่
        </Link>
      </div>

      <section className="card overflow-hidden">
        {batches.length === 0 ? (
          <EmptyBatches />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
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
              <tbody className="divide-y divide-slate-50">
                {batches.map((b) => {
                  const status = BATCH_STATUS[b.status] ?? {
                    label: b.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="py-3 pl-6 pr-4">
                        <Link
                          href={`/batches/${b.id}`}
                          className="font-mono text-xs font-medium text-brand-700 hover:underline"
                        >
                          {b.code}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{b.communityName}</td>
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
                      <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-900">
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

function EmptyBatches() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
          <path d="M4 7h16M4 7v11a1 1 0 001 1h14a1 1 0 001-1V7M4 7l2-3h12l2 3" strokeLinejoin="round" />
          <path d="M9 11h6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">
        ยังไม่มีปึกกระดาษในขอบเขตของคุณ
      </p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        เมื่อได้รับกระดาษแบบสอบถามจากผู้สำรวจ กด &ldquo;รับปึกใหม่&rdquo;
        เพื่อนำเข้าระบบ
      </p>
    </div>
  );
}
