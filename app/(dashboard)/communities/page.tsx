import { requirePermission } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listCommunities } from "@/lib/community/core";
import type { CoverageResult } from "@/domain/coverage/coverage";
import { PopulationEditor } from "@/components/community/population-editor";

export const metadata = { title: "ชุมชน" };
export const dynamic = "force-dynamic";

function pct(result: CoverageResult | undefined): { text: string; meets: boolean | null } {
  if (!result || result.kind === "NOT_CALCULABLE") return { text: "ยังไม่ทราบ", meets: null };
  return {
    text: `${result.percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`,
    meets: result.meetsTarget,
  };
}

export default async function CommunitiesPage() {
  const ctx = await requirePermission(PERMISSIONS.COMMUNITY_VIEW);
  const canManage = hasPermission(ctx, PERMISSIONS.COMMUNITY_MANAGE);
  const { communities } = await listCommunities(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-900">ชุมชน</h2>
        <p className="mt-1 text-sm text-slate-500">
          จำนวนครัวเรือนทั้งหมด (ตัวหารของ Coverage) และความครอบคลุมการสำรวจรายชุมชน
          {!canManage && " — บัญชีของคุณดูได้อย่างเดียว"}
        </p>
      </div>

      {communities.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          ไม่มีชุมชนในขอบเขตของคุณ
        </div>
      ) : (
        <div className="stagger space-y-4">
          {communities.map((c) => {
            const verified = pct(c.coverage?.verifiedCoverage);
            const survey = pct(c.coverage?.surveyCoverage);
            const primary = c.tambons.find((t) => t.isPrimary) ?? c.tambons[0];
            return (
              <section key={c.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
                      {c.nameTh}
                      <span className="font-mono text-xs text-slate-400">{c.code}</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {c.tambons.length > 0
                        ? `ต.${primary?.nameTh}${c.tambons.length > 1 ? ` +${c.tambons.length - 1} ตำบล` : ""}`
                        : "ยังไม่ผูกตำบล"}
                    </p>
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
                  />
                  <Metric
                    label="ตรวจสอบแล้ว"
                    value={`${(c.coverage?.verified ?? 0).toLocaleString("th-TH")} · ${verified.text}`}
                  />
                  <div>
                    <dt className="text-[11px] font-medium text-slate-500">Verified Coverage</dt>
                    <dd className="mt-1">
                      {verified.meets === null ? (
                        <span className="badge badge-neutral !bg-slate-100 !text-slate-400">
                          ยังไม่ทราบเป้า
                        </span>
                      ) : verified.meets ? (
                        <span className="badge badge-success">ผ่านเป้า &gt;{c.targetCoveragePercent}%</span>
                      ) : (
                        <span className="badge badge-warning">ยังไม่ถึง {c.targetCoveragePercent}%</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {(c.populationDataSource || c.lastPopulationUpdatedAt) && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
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

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold tabular-nums ${muted ? "text-slate-300" : "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}
