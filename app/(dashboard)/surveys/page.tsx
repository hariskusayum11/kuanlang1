import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getEntryOverview, getMyActiveSheet } from "@/lib/entry/claim";
import { SheetOpenForm } from "@/components/entry/sheet-open-form";
import { ResumeRow } from "@/components/entry/resume-card";

export const metadata = { title: "คีย์แบบสอบถาม" };
export const dynamic = "force-dynamic";

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  READY_FOR_ENTRY: { label: "พร้อมคีย์", cls: "badge-brand" },
  IN_PROGRESS: { label: "กำลังคีย์", cls: "badge-warning" },
};

// Workflow จริง (Owner Decision): หัวหน้าแจกปึกกระดาษให้เจ้าหน้าที่ —
// เจ้าหน้าที่ถือกระดาษอยู่แล้ว จึง "เปิดใบจากรหัส" ไม่ใช่ให้ระบบแจกงาน
export default async function SurveysPage() {
  // RBAC ฝั่ง server — ไม่มี survey.entry → /access-denied
  const ctx = await requirePermission(PERMISSIONS.SURVEY_ENTRY);
  const [overview, mySheet] = await Promise.all([
    getEntryOverview(ctx),
    getMyActiveSheet(ctx),
  ]);

  const totals = overview.batches.reduce(
    (acc, b) => ({
      total: acc.total + b.totalSheets,
      entered: acc.entered + b.entered,
      remaining: acc.remaining + b.pending,
    }),
    { total: 0, entered: 0, remaining: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-900">คีย์แบบสอบถาม</h2>
        <p className="mt-1 text-sm text-slate-500">
          หยิบกระดาษใบถัดไปจากปึกของคุณ แล้วพิมพ์รหัสใบเพื่อเปิดแบบฟอร์ม
        </p>
      </div>

      {/* ใบที่คีย์ค้างอยู่ — แถวเล็ก ไม่ใช่จุดเด่นของหน้า */}
      {mySheet && (
        <ResumeRow
          sheetId={mySheet.id}
          sheetNo={mySheet.sheetNo}
          communityName={mySheet.communityName}
          expired={mySheet.expired}
        />
      )}

      {/* Primary Action: เปิดใบจากรหัสบนกระดาษ */}
      <section className="card p-6">
        <SheetOpenForm
          batches={overview.batches.map((b) => ({
            id: b.id,
            code: b.code,
            communityName: b.communityName,
          }))}
        />
      </section>

      {/* ความคืบหน้าปึกในพื้นที่ (aggregate เท่านั้น — ไม่มีข้อมูลบุคคล) */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">
            ความคืบหน้าปึกในพื้นที่ของคุณ
          </h3>
          {overview.batches.length > 0 && (
            <span className="text-xs tabular-nums text-slate-500">
              คีย์แล้ว {totals.entered.toLocaleString("th-TH")} /{" "}
              {totals.total.toLocaleString("th-TH")} ใบ · คงเหลือ{" "}
              {totals.remaining.toLocaleString("th-TH")}
            </span>
          )}
        </div>
        {overview.batches.length === 0 ? (
          <EmptyBatches allowed={overview.allowed} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-4">ปึก (Batch)</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4 text-right">ทั้งหมด</th>
                  <th className="py-3 pr-4 text-right">คีย์แล้ว</th>
                  <th className="py-3 pr-4 text-right">คงเหลือ</th>
                  <th className="py-3 pr-6">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {overview.batches.map((b) => {
                  const done =
                    b.totalSheets > 0 ? Math.round((b.entered / b.totalSheets) * 100) : 0;
                  const status = BATCH_STATUS[b.status] ?? {
                    label: b.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="py-3 pl-6 pr-4 font-mono text-xs font-medium text-slate-700">
                        {b.code}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{b.communityName}</td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {b.totalSheets.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {b.entered.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-900">
                        {b.pending.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-6">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${done}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                            {done}%
                          </span>
                        </div>
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

function EmptyBatches({ allowed }: { allowed: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
          <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1z" strokeLinejoin="round" />
          <path d="M9 9h6M9 13h4" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">
        {allowed ? "ยังไม่มีปึกกระดาษที่เปิดให้คีย์" : "ไม่มีขอบเขตชุมชนที่คุณเข้าถึงได้"}
      </p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        {allowed
          ? "เมื่อหัวหน้างานรับปึกกระดาษและเปิดให้คีย์ ความคืบหน้าจะแสดงที่นี่"
          : "กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"}
      </p>
    </div>
  );
}
