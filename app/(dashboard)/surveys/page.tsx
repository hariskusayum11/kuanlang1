import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  countMySubmittedSheets,
  getMyDraftSheets,
  getMySubmittedSheets,
} from "@/lib/entry/claim";
import { listSelectableCommunities } from "@/lib/sheet/create";
import { StartSheetLauncher } from "@/components/entry/start-sheet-launcher";
import { ResumeRow } from "@/components/entry/resume-card";
import { MySheetsTable } from "@/components/entry/my-sheets-table";
import { MySheetsFilter } from "@/components/entry/my-sheets-filter";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";
import { dateRangeError } from "@/lib/household/trusted-where";
import type { MySubmittedStatusFilter } from "@/lib/entry/claim";

export const metadata = { title: "คีย์แบบสอบถาม" };
export const dynamic = "force-dynamic";

// Workflow จริง (Owner Decision 2026-08-03): ระบบออกรหัสให้ตอนเริ่มกรอก
// เจ้าหน้าที่เลือกชุมชนของกระดาษที่ถืออยู่ → กดเริ่ม → เขียนรหัสลงกระดาษ → คีย์
type SearchParams = Promise<{
  myPage?: string;
  q?: string;
  community?: string;
  status?: string;
  from?: string;
  to?: string;
}>;

export default async function SurveysPage({ searchParams }: { searchParams: SearchParams }) {
  // RBAC ฝั่ง server — ไม่มี survey.entry → /access-denied
  const ctx = await requirePermission(PERMISSIONS.SURVEY_ENTRY);
  const raw = await searchParams;
  const requestedPage = Number.parseInt(raw.myPage ?? "1", 10);
  const myPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const myPageSize = 50;
  const status: MySubmittedStatusFilter = ["ALL", "VERIFIED", "PENDING", "EDITING"].includes(raw.status ?? "")
    ? raw.status as MySubmittedStatusFilter
    : "ALL";
  const filterError = dateRangeError(raw.from, raw.to);
  const filters = {
    query: raw.q,
    communityId: raw.community,
    status,
    dateFrom: filterError ? undefined : raw.from,
    dateTo: filterError ? undefined : raw.to,
  };
  const hasFilters = Boolean(raw.q || raw.community || status !== "ALL" || raw.from || raw.to);
  const [myDrafts, communities, mySheets, mySheetsTotal, mySheetsAllTotal] = await Promise.all([
    getMyDraftSheets(ctx),
    listSelectableCommunities(ctx),
    getMySubmittedSheets(ctx, myPageSize, (myPage - 1) * myPageSize, filters),
    countMySubmittedSheets(ctx, filters),
    countMySubmittedSheets(ctx),
  ]);

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="คีย์แบบสอบถาม"
        tone="brand"
        description="หยิบกระดาษใบถัดไปที่ถืออยู่ เลือกชุมชน แล้วกดเริ่มกรอกได้ทันที"
        badge={
          <>
            <span className="live-dot" />
            ของฉัน {mySheetsAllTotal.toLocaleString("th-TH")} ใบ
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
              mySheetsTotal > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {mySheetsTotal.toLocaleString("th-TH")} ใบ
                </span>
              ) : undefined
            }
          />
        </div>
        <MySheetsFilter
          query={raw.q}
          communityId={raw.community}
          status={status}
          from={raw.from}
          to={raw.to}
          communities={communities}
        />
        {filterError ? (
          <div role="alert" className="mx-6 mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            ช่วงวันที่ไม่ถูกต้อง: {filterError}
          </div>
        ) : null}
        {mySheetsTotal === 0 ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title={hasFilters ? "ไม่พบแบบสอบถามตามตัวกรอง" : "ยังไม่มีแบบสอบถามที่คุณคีย์"}
            description={hasFilters
              ? "ลองเปลี่ยนคำค้น ชุมชน สถานะ หรือช่วงวันที่ แล้วค้นหาอีกครั้ง"
              : "เมื่อคีย์ใบแรกเสร็จ ใบนั้นจะมาอยู่ที่นี่ให้กลับมาดูหรือแก้ไขได้ตลอด"}
          />
        ) : (
          <>
            <MySheetsTable rows={mySheets} />
            <MySheetsPagination
              page={myPage}
              total={mySheetsTotal}
              pageSize={myPageSize}
              params={raw}
            />
          </>
        )}
      </section>
    </div>
  );
}

function MySheetsPagination({
  page,
  total,
  pageSize,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  params: Awaited<SearchParams>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const previous = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const key of ["q", "community", "status", "from", "to"] as const) {
      if (params[key]) query.set(key, params[key]!);
    }
    query.set("myPage", String(target));
    return `?${query.toString()}`;
  };
  return (
    <div className="flex items-center justify-between border-t-2 border-slate-100 bg-slate-50/60 px-6 py-3">
      <span className="text-xs font-semibold text-slate-500">หน้า {page.toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}</span>
      <div className="flex gap-2">
        <a href={href(previous)} aria-disabled={page <= 1} className={`btn btn-secondary btn-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>ก่อนหน้า</a>
        <a href={href(next)} aria-disabled={page >= totalPages} className={`btn btn-secondary btn-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}>ถัดไป</a>
      </div>
    </div>
  );
}
