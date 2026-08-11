import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getVerificationOverview,
  verificationRowActions,
  type VerificationQueueItem,
} from "@/lib/verification/queue";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";
import { DeleteHouseholdButton } from "@/components/admin/delete-household-button";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const metadata = { title: "การตรวจสอบข้อมูล" };
export const dynamic = "force-dynamic";

type SearchParams = { community?: string; enteredBy?: string; q?: string; page?: string; size?: string };

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
    search: sp.q || undefined,
    page: Number.parseInt(sp.page ?? "1", 10),
    pageSize: Number.parseInt(sp.size ?? "20", 10),
  };
  const overview = await getVerificationOverview(ctx, filters);
  const filterActive = Boolean(filters.communityId || filters.enteredById || filters.search);
  const totalPages = Math.max(1, Math.ceil(overview.filteredTotal / overview.pageSize));
  const current = Math.min(overview.page, totalPages);
  const baseParams = new URLSearchParams();
  if (filters.communityId) baseParams.set("community", filters.communityId);
  if (filters.enteredById) baseParams.set("enteredBy", filters.enteredById);
  if (filters.search) baseParams.set("q", filters.search);
  baseParams.set("size", String(overview.pageSize));
  const pageHref = (page: number) => {
    const q = new URLSearchParams(baseParams);
    q.set("page", String(page));
    return `/verification?${q}`;
  };
  const isAdmin = ctx.roles.includes("ADMIN");

  const displayedWaiting = overview.filteredTotal;
  const displayedVerified = overview.filteredVerified;
  const total = displayedWaiting + displayedVerified;
  const percent = total > 0 ? Math.round((displayedVerified / total) * 100) : 0;
  const scopeLabel = ctx.isGlobalScope ? "ทั้งระบบ" : "ในขอบเขตของคุณ";

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="การตรวจสอบข้อมูล"
        tone="brand"
        description={`ตรวจความถูกต้องของใบที่คีย์แล้วเทียบกับกระดาษ แล้วดู ตรวจ แก้ไข หรือลบได้จากตารางตามสิทธิ์ (${scopeLabel})`}
        badge={
          <>
            <span className="live-dot" />
            รอตรวจสอบ {displayedWaiting.toLocaleString("th-TH")} ใบ
          </>
        }
      />

      {/* ตัวเลข aggregate + denominator (Coverage การตรวจสอบ) */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="รอตรวจสอบ"
          value={displayedWaiting}
          tone="warning"
          icon="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z"
        />
        <StatCard
          label="ยืนยันแล้ว"
          value={displayedVerified}
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
            {displayedVerified.toLocaleString("th-TH")} / {total.toLocaleString("th-TH")} ใบ{" "}
            {filterActive ? "ตามตัวกรอง" : scopeLabel}
          </p>
        </div>
      </div>

      {/* ตัวกรอง — ฟอร์ม GET ล้วน ไม่ใช้ JS (Server Component) */}
      {overview.allowed && overview.filterOptions.communities.length > 0 && (
        <form className="card flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="size" value={overview.pageSize} />
          <label className="min-w-[200px] flex-[2] space-y-1">
            <span className="text-xs font-bold text-slate-600">ค้นหา (รหัสใบ / บ้านเลขที่)</span>
            <input type="search" name="q" defaultValue={filters.search ?? ""} placeholder="เช่น SK-000123 หรือ 45/2" className="field" />
          </label>
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
                  {overview.filteredTotal.toLocaleString("th-TH")} รายการ
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
          <>
            <QueueTable items={overview.queue} isAdmin={isAdmin} startIndex={(current - 1) * overview.pageSize} />
            <PaginationFooter
              current={current}
              totalPages={totalPages}
              pageSize={overview.pageSize}
              pageHref={pageHref}
              baseParams={baseParams}
            />
          </>
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

function QueueTable({ items, isAdmin, startIndex }: { items: VerificationQueueItem[]; isAdmin: boolean; startIndex: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <th className="py-2.5 pl-6 pr-3 text-right">#</th>
            <th className="py-2.5 pr-4">รหัสใบ</th>
            <th className="py-2.5 pr-4">วันที่กรอก</th>
            <th className="py-2.5 pr-4">ชุมชน</th>
            <th className="py-2.5 pr-4">บ้านเลขที่</th>
            <th className="py-2.5 pr-4">คนกรอก</th>
            <th className="py-2.5 pr-4">สถานะ</th>
            <th className="sticky right-0 bg-slate-50 py-2.5 pr-6 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((q, index) => {
            const actions = verificationRowActions({ isAdmin, enteredByMe: q.enteredByMe });
            return (
            <tr key={q.householdId} className="group transition-colors hover:bg-brand-50/50">
              <td className="py-2.5 pl-6 pr-3 text-right text-xs tabular-nums text-slate-400">{startIndex + index + 1}</td>
              <td className="py-2.5 pr-4 font-mono text-xs font-bold text-slate-700">
                {q.sheetNo}
              </td>
              <td className="py-2.5 pr-4 text-xs tabular-nums text-slate-500">{q.enteredAt.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="py-2.5 pr-4 font-semibold text-slate-800">{q.communityName}</td>
              <td className="py-2.5 pr-4 text-slate-600">{q.houseNo ? `${q.houseNo}${q.mooNo != null ? ` หมู่ ${q.mooNo}` : ""}` : "—"}</td>
              <td className="py-2.5 pr-4 text-slate-600">{q.enteredByName}</td>
              <td className="py-2.5 pr-4">
                {q.duplicateResolution === "CONFIRMED_DUPLICATE" ? (
                  <span className="badge badge-danger">ซ้ำจริง</span>
                ) : q.hasDuplicateFlag ? (
                  <span className="badge badge-warning">⚠ สงสัยซ้ำ · รอตัดสิน</span>
                ) : (
                  <span className="badge badge-brand">รอตรวจ</span>
                )}
              </td>
              <td className="sticky right-0 bg-white py-2.5 pr-6 text-right group-hover:bg-brand-50/50">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={`/verification/${q.householdId}?mode=view`} className="btn btn-secondary btn-sm">ดู</Link>
                  {actions.canConfirm && (
                    <Link href={`/verification/${q.householdId}?mode=view`} className="btn btn-primary btn-sm">ตรวจสอบ</Link>
                  )}
                  {actions.canEdit && (
                    <Link href={`/verification/${q.householdId}?mode=edit`} className="btn btn-accent btn-sm">แก้ไข</Link>
                  )}
                  {actions.canDelete && <DeleteHouseholdButton householdId={q.householdId} sheetNo={q.sheetNo} />}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaginationFooter({
  current,
  totalPages,
  pageSize,
  pageHref,
  baseParams,
}: {
  current: number;
  totalPages: number;
  pageSize: number;
  pageHref: (page: number) => string;
  baseParams: URLSearchParams;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-slate-100 bg-slate-50/40 px-6 py-3.5">
      <span className="text-xs font-medium tabular-nums text-slate-500">หน้า {current.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <form>
          {[...baseParams.entries()].filter(([key]) => key !== "size" && key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
            แสดง
            <select name="size" defaultValue={pageSize} className="field !h-9 !w-20 !py-1" aria-label="จำนวนรายการต่อหน้า">
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm">ใช้</button>
          </label>
        </form>
        {current > 1 && <Link href={pageHref(current - 1)} className="btn btn-secondary btn-sm">ก่อนหน้า</Link>}
        {current < totalPages && <Link href={pageHref(current + 1)} className="btn btn-secondary btn-sm">ถัดไป</Link>}
      </div>
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
