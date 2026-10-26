import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listDeletedHouseholds } from "@/lib/household/admin-soft-delete";
import { RestoreHouseholdButton } from "@/components/admin/restore-household-button";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const metadata = { title: "แบบสอบถามที่ถูกลบ" };
export const dynamic = "force-dynamic";

// จัดการแบบสอบถามโดย ADMIN — ณ ตอนนี้: กู้คืนใบที่ถูกลบ (soft delete)
// หมายเหตุ: RBAC ตรวจทั้ง permission และ role ADMIN ฝั่ง server ใน core
export default async function AdminSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string }>;
}) {
  // USER_MANAGE ตรงกับเมนู — household.view ไม่พอแล้วเพราะหัวหน้าชุมชนก็มี (docs/43)
  // listDeletedHouseholds ตรวจ ADMIN ซ้ำอีกชั้น
  const ctx = await requirePermission(PERMISSIONS.USER_MANAGE);
  const sp = await searchParams;
  const result = await listDeletedHouseholds(
    ctx,
    Number.parseInt(sp.page ?? "1", 10),
    Number.parseInt(sp.size ?? "20", 10),
  );
  const sheets = result.rows;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const current = Math.min(result.page, totalPages);
  const pageHref = (page: number) => `/admin/sheets?page=${page}&size=${result.pageSize}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <PageHero
        title="แบบสอบถามที่ถูกลบ"
        tone="ink"
        description="ใบที่ ADMIN ลบ (soft delete) จะถูกซ่อนจากทุกมุมมองทันที — กู้คืนได้ที่หน้านี้ ข้อมูลและสถานะเดิมกลับคืนครบ"
        badge={
          <>
            <span className="live-dot" />
            ถูกลบ {result.total.toLocaleString("th-TH")} ใบ
          </>
        }
      />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายการใบที่ถูกลบ"
            tone="sun"
            aside={
              <span className="badge badge-neutral tabular-nums">
                {result.total.toLocaleString("th-TH")} รายการ
              </span>
            }
          />
        </div>

        {result.allowed && sheets.length === 0 ? (
          <EmptyState
            mood="happy"
            tone="sun"
            title="ไม่มีใบที่ถูกลบ"
            description="เมื่อ ADMIN ลบแบบสอบถาม (โดยตั้งใจหรือแก้ข้อมูลผิดพลาดรุนแรง) ใบนั้นจะปรากฏที่นี่เพื่อกู้คืนได้"
          />
        ) : !result.allowed ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title="เฉพาะผู้ดูแลระบบ"
            description="หน้านี้แสดงเฉพาะ ADMIN — บทบาทอื่นไม่เห็นรายการถูกลบ"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ใบ</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">คีย์โดย</th>
                  <th className="py-3 pr-4">คีย์เมื่อ</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-6 text-right">การทำงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {sheets.map((s) => (
                  <tr key={s.householdId} className="transition-colors hover:bg-sun-50/50">
                    <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-slate-700">
                      {s.sheetNo}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-800">{s.communityName}</td>
                    <td className="py-3 pr-4 text-slate-600">{s.enteredByName}</td>
                    <td className="py-3 pr-4 text-xs tabular-nums text-slate-500">
                      {s.enteredAt.toLocaleDateString("th-TH")}
                    </td>
                    <td className="py-3 pr-4">
                      {s.verifiedAt ? (
                        <span className="badge badge-neutral">ตรวจแล้ว</span>
                      ) : (
                        <span className="badge badge-warning">ยังไม่ตรวจ</span>
                      )}
                    </td>
                    <td className="py-3 pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <RestoreHouseholdButton
                          householdId={s.householdId}
                          sheetNo={s.sheetNo}
                        />
                        <Link
                          href={`/verification/${s.householdId}?deleted=1&mode=view`}
                          className="btn btn-secondary btn-sm"
                        >
                          ดูใบ
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-slate-100 bg-slate-50/40 px-6 py-3.5">
              <span className="text-xs font-medium tabular-nums text-slate-500">หน้า {current.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
              <div className="flex flex-wrap items-center gap-2">
                <form>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    แสดง
                    <select name="size" defaultValue={result.pageSize} className="field !h-9 !w-20 !py-1" aria-label="จำนวนรายการต่อหน้า">
                      {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <button type="submit" className="btn btn-secondary btn-sm">ใช้</button>
                  </label>
                </form>
                {current > 1 && <Link href={pageHref(current - 1)} className="btn btn-secondary btn-sm">ก่อนหน้า</Link>}
                {current < totalPages && <Link href={pageHref(current + 1)} className="btn btn-secondary btn-sm">ถัดไป</Link>}
              </div>
            </div>
          </>
        )}
      </section>

      <p className="rounded-2xl border-2 border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-medium text-slate-500">
        การลบแบบสอบถามเป็น Soft Delete (ตั้ง deletedAt) — ใบถูกลบออกจากยอด coverage/ความเสี่ยง/รายงานทันที
        แต่ยังกู้คืนได้โดยไม่เสียข้อมูล ตามกติกา BR-29 ห้าม hard delete เว้นแต่มีคำสั่งตาม PDPA
      </p>
    </div>
  );
}
