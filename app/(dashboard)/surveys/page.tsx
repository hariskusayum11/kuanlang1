import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getEntryOverview,
  getMyDraftSheets,
  getMySubmittedSheets,
} from "@/lib/entry/claim";
import { listSelectableCommunities } from "@/lib/sheet/create";
import { StartSheetLauncher } from "@/components/entry/start-sheet-launcher";
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
    <div className="w-full space-y-7 animate-fade-in">
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

      {/* Primary Action: เริ่มใบใหม่ ระบบออกรหัสให้
          ต้องอยู่บนสุดเสมอ — เมื่อมีใบคีย์ค้างหลายใบ ปุ่ม "เพิ่มแบบสอบถาม"
          ต้องไม่ถูกดันลงไปด้านล่างจนหาไม่เจอ (Owner feedback) */}
      <section className="card space-y-6 p-6">
        {communities.length === 0 ? (
          <EmptyState
            title="ยังไม่มีชุมชนในระบบ"
            description="กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลชุมชนก่อนเริ่มคีย์"
          />
        ) : (
          <StartSheetLauncher communities={communities} />
        )}
      </section>

      {/* ใบที่คีย์ค้างอยู่ — ยึดจากร่างที่บันทึกไว้ + ใบที่เพิ่งออกรหัส (ยังถืออยู่)
          จึงยังเห็นแม้เคยกด "ออกจากแบบฟอร์ม" หรือเพิ่งสร้างรหัสแต่ยังไม่ได้กรอก */}
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

      {/* แบบสอบถามที่ตนคีย์ไปแล้ว — ดู/แก้ได้ตลอด (#R7-C) เห็นเฉพาะของตัวเอง
          (เอาตาราง "ความคืบหน้ารายชุมชน" ออกจากหน้าคนคีย์ — ตัวเลข "ทั้งหมด"
           ไม่ใช่จำนวนจริงของชุมชนเพราะระบบไม่ล่วงรู้จำนวนกระดาษที่คาดหวัง #R7-A) */}
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
    </div>
  );
}
