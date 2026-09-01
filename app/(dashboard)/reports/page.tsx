import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { ReportActions } from "@/components/report/report-actions";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { hasPermission } from "@/lib/authz/access";
import {
  getExecutiveReport,
  parseExecutiveReportFilters,
} from "@/lib/report/executive-summary";
import { dateRangeError } from "@/lib/household/trusted-where";
import { floodDepthMeters } from "@/domain/flood/depth";
import { TRIAGE_EXAMPLE } from "@/domain/triage";

export const metadata = { title: "รายงานสำหรับผู้บริหาร" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  community?: string;
  tambon?: string;
  from?: string;
  to?: string;
  status?: string;
}>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const raw = await searchParams;
  const filters = parseExecutiveReportFilters(raw);
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  const report = await getExecutiveReport(ctx, filters);
  if (!report) return null;

  const exportParams = new URLSearchParams();
  if (filters.communityId) exportParams.set("community", filters.communityId);
  if (filters.tambonId) exportParams.set("tambon", filters.tambonId);
  if (filters.dateFrom) exportParams.set("from", filters.dateFrom);
  if (filters.dateTo) exportParams.set("to", filters.dateTo);
  exportParams.set("status", filters.status ?? "VERIFIED");
  const exportHref = `/reports/export?${exportParams.toString()}`;
  const personalParams = new URLSearchParams();
  if (filters.communityId) personalParams.set("community", filters.communityId);
  if (filters.tambonId) personalParams.set("tambon", filters.tambonId);
  if (filters.dateFrom) personalParams.set("from", filters.dateFrom);
  if (filters.dateTo) personalParams.set("to", filters.dateTo);
  const personalHref = `/reports/personal-export${personalParams.toString() ? `?${personalParams}` : ""}`;
  const triageTotal = Object.values(report.triage).reduce((sum, value) => sum + value, 0);

  return (
    <div className="w-full space-y-7 animate-fade-in print:space-y-4">
      <PageHero
        title="รายงานสำหรับผู้บริหาร"
        tone="brand"
        description="สรุปสถานการณ์จากแบบสอบถามเพื่อวางแผนช่วยเหลือและจัดสรรทรัพยากร แสดงเฉพาะข้อมูลรวมโดยไม่เปิดเผยข้อมูลส่วนบุคคล"
        badge={<>ครัวเรือน {format(report.summary.households)} · ประชากร {format(report.summary.people)} คน</>}
        actions={
          <ReportActions
            exportHref={exportHref}
            vulnerableHref={hasPermission(ctx, PERMISSIONS.MEDICAL_REPORT_EXPORT) ? "/reports/vulnerable-export" : undefined}
            personalHref={hasPermission(ctx, PERMISSIONS.PERSONAL_REPORT_EXPORT) ? personalHref : undefined}
          />
        }
      />

      <form method="get" className="card grid gap-4 p-5 print:hidden md:grid-cols-2 xl:grid-cols-6">
        <FilterSelect label="ชุมชน" name="community" value={filters.communityId} options={report.options.communities} />
        <FilterSelect label="ตำบล" name="tambon" value={filters.tambonId} options={report.options.tambons} />
        <DateField label="ตั้งแต่วันที่สำรวจ" name="from" value={filters.dateFrom} max={filters.dateTo} />
        <DateField label="ถึงวันที่สำรวจ" name="to" value={filters.dateTo} min={filters.dateFrom} />
        <label className="block text-sm font-semibold text-slate-600">
          สถานะข้อมูล
          <select name="status" defaultValue={filters.status} className="input mt-1 w-full">
            <option value="VERIFIED">ตรวจแล้ว</option>
            <option value="PENDING">รอตรวจ</option>
            <option value="ALL">ทั้งหมด</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary flex-1" type="submit">แสดงผล</button>
          <a className="btn btn-secondary" href="/reports">ล้าง</a>
        </div>
      </form>
      {filterError ? (
        <div role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden">
          ช่วงวันที่ไม่ถูกต้อง: {filterError} กรุณาแก้วันที่แล้วกด “แสดงผล” อีกครั้ง
        </div>
      ) : null}

      <p className="hidden text-xs text-slate-500 print:block">
        จัดทำเมื่อ {new Date().toLocaleString("th-TH")} · ขอบเขตข้อมูล: {statusLabel(filters.status)}
      </p>

      <section>
        <SectionTitle title="ภาพรวมที่ต้องใช้ตัดสินใจ" />
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="ครัวเรือน" value={report.summary.households} unit="ครัวเรือน" tone="brand" />
          <MetricCard label="ประชากร" value={report.summary.people} unit="คน" tone="brand" />
          <MetricCard label="กลุ่มเปราะบาง" value={report.summary.vulnerablePeople} unit="คน" tone="alert" />
          <MetricCard label="กลุ่มวิกฤต" value={report.triage.P1} unit="คน" tone="alert" />
          <MetricCard label="ต้องการความช่วยเหลือ" value={report.summary.assistancePeople} unit="คน" tone="sun" />
          <MetricCard label="ไม่มีชุดยังชีพ" value={report.flood.withoutSurvivalKit} unit="ครัวเรือน" tone="sun" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="กลุ่มเปราะบางและระดับเร่งด่วน" tone="alert">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TriageMetric label="วิกฤต" example={TRIAGE_EXAMPLE.P1} value={report.triage.P1} tone="text-red-700" />
            <TriageMetric label="เร่งด่วน" example={TRIAGE_EXAMPLE.P2} value={report.triage.P2} tone="text-orange-700" />
            <TriageMetric label="เฝ้าระวัง" example={TRIAGE_EXAMPLE.P3} value={report.triage.P3} tone="text-amber-700" />
            <MiniMetric label="ยังไม่ประเมิน" value={report.triage.UNASSESSED} tone="text-slate-600" />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            พบกลุ่มเปราะบาง {format(report.summary.vulnerablePeople)} คน ใน {format(report.summary.vulnerableHouseholds)} ครัวเรือน
            {triageTotal !== report.summary.vulnerablePeople ? " · บางรายการอาจยังไม่มีระดับประเมิน" : ""}
          </p>
        </ReportSection>

        <ReportSection title="สถานการณ์น้ำท่วมและความพร้อม" tone="sun">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniMetric label="เคยน้ำท่วม" value={report.flood.floodedHouseholds} unit="ครัวเรือน" />
            <MiniMetric label="ระดับน้ำเฉลี่ย" value={floodDepthMeters(report.flood.averageDepthCm) ?? 0} unit="เมตร" />
            <MiniMetric label="ระดับน้ำสูงสุด" value={floodDepthMeters(report.flood.maximumDepthCm) ?? 0} unit="เมตร" />
            <MiniMetric label="ท่วมนานเฉลี่ย" value={round(report.flood.averageDurationDays)} unit="วัน" />
            <MiniMetric label="ไม่มีชุดยังชีพ" value={report.flood.withoutSurvivalKit} unit="ครัวเรือน" />
            <MiniMetric label="ไม่มีทรัพยากร" value={report.flood.withoutResources} unit="ครัวเรือน" />
          </div>
        </ReportSection>
      </div>

      <ReportSection title="ความต้องการความช่วยเหลือ" tone="alert">
        <DataTable
          empty="ยังไม่มีการระบุความต้องการในขอบเขตนี้"
          headers={["ประเภทความช่วยเหลือ", "ครัวเรือน", "จำนวนคน"]}
          rows={report.assistance.map((item) => [item.label, format(item.count), format(item.people ?? 0)])}
        />
      </ReportSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="การอพยพและช่องทางสื่อสาร">
          <ListGroup title="ยานพาหนะที่ใช้อพยพ" items={report.preparedness.vehicles} />
          <ListGroup title="ช่องทางรับข่าวสาร" items={report.preparedness.alertChannels} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniMetric label="ใช้สมาร์ตโฟน" value={report.preparedness.smartphoneHouseholds} unit="ครัวเรือน" />
            <MiniMetric label="สแกน QR ได้" value={report.preparedness.qrReadyHouseholds} unit="ครัวเรือน" />
          </div>
        </ReportSection>

        <ReportSection title="การมีส่วนร่วมและความช่วยเหลือต่อเนื่อง" tone="mint">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="สนใจเป็นอาสาสมัคร" value={report.participation.volunteerHouseholds} unit="ครัวเรือน" />
            <MiniMetric label="ยินยอมเป็นจุดพักพิงเบื้องต้น" value={report.participation.potentialHostHouses} unit="ครัวเรือน" />
            <MiniMetric label="ต้องการดูแลสุขภาพจิต" value={report.participation.mentalHealthSupport} unit="ครัวเรือน" />
            <MiniMetric label="สนใจโครงการแก้ความยากจน" value={report.participation.povertyProgramInterest} unit="ครัวเรือน" />
          </div>
          <ListGroup title="ทักษะของผู้สนใจเป็นอาสาสมัคร" items={report.participation.volunteerSkills} />
        </ReportSection>
      </div>

      <ReportSection title="คุณภาพข้อมูลสำหรับติดตามแก้ไข" tone="sun">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniMetric label="ไม่มีพิกัด" value={report.quality.missingCoordinates} unit="ใบ" />
          <MiniMetric label="ข้อมูลไม่ครบ" value={report.quality.incomplete} unit="ใบ" />
          <MiniMetric label="มีช่องอ่านไม่ออก" value={report.quality.illegible} unit="ใบ" />
        </div>
        <p className="mt-3 text-xs text-slate-500">รายการคุณภาพข้อมูลยังนับอยู่ในยอดรวม แต่ควรแก้ไขก่อนนำไปใช้วางแผนรายพื้นที่หรือแสดงบนแผนที่</p>
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, tone = "brand", children }: { title: string; tone?: "brand" | "alert" | "sun" | "mint"; children: React.ReactNode }) {
  return <section className="card break-inside-avoid p-5 md:p-6"><SectionTitle title={title} tone={tone} /><div className="mt-4">{children}</div></section>;
}

