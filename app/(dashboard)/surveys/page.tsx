import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getEntryOverview,
  getMyDraftSheets,
  getMySubmittedSheets,
} from "@/lib/entry/claim";
import { listSelectableCommunities } from "@/lib/sheet/create";
import { StartSheetForm } from "@/components/entry/start-sheet-form";
import { SheetOpenForm } from "@/components/entry/sheet-open-form";
import { ResumeRow } from "@/components/entry/resume-card";
import { MySheetsTable } from "@/components/entry/my-sheets-table";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "คีย์แบบสอบถาม" };
export const dynamic = "force-dynamic";

// Workflow จริง (Owner Decision 2026-08-03): ระบบออกรหัสให้ตอนเริ่มกรอก
// เจ้าหน้าที่เลือกชุมชนของกระดาษที่ถืออยู่ → กดเริ่ม → เขียนรหัสลงกระดาษ → คีย์
export default async function SurveysPage() {
  // RBAC ฝั่ง server — ไม่มี survey.entry → /access-denied
  const ctx = await requirePermission(PERMISSIONS.SURVEY_ENTRY);
  const [overview, myDrafts, communities, mySheets] = await Promise.all([
    getEntryOverview(ctx),
    getMyDraftSheets(ctx),
    listSelectableCommunities(ctx),
    getMySubmittedSheets(ctx),
  ]);

  const totals = overview.communities.reduce(
    (acc, c) => ({
      total: acc.total + c.totalSheets,
      entered: acc.entered + c.entered,
      remaining: acc.remaining + c.pending,
    }),
    { total: 0, entered: 0, remaining: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="คีย์แบบสอบถาม"
        tone="brand"
        description="หยิบกระดาษใบถัดไปที่ถืออยู่ เลือกชุมชน แล้วกดเริ่มกรอกได้ทันที"
        badge={
          <>
            <span className="live-dot" />
            คีย์แล้ว {totals.entered.toLocaleString("th-TH")} ใบ
          </>
        }
      />

      {/* ใบที่คีย์ค้างอยู่ — ยึดจากร่างที่บันทึกไว้ ไม่ใช่จาก lock
          จึงยังเห็นแม้เคยกด "ออกจากแบบฟอร์ม" ไปแล้ว */}
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

      {/* Primary Action: เริ่มใบใหม่ ระบบออกรหัสให้ */}
      <section className="card space-y-6 p-6">
        {communities.length === 0 ? (
          <EmptyState
            title="ยังไม่มีชุมชนในระบบ"
            description="กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลชุมชนก่อนเริ่มคีย์"
          />
        ) : (
          <StartSheetForm communities={communities} />
        )}
        <div className="border-t-2 border-slate-100 pt-5">
          <SheetOpenForm />
        </div>
      </section>

      {/* แบบสอบถามที่ตนคีย์ไปแล้ว — ดู/แก้ได้ตลอด (#R7-C) เห็นเฉพาะของตัวเอง */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="แบบสอบถามที่ฉันคีย์"
            tone="brand"
            aside={
              mySheets.length > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {mySheets.length.toLocaleString("th-TH")} ใบ
                </span>
              ) : undefined
            }
          />
        </div>
        {mySheets.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title="ยังไม่มีแบบสอบถามที่คุณคีย์"
            description="เมื่อคีย์ใบแรกเสร็จ ใบนั้นจะมาอยู่ที่นี่ให้กลับมาดูหรือแก้ไขได้ตลอด"
          />
        ) : (
          <MySheetsTable rows={mySheets} />
        )}
      </section>

      {/* ความคืบหน้ารายชุมชน (aggregate เท่านั้น — ไม่มีข้อมูลบุคคล) */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="ความคืบหน้ารายชุมชน"
            tone="mint"
            aside={
              totals.total > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  คีย์แล้ว {totals.entered.toLocaleString("th-TH")} /{" "}
                  {totals.total.toLocaleString("th-TH")} ใบ
                </span>
              ) : undefined
            }
          />
        </div>
        {totals.total === 0 ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title="ยังไม่มีแบบสอบถามในระบบ"
            description="เมื่อเริ่มกรอกใบแรก ความคืบหน้าจะแสดงที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4 text-right">ทั้งหมด</th>
                  <th className="py-3 pr-4 text-right">กำลังคีย์</th>
                  <th className="py-3 pr-4 text-right">คีย์แล้ว</th>
                  <th className="py-3 pr-6">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {overview.communities.map((c) => {
                  const done =
                    c.totalSheets > 0 ? Math.round((c.entered / c.totalSheets) * 100) : 0;
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-alert-50/50">
                      <td className="py-3 pl-6 pr-4 font-medium text-slate-700">
                        {c.communityName}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {c.totalSheets.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {c.locked.toLocaleString("th-TH")}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-900">
                        {c.entered.toLocaleString("th-TH")}
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
