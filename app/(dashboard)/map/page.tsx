import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { getHouseholdLayerMap, type HouseholdMapFilters } from "@/lib/geo/household-layer-map";
import { HouseholdLayerMap } from "@/components/geo/household-layer-map";
import { getSystemPreferences } from "@/lib/settings/core";
import {
  canManageImportantSites,
  getImportantSites,
  IMPORTANT_SITE_TYPES,
  type ImportantSitePoint,
} from "@/lib/geo/important-sites";
import { saveImportantSiteAction } from "@/lib/geo/important-site-actions";
import { DeleteImportantSiteForm } from "@/components/geo/delete-important-site-form";
import { dateRangeError } from "@/lib/household/trusted-where";
import { ThaiDateRangeFields } from "@/components/report/thai-date-range-filter";

export const metadata = { title: "แผนที่ข้อมูลพื้นที่" };
export const dynamic = "force-dynamic";

type SearchParams = {
  community?: string; tambon?: string; from?: string; to?: string;
  siteSaved?: string; siteDeleted?: string; siteError?: string;
};

export default async function SurveyMapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePermission(PERMISSIONS.MAP_VIEW);
  const sp = await searchParams;
  const filters: HouseholdMapFilters = {
    communityId: sp.community || undefined,
    tambonId: sp.tambon || undefined,
    dateFrom: sp.from || undefined,
    dateTo: sp.to || undefined,
  };
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  const [householdMap, preferences, sites] = await Promise.all([
    getHouseholdLayerMap(ctx, filters),
    getSystemPreferences(),
    getImportantSites(filters.communityId),
  ]);
  const center = householdMap.points.length
    ? householdMap.center
    : sites.length
      ? { lat: sites.reduce((sum, site) => sum + site.lat, 0) / sites.length, lng: sites.reduce((sum, site) => sum + site.lng, 0) / sites.length }
      : { lat: preferences.mapDefaultLat, lng: preferences.mapDefaultLng };
  const canManage = canManageImportantSites(ctx);

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="แผนที่ข้อมูลพื้นที่"
        tone="brand"
        description="ดูบ้านกลุ่มเปราะบาง ทักษะผู้สนใจเป็นอาสาสมัคร บ้านพักพิง จุดสำคัญในพื้นที่ และฮีตแมประดับน้ำจากแบบสอบถามที่ตรวจแล้ว"
        badge={<>จุดบ้าน {householdMap.points.length.toLocaleString("th-TH")} · จุดสำคัญ {sites.length.toLocaleString("th-TH")}</>}
      />

      {sp.siteSaved ? <Notice tone="success">บันทึกจุดสำคัญแล้ว</Notice> : null}
      {sp.siteDeleted ? <Notice tone="warning">ลบจุดสำคัญออกจากระบบแล้ว ไม่สามารถกู้คืนจากหน้านี้ได้</Notice> : null}
      {sp.siteError ? <Notice tone="error">{sp.siteError}</Notice> : null}

      <MapFilters filters={filters} options={householdMap.options} />
      {filterError ? <Notice tone="error">ช่วงวันที่ไม่ถูกต้อง: {filterError} กรุณาแก้วันที่แล้วกด “แสดงผล” อีกครั้ง</Notice> : null}

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="แผนที่ปฏิบัติการ" tone="alert" />
          <p className="mt-1 text-xs text-slate-500">ข้อมูลบ้านใช้เฉพาะใบที่ตรวจแล้ว ไม่ถูกลบหรือยืนยันว่าเป็นใบซ้ำ แสดงที่อยู่สำหรับระบุจุดและนำทาง แต่ไม่แสดงชื่อหรือเบอร์โทรศัพท์</p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b-2 border-slate-100 p-4 md:grid-cols-3 xl:grid-cols-6">
          <MapMetric label="มีกลุ่มเปราะบาง" value={householdMap.totals.vulnerable} />
          <MapMetric label="สนใจเป็นอาสาสมัคร" value={householdMap.totals.volunteer} />
          <MapMetric label="บ้านพักพิงเบื้องต้น" value={householdMap.totals.hostHouse} />
          <MapMetric label="มีข้อมูลระดับน้ำ" value={householdMap.totals.floodDepth} />
          <MapMetric label="จุดสำคัญพื้นที่" value={sites.length} unit="จุด" />
          <MapMetric label="ไม่มีพิกัด" value={householdMap.missingCoordinates.uniqueHouseholds} warning />
        </div>
        <HouseholdLayerMap
          points={householdMap.points}
          sites={sites}
          availableVolunteerSkills={householdMap.options.volunteerSkills}
          center={center}
          defaultZoom={preferences.mapDefaultZoom}
        />
        <div className="border-t-2 border-slate-100 bg-sun-50/60 px-5 py-3 text-xs text-slate-600">
          ไม่มีพิกัด: กลุ่มเปราะบาง {householdMap.missingCoordinates.vulnerable.toLocaleString("th-TH")} หลัง · ผู้สนใจอาสาสมัคร {householdMap.missingCoordinates.volunteer.toLocaleString("th-TH")} หลัง · จุดพักพิง {householdMap.missingCoordinates.hostHouse.toLocaleString("th-TH")} หลัง · มีระดับน้ำ {householdMap.missingCoordinates.floodDepth.toLocaleString("th-TH")} หลัง
        </div>
      </section>

      {canManage ? <ImportantSiteManager sites={sites} communities={householdMap.options.communities} /> : null}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        ฮีตแมปใช้ระดับน้ำสูงสุดจริงจากช่อง “เมตร + เซนติเมตร” ของแต่ละครัวเรือน แล้วแสดงผลเป็นเมตร จุดที่อยู่ใกล้กันจะซ้อนสีเข้มขึ้น จึงใช้ดูแนวโน้มพื้นที่ได้ แต่ไม่ใช่แบบจำลองระดับน้ำหรือขอบเขตน้ำท่วมทางวิศวกรรม
      </p>
    </div>
  );
}

