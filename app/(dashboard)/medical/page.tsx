import Link from "next/link";
import { EmptyState, PageHero, SectionTitle } from "@/components/layout/page-hero";
import { TRIAGE_EXAMPLE, type TriageCode } from "@/domain/triage";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getMedicalCases, type MedicalCaseRow } from "@/lib/medical/cases";
import { getRulesPageData } from "@/lib/rules/core";
import { TriageRulesPanel } from "@/components/rules/page-rules-panels";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

export const metadata = { title: "ข้อมูลสุขภาพและกลุ่มเปราะบาง" };
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  community?: string;
  tambon?: string;
  triage?: string;
  type?: string;
  page?: string;
  size?: string;
};

export default async function MedicalCasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePermission(PERMISSIONS.MEDICAL_CASE_VIEW);
  const sp = await searchParams;
  const triage = isTriageFilter(sp.triage) ? sp.triage : undefined;
  const filters = {
    search: sp.q?.trim() || undefined,
    communityId: sp.community || undefined,
    tambonId: sp.tambon || undefined,
    vulnerabilityTypeId: sp.type || undefined,
    triage,
  };
  const [result, rules] = await Promise.all([getMedicalCases(ctx, filters, sp.page, sp.size), getRulesPageData(ctx)]);
  if (!result) return null;

  const filterActive = Boolean(
    filters.search || filters.communityId || filters.tambonId || filters.vulnerabilityTypeId || filters.triage,
  );
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const baseParams = new URLSearchParams();
  if (filters.search) baseParams.set("q", filters.search);
  if (filters.communityId) baseParams.set("community", filters.communityId);
  if (filters.tambonId) baseParams.set("tambon", filters.tambonId);
  if (filters.vulnerabilityTypeId) baseParams.set("type", filters.vulnerabilityTypeId);
  if (filters.triage) baseParams.set("triage", filters.triage);
  baseParams.set("size", String(result.pageSize));
  const pageHref = (page: number) => {
    const query = new URLSearchParams(baseParams);
    query.set("page", String(page));
    return `/medical?${query}`;
  };

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="ข้อมูลสุขภาพและกลุ่มเปราะบาง"
        tone="brand"
        description="ทะเบียนสำหรับผู้บริหาร/แพทย์ แสดงเฉพาะข้อมูลที่ตรวจแล้ว อ่านอย่างเดียว และบันทึกประวัติการเข้าดู"
        badge={<>กลุ่มเปราะบาง {format(result.total)} คน</>}
        actions={(
          <>
            {ctx.permissions.includes(PERMISSIONS.MEDICAL_MAP_VIEW) && (
              <Link href="/map" className="btn btn-secondary btn-md">ดูบนแผนที่</Link>
            )}
            {ctx.permissions.includes(PERMISSIONS.MEDICAL_REPORT_EXPORT) && result.total > 0 && (
              <a href="/reports/vulnerable-export" className="btn btn-accent btn-md">ส่งออก Excel</a>
            )}
          </>
        )}
      />

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950">
        <p className="font-bold">ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหว</p>
        <p>ใช้เพื่อวางแผนช่วยเหลือเท่านั้น ห้ามเผยแพร่รายชื่อ เบอร์โทร หรือที่อยู่โดยไม่มีเหตุจำเป็น</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="ทั้งหมด" value={result.summary.total} tone="brand" />
        <StatCard label="วิกฤต" detail={TRIAGE_EXAMPLE.P1} value={result.summary.critical} tone="danger" />
        <StatCard label="เร่งด่วน" detail={TRIAGE_EXAMPLE.P2} value={result.summary.urgent} tone="warning" />
        <StatCard label="เฝ้าระวัง" detail={TRIAGE_EXAMPLE.P3} value={result.summary.watch} tone="success" />
        <StatCard label="ยังไม่ประเมิน" value={result.summary.unassessed} tone="neutral" />
        <StatCard label="ต้องการดูแลใจ" value={result.summary.mentalHealth} tone="violet" />
      </div>

      {/* เกณฑ์ที่ใช้จัดระดับ — เห็นบนหน้าที่ใช้จริง แก้ได้เฉพาะ ADMIN (docs/40) */}
      {rules ? <TriageRulesPanel data={rules} /> : null}

      <form className="card grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
        <input type="hidden" name="size" value={result.pageSize} />
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-bold text-slate-600">ค้นหา</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.search ?? ""}
            placeholder="ชื่อ เบอร์โทร รหัสใบ หรือที่อยู่"
            className="field"
          />
        </label>
        <FilterSelect
          name="community"
          label="ชุมชน"
          value={filters.communityId}
          options={result.options.communities.map((item) => ({ value: item.id, label: item.nameTh }))}
        />
        <FilterSelect
          name="tambon"
          label="ตำบล"
          value={filters.tambonId}
          options={result.options.tambons.map((item) => ({ value: item.id, label: item.nameTh }))}
        />
        <FilterSelect
          name="triage"
          label="ความเร่งด่วน"
          value={filters.triage}
          options={[
            { value: "P1", label: "วิกฤต" },
            { value: "P2", label: "เร่งด่วน" },
            { value: "P3", label: "เฝ้าระวัง" },
            { value: "UNASSESSED", label: "ยังไม่ประเมิน" },
          ]}
        />
        <FilterSelect
          name="type"
          label="ลักษณะเปราะบาง"
          value={filters.vulnerabilityTypeId}
          options={result.options.vulnerabilityTypes.map((item) => ({ value: item.id, label: item.nameTh }))}
        />
        <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-6">
          <button type="submit" className="btn btn-primary btn-md">แสดงผล</button>
          {filterActive && <Link href="/medical" className="btn btn-secondary btn-md">ล้างตัวกรอง</Link>}
        </div>
      </form>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายชื่อที่ต้องติดตาม"
            tone="alert"
            aside={<span className="badge badge-neutral tabular-nums">{format(result.total)} คน</span>}
          />
        </div>

        {!result.rows.length ? (
          <EmptyState
            mood="sleep"
            tone="sun"
            title={filterActive ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง" : "ยังไม่มีข้อมูลที่ตรวจแล้ว"}
            description={filterActive ? "ลองล้างหรือเปลี่ยนตัวกรองเพื่อค้นหาใหม่" : "ข้อมูลจะปรากฏเมื่อแบบสอบถามผ่านการตรวจสอบ"}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-left text-sm">
                <thead className="border-b-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">ความเร่งด่วน</th>
                    <th className="px-5 py-3">บุคคล</th>
                    <th className="px-5 py-3">ลักษณะเปราะบาง</th>
                    <th className="px-5 py-3">ความช่วยเหลือ</th>
                    <th className="px-5 py-3">ที่อยู่</th>
                    <th className="px-5 py-3">ติดต่อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((row) => <MedicalRow key={row.personId} row={row} />)}
                </tbody>
              </table>
            </div>

            {(totalPages > 1 || result.total > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-slate-100 bg-slate-50/40 px-6 py-3.5">
                <span className="text-xs font-medium tabular-nums text-slate-500">
                  หน้า {format(result.page)} / {format(totalPages)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <form>
                    {[...baseParams.entries()].filter(([key]) => key !== "size" && key !== "page").map(([key, value]) => (
                      <input key={key} type="hidden" name={key} value={value} />
                    ))}
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      แสดง
                      <select name="size" defaultValue={result.pageSize} className="field !h-9 !w-20 !py-1" aria-label="จำนวนรายการต่อหน้า">
                        {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <button type="submit" className="btn btn-secondary btn-sm">ใช้</button>
                    </label>
                  </form>
                  {result.page > 1 && <Link href={pageHref(result.page - 1)} className="btn btn-secondary btn-sm">ก่อนหน้า</Link>}
                  {result.page < totalPages && <Link href={pageHref(result.page + 1)} className="btn btn-secondary btn-sm">ถัดไป</Link>}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {result.truncated && (
        <p className="text-xs text-amber-700">ข้อมูลเกิน 5,000 คน โปรดใช้ตัวกรองเพื่อจำกัดผลลัพธ์ก่อนค้นหา</p>
      )}
    </div>
  );
}

function MedicalRow({ row }: { row: MedicalCaseRow }) {
  return (
    <tr className="align-top hover:bg-brand-50/30">
      <td className="px-5 py-4"><TriageBadge level={row.triage} /></td>
      <td className="px-5 py-4">
        <p className="font-bold text-slate-900">{row.fullName || "ไม่ระบุชื่อ"}</p>
        <p className="mt-1 text-xs text-slate-500">อายุ {row.ageText || "ไม่ระบุ"} · ใบ {row.sheetNo}</p>
      </td>
      <td className="max-w-[280px] px-5 py-4 leading-relaxed text-slate-700">{row.vulnerabilities || "ไม่ระบุรายละเอียด"}</td>
      <td className="max-w-[280px] px-5 py-4 leading-relaxed text-slate-700">
        <p>{row.assistance || "ยังไม่ระบุความช่วยเหลือ"}</p>
        {row.mentalHealthSupport === true && <span className="badge mt-2 bg-violet-100 text-violet-800">ต้องการดูแลสุขภาพจิต</span>}
      </td>
      <td className="max-w-[260px] px-5 py-4 leading-relaxed text-slate-700">
        <p>{row.address || "ไม่ระบุที่อยู่"}</p>
        <p className="mt-1 text-xs text-slate-500">{row.community}{row.tambon ? ` · ตำบล${row.tambon}` : ""}</p>
        {row.mapsUrl && <a href={row.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex font-bold text-brand-700 hover:underline">เปิด Google Maps ↗</a>}
      </td>
      <td className="px-5 py-4">
        {row.phone ? <a href={`tel:${row.phone}`} className="font-bold text-brand-700 hover:underline">{row.phone}</a> : <span className="text-slate-400">ไม่ระบุ</span>}
      </td>
    </tr>
  );
}

function TriageBadge({ level }: { level: TriageCode | null }) {
  const style = level === "P1"
    ? "bg-red-100 text-red-800"
    : level === "P2"
      ? "bg-amber-100 text-amber-800"
      : level === "P3"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-slate-100 text-slate-600";
  const label = level === "P1" ? "วิกฤต" : level === "P2" ? "เร่งด่วน" : level === "P3" ? "เฝ้าระวัง" : "ยังไม่ประเมิน";
  return <span className={`badge whitespace-nowrap ${style}`}>{label}</span>;
}

function StatCard({
  label,
  detail,
  value,
  tone,
}: {
  label: string;
  detail?: string;
  value: number;
  tone: "brand" | "danger" | "warning" | "success" | "neutral" | "violet";
}) {
  const color = {
    brand: "text-brand-700",
    danger: "text-red-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
    neutral: "text-slate-600",
    violet: "text-violet-700",
  }[tone];
  return (
    <div className="card min-w-0 p-4" title={detail}>
      <p className="text-sm font-bold text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{format(value)}</p>
      {detail && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{detail}</p>}
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
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="field">
        <option value="">ทั้งหมด</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function isTriageFilter(value?: string): value is TriageCode | "UNASSESSED" {
  return value === "P1" || value === "P2" || value === "P3" || value === "UNASSESSED";
}

function format(value: number): string {
  return value.toLocaleString("th-TH");
}
