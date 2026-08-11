import { redirect } from "next/navigation";
import { toStatCards } from "@/lib/dashboard/stats";
import { fetchScopedDashboardCounts } from "@/lib/dashboard/get-dashboard-stats";
import { fetchCommunityCoverage } from "@/lib/dashboard/get-coverage";
import { AGGREGATE_TARGET_COVERAGE_PERCENT } from "@/lib/dashboard/coverage";
import { CoverageGauge } from "@/components/charts/coverage-gauge";
import type { CoverageResult } from "@/domain/coverage/coverage";
import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { defaultLandingPath } from "@/lib/navigation";
import { APPLIED_MIGRATION_COUNT } from "@/lib/app-config";
import type { DashboardCounts } from "@/lib/dashboard/stats";
import { fetchQuestionnaireAnalytics, type NamedCount } from "@/lib/dashboard/questionnaire-analytics";
import type { HouseholdAnalyticsFilters, SurveyStatusFilter } from "@/lib/household/trusted-where";
import { getSystemPreferences } from "@/lib/settings/core";

export const metadata = { title: "แดชบอร์ดผู้บริหาร" };
export const dynamic = "force-dynamic";

/* โทนของการ์ดตัวเลข — sun/alert สงวนความหมายไว้ (คำเตือน / ต้องลงมือทำ)
   ตัวเลข Master Data ที่เป็นกลางจึงใช้ brand หรือ ink เท่านั้น */
type Tone = "brand" | "ink" | "alert" | "sun" | "mint";

const CHIP: Record<Tone, string> = {
  brand: "chip-brand",
  ink: "bg-ink-800/10 text-ink-900",
  alert: "chip-accent",
  sun: "chip-sun",
  mint: "chip-mint",
};
const VALUE: Record<Tone, string> = {
  brand: "text-brand-700",
  ink: "text-ink-900",
  alert: "text-alert-600",
  sun: "text-sun-800",
  mint: "text-emerald-700",
};
const BAR: Record<Tone, string> = {
  brand: "bg-brand-400",
  ink: "bg-ink-800",
  alert: "bg-alert-400",
  sun: "bg-sun-400",
  mint: "bg-emerald-400",
};

const CARD_TONE: Record<keyof DashboardCounts, Tone> = {
  communities: "brand",
  keyed: "brand",
  verified: "mint",
  pending: "sun",
  keyers: "ink",
};
const CARD_ICON: Record<keyof DashboardCounts, string> = {
  communities: "M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5",
  keyed: "M4 7h16M4 12h16M4 17h10", // รายการที่คีย์
  verified: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4", // โล่ + ติ๊ก
  pending: "M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z", // นาฬิกา = รอ
  keyers: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a3 3 0 100 6 3 3 0 000-6zM22 21v-2a4 4 0 00-3-3.87", // ผู้คน
};

