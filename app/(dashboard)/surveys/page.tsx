import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getEntryOverview, getMyDraftSheets } from "@/lib/entry/claim";
import { SheetOpenForm } from "@/components/entry/sheet-open-form";
import { ResumeRow } from "@/components/entry/resume-card";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

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
  const [overview, myDrafts] = await Promise.all([
    getEntryOverview(ctx),
    getMyDraftSheets(ctx),
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
    <div className="mx-auto max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="คีย์แบบสอบถาม"
        tone="brand"
        description="หยิบกระดาษใบถัดไปที่ถืออยู่ แล้วพิมพ์รหัสใบเพื่อเปิดแบบฟอร์ม"
        badge={
          <>
            <span className="live-dot" />
            คงเหลือ {totals.remaining.toLocaleString("th-TH")} ใบในพื้นที่ของคุณ
          </>
        }
      />

      {/* ใบที่คีย์ค้างอยู่ — ยึดจากร่างที่บันทึกไว้ ไม่ใช่จาก lock
          จึงยังเห็นแม้เคยกด "ออกจากแบบฟอร์ม" ไปแล้ว (ไม่ต้องค้นรหัสใบใหม่) */}
      {myDrafts.length > 0 && (
        <div className="space-y-2">
          {myDrafts.map((d) => (
            <ResumeRow
              key={d.id}
              sheetId={d.id}
              sheetNo={d.sheetNo}
              communityName={d.communityName}
              needsClaim={d.needsClaim}
            />
          ))}
        </div>
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
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="ความคืบหน้าในพื้นที่ของคุณ"
            tone="mint"
            aside={
              overview.batches.length > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  คีย์แล้ว {totals.entered.toLocaleString("th-TH")} /{" "}
                  {totals.total.toLocaleString("th-TH")} ใบ · คงเหลือ{" "}
                  {totals.remaining.toLocaleString("th-TH")}
                </span>
              ) : undefined
            }
          />
        </div>
        {overview.batches.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone={overview.allowed ? "sun" : "brand"}
            title={
              overview.allowed
                ? "ยังไม่มีแบบสอบถามที่เปิดให้คีย์"
                : "ไม่มีขอบเขตชุมชนที่คุณเข้าถึงได้"
            }
            description={
              overview.allowed
                ? "เปิดใบด้วยรหัสบนกระดาษได้เสมอ — ส่วนนี้จะแสดงความคืบหน้าเมื่อเอกสารถูกจัดเป็นปึก"
                : "กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ปึก (Batch)</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4 text-right">ทั้งหมด</th>
                  <th className="py-3 pr-4 text-right">คีย์แล้ว</th>
                  <th className="py-3 pr-4 text-right">คงเหลือ</th>
                  <th className="py-3 pr-6">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {overview.batches.map((b) => {
                  const done =
                    b.totalSheets > 0 ? Math.round((b.entered / b.totalSheets) * 100) : 0;
                  const status = BATCH_STATUS[b.status] ?? {
                    label: b.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-alert-50/50">
                      <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-slate-700">
                        {b.code}
                      </td>
                      <td className="py-3 pr-4 font-medium text-slate-700">{b.communityName}</td>
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
                          <div className="h-2.5 w-24 overflow-hidden rounded-full bg-slate-200/70">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                              style={{ width: `${done}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-600">
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
