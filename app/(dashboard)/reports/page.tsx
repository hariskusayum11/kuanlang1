import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getKeyerProductivity, type KeyerRow } from "@/lib/report/keyer-productivity";
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
          <div>
            {/* หัวคอลัมน์ */}
            <div className="hidden items-center gap-4 border-b-2 border-slate-100 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:flex">
              <span className="flex-1">คนกรอก (กดเพื่อดูรหัสใบ)</span>
              <span className="w-24 text-right">กรอกทั้งหมด</span>
              <span className="w-24 text-right">ตรวจผ่านแล้ว</span>
              <span className="w-24 text-right">ยังไม่ผ่าน</span>
            </div>
            <div className="divide-y-2 divide-slate-50">
              {report.rows.map((r) => (
                <KeyerRowDetails key={r.enteredById} row={r} />
              ))}
            </div>
            {/* แถวรวม */}
            <div className="flex items-center gap-4 border-t-2 border-slate-100 bg-slate-50/70 px-6 py-3 text-sm font-bold">
              <span className="flex-1 text-slate-700">รวม</span>
              <span className="w-24 text-right tabular-nums text-brand-700">
                {report.totals.total.toLocaleString("th-TH")}
              </span>
              <span className="w-24 text-right tabular-nums text-emerald-700">
                {report.totals.verified.toLocaleString("th-TH")}
              </span>
              <span className="w-24 text-right tabular-nums text-slate-500">
                {report.totals.pending.toLocaleString("th-TH")}
              </span>
            </div>
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

/** แถวคนกรอก — กดขยายเพื่อดูรหัสใบ (SK) ที่กรอกไปทั้งหมด (details/summary, ไม่ใช้ JS) */
function KeyerRowDetails({ row }: { row: KeyerRow }) {
  return (
    <details className="group/keyer">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-6 py-2.5 text-sm transition-colors hover:bg-brand-50/50">
        <span className="flex flex-1 items-center gap-2 font-semibold text-slate-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open/keyer:rotate-90">
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {row.name}
        </span>
        <span className="w-24 text-right font-bold tabular-nums text-brand-700">
          {row.total.toLocaleString("th-TH")}
        </span>
        <span className="w-24 text-right tabular-nums text-emerald-700">
          {row.verified.toLocaleString("th-TH")}
        </span>
        <span className="w-24 text-right tabular-nums text-slate-500">
          {row.pending.toLocaleString("th-TH")}
        </span>
      </summary>
      <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
        {row.sheets.length === 0 ? (
          <p className="text-xs text-slate-400">ไม่มีใบ</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.sheets.map((s) => (
              <Link
                key={s.householdId}
                href={`/verification/${s.householdId}`}
                title={s.verified ? "ตรวจผ่านแล้ว" : "ยังไม่ผ่านตรวจ"}
                className={`inline-flex items-center gap-1 rounded-lg border-2 px-2 py-1 font-mono text-xs font-bold transition-colors ${
                  s.verified
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-400"
                }`}
              >
                {s.verified && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {s.sheetNo}
              </Link>
            ))}
          </div>
        )}
      </div>
    </details>
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