type SearchParams = {
  community?: string;
  tambon?: string;
  from?: string;
  to?: string;
  status?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  // ไม่มี dashboard.view (เช่น DATA_ENTRY) → ส่งไปหน้าแรกตามสิทธิ์ของตน
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    redirect(defaultLandingPath(ctx.permissions) ?? "/access-denied");
  }

  const scope = { isGlobalScope: ctx.isGlobalScope, communityIds: ctx.communityIds };
  const [sp, preferences] = await Promise.all([searchParams, getSystemPreferences()]);
  const status: SurveyStatusFilter = ["VERIFIED", "PENDING", "ALL"].includes(sp.status ?? "")
    ? (sp.status as SurveyStatusFilter)
    : preferences.dashboardDefaultStatus;
  const filters: HouseholdAnalyticsFilters = {
    communityId: sp.community || undefined,
    tambonId: sp.tambon || undefined,
    dateFrom: sp.from || undefined,
    dateTo: sp.to || undefined,
    status,
  };
  const [counts, coverage, analytics] = await Promise.all([
    fetchScopedDashboardCounts(scope),
    fetchCommunityCoverage(scope),
    fetchQuestionnaireAnalytics(scope, filters),
  ]);
  const cards = toStatCards(counts);

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 animate-fade-in">
      {/* หัวเรื่อง + ขอบเขต — แถบต้อนรับสีแบรนด์ */}
      <div className="animate-slide-up relative overflow-hidden rounded-3xl band-brand px-6 py-6 md:px-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-white">แดชบอร์ดผู้บริหาร</h2>
            <p className="mt-1 text-sm text-brand-50">
              สรุปข้อมูลหลักของพื้นที่ที่คุณรับผิดชอบ
            </p>
            <span className="badge mt-3 bg-white/20 text-white">
              <span className="live-dot" />
              {ctx.isGlobalScope
                ? "ขอบเขต: ทั้งระบบ"
                : `ขอบเขต: ${ctx.communityIds.length} ชุมชนในสิทธิ์ของคุณ`}
            </span>
          </div>
        </div>
      </div>

      {preferences.notice ? (
        <div className="rounded-2xl border-2 border-sun-200 bg-sun-50 px-5 py-4 text-sm font-semibold leading-6 text-sun-900" role="status">
          <span className="mr-2" aria-hidden="true">📢</span>{preferences.notice}
        </div>
      ) : null}

      <DashboardFilters filters={filters} options={analytics.options} />

      {/* สถิติหลัก */}
      <section>
        <SectionTitle tone="brand" title="สรุปการดำเนินงาน" />
        <div className="stagger mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => {
            const muted = card.value === 0;
            const tone = CARD_TONE[card.key];
            return (
              <div key={card.key} className="card card-interactive p-5">
                <span className={`chip chip-md ${muted ? "chip-neutral" : CHIP[tone]}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <path d={CARD_ICON[card.key]} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-500">{card.label}</p>
                <p
                  className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${
                    muted ? "text-slate-300" : VALUE[tone]
                  }`}
                >
                  {card.value.toLocaleString("th-TH")}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          &quot;คีย์แล้ว&quot; นับทุกใบที่คีย์เข้าระบบ · &quot;ตรวจแล้ว&quot; นับเฉพาะ VERIFIED ·
          &quot;ยังไม่ผ่านตรวจ&quot; = คีย์แล้วทั้งหมด − ตรวจแล้ว (รวมใบที่กำลังเปิดแก้)
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <SectionTitle tone="mint" title="ภาพรวมข้อมูลจากแบบสอบถาม" />
          <p className="mt-1 text-xs text-slate-500">
            ตัวเลขและกราฟส่วนนี้เปลี่ยนตามตัวกรองด้านบน · ค่าเริ่มต้นใช้เฉพาะใบที่ตรวจแล้ว
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="ครัวเรือน" value={analytics.summary.households} suffix="ครัวเรือน" />
          <MetricCard label="ประชากรรวม" value={analytics.summary.people} suffix="คน" />
          <MetricCard label="ครัวเรือนมีกลุ่มเปราะบาง" value={analytics.summary.vulnerableHouseholds} suffix="ครัวเรือน" />
          <MetricCard label="บุคคลกลุ่มเปราะบาง" value={analytics.summary.vulnerablePeople} suffix="คน" />
          <MetricCard label="ต้องการความช่วยเหลือรวม" value={analytics.summary.assistancePeople} suffix="คน" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <AnalyticsPanel title="ระดับความเร่งด่วนของกลุ่มเปราะบาง" description="P1 เร่งด่วนสูงสุด · ไม่รวมรายชื่อหรือข้อมูลส่วนบุคคล">
          <BarList
            rows={[
              { key: "P1", label: "P1 วิกฤต", count: analytics.triage.P1 },
              { key: "P2", label: "P2 เร่งด่วน", count: analytics.triage.P2 },
              { key: "P3", label: "P3 เฝ้าระวัง", count: analytics.triage.P3 },
              { key: "NA", label: "ยังไม่ประเมิน", count: analytics.triage.UNASSESSED },
            ]}
            tone="alert"
          />
        </AnalyticsPanel>
        <AnalyticsPanel title="ประเภทความช่วยเหลือ" description="จำนวนคนที่ระบุในแต่ละประเภท">
          <BarList rows={analytics.assistance.map((r) => ({ ...r, count: r.people ?? 0 }))} tone="brand" empty="ยังไม่มีการระบุความช่วยเหลือ" />
        </AnalyticsPanel>
        <AnalyticsPanel title="ประวัติและความพร้อมรับน้ำท่วม" description="สรุปจากข้อมูลระดับครัวเรือน">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniMetric label="เคยน้ำท่วม" value={analytics.flood.floodedHouseholds} suffix="หลัง" />
            <MiniMetric label="ระดับน้ำเฉลี่ย" value={roundOrZero(analytics.flood.averageDepthCm)} suffix="ซม." />
            <MiniMetric label="ระดับน้ำสูงสุด" value={analytics.flood.maximumDepthCm ?? 0} suffix="ซม." />
            <MiniMetric label="ท่วมนานเฉลี่ย" value={roundOrZero(analytics.flood.averageDurationDays)} suffix="วัน" />
            <MiniMetric label="ไม่มีชุดยังชีพ" value={analytics.flood.withoutSurvivalKit} suffix="หลัง" />
            <MiniMetric label="ไม่มีทรัพยากร" value={analytics.flood.withoutResources} suffix="หลัง" />
          </div>
        </AnalyticsPanel>
        <AnalyticsPanel title="ยานพาหนะสำหรับอพยพ" description="จำนวนรายการยานพาหนะที่ครัวเรือนระบุ">
          <BarList rows={analytics.preparedness.vehicles} tone="mint" empty="ยังไม่มีข้อมูลยานพาหนะ" />
        </AnalyticsPanel>
        <AnalyticsPanel title="ช่องทางข่าวสารและความพร้อมดิจิทัล" description="ใช้วางแผนการแจ้งเตือนให้เข้าถึงประชาชน">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <MiniMetric label="ใช้สมาร์ตโฟน" value={analytics.preparedness.smartphoneHouseholds} suffix="หลัง" />
            <MiniMetric label="สแกน QR ได้" value={analytics.preparedness.qrReadyHouseholds} suffix="หลัง" />
          </div>
          <BarList rows={analytics.preparedness.alertChannels} tone="brand" empty="ยังไม่มีข้อมูลช่องทางข่าวสาร" />
        </AnalyticsPanel>
        <AnalyticsPanel title="การมีส่วนร่วมและความต้องการต่อเนื่อง" description="คำว่าอาสาสมัครและจุดพักพิงเป็นเพียงความสนใจ/ความยินยอมเบื้องต้น">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniMetric label="ผู้สนใจเป็นอาสาสมัคร" value={analytics.participation.volunteerHouseholds} suffix="หลัง" />
            <MiniMetric label="ยินยอมเป็นจุดพักพิง" value={analytics.participation.potentialHostHouses} suffix="หลัง" />
            <MiniMetric label="ต้องการดูแลสุขภาพจิต" value={analytics.participation.mentalHealthSupport} suffix="หลัง" />
            <MiniMetric label="สนใจโครงการแก้จน" value={analytics.participation.povertyProgramInterest} suffix="หลัง" />
          </div>
          <div className="mt-4">
            <BarList rows={analytics.participation.volunteerSkills} tone="mint" empty="ยังไม่มีทักษะอาสาสมัครที่สนใจ" />
          </div>
        </AnalyticsPanel>
      </section>

      <section className="card border-l-4 border-l-sun-400 p-5">
        <SectionTitle tone="sun" title="คุณภาพข้อมูลที่ต้องติดตาม" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniMetric label="ไม่มีพิกัด" value={analytics.quality.missingCoordinates} suffix="ใบ" />
          <MiniMetric label="ข้อมูลไม่ครบ" value={analytics.quality.incomplete} suffix="ใบ" />
          <MiniMetric label="มีช่องอ่านไม่ออก" value={analytics.quality.illegible} suffix="ใบ" />
        </div>
        <p className="mt-3 text-xs text-slate-500">รายการไม่มีพิกัดยังรวมอยู่ในยอดการ์ดและกราฟ แต่ไม่สามารถวางเป็นจุดบนแผนที่ได้</p>
      </section>

      {/* ความครอบคลุมการสำรวจ (Verified Coverage) — เป้า > ร้อยละ 60 */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-emerald-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="chip chip-md chip-mint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                ความครอบคลุมการสำรวจ
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                นับเฉพาะข้อมูลที่ตรวจสอบแล้ว (VERIFIED) เทียบจำนวนครัวเรือนทั้งหมด · เป้า &gt; 60%
              </p>
            </div>
          </div>
          {/* เกจ = ตัวเลขเป็นพระเอก (ไม่ใช่ภาพประดับ) — Denominator กำกับใต้เกจตามกฎ Dashboard */}
          <CoverageGauge
            coverage={coverage.summary.verifiedCoverage}
            target={AGGREGATE_TARGET_COVERAGE_PERCENT}
            size={150}
            caption={`ตรวจสอบแล้ว ${coverage.summary.verified.toLocaleString("th-TH")} / ${
              coverage.summary.totalHouseholdsKnown > 0
                ? coverage.summary.totalHouseholdsKnown.toLocaleString("th-TH")
                : "ยังไม่ทราบ"
            } ครัวเรือน · ผ่านเป้า ${coverage.summary.passedCommunities}/${
              coverage.summary.communities
            } ชุมชน`}
          />
        </div>

        {coverage.rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            ไม่มีชุมชนในขอบเขตของคุณ
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4 text-right">ครัวเรือนทั้งหมด</th>
                  <th className="py-3 pr-4 text-right">สำรวจแล้ว</th>
                  <th className="py-3 pr-4 text-right">ตรวจสอบแล้ว</th>
                  <th className="py-3 pr-4">Verified Coverage</th>
                  <th className="py-3 pr-6 text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {coverage.rows.map((r) => (
                  <tr key={r.communityId} className="transition-colors hover:bg-slate-50/60">
                    <td className="py-3 pl-6 pr-4">
                      <span className="font-medium text-slate-800">{r.nameTh}</span>{" "}
                      <span className="font-mono text-xs text-slate-400">{r.code}</span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {r.totalHouseholds != null ? (
                        <span className="text-slate-700">
                          {r.totalHouseholds.toLocaleString("th-TH")}
                        </span>
                      ) : (
                        <span className="text-slate-300">ยังไม่ทราบ</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                      {r.surveyed.toLocaleString("th-TH")}
                      <span className="ml-1 text-[11px] text-slate-400">
                        {fmtPercentShort(r.surveyCoverage)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-slate-900">
                      {r.verified.toLocaleString("th-TH")}
                    </td>
                    <td className="py-3 pr-4">
                      <CoverageBar result={r.verifiedCoverage} />
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <CoverageStatus result={r.verifiedCoverage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* สถานะระบบ */}
      <section className="card p-6">
        <SectionTitle tone="ink" title="สถานะระบบ" />
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <StatusRow label="ฐานข้อมูล" value="พร้อมใช้งาน" tone="success" />
          <StatusRow label="Migration" value={`${APPLIED_MIGRATION_COUNT} ชุด`} tone="neutral" />
          <StatusRow label="Database constraints" value="ผ่าน" tone="success" />
          <StatusRow label="โมดูลคีย์ + ตรวจข้อมูล" value="พร้อมใช้งาน" tone="success" />
        </dl>
      </section>
    </div>
  );
}

function SectionTitle({ title, tone }: { title: string; tone: Tone }) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold text-slate-900">
      <span className={`h-6 w-1.5 rounded-full ${BAR[tone]}`} aria-hidden="true" />
      {title}
    </h2>
  );
}

/** เปอร์เซ็นต์แบบย่อในวงเล็บ — ว่างถ้าไม่มี denominator */
function fmtPercentShort(result: CoverageResult): string {
  if (result.kind === "NOT_CALCULABLE") return "";
  return `(${result.percent.toLocaleString("th-TH", { maximumFractionDigits: 0 })}%)`;
}

function CoverageBar({ result }: { result: CoverageResult }) {
  if (result.kind === "NOT_CALCULABLE") {
    return <span className="text-xs text-slate-300">— ยังไม่ทราบจำนวนครัวเรือน</span>;
  }
  const width = Math.min(100, result.percent);
  const bar = result.meetsTarget ? "bg-emerald-400" : "bg-sun-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-24 overflow-hidden rounded-full bg-slate-200/70">
        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-600">
        {result.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%
      </span>
    </div>
  );
}

function CoverageStatus({ result }: { result: CoverageResult }) {
  if (result.kind === "NOT_CALCULABLE") {
    return <span className="badge badge-neutral !bg-slate-100 !text-slate-400">ยังไม่ทราบเป้า</span>;
  }
  return result.meetsTarget ? (
    <span className="badge badge-success">ผ่านเป้า</span>
  ) : (
    <span className="badge badge-warning">ยังไม่ถึงเป้า</span>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "neutral" | "muted";
}) {
  const dot =
    tone === "success" ? "bg-emerald-400" : tone === "muted" ? "bg-slate-300" : "bg-brand-400";
  const text =
    tone === "success" ? "text-emerald-700" : tone === "muted" ? "text-slate-500" : "text-slate-800";
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-slate-100 bg-slate-50/70 px-4 py-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`flex items-center gap-2 font-medium ${text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {value}
      </dd>
    </div>
  );
}

function DashboardFilters({
  filters,
  options,
}: {
  filters: HouseholdAnalyticsFilters;
  options: {
    communities: { id: string; label: string }[];
    tambons: { id: string; label: string }[];
  };
}) {
  return (
    <form method="get" className="card p-5" aria-label="ตัวกรองแดชบอร์ด">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-slate-900">ตัวกรองข้อมูลกลาง</h2>
          <p className="text-xs text-slate-500">ใช้กับการ์ดและกราฟข้อมูลแบบสอบถามทั้งหมดด้านล่าง</p>
        </div>
        <a href="/dashboard" className="text-sm font-semibold text-brand-700 hover:underline">ล้างตัวกรอง</a>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FilterSelect name="community" label="ชุมชน" value={filters.communityId}>
          <option value="">ทุกชุมชน</option>
          {options.communities.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </FilterSelect>
        <FilterSelect name="tambon" label="ตำบล" value={filters.tambonId}>
          <option value="">ทุกตำบล</option>
          {options.tambons.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </FilterSelect>
        <label className="text-xs font-bold text-slate-600">ตั้งแต่วันที่สำรวจ
          <input type="date" name="from" defaultValue={filters.dateFrom} className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-bold text-slate-600">ถึงวันที่สำรวจ
          <input type="date" name="to" defaultValue={filters.dateTo} className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm" />
        </label>
        <div className="flex items-end gap-2">
          <FilterSelect name="status" label="สถานะตรวจสอบ" value={filters.status} className="flex-1">
            <option value="VERIFIED">ตรวจแล้ว</option>
            <option value="PENDING">ยังไม่ผ่านตรวจ</option>
            <option value="ALL">ทุกสถานะ</option>
          </FilterSelect>
          <button type="submit" className="btn btn-primary mb-px whitespace-nowrap px-4 py-2.5">แสดงผล</button>
        </div>
      </div>
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  children,
  className = "",
}: {
  name: string;
  label: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`text-xs font-bold text-slate-600 ${className}`}>{label}
      <select name={name} defaultValue={value ?? ""} className="mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm">
        {children}
      </select>
    </label>
  );
}

function MetricCard({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold leading-5 text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-brand-700">{value.toLocaleString("th-TH")}</p>
      <p className="mt-1 text-xs text-slate-400">{suffix}</p>
    </div>
  );
}

function MiniMetric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="rounded-xl border-2 border-slate-100 bg-slate-50/60 px-3 py-3">
      <p className="text-[11px] font-semibold leading-4 text-slate-500">{label}</p>
      <p className="mt-1 font-bold tabular-nums text-slate-900">{value.toLocaleString("th-TH")} <span className="text-xs font-medium text-slate-400">{suffix}</span></p>
    </div>
  );
}

function AnalyticsPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BarList({ rows, tone, empty = "ยังไม่มีข้อมูล" }: { rows: NamedCount[]; tone: Tone; empty?: string }) {
  if (rows.length === 0 || rows.every((row) => row.count === 0)) {
    return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{empty}</p>;
  }
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-slate-600" title={row.label}>{row.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-slate-800">{row.count.toLocaleString("th-TH")}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function roundOrZero(value: number | null): number {
  return value === null ? 0 : Math.round(value);
}
