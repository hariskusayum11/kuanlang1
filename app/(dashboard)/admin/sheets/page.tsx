import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listDeletedHouseholds } from "@/lib/household/admin-soft-delete";
import { RestoreHouseholdButton } from "@/components/admin/restore-household-button";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "แบบสอบถามที่ถูกลบ" };
export const dynamic = "force-dynamic";

// จัดการแบบสอบถามโดย ADMIN — ณ ตอนนี้: กู้คืนใบที่ถูกลบ (soft delete)
// หมายเหตุ: RBAC ตรวจทั้ง permission และ role ADMIN ฝั่ง server ใน core
export default async function AdminSheetsPage() {
  const ctx = await requirePermission(PERMISSIONS.HOUSEHOLD_VIEW);
  const sheets = await listDeletedHouseholds(ctx);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <PageHero
        title="แบบสอบถามที่ถูกลบ"
        tone="ink"
        description="ใบที่ ADMIN ลบ (soft delete) จะถูกซ่อนจากทุกมุมมองทันที — กู้คืนได้ที่หน้านี้ ข้อมูลและสถานะเดิมกลับคืนครบ"
        badge={
          <>
            <span className="live-dot" />
            ถูกลบ {sheets.length.toLocaleString("th-TH")} ใบ
          </>
        }
      />

      <AdminTabs />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายการใบที่ถูกลบ"
            tone="sun"
            aside={
              <span className="badge badge-neutral tabular-nums">
                {sheets.length.toLocaleString("th-TH")} รายการ
              </span>
            }
          />
        </div>

        {ctx.roles.includes("ADMIN") && sheets.length === 0 ? (
          <EmptyState
            mood="happy"
            tone="sun"
            title="ไม่มีใบที่ถูกลบ"
            description="เมื่อ ADMIN ลบแบบสอบถาม (โดยตั้งใจหรือแก้ข้อมูลผิดพลาดรุนแรง) ใบนั้นจะปรากฏที่นี่เพื่อกู้คืนได้"
          />
        ) : !ctx.roles.includes("ADMIN") ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title="เฉพาะผู้ดูแลระบบ"
            description="หน้านี้แสดงเฉพาะ ADMIN — บทบาทอื่นไม่เห็นรายการถูกลบ"
          />
        ) : (
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
                          href={`/verification/${s.householdId}`}
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
        )}
      </section>

      <p className="rounded-2xl border-2 border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-medium text-slate-500">
        การลบแบบสอบถามเป็น Soft Delete (ตั้ง deletedAt) — ใบถูกลบออกจากยอด coverage/ความเสี่ยง/รายงานทันที
        แต่ยังกู้คืนได้โดยไม่เสียข้อมูล ตามกติกา BR-29 ห้าม hard delete เว้นแต่มีคำสั่งตาม PDPA
      </p>
    </div>
  );
}
