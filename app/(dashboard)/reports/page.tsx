import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getKeyerProductivity } from "@/lib/report/keyer-productivity";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "รายงาน" };
export const dynamic = "force-dynamic";

// รายงานสรุปการกรอกรายคน — สำหรับคิดค่ากรอก
// แสดงทั้งสองฐาน (กรอกทั้งหมด / ตรวจผ่านแล้ว) ให้ผู้ใช้เลือกฐานคิดเงินเอง
export default async function ReportsPage() {
  // RBAC ฝั่ง server — ไม่มี report.view → /access-denied
  const ctx = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const report = await getKeyerProductivity(ctx);

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="รายงาน"
        tone="brand"
        description="สรุปจำนวนแบบสอบถามที่กรอกของแต่ละคน สำหรับใช้คิดค่ากรอก — แสดงทั้งยอดที่กรอกทั้งหมดและยอดที่ตรวจผ่านแล้ว"
        badge={
          <>
            <span className="live-dot" />
            กรอกรวม {report.totals.total.toLocaleString("th-TH")} ใบ
          </>
        }
        actions={
          report.rows.length > 0 ? (
            <a href="/reports/export" className="btn btn-accent btn-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ส่งออก CSV
            </a>
          ) : undefined
        }
      />

      {/* สรุปภาพรวมทั้งสองฐาน */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="กรอกทั้งหมด" value={report.totals.total} tone="brand" />
        <StatCard label="ตรวจผ่านแล้ว" value={report.totals.verified} tone="success" />
        <StatCard label="ยังไม่ผ่านตรวจ" value={report.totals.pending} tone="warning" />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="สรุปการกรอกรายคน"
            tone="brand"
            aside={
              report.rows.length > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {report.rows.length.toLocaleString("th-TH")} คน
                </span>
              ) : undefined
            }
          />
        </div>

        {report.rows.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title="ยังไม่มีข้อมูลการกรอก"
            description="เมื่อเจ้าหน้าที่เริ่มคีย์แบบสอบถามเข้าระบบ ยอดของแต่ละคนจะปรากฏที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pl-6 pr-4">คนกรอก</th>
                  <th className="py-2.5 pr-4 text-right">กรอกทั้งหมด</th>
                  <th className="py-2.5 pr-4 text-right">ตรวจผ่านแล้ว</th>
                  <th className="py-2.5 pr-6 text-right">ยังไม่ผ่านตรวจ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {report.rows.map((r) => (
                  <tr key={r.enteredById} className="transition-colors hover:bg-brand-50/50">
                    <td className="py-2.5 pl-6 pr-4 font-semibold text-slate-800">{r.name}</td>
                    <td className="py-2.5 pr-4 text-right font-bold tabular-nums text-brand-700">
                      {r.total.toLocaleString("th-TH")}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-700">
                      {r.verified.toLocaleString("th-TH")}
                    </td>
                    <td className="py-2.5 pr-6 text-right tabular-nums text-slate-500">
                      {r.pending.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-100 bg-slate-50/70 font-bold">
                  <td className="py-3 pl-6 pr-4 text-slate-700">รวม</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-brand-700">
                    {report.totals.total.toLocaleString("th-TH")}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">
                    {report.totals.verified.toLocaleString("th-TH")}
                  </td>
                  <td className="py-3 pr-6 text-right tabular-nums text-slate-500">
                    {report.totals.pending.toLocaleString("th-TH")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        หมายเหตุ: &quot;กรอกทั้งหมด&quot; นับทุกใบที่เจ้าหน้าที่คีย์เข้าระบบ (ยังไม่ถูกลบ)
        ส่วน &quot;ตรวจผ่านแล้ว&quot; นับเฉพาะใบที่ Verifier ยืนยันเป็น VERIFIED —
        เลือกใช้ฐานใดคิดค่ากรอกได้ตามข้อตกลง
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "success" | "warning";
}) {
  const valueCls =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-sun-700"
        : "text-brand-700";
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${valueCls}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}
