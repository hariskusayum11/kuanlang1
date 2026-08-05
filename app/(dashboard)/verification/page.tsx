import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getVerificationOverview,
  type VerificationQueueItem,
} from "@/lib/verification/queue";
import { groupVerificationQueue } from "@/domain/verification/group-queue";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "การตรวจสอบข้อมูล" };
export const dynamic = "force-dynamic";

type SearchParams = { community?: string; enteredBy?: string };

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // RBAC ฝั่ง server — ไม่มี verification.view → /access-denied
  const ctx = await requirePermission(PERMISSIONS.VERIFICATION_VIEW);
  const sp = await searchParams;
  const filters = {
    communityId: sp.community || undefined,
    enteredById: sp.enteredBy || undefined,
  };
  const overview = await getVerificationOverview(ctx, filters);
  const filterActive = Boolean(filters.communityId || filters.enteredById);
  const groups = groupVerificationQueue(overview.queue);

  const total = overview.waiting + overview.verified;
  const percent = total > 0 ? Math.round((overview.verified / total) * 100) : 0;
  const scopeLabel = ctx.isGlobalScope ? "ทั้งระบบ" : "ในขอบเขตของคุณ";

  return (
    <div className="mx-auto max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="การตรวจสอบข้อมูล"
        tone="brand"
        description={`ตรวจความถูกต้องของใบที่คีย์แล้วเทียบกับกระดาษ แล้วยืนยันเป็นข้อมูลที่ตรวจสอบแล้ว — จัดกลุ่มเป็นชุมชน → คนกรอก (${scopeLabel})`}
        badge={
          <>
            <span className="live-dot" />
            รอตรวจสอบ {overview.waiting.toLocaleString("th-TH")} ใบ
          </>
        }
      />

      {/* ตัวเลข aggregate + denominator (Coverage การตรวจสอบ) */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="รอตรวจสอบ"
          value={overview.waiting}
          tone="warning"
          icon="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z"
        />
        <StatCard
          label="ยืนยันแล้ว"
          value={overview.verified}
          tone="success"
          icon="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4"
        />
        <div className="card p-5 sm:col-span-1">
          <span className="chip chip-md chip-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-500">ความคืบหน้าการตรวจ</p>
          <p className="mt-1 text-[32px] font-bold leading-none tabular-nums text-brand-700">
            {percent}
            <span className="text-lg font-bold text-slate-400">%</span>
          </p>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium tabular-nums text-slate-500">
            {overview.verified.toLocaleString("th-TH")} / {total.toLocaleString("th-TH")} ใบ{" "}
            {scopeLabel}
          </p>
        </div>
      </div>

      {/* ตัวกรอง — ฟอร์ม GET ล้วน ไม่ใช้ JS (Server Component) */}
      {overview.allowed && overview.filterOptions.communities.length > 0 && (
        <form className="card flex flex-wrap items-end gap-3 p-4">
          <FilterSelect
            name="community"
            label="ชุมชน"
            value={filters.communityId}
            options={overview.filterOptions.communities.map((c) => ({
              value: c.id,
              label: c.nameTh,
            }))}
          />
          <FilterSelect
            name="enteredBy"
            label="คนกรอก"
            value={filters.enteredById}
            options={overview.filterOptions.enterers.map((e) => ({
              value: e.id,
              label: e.name,
            }))}
          />
          <button type="submit" className="btn btn-primary btn-md">
            กรองข้อมูล
          </button>
          {filterActive && (
            <Link href="/verification" className="btn btn-ghost btn-md">
              ล้างตัวกรอง
            </Link>
          )}
        </form>
      )}

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="คิวรอตรวจสอบ"
            tone="sun"
            aside={
              overview.queue.length > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {overview.queue.length.toLocaleString("th-TH")} รายการ
                  {!filterActive &&
                    overview.waiting > overview.queue.length &&
                    ` (แสดง ${overview.queue.length} แรก)`}
                </span>
              ) : undefined
            }
          />
        </div>

        {overview.queue.length === 0 ? (
          <EmptyState
            mood={overview.allowed ? "happy" : "sleep"}
            tone={overview.allowed ? "mint" : "sun"}
            title={
              !overview.allowed
                ? "ไม่มีขอบเขตชุมชนที่คุณเข้าถึงได้"
                : filterActive
                  ? "ไม่มีใบที่ตรงกับตัวกรอง"
                  : "ไม่มีใบที่รอตรวจสอบ"
            }
            description={
              !overview.allowed
                ? "กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"
                : filterActive
                  ? "ลองล้างตัวกรองเพื่อดูใบทั้งหมดที่รอตรวจ"
                  : "เมื่อเจ้าหน้าที่คีย์แบบสอบถามเข้าระบบ ใบที่รอตรวจจะปรากฏที่นี่"
            }
          />
        ) : (
          <div className="divide-y-2 divide-slate-100">
            {groups.map((community) => (
              <details key={community.communityId} className="group/community" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-white px-6 py-3.5 transition-colors hover:bg-brand-50/40">
                  <span className="flex items-center gap-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open/community:rotate-90">
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-bold text-slate-900">{community.communityName}</span>
                  </span>
                  <span className="badge badge-brand tabular-nums">{community.count} ใบ</span>
                </summary>

                <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                  {community.enterers.map((enterer) => (
                    <div key={enterer.enteredById} className="rounded-xl border-2 border-slate-100 bg-white">
                      <p className="flex items-center justify-between gap-2 border-b-2 border-slate-100 bg-slate-50/70 px-3.5 py-2 text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-slate-600">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                            <circle cx="12" cy="8" r="3.6" />
                            <path d="M5 20v-1c0-3 3.1-5 7-5s7 2 7 5v1" strokeLinecap="round" />
                          </svg>
                          คีย์โดย {enterer.enteredByName}
                        </span>
                        <span className="tabular-nums text-slate-400">{enterer.count} ใบ</span>
                      </p>
                      <QueueTable items={enterer.items} />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="min-w-[160px] flex-1 space-y-1">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="field">
        <option value="">ทั้งหมด</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueTable({ items }: { items: VerificationQueueItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <th className="py-2.5 pl-3.5 pr-4">ใบ</th>
            <th className="py-2.5 pr-4 text-center">กลุ่มเปราะบาง</th>
            <th className="py-2.5 pr-4 text-center">อ่านไม่ออก/ว่าง</th>
            <th className="py-2.5 pr-4">สถานะ</th>
            <th className="py-2.5 pr-3.5 text-right">การทำงาน</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((q) => (
            <tr key={q.householdId} className="transition-colors hover:bg-brand-50/50">
              <td className="py-2.5 pl-3.5 pr-4 font-mono text-xs font-bold text-slate-700">
                {q.sheetNo}
              </td>
              <td className="py-2.5 pr-4 text-center font-semibold tabular-nums text-slate-600">
                {q.vulnerableCount > 0 ? `${q.vulnerableCount} คน` : "—"}
              </td>
              <td className="py-2.5 pr-4 text-center font-semibold tabular-nums">
                {q.illegibleCount + q.blankCount > 0 ? (
                  <span className="text-slate-600">
                    {q.illegibleCount > 0 && <span className="text-sun-700">{q.illegibleCount}</span>}
                    {q.illegibleCount > 0 && q.blankCount > 0 && " / "}
                    {q.blankCount > 0 && <span className="text-slate-400">{q.blankCount}</span>}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                {q.hasDuplicateFlag ? (
                  <span className="badge badge-warning">⚠ สงสัยซ้ำ</span>
                ) : (
                  <span className="badge badge-brand">รอตรวจ</span>
                )}
              </td>
              <td className="py-2.5 pr-3.5 text-right">
                <Link
                  href={`/verification/${q.householdId}`}
                  className={`btn btn-sm ${q.enteredByMe ? "btn-secondary" : "btn-primary"}`}
                >
                  {q.enteredByMe ? "ดู" : "ตรวจสอบ"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "warning" | "success";
  icon: string;
}) {
  const chipCls = tone === "warning" ? "chip-sun" : "chip-mint";
  const valueCls = tone === "warning" ? "text-sun-700" : "text-emerald-700";
  return (
    <div className="card card-interactive p-5">
      <span className={`chip chip-md ${chipCls}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
          <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${valueCls}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}
