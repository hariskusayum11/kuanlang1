import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  getVerifiedHouseholds,
  type HouseholdListRow,
} from "@/lib/household/list";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ครัวเรือนที่ตรวจแล้ว" };
export const dynamic = "force-dynamic";

type SearchParams = {
  community?: string;
  tambon?: string;
  q?: string;
  page?: string;
};

// รายการครัวเรือนที่ผ่านการตรวจ (VERIFIED) — ค้น/กรอง/Export
// Privacy: แสดงเฉพาะฟิลด์โครงสร้าง (ไม่มี ชื่อ/เบอร์/พิกัด) — PII อยู่ที่หน้ารายละเอียด
export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // RBAC ฝั่ง server — ไม่มี household.view → /access-denied
  const ctx = await requirePermission(PERMISSIONS.HOUSEHOLD_VIEW);
  const sp = await searchParams;
  const filters = {
    communityId: sp.community || undefined,
    tambonId: sp.tambon || undefined,
    search: sp.q || undefined,
  };
  const page = Number.parseInt(sp.page ?? "1", 10) || 1;
  const result = await getVerifiedHouseholds(ctx, filters, page);

  const filterActive = Boolean(filters.communityId || filters.tambonId || filters.search);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const current = Math.min(result.page, totalPages);

  // เก็บตัวกรองไว้ใน query ของลิงก์ Export / เปลี่ยนหน้า
  const baseParams = new URLSearchParams();
  if (filters.communityId) baseParams.set("community", filters.communityId);
  if (filters.tambonId) baseParams.set("tambon", filters.tambonId);
  if (filters.search) baseParams.set("q", filters.search);
  const exportHref = `/households/export${baseParams.toString() ? `?${baseParams}` : ""}`;
  const pageHref = (p: number) => {
    const q = new URLSearchParams(baseParams);
    q.set("page", String(p));
    return `/households?${q}`;
  };

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="ครัวเรือนที่ตรวจแล้ว"
        tone="brand"
        description="รายการครัวเรือนที่ผ่านการตรวจสอบแล้ว (VERIFIED) — ค้นหา กรองตามชุมชน/ตำบล และส่งออกเป็น CSV"
        badge={
          <>
            <span className="live-dot" />
            ตรวจแล้ว {result.total.toLocaleString("th-TH")} ครัวเรือน
          </>
        }
        actions={
          result.total > 0 ? (
            <a href={exportHref} className="btn btn-accent btn-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ส่งออก CSV
            </a>
          ) : undefined
        }
      />

      {/* ตัวกรอง — ฟอร์ม GET ล้วน ไม่ใช้ JS (Server Component) */}
      <form className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-[2] space-y-1">
          <span className="text-xs font-bold text-slate-600">ค้นหา (รหัสใบ / บ้านเลขที่)</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="เช่น SK-000123 หรือ 45/2"
            className="field"
          />
        </label>
        <FilterSelect
          name="community"
          label="ชุมชน"
          value={filters.communityId}
          options={result.filterOptions.communities.map((c) => ({ value: c.id, label: c.nameTh }))}
        />
        <FilterSelect
          name="tambon"
          label="ตำบล"
          value={filters.tambonId}
          options={result.filterOptions.tambons.map((t) => ({ value: t.id, label: t.nameTh }))}
        />
        <button type="submit" className="btn btn-primary btn-md">
          กรองข้อมูล
        </button>
        {filterActive && (
          <Link href="/households" className="btn btn-ghost btn-md">
            ล้างตัวกรอง
          </Link>
        )}
      </form>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายการครัวเรือน"
            tone="mint"
            aside={
              result.total > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {result.total.toLocaleString("th-TH")} รายการ
                </span>
              ) : undefined
            }
          />
        </div>

        {result.rows.length === 0 ? (
          <EmptyState
            mood={filterActive ? "sleep" : "happy"}
            tone={filterActive ? "sun" : "mint"}
            title={filterActive ? "ไม่มีครัวเรือนที่ตรงกับตัวกรอง" : "ยังไม่มีครัวเรือนที่ตรวจแล้ว"}
            description={
              filterActive
                ? "ลองล้างตัวกรองเพื่อดูครัวเรือนที่ตรวจแล้วทั้งหมด"
                : "เมื่อ Verifier ยืนยันใบที่คีย์แล้ว ครัวเรือนนั้นจะปรากฏที่นี่"
            }
          />
        ) : (
          <>
            <HouseholdTable rows={result.rows} canOpen={ctx.permissions.includes(PERMISSIONS.VERIFICATION_VIEW)} />
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t-2 border-slate-100 bg-slate-50/40 px-6 py-3.5">
                <span className="text-xs font-medium tabular-nums text-slate-500">
                  หน้า {current.toLocaleString("th-TH")} / {totalPages.toLocaleString("th-TH")}
                </span>
                <div className="flex gap-2">
                  {current > 1 && (
                    <Link href={pageHref(current - 1)} className="btn btn-secondary btn-sm">
                      ก่อนหน้า
                    </Link>
                  )}
                  {current < totalPages && (
                    <Link href={pageHref(current + 1)} className="btn btn-secondary btn-sm">
                      ถัดไป
                    </Link>
                  )}
                </div>
              </div>
            )}
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