function ImportantSiteManager({ sites, communities }: { sites: ImportantSitePoint[]; communities: { id: string; label: string }[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4"><SectionTitle title="จัดการจุดสำคัญบนแผนที่" tone="mint" /><p className="mt-1 text-xs text-slate-500">เฉพาะผู้ดูแลระบบ เพิ่มโรงเรียน วัด/มัสยิด ศูนย์อพยพ และพื้นที่สำคัญอื่นได้</p></div>
      <div className="grid gap-6 p-5 xl:grid-cols-[1fr_1.25fr]">
        <form action={saveImportantSiteAction} className="rounded-2xl border-2 border-brand-100 bg-brand-50/30 p-4">
          <h3 className="mb-4 font-bold text-slate-800">เพิ่มจุดใหม่</h3>
          <SiteFields communities={communities} />
          <button type="submit" className="btn btn-primary mt-4 w-full">เพิ่มจุดบนแผนที่</button>
        </form>
        <div>
          <h3 className="mb-3 font-bold text-slate-800">รายการปัจจุบัน ({sites.length.toLocaleString("th-TH")})</h3>
          {sites.length ? <div className="space-y-2">{sites.map((site) => (
            <details key={site.id} className="rounded-xl border-2 border-slate-100 bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">{site.name} <span className="ml-2 text-xs font-normal text-slate-400">{site.communityName} · {siteTypeLabel(site.type)}</span></summary>
              <div className="border-t border-slate-100 p-4">
                <form action={saveImportantSiteAction}>
                  <input type="hidden" name="id" value={site.id} />
                  <SiteFields communities={communities} site={site} />
                  <button type="submit" className="btn btn-primary mt-4">บันทึกการแก้ไข</button>
                </form>
                <DeleteImportantSiteForm id={site.id} name={site.name} />
              </div>
            </details>
          ))}</div> : <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-400">ยังไม่มีจุดสำคัญ</p>}
        </div>
      </div>
    </section>
  );
}

function SiteFields({ communities, site }: { communities: { id: string; label: string }[]; site?: ImportantSitePoint }) {
  const field = "mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm";
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-bold text-slate-600">ชื่อจุด<input required maxLength={150} name="name" defaultValue={site?.name} className={field} placeholder="เช่น โรงเรียนบ้านคลอง" /></label>
    <label className="text-xs font-bold text-slate-600">ประเภท<select required name="type" defaultValue={site?.type ?? "SCHOOL"} className={field}>{IMPORTANT_SITE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-600">ชุมชน<select required name="communityId" defaultValue={site?.communityId ?? ""} className={field}><option value="" disabled>เลือกชุมชน</option>{communities.map((community) => <option key={community.id} value={community.id}>{community.label}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-600">ความจุ (คน)<input min={0} step={1} type="number" name="capacity" defaultValue={site?.capacity ?? ""} className={field} /></label>
    <label className="text-xs font-bold text-slate-600">ละติจูด<input required step="any" type="number" name="latitude" defaultValue={site?.lat} className={field} placeholder="7.0075" /></label>
    <label className="text-xs font-bold text-slate-600">ลองจิจูด<input required step="any" type="number" name="longitude" defaultValue={site?.lng} className={field} placeholder="100.4200" /></label>
    <label className="text-xs font-bold text-slate-600 sm:col-span-2">ที่อยู่/รายละเอียด<input maxLength={500} name="address" defaultValue={site?.address ?? ""} className={field} /></label>
  </div>;
}

function siteTypeLabel(type: ImportantSitePoint["type"]) { return IMPORTANT_SITE_TYPES.find((item) => item.value === type)?.label ?? "จุดสำคัญ"; }

function Notice({ tone, children }: { tone: "success" | "warning" | "error"; children: React.ReactNode }) {
  const cls = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800";
  return <div className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold ${cls}`}>{children}</div>;
}

function MapFilters({ filters, options }: { filters: HouseholdMapFilters; options: { communities: { id: string; label: string }[]; tambons: { id: string; label: string }[] } }) {
  const input = "mt-1 block w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm";
  return <form method="get" className="card p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">ตัวกรองข้อมูลแผนที่</h2><p className="text-xs text-slate-500">มีผลกับจุดบ้านและฮีตแมป จุดสำคัญกรองตามชุมชน</p></div><a href="/map" className="text-sm font-semibold text-brand-700 hover:underline">ล้างตัวกรอง</a></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    <label className="text-xs font-bold text-slate-600">ชุมชน<select name="community" defaultValue={filters.communityId ?? ""} className={input}><option value="">ทุกชุมชน</option>{options.communities.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-600">ตำบล<select name="tambon" defaultValue={filters.tambonId ?? ""} className={input}><option value="">ทุกตำบล</option>{options.tambons.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <ThaiDateRangeFields
      from={filters.dateFrom}
      to={filters.dateTo}
      fromLabel="ตั้งแต่วันที่สำรวจ"
      toLabel="ถึงวันที่สำรวจ"
    />
    <button type="submit" className="btn btn-primary self-end py-2.5">แสดงผล</button>
  </div></form>;
}

function MapMetric({ label, value, warning = false, unit = "หลัง" }: { label: string; value: number; warning?: boolean; unit?: string }) {
  return <div className="rounded-xl border-2 border-slate-100 bg-white px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-xl font-bold tabular-nums ${warning ? "text-sun-800" : "text-brand-700"}`}>{value.toLocaleString("th-TH")} <span className="text-xs font-medium text-slate-400">{unit}</span></p></div>;
}
