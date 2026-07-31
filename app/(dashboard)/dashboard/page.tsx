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

export const metadata = { title: "ภาพรวม" };
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
  tambons: "ink",
  moos: "brand",
  households: "mint",
  evacuationSites: "alert",
};
const CARD_ICON: Record<keyof DashboardCounts, string> = {
  communities: "M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5",
  tambons: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  moos: "M4 21V9l8-5 8 5v12M9 21v-6h6v6",
  households: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4",
  evacuationSites: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 11h.01",
};

export default async function DashboardPage() {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  // ไม่มี dashboard.view (เช่น DATA_ENTRY) → ส่งไปหน้าแรกตามสิทธิ์ของตน
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    redirect(defaultLandingPath(ctx.permissions) ?? "/access-denied");
  }

  const scope = { isGlobalScope: ctx.isGlobalScope, communityIds: ctx.communityIds };
  const [counts, coverage] = await Promise.all([
    fetchScopedDashboardCounts(scope),
    fetchCommunityCoverage(scope),
  ]);
  const cards = toStatCards(counts);

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-in">
      {/* หัวเรื่อง + ขอบเขต — แถบต้อนรับสีแบรนด์ */}
      <div className="animate-slide-up relative overflow-hidden rounded-3xl band-brand px-6 py-6 md:px-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-white">ภาพรวมระบบ</h2>
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

      {/* สถิติหลัก */}
      <section>
        <SectionTitle tone="brand" title="ตัวเลขพื้นฐานพื้นที่" />
        <div className="stagger mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => {
            const muted = card.pending && card.value === 0;
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
                {card.pending && (
                  <span className="badge badge-neutral mt-2">อยู่ระหว่างพัฒนา</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ครัวเรือนนับจากใบที่คีย์เข้าระบบแล้ว (ดูความครอบคลุมด้านล่าง) —
          โมดูลจุดอพยพยังอยู่ระหว่างพัฒนา
        </p>
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
          <StatusRow label="โมดูลสำรวจครัวเรือน" value="กำลังพัฒนา" tone="muted" />
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