function formatAddress(r: HouseholdListRow): string {
  const parts = [
    r.houseNo ? `บ้านเลขที่ ${r.houseNo}` : null,
    r.mooNo != null ? `หมู่ ${r.mooNo}` : null,
    r.soi ? `ซ.${r.soi}` : null,
    r.road ? `ถ.${r.road}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function HouseholdTable({ rows, canOpen }: { rows: HouseholdListRow[]; canOpen: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[940px] text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <th className="py-2.5 pl-6 pr-4">ใบ</th>
            <th className="py-2.5 pr-4">ชุมชน / ตำบล</th>
            <th className="py-2.5 pr-4">ที่อยู่ (ตามกระดาษ)</th>
            <th className="py-2.5 pr-4 text-center">สมาชิก</th>
            <th className="py-2.5 pr-4 text-center">เปราะบาง</th>
            <th className="py-2.5 pr-4">บันทึกโดย</th>
            <th className="py-2.5 pr-4">ตรวจโดย</th>
            <th className="py-2.5 pr-6 text-right">การทำงาน</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => (
            <tr key={r.householdId} className="transition-colors hover:bg-brand-50/50">
              <td className="py-2.5 pl-6 pr-4 font-mono text-xs font-bold text-slate-700">{r.sheetNo}</td>
              <td className="py-2.5 pr-4">
                <span className="font-semibold text-slate-800">{r.communityName}</span>
                {r.tambonName && <span className="block text-xs text-slate-400">ต.{r.tambonName}</span>}
              </td>
              <td className="py-2.5 pr-4 text-slate-600">{formatAddress(r)}</td>
              <td className="py-2.5 pr-4 text-center tabular-nums text-slate-600">
                {r.memberCount != null ? r.memberCount.toLocaleString("th-TH") : "—"}
              </td>
              <td className="py-2.5 pr-4 text-center tabular-nums">
                {r.vulnerableCount > 0 ? (
                  <span className="font-semibold text-slate-700">{r.vulnerableCount} คน</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                <span className="text-slate-700">{r.enteredByName}</span>
                <span className="block text-xs tabular-nums text-slate-400">
                  {r.enteredAt.toLocaleDateString("th-TH")}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <span className="text-slate-700">{r.verifiedByName ?? "—"}</span>
                {r.verifiedAt && (
                  <span className="block text-xs tabular-nums text-slate-400">
                    {r.verifiedAt.toLocaleDateString("th-TH")}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-6 text-right">
                {canOpen ? (
                  <Link href={`/verification/${r.householdId}`} className="btn btn-secondary btn-sm">
                    ดู
                  </Link>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
