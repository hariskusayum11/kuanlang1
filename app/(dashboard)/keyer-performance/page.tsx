import Link from "next/link";
import { EmptyState, PageHero, SectionTitle } from "@/components/layout/page-hero";
import { ThaiDateRangeFilter } from "@/components/report/thai-date-range-filter";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getKeyerProductivity,
  type KeyerRow,
} from "@/lib/report/keyer-productivity";
import { dateRangeError } from "@/lib/household/trusted-where";

export const metadata = { title: "ผลงานผู้กรอก" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function KeyerPerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const raw = await searchParams;
  const filters = { dateFrom: raw.from, dateTo: raw.to };
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  const report = await getKeyerProductivity(ctx, filterError ? {} : filters);
  const exportParams = new URLSearchParams();
  if (filters.dateFrom) exportParams.set("from", filters.dateFrom);
  if (filters.dateTo) exportParams.set("to", filters.dateTo);
  const exportHref = `/keyer-performance/export?${exportParams.toString()}`;

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="ผลงานผู้กรอก"
        tone="brand"
        description="สรุปแบบสอบถามที่เจ้าหน้าที่แต่ละคนส่งเข้าระบบ พร้อมสถานะที่บวกกลับได้ครบทุกใบ"
        badge={<>กรอกรวม {format(report.totals.total)} ใบ</>}
        actions={report.rows.length ? (
          <a href={exportHref} className="btn btn-accent btn-md">
            ส่งออก CSV
          </a>
        ) : undefined}
      />

      <ThaiDateRangeFilter from={filters.dateFrom} to={filters.dateTo} />
      {filterError ? (
        <div role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          ช่วงวันที่ไม่ถูกต้อง: {filterError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="ส่งเข้าระบบทั้งหมด" value={report.totals.total} tone="brand" />
        <StatCard label="ตรวจผ่านแล้ว" value={report.totals.verified} tone="success" />
        <StatCard label="อยู่ระหว่างดำเนินการ" value={report.totals.pending} tone="warning" />
        <StatCard label="ยืนยันซ้ำจริง" value={report.totals.duplicates} tone="danger" />
      </div>

      <div className="rounded-2xl border-2 border-brand-100 bg-brand-50/50 px-5 py-4 text-sm text-slate-700">
        <p className="font-bold text-slate-900">ตรวจสอบยอดรวม</p>
        <p className="mt-1 tabular-nums">
          ส่งเข้าระบบ {format(report.totals.total)} = ตรวจผ่าน {format(report.totals.verified)} +
          พร้อมตรวจ {format(report.totals.ready)} + กำลังแก้ไข {format(report.totals.editing)} +
          ซ้ำจริง {format(report.totals.duplicates)}
        </p>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="จำนวนที่กรอกของแต่ละคน"
            tone="brand"
            aside={report.rows.length ? (
              <span className="badge badge-neutral tabular-nums">{format(report.rows.length)} คน</span>
            ) : undefined}
          />
        </div>

        {!report.rows.length ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title="ยังไม่มีข้อมูลการกรอก"
            description="เมื่อมีการส่งแบบสอบถาม ยอดของผู้กรอกแต่ละคนจะปรากฏที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[850px]">
            <div className="flex items-center gap-4 border-b-2 border-slate-100 px-6 py-2.5 text-[11px] font-bold text-slate-400">
              <span className="flex-1">ผู้กรอก (กดเพื่อดูรหัสใบ)</span>
              <span className="w-24 text-right">ส่งทั้งหมด</span>
              <span className="w-24 text-right">ตรวจผ่าน</span>
              <span className="w-24 text-right">พร้อมตรวจ</span>
              <span className="w-24 text-right">กำลังแก้ไข</span>
              <span className="w-24 text-right">ซ้ำจริง</span>
            </div>
            <div className="divide-y-2 divide-slate-50">
              {report.rows.map((row) => <KeyerDetails key={row.enteredById} row={row} />)}
            </div>
            <div className="flex items-center gap-4 border-t-2 border-slate-100 bg-slate-50/70 px-6 py-3 text-sm font-bold">
              <span className="flex-1 text-slate-700">รวม</span>
              <NumberCell value={report.totals.total} className="text-brand-700" />
              <NumberCell value={report.totals.verified} className="text-emerald-700" />
              <NumberCell value={report.totals.ready} className="text-amber-700" />
              <NumberCell value={report.totals.editing} className="text-slate-600" />
              <NumberCell value={report.totals.duplicates} className="text-red-700" />
            </div>
            </div>
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        ใบที่เพียงสงสัยซ้ำยังอยู่ในสถานะปกติจนกว่าผู้ตรวจจะตัดสิน ส่วนใบที่ยืนยันว่าซ้ำจริงยังนับใน
        “ส่งเข้าระบบทั้งหมด” แต่แยกคอลัมน์ให้เห็นชัดเจน ใบที่ถูกลบไม่รวมในรายงานนี้
      </p>
    </div>
  );
}

function KeyerDetails({ row }: { row: KeyerRow }) {
  return (
    <details className="group/keyer">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-6 py-3 text-sm transition-colors hover:bg-brand-50/50">
        <span className="flex flex-1 items-center gap-2 font-semibold text-slate-800">
          <span className="text-slate-400 transition-transform group-open/keyer:rotate-90">›</span>
          {row.name}
        </span>
        <NumberCell value={row.total} className="text-brand-700" />
        <NumberCell value={row.verified} className="text-emerald-700" />
        <NumberCell value={row.ready} className="text-amber-700" />
        <NumberCell value={row.editing} className="text-slate-600" />
        <NumberCell value={row.duplicates} className="text-red-700" />
      </summary>
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50/50 px-6 py-3">
        {row.sheets.map((sheet) => (
          <Link
            key={sheet.householdId}
            href={`/verification/${sheet.householdId}`}
            title={sheetStatusLabel(sheet.status)}
            className={`rounded-lg border-2 px-2 py-1 font-mono text-xs font-bold ${sheetStatusClass(sheet.status)}`}
          >
            {sheet.sheetNo}
          </Link>
        ))}
      </div>
    </details>
  );
}

function NumberCell({ value, className }: { value: number; className: string }) {
  return <span className={`w-24 text-right font-bold tabular-nums ${className}`}>{format(value)}</span>;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "brand" | "success" | "warning" | "danger" }) {
  const color = tone === "success"
    ? "text-emerald-700"
    : tone === "warning"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-red-700"
        : "text-brand-700";
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${color}`}>{format(value)}</p>
    </div>
  );
}

function sheetStatusLabel(status: KeyerRow["sheets"][number]["status"]) {
  return {
    VERIFIED: "ตรวจผ่านแล้ว",
    READY: "พร้อมตรวจ",
    EDITING: "กำลังแก้ไข",
    DUPLICATE: "ยืนยันซ้ำจริง",
  }[status];
}

function sheetStatusClass(status: KeyerRow["sheets"][number]["status"]) {
  return {
    VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    READY: "border-amber-200 bg-amber-50 text-amber-700",
    EDITING: "border-slate-200 bg-white text-slate-600",
    DUPLICATE: "border-red-200 bg-red-50 text-red-700",
  }[status];
}

function format(value: number) {
  return value.toLocaleString("th-TH");
}
