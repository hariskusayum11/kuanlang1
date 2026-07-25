import { redirect } from "next/navigation";
import { toStatCards } from "@/lib/dashboard/stats";
import { fetchScopedDashboardCounts } from "@/lib/dashboard/get-dashboard-stats";
import { fetchCommunityCoverage } from "@/lib/dashboard/get-coverage";
import type { CoverageResult } from "@/domain/coverage/coverage";
import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { defaultLandingPath } from "@/lib/navigation";
import { APPLIED_MIGRATION_COUNT } from "@/lib/app-config";

export const metadata = { title: "ภาพรวม" };
export const dynamic = "force-dynamic";

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
      {/* หัวเรื่อง + ขอบเขต */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ภาพรวมระบบ</h2>
          <p className="mt-1 text-sm text-slate-500">
            สรุปข้อมูลหลักของพื้นที่ที่คุณรับผิดชอบ
          </p>
        </div>
        <span
          className={`badge ${ctx.isGlobalScope ? "badge-brand" : "badge-neutral"}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
          {ctx.isGlobalScope
            ? "ทั้งระบบ"
            : `${ctx.communityIds.length} ชุมชนในสิทธิ์ของคุณ`}
        </span>
      </div>

      {/* สถิติหลัก */}
      <section>
        <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => {
            const muted = card.pending && card.value === 0;
            return (
              <div
                key={card.key}
                className="group card p-5 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  {card.pending && (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" title="โมดูลอยู่ระหว่างพัฒนา" />
                  )}
                </div>
                <p
                  className={`mt-2 text-[32px] font-bold leading-none tabular-nums ${
                    muted ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  {card.value.toLocaleString("th-TH")}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  {card.pending ? "อยู่ระหว่างพัฒนา" : "ข้อมูลพื้นฐานพื้นที่"}
                </p>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              ความครอบคลุมการสำรวจ
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              นับเฉพาะข้อมูลที่ตรวจสอบแล้ว (VERIFIED) เทียบจำนวนครัวเรือนทั้งหมด · เป้า &gt; 60%
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold leading-none tabular-nums text-slate-900">
              {fmtPercent(coverage.summary.verifiedCoverage)}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-slate-500">
              ตรวจสอบแล้ว {coverage.summary.verified.toLocaleString("th-TH")} /{" "}
              {coverage.summary.totalHouseholdsKnown > 0
                ? coverage.summary.totalHouseholdsKnown.toLocaleString("th-TH")
                : "ยังไม่ทราบ"}{" "}
              ครัวเรือน · ผ่านเป้า {coverage.summary.passedCommunities}/
              {coverage.summary.communities} ชุมชน
            </p>
          </div>
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
        <h2 className="mb-4 text-[15px] font-semibold text-slate-900">สถานะระบบ</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusRow label="ฐานข้อมูล" value="พร้อมใช้งาน" tone="success" />
          <StatusRow label="Migration" value={`${APPLIED_MIGRATION_COUNT} ชุด`} tone="neutral" />
          <StatusRow label="Database constraints" value="ผ่าน" tone="success" />
          <StatusRow label="โมดูลสำรวจครัวเรือน" value="กำลังพัฒนา" tone="muted" />
        </dl>
      </section>
    </div>
  );
}

/** เปอร์เซ็นต์ Coverage แบบเต็ม — NOT_CALCULABLE → "ยังไม่ทราบ" (ไม่ใช่ 0%) */
function fmtPercent(result: CoverageResult): string {
  if (result.kind === "NOT_CALCULABLE") return "ยังไม่ทราบ";
  return `${result.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
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
  const bar = result.meetsTarget ? "bg-emerald-500" : "bg-amber-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-slate-500">
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
    tone === "success" ? "bg-emerald-500" : tone === "muted" ? "bg-slate-300" : "bg-brand-400";
  const text =
    tone === "success" ? "text-emerald-700" : tone === "muted" ? "text-slate-500" : "text-slate-800";
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`flex items-center gap-2 font-medium ${text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {value}
      </dd>
    </div>
  );
}
