import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { ReportActions } from "@/components/report/report-actions";
import { DetailBreakdownButton } from "@/components/report/detail-breakdown";
import { SegmentDrilldown } from "@/components/report/segment-drilldown";
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
import { prisma } from "@/lib/prisma";

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

  // Drill-down (ข้อ 3/7): กดตัวเลข → รายชื่อ → Excel เฉพาะกลุ่ม · เคารพตัวกรองเดียวกับรายงาน
  // health → เฉพาะผู้มี MEDICAL_REPORT_EXPORT · general → REPORT_SEGMENT_EXPORT
  const segmentQuery = exportParams.toString();
  const canHealthSegment = hasPermission(ctx, PERMISSIONS.MEDICAL_REPORT_EXPORT);
  const canGeneralSegment = hasPermission(ctx, PERMISSIONS.REPORT_SEGMENT_EXPORT);
  const [vulnerabilityDetailTypes, assistanceDetailTypes] = await Promise.all([
    canHealthSegment
      ? prisma.vulnerabilityType.findMany({ where: { requiresDetail: true }, select: { id: true } })
      : Promise.resolve([]),
    canGeneralSegment
      ? prisma.assistanceNeedType.findMany({ where: { requiresDetail: true }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const vulnerabilityDetailIds = new Set(vulnerabilityDetailTypes.map((item) => item.id));
  const assistanceDetailIds = new Set(assistanceDetailTypes.map((item) => item.id));
  const detail = (kind: "vulnerability" | "assistance" | "vehicle", id: string) => (
    <DetailBreakdownButton kind={kind} id={id} filterQuery={segmentQuery} />
  );
  const drill = (segmentId: string, health: boolean, node: React.ReactNode) =>
    (health ? canHealthSegment : canGeneralSegment) ? (
      <SegmentDrilldown segmentId={segmentId} filterQuery={segmentQuery}>
        {node}
      </SegmentDrilldown>
    ) : (
      node
    );

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
          {drill("households", false, <MetricCard label="ครัวเรือน" value={report.summary.households} unit="ครัวเรือน" tone="brand" />)}
          <MetricCard label="ประชากร" value={report.summary.people} unit="คน" tone="brand" />
          {drill("vulnerable-people", true, <MetricCard label="กลุ่มเปราะบาง" value={report.summary.vulnerablePeople} unit="คน" tone="alert" />)}
          {drill("triage:P1", true, <MetricCard label="กลุ่มวิกฤต" value={report.triage.P1} unit="คน" tone="alert" />)}
          {drill("assistance-households", false, <MetricCard label="ต้องการความช่วยเหลือ" value={report.summary.assistancePeople} unit="คน" tone="sun" />)}
          {drill("without-kit", false, <MetricCard label="ไม่มีชุดยังชีพ" value={report.flood.withoutSurvivalKit} unit="ครัวเรือน" tone="sun" />)}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="กลุ่มเปราะบางและระดับเร่งด่วน" tone="alert">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {drill("triage:P1", true, <TriageMetric label="วิกฤต" example={TRIAGE_EXAMPLE.P1} value={report.triage.P1} tone="text-red-700" />)}
            {drill("triage:P2", true, <TriageMetric label="เร่งด่วน" example={TRIAGE_EXAMPLE.P2} value={report.triage.P2} tone="text-orange-700" />)}
            {drill("triage:P3", true, <TriageMetric label="เฝ้าระวัง" example={TRIAGE_EXAMPLE.P3} value={report.triage.P3} tone="text-amber-700" />)}
            {drill("triage:UNASSESSED", true, <MiniMetric label="ยังไม่ประเมิน" value={report.triage.UNASSESSED} tone="text-slate-600" />)}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            พบกลุ่มเปราะบาง {format(report.summary.vulnerablePeople)} คน ใน {format(report.summary.vulnerableHouseholds)} ครัวเรือน
            {triageTotal !== report.summary.vulnerablePeople ? " · บางรายการอาจยังไม่มีระดับประเมิน" : ""}
          </p>
        </ReportSection>

        <ReportSection title="สถานการณ์น้ำท่วมและความพร้อม" tone="sun">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {drill("flooded", false, <MiniMetric label="เคยน้ำท่วม" value={report.flood.floodedHouseholds} unit="ครัวเรือน" />)}
            <MiniMetric label="ระดับน้ำเฉลี่ย" value={floodDepthMeters(report.flood.averageDepthCm) ?? 0} unit="เมตร" />
            <MiniMetric label="ระดับน้ำสูงสุด" value={floodDepthMeters(report.flood.maximumDepthCm) ?? 0} unit="เมตร" />
            <MiniMetric label="ท่วมนานเฉลี่ย" value={round(report.flood.averageDurationDays)} unit="วัน" />
            {drill("without-kit", false, <MiniMetric label="ไม่มีชุดยังชีพ" value={report.flood.withoutSurvivalKit} unit="ครัวเรือน" />)}
            {drill("without-resources", false, <MiniMetric label="ไม่มีทรัพยากร" value={report.flood.withoutResources} unit="ครัวเรือน" />)}
          </div>
        </ReportSection>
      </div>

      <ReportSection title="ลักษณะความเปราะบางตามแบบสอบถาม" tone="alert">
        <ListGroup
          title="แยกตามลักษณะ — กดเพื่อดูรายชื่อ (รวม “อื่นๆ” ว่าคืออะไร)"
          items={report.vulnerability.types}
          drillWrap={(item, node) => drill(`vuln:${item.key}`, true, node)}
          detailAction={(item) => vulnerabilityDetailIds.has(item.key) ? detail("vulnerability", item.key) : null}
        />
        {report.vulnerability.unclassifiedPeople > 0 ? (
          <p className="mt-3 text-xs font-semibold text-sun-800">
            ยังไม่ระบุประเภท {format(report.vulnerability.unclassifiedPeople)} คน
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          หนึ่งคนเลือกได้มากกว่าหนึ่งประเภท ยอดส่วนนี้จึงอาจรวมเกินจำนวนบุคคล · แท่ง “อื่นๆ” กดเพื่อดูว่าคืออะไร
        </p>
      </ReportSection>

      <ReportSection title="ความต้องการความช่วยเหลือ" tone="alert">
        {report.assistance.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {report.assistance.map((item) => (
              <div key={item.key} className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  {drill(
                    `assistance:${item.key}`,
                    false,
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span>{item.label}</span>
                      <strong className="tabular-nums text-brand-700">
                        {format(item.count)} ครัวเรือน · {format(item.people ?? 0)} คน
                      </strong>
                    </div>,
                  )}
                </div>
                {assistanceDetailIds.has(item.key) ? detail("assistance", item.key) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-5 text-center text-sm text-slate-400">ยังไม่มีการระบุความต้องการในขอบเขตนี้</p>
        )}
      </ReportSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="การอพยพและช่องทางสื่อสาร">
          <ListGroup
            title="ยานพาหนะที่ใช้อพยพ"
            items={report.preparedness.vehicles}
            drillWrap={(item, node) => drill(`vehicle:${item.key}`, false, node)}
            detailAction={(item) => canGeneralSegment && item.key === "OTHER" ? detail("vehicle", item.key) : null}
          />
          <ListGroup title="ช่องทางรับข่าวสาร" items={report.preparedness.alertChannels} drillWrap={(item, node) => drill(`alert:${item.key}`, false, node)} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {drill("smartphone", false, <MiniMetric label="ใช้สมาร์ตโฟน" value={report.preparedness.smartphoneHouseholds} unit="ครัวเรือน" />)}
            {drill("qr-ready", false, <MiniMetric label="สแกน QR ได้" value={report.preparedness.qrReadyHouseholds} unit="ครัวเรือน" />)}
          </div>
        </ReportSection>

        <ReportSection title="การมีส่วนร่วมและความช่วยเหลือต่อเนื่อง" tone="mint">
          <div className="grid grid-cols-2 gap-3">
            {drill("volunteers", false, <MiniMetric label="สนใจเป็นอาสาสมัคร" value={report.participation.volunteerHouseholds} unit="ครัวเรือน" />)}
            {drill("host-houses", false, <MiniMetric label="ยินยอมเป็นจุดพักพิงเบื้องต้น" value={report.participation.potentialHostHouses} unit="ครัวเรือน" />)}
            {drill("mental-health", true, <MiniMetric label="ต้องการดูแลสุขภาพจิต" value={report.participation.mentalHealthSupport} unit="ครัวเรือน" />)}
            {drill("poverty", false, <MiniMetric label="สนใจโครงการแก้ความยากจน" value={report.participation.povertyProgramInterest} unit="ครัวเรือน" />)}
          </div>
          <ListGroup title="ทักษะของผู้สนใจเป็นอาสาสมัคร" items={report.participation.volunteerSkills} drillWrap={(item, node) => drill(`skill:${item.key}`, false, node)} />
        </ReportSection>
      </div>

      <ReportSection title="คุณภาพข้อมูลสำหรับติดตามแก้ไข" tone="sun">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {drill("missing-coords", false, <MiniMetric label="ไม่มีพิกัด" value={report.quality.missingCoordinates} unit="ใบ" />)}
          {drill("incomplete", false, <MiniMetric label="ข้อมูลไม่ครบ" value={report.quality.incomplete} unit="ใบ" />)}
          {drill("illegible", false, <MiniMetric label="มีช่องอ่านไม่ออก" value={report.quality.illegible} unit="ใบ" />)}
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

type ListItem = { key: string; label: string; count: number };
function ListGroup({
  title,
  items,
  drillWrap,
  detailAction,
}: {
  title: string;
  items: ListItem[];
  drillWrap?: (item: ListItem, node: React.ReactNode) => React.ReactNode;
  detailAction?: (item: ListItem) => React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-bold text-slate-700">{title}</h4>
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const node = (
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{item.label}</span>
                <strong className="tabular-nums text-brand-700">{format(item.count)}</strong>
              </div>
            );
            return (
              <div key={item.key} className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">{drillWrap ? drillWrap(item, node) : node}</div>
                {detailAction ? detailAction(item) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>
      )}
    </div>
  );
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
