import { requirePermission } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listCommunities } from "@/lib/community/core";
import type { CoverageResult } from "@/domain/coverage/coverage";
import { PopulationEditor } from "@/components/community/population-editor";
import { PageHero, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ชุมชน" };
export const dynamic = "force-dynamic";

function pct(result: CoverageResult | undefined): {
  text: string;
  percent: number | null;
  meets: boolean | null;
} {
  if (!result || result.kind === "NOT_CALCULABLE")
    return { text: "ยังไม่ทราบ", percent: null, meets: null };
  return {
    text: `${result.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`,
    percent: result.percent,
    meets: result.meetsTarget,
  };
}

export default async function CommunitiesPage() {
  const ctx = await requirePermission(PERMISSIONS.COMMUNITY_VIEW);
  const canManage = hasPermission(ctx, PERMISSIONS.COMMUNITY_MANAGE);
  const { communities } = await listCommunities(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="ชุมชน"
        tone="brand"
        description={
          <>
            จำนวนครัวเรือนทั้งหมด (ตัวหารของ Coverage) และความครอบคลุมการสำรวจรายชุมชน
            {!canManage && " — บัญชีของคุณดูได้อย่างเดียว"}
          </>
        }
        badge={
          <>
            <span className="live-dot" />
            {communities.length.toLocaleString("th-TH")} ชุมชนในขอบเขตของคุณ
          </>
        }
      />

      {communities.length === 0 ? (
        <div className="card">
          <EmptyState
            title="ไม่มีชุมชนในขอบเขตของคุณ"
            description="กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"
          />
        </div>
      ) : (
        <div className="stagger space-y-4">
          {communities.map((c) => {
            const verified = pct(c.coverage?.verifiedCoverage);
            const survey = pct(c.coverage?.surveyCoverage);
            const primary = c.tambons.find((t) => t.isPrimary) ?? c.tambons[0];
            return (
              <section key={c.id} className="card card-interactive p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="chip chip-md chip-brand shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                        <path
                          d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900">
                        {c.nameTh}
                        <span className="badge badge-neutral font-mono">{c.code}</span>
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {c.tambons.length > 0
                          ? `ต.${primary?.nameTh}${c.tambons.length > 1 ? ` +${c.tambons.length - 1} ตำบล` : ""}`
                          : "ยังไม่ผูกตำบล"}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <PopulationEditor
                      communityId={c.id}
                      communityName={c.nameTh}
                      totalHouseholds={c.totalHouseholds}
                      targetCoveragePercent={c.targetCoveragePercent}
                      dataSource={c.populationDataSource}
                      dataNote={c.populationDataNote}
                    />
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric
                    label="ครัวเรือนทั้งหมด"
                    value={
                      c.totalHouseholds != null
                        ? c.totalHouseholds.toLocaleString("th-TH")
                        : "ยังไม่ทราบ"
                    }
                    muted={c.totalHouseholds == null}
                  />
                  <Metric
                    label="สำรวจแล้ว"
                    value={`${(c.coverage?.surveyed ?? 0).toLocaleString("th-TH")} · ${survey.text}`}
                    tone="sun"
                  />
                  <Metric
                    label="ตรวจสอบแล้ว"
                    value={`${(c.coverage?.verified ?? 0).toLocaleString("th-TH")} · ${verified.text}`}
                    tone="mint"
                  />
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Verified Coverage
                    </dt>
                    <dd className="mt-1.5">
                      {verified.meets === null ? (
                        <span className="badge badge-neutral">ยังไม่ทราบเป้า</span>
                      ) : verified.meets ? (
                        <span className="badge badge-success">
                          ผ่านเป้า &gt;{c.targetCoveragePercent}%
                        </span>
                      ) : (
                        <span className="badge badge-warning">
                          ยังไม่ถึง {c.targetCoveragePercent}%
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* แถบความครอบคลุม — ตรวจสอบแล้วซ้อนบนสำรวจแล้ว */}
                <div className="mt-4">
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/70">
                    {survey.percent != null && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-sun-300 transition-all duration-500"
                        style={{ width: `${Math.min(survey.percent, 100)}%` }}
                      />
                    )}
                    {verified.percent != null && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.min(verified.percent, 100)}%` }}
                      />
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                      ตรวจสอบแล้ว
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sun-300" aria-hidden="true" />
                      สำรวจแล้ว
                    </span>
                    <span className="ml-auto tabular-nums">
                      เป้า &gt;{c.targetCoveragePercent}%
                    </span>
                  </div>
                </div>

                {(c.populationDataSource || c.lastPopulationUpdatedAt) && (
                  <p className="mt-3 border-t-2 border-slate-100 pt-3 text-[11px] text-slate-400">
                    {c.populationDataSource && <>แหล่งข้อมูล: {c.populationDataSource} · </>}
                    {c.lastPopulationUpdatedAt &&
                      `อัปเดตล่าสุด ${c.lastPopulationUpdatedAt.toLocaleDateString("th-TH")}`}
                    {c.populationDataNote && <> · {c.populationDataNote}</>}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "sun" | "mint";
}) {
  const valueCls = muted
    ? "text-slate-300"
    : tone === "sun"
      ? "text-sun-700"
      : tone === "mint"
        ? "text-emerald-700"
        : "text-slate-900";
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-[15px] font-bold tabular-nums ${valueCls}`}>{value}</dd>
    </div>
  );
}