function MetricCard({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: "brand" | "alert" | "sun" }) {
  const color = tone === "alert" ? "text-red-700" : tone === "sun" ? "text-amber-700" : "text-brand-700";
  return <div className="card p-4"><p className="text-sm font-semibold text-slate-500">{label}</p><p className={`mt-2 text-3xl font-bold tabular-nums ${color}`}>{format(value)}</p><p className="text-xs text-slate-400">{unit}</p></div>;
}

function MiniMetric({ label, value, unit = "คน", tone = "text-brand-700" }: { label: string; value: number; unit?: string; tone?: string }) {
  return <div className="rounded-xl border-2 border-slate-100 bg-slate-50/60 p-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{format(value)} <span className="text-xs font-medium text-slate-400">{unit}</span></p></div>;
}

function TriageMetric({ label, example, value, tone }: { label: string; example: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-100 bg-slate-50/60 p-3">
      <p className={`text-sm font-bold ${tone}`}>{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{example}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${tone}`}>{format(value)} <span className="text-xs font-medium text-slate-400">คน</span></p>
    </div>
  );
}

function ListGroup({ title, items }: { title: string; items: { key: string; label: string; count: number }[] }) {
  return <div className="mt-4"><h4 className="mb-2 text-sm font-bold text-slate-700">{title}</h4>{items.length ? <div className="grid gap-2 sm:grid-cols-2">{items.map((item) => <div key={item.key} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{item.label}</span><strong className="tabular-nums text-brand-700">{format(item.count)}</strong></div>)}</div> : <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>}</div>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="py-5 text-center text-sm text-slate-400">{empty}</p>;
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b-2 border-slate-100 text-left text-xs text-slate-500">{headers.map((header, index) => <th key={header} className={`px-3 py-2 ${index ? "text-right" : ""}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row[0]} className="border-b border-slate-100">{row.map((cell, index) => <td key={`${row[0]}-${index}`} className={`px-3 py-2.5 ${index ? "text-right font-semibold tabular-nums" : ""}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function FilterSelect({ label, name, value, options }: { label: string; name: string; value?: string; options: { id: string; label: string }[] }) {
  return <label className="block text-sm font-semibold text-slate-600">{label}<select name={name} defaultValue={value ?? ""} className="input mt-1 w-full"><option value="">ทั้งหมด</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

function DateField({ label, name, value, min, max }: { label: string; name: string; value?: string; min?: string; max?: string }) {
  return <label className="block text-sm font-semibold text-slate-600">{label}<input className="input mt-1 w-full" type="date" name={name} defaultValue={value ?? ""} min={min} max={max} /></label>;
}

function format(value: number) { return value.toLocaleString("th-TH"); }
function round(value: number | null) { return Math.round(value ?? 0); }
function statusLabel(status: string | undefined) { return status === "ALL" ? "ทุกสถานะ" : status === "PENDING" ? "รอตรวจ" : "ตรวจแล้ว"; }
