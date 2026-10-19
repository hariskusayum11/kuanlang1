"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdLayerPoint, VolunteerMapSkill } from "@/lib/geo/household-layer-map";
import type { ImportantSitePoint } from "@/lib/geo/important-sites";
import type { CommunityBoundaryShape } from "@/lib/geo/community-boundaries";
import type { CommunityMapSummary } from "@/lib/geo/community-map-summary";
import {
  countActiveLayers,
  HOUSEHOLD_LAYER_KEYS,
  mapViewHref,
  type BaseMapKey,
  type HouseholdLayerKey,
  type MapViewState,
} from "@/lib/geo/map-view-state";
import { ThaiDateRangeFields } from "@/components/report/thai-date-range-filter";
import {
  belongsToLayer,
  HEATMAP_ICON_PATH,
  HOUSEHOLD_LAYERS,
  HouseholdLayerMap,
  LayerIcon,
  SITE_STYLE,
  siteTypeKey,
  skillStyle,
} from "./household-layer-map";
import { ImportantSiteManager, SiteSymbol, type SiteManagerResult } from "./important-site-manager";
import { FLOOD_DEPTH_BINS, heatVar } from "@/domain/flood/depth-scale";
import { MAP_URGENCY_LABELS, MAP_URGENCY_ORDER } from "@/domain/geo/map-urgency";

type Option = { id: string; label: string };
type SiteTypeOption = { value: string; label: string };
type Totals = { vulnerable: number; volunteer: number; hostHouse: number; floodDepth: number };
type Missing = Totals & { uniqueHouseholds: number };

// ไอคอนฮีตแมปใช้สีระดับกลางของสเกลเดียวกับที่วาดบนแผนที่
const HEAT_LAYER = { key: "heat" as const, label: "ฮีตแมประดับน้ำสูงสุด", color: "var(--heat-6)", iconPath: HEATMAP_ICON_PATH };

const nf = (value: number) => value.toLocaleString("th-TH");

/**
 * พื้นที่ทำงานของหน้าแผนที่: แผนที่เต็มความสูง + แผง "ชั้นข้อมูล" + คำอธิบายสัญลักษณ์
 *
 * สถานะสองแบบ:
 *  - พื้นที่/ช่วงวันที่ → ต้องดึงข้อมูลใหม่จาก server จึงเปลี่ยน URL ด้วย router.replace
 *    (มีผลทันทีที่เลือก ไม่ต้องกดปุ่ม "แสดงผล")
 *  - ชั้นข้อมูล/แผนที่พื้นฐาน/ทักษะ → กรองฝั่ง client จากข้อมูลที่ได้รับสิทธิ์อยู่แล้ว
 *    เขียน URL ด้วย history.replaceState (ไม่โหลดข้อมูลซ้ำ ไม่เพิ่ม Audit Log ทุกคลิก)
 *  ทั้งสองแบบอยู่ใน URL เพื่อให้ส่งลิงก์ต่อแล้วเห็นมุมมองเดียวกัน
 */
export function MapWorkspace({
  view,
  siteTypeOptions,
  points,
  sites,
  boundaries,
  communitySummaries,
  summaryGeneratedAt,
  volunteerSkills,
  communities,
  tambons,
  totals,
  missingCoordinates,
  center,
  defaultZoom,
  filterError,
  canManageSites,
}: {
  view: MapViewState;
  siteTypeOptions: SiteTypeOption[];
  points: HouseholdLayerPoint[];
  sites: ImportantSitePoint[];
  boundaries: CommunityBoundaryShape[];
  communitySummaries: Record<string, CommunityMapSummary>;
  summaryGeneratedAt: string;
  volunteerSkills: VolunteerMapSkill[];
  communities: Option[];
  tambons: Option[];
  totals: Totals;
  missingCoordinates: Missing;
  center: { lat: number; lng: number };
  defaultZoom: number;
  filterError: string | null;
  canManageSites: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const allSiteTypes = useMemo(() => siteTypeOptions.map((type) => type.value), [siteTypeOptions]);
  const siteTypeLabels = useMemo(() => Object.fromEntries(siteTypeOptions.map((type) => [type.value, type.label])), [siteTypeOptions]);

  // ชั้นข้อมูลฝั่ง client — ตั้งต้นจาก URL ครั้งเดียว
  const [base, setBase] = useState<BaseMapKey>(view.base);
  const [layers, setLayers] = useState<HouseholdLayerKey[]>(view.layers);
  const [skill, setSkill] = useState(view.skill ?? "");
  const [siteTypes, setSiteTypes] = useState<string[]>(view.siteTypes);
  const [showBoundaries, setShowBoundaries] = useState(view.boundaries);
  const hasDraftBoundary = boundaries.some((boundary) => !boundary.isApproved);

  // พื้นที่: แสดงค่าที่เพิ่งเลือกทันทีระหว่างรอ server แล้วกลับไปเชื่อค่าจาก server เมื่อมาถึง
  const [area, setArea] = useState({ communityId: view.communityId ?? "", tambonId: view.tambonId ?? "" });
  useEffect(() => {
    setArea({ communityId: view.communityId ?? "", tambonId: view.tambonId ?? "" });
  }, [view.communityId, view.tambonId]);

  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [toast, setToast] = useState<SiteManagerResult | null>(
    filterError ? { tone: "error", text: `ช่วงวันที่ไม่ถูกต้อง: ${filterError} — แก้ได้ที่ “ตัวกรองขั้นสูง” ในแผงชั้นข้อมูล` } : null,
  );
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const [managerCenter, setManagerCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const wide = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(desktop.matches);
    // จอแคบ: คำอธิบายสัญลักษณ์เริ่มแบบย่อ ไม่ให้บังแผนที่ครึ่งจอ
    setLegendOpen(wide.matches);
    const onChange = () => setIsDesktop(desktop.matches);
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentState = useCallback(
    (patch: Partial<MapViewState> = {}): MapViewState => ({
      communityId: view.communityId,
      tambonId: view.tambonId,
      dateFrom: view.dateFrom,
      dateTo: view.dateTo,
      base,
      layers,
      skill: skill || undefined,
      siteTypes,
      boundaries: showBoundaries,
      ...patch,
    }),
    [view.communityId, view.tambonId, view.dateFrom, view.dateTo, base, layers, skill, siteTypes, showBoundaries],
  );

  // เขียนชั้นข้อมูลลง URL โดยไม่โหลดหน้าใหม่
  useEffect(() => {
    const href = mapViewHref(currentState(), allSiteTypes);
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.replaceState(null, "", href);
    }
  }, [currentState, allSiteTypes]);

  // ลิงก์ในกล่องข้อมูลชุมชน — คงชั้นข้อมูลที่เปิดอยู่ ล้างตำบลเพราะชุมชนหนึ่งครอบคลุมได้หลายตำบล
  const communityFilterHref = useCallback(
    (communityId: string) => mapViewHref(currentState({ communityId, tambonId: undefined }), allSiteTypes),
    [currentState, allSiteTypes],
  );

  const navigateArea = (patch: Partial<Pick<MapViewState, "communityId" | "tambonId" | "dateFrom" | "dateTo">>) => {
    const href = mapViewHref(currentState(patch), allSiteTypes);
    startTransition(() => router.replace(href, { scroll: false }));
  };

  // ---- จำนวนกำกับแต่ละชั้น (นับเฉพาะจุดที่มีพิกัดบนแผนที่) ----
  const layerCounts = useMemo(() => {
    const counts = {} as Record<HouseholdLayerKey, number>;
    for (const key of HOUSEHOLD_LAYER_KEYS) counts[key] = points.filter((point) => belongsToLayer(point, key, key === "volunteer" ? skill : "")).length;
    return counts;
  }, [points, skill]);
  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of points) for (const item of point.volunteerSkills) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
    return counts;
  }, [points]);
  const siteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const site of sites) counts.set(siteTypeKey(site), (counts.get(siteTypeKey(site)) ?? 0) + 1);
    return counts;
  }, [sites]);
  const { active: activeCount, total: totalCount } = countActiveLayers({ layers, siteTypes, boundaries: showBoundaries }, allSiteTypes);
  const visibleSkillList = useMemo(
    () => volunteerSkills.filter((item) => (skillCounts.get(item.code) ?? 0) > 0 && (!skill || item.code === skill)),
    [volunteerSkills, skillCounts, skill],
  );

  const toggleLayer = (key: HouseholdLayerKey, on: boolean) =>
    setLayers((old) => HOUSEHOLD_LAYER_KEYS.filter((item) => (item === key ? on : old.includes(item))));
  const toggleSiteType = (type: string, on: boolean) =>
    setSiteTypes((old) => allSiteTypes.filter((item) => (item === type ? on : old.includes(item))));

  const hasAreaFilter = Boolean(view.communityId || view.tambonId || view.dateFrom || view.dateTo);
  const fitKey = `${view.communityId ?? ""}|${view.tambonId ?? ""}|${view.dateFrom ?? ""}|${view.dateTo ?? ""}`;
  const noData = points.length === 0 && sites.length === 0;

  const openManager = () => {
    setManagerCenter(mapCenterRef.current);
    setManagerOpen(true);
  };

  return (
    // ยืดเต็มพื้นที่ใต้ header (h-16) โดยหักระยะ padding ของ <main> ใน (dashboard)/layout.tsx
    // `isolate` ขัง z-index ของ Leaflet (400–1000) ไว้ในกล่องนี้ ไม่ให้ทับ header/modal ของระบบ
    // มือถือ: ยก attribution ของแผนที่ขึ้นพ้นแถบหัวของแผ่นด้านล่าง — ต้องใส่ `!` เพราะ leaflet.css
    // ไม่อยู่ใน cascade layer จึงชนะ utility ของ Tailwind เสมอถ้าไม่ important
    <div className="relative isolate -mx-5 -my-6 h-[calc(100dvh-4rem)] overflow-hidden bg-slate-100 md:-mx-8 md:-my-8 [&_.leaflet-bottom]:bottom-14! md:[&_.leaflet-bottom]:bottom-0!">
      <HouseholdLayerMap
        points={points}
        sites={sites}
        siteTypeLabels={siteTypeLabels}
        center={center}
        defaultZoom={defaultZoom}
        base={base}
        layers={layers}
        volunteerSkill={skill}
        siteTypes={siteTypes}
        boundaries={boundaries}
        communitySummaries={communitySummaries}
        summaryGeneratedAt={summaryGeneratedAt}
        communityFilterHref={communityFilterHref}
        showBoundaries={showBoundaries}
        selectedCommunityId={view.communityId}
        fitKey={fitKey}
        onCenterChange={(value) => { mapCenterRef.current = value; }}
      />

      {/* ปุ่มลอย: เพิ่ม/จัดการจุดสำคัญ (เฉพาะผู้มีสิทธิ์ — server ตรวจซ้ำทุกครั้ง) */}
      {canManageSites ? (
        <button type="button" onClick={openManager} className="btn btn-accent btn-sm absolute left-14 top-3 z-[1050] shadow-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          เพิ่มจุดสำคัญ
        </button>
      ) : null}

      {isPending ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-[1150] -translate-x-1/2 md:top-3" role="status">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-900/90 px-4 py-2 text-xs font-bold text-white shadow-md">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            กำลังโหลดข้อมูลพื้นที่…
          </span>
        </div>
      ) : null}

      {toast ? <Toast result={toast} onClose={() => setToast(null)} /> : null}

      {noData && !isPending ? (
        <div className="pointer-events-none absolute inset-0 z-[1040] grid place-items-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl border-2 border-slate-200 bg-white/95 p-5 text-center shadow-lg">
            <p className="font-bold text-slate-800">ไม่พบจุดบ้านหรือจุดสำคัญในพื้นที่ที่เลือก</p>
            <p className="mt-1 text-sm text-slate-500">
              แผนที่แสดงเฉพาะแบบสอบถามที่ตรวจแล้วและมีพิกัด
              {missingCoordinates.uniqueHouseholds ? ` (มีอีก ${nf(missingCoordinates.uniqueHouseholds)} หลังที่ยังไม่มีพิกัด)` : ""}
            </p>
            {hasAreaFilter ? (
              <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => navigateArea({ communityId: undefined, tambonId: undefined, dateFrom: undefined, dateTo: undefined })}>
                ล้างตัวกรองพื้นที่
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Legend
        open={legendOpen}
        onToggle={() => setLegendOpen((old) => !old)}
        totals={totals}
        missing={missingCoordinates}
        layers={layers}
        boundary={showBoundaries && boundaries.length ? { draft: hasDraftBoundary } : null}
        skills={visibleSkillList}
        siteTypes={siteTypeOptions.filter((type) => siteTypes.includes(type.value) && (siteCounts.get(type.value) ?? 0) > 0)}
      />

      {/* เปิดแผงกลับ (เดสก์ท็อป) */}
      {!panelOpen ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="btn btn-secondary btn-sm absolute right-3 top-3 z-[1100] hidden shadow-md md:inline-flex"
          aria-expanded={false}
          aria-controls="map-layer-panel"
        >
          <LayersGlyph />
          ชั้นข้อมูล <span className="badge badge-brand tabular-nums">{activeCount}/{totalCount}</span>
        </button>
      ) : null}

      <aside
        id="map-layer-panel"
        aria-label="ชั้นข้อมูลแผนที่"
        className={[
          "absolute z-[1100] flex flex-col overflow-hidden border-slate-200 bg-white shadow-lg",
          // มือถือ: แผ่นดึงขึ้นจากด้านล่าง (ยุบเหลือแถบหัว 3.5rem)
          "inset-x-0 bottom-0 max-h-[72%] rounded-t-2xl border-t-2 transition-transform duration-200 motion-reduce:transition-none",
          sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]",
          // เดสก์ท็อป: แผงลอยด้านขวา เว้นมุมล่างขวาให้ attribution ของแผนที่
          "md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:max-h-[calc(100%-3.5rem)] md:w-[340px] md:translate-y-0 md:rounded-2xl md:border-2",
          panelOpen ? "md:flex" : "md:hidden",
        ].join(" ")}
      >
        {/* หัวแผง: มือถือเป็นปุ่มดึงขึ้น/ลง · เดสก์ท็อปมีปุ่มพับ */}
        <button
          type="button"
          onClick={() => setSheetOpen((old) => !old)}
          className="flex h-14 shrink-0 flex-col items-center justify-center gap-1 px-4 md:hidden"
          aria-expanded={sheetOpen}
          aria-controls="map-layer-panel-body"
        >
          <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <LayersGlyph /> ชั้นข้อมูล
            <span className="badge badge-brand tabular-nums">เปิด {activeCount} จาก {totalCount} ชั้น</span>
            <span className="text-slate-400" aria-hidden="true">{sheetOpen ? "▾" : "▴"}</span>
          </span>
        </button>
        <div className="hidden shrink-0 items-center justify-between gap-2 border-b-2 border-slate-100 bg-mist px-4 py-3 md:flex">
          <div>
            <p className="flex items-center gap-2 font-bold text-slate-900"><LayersGlyph /> ชั้นข้อมูล</p>
            <p className="mt-0.5 text-xs text-slate-500">เปิด <b className="tabular-nums text-brand-700">{activeCount}</b> จาก <span className="tabular-nums">{totalCount}</span> ชั้น</p>
          </div>
          <button type="button" onClick={() => setPanelOpen(false)} className="btn btn-ghost btn-sm" aria-label="พับแผงชั้นข้อมูล" title="พับแผง">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            พับ
          </button>
        </div>

        <div
          id="map-layer-panel-body"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-4 md:pt-2"
          // แผ่นที่ยุบอยู่บนมือถือไม่ควรรับ Tab ไปยังช่องที่มองไม่เห็น
          inert={!isDesktop && !sheetOpen}
        >
          <Group title="แผนที่พื้นฐาน">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="เลือกแผนที่พื้นฐาน">
              {([["street", "ถนน"], ["satellite", "ดาวเทียม"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={base === key}
                  onClick={() => setBase(key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${base === key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Group>

          <Group
            title="พื้นที่"
            aside={hasAreaFilter ? (
              <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => navigateArea({ communityId: undefined, tambonId: undefined, dateFrom: undefined, dateTo: undefined })}>
                ล้าง
              </button>
            ) : null}
          >
            <div className="space-y-2">
              <div>
                <LayerRow
                  checked={showBoundaries}
                  onChange={setShowBoundaries}
                  icon={<BoundarySwatch draft={hasDraftBoundary} />}
                  label="เส้นขอบชุมชน"
                  count={boundaries.length}
                  unit="ชุมชน"
                />
                {hasDraftBoundary && showBoundaries ? (
                  <p className="ml-9 text-[11px] leading-snug text-sun-800">ร่างจากเจ้าของระบบ — ยังไม่รับรองเป็นแนวเขตทางการ</p>
                ) : null}
              </div>
              <label className="block text-xs font-bold text-slate-600">ชุมชน
                <select
                  value={area.communityId}
                  onChange={(event) => { setArea((old) => ({ ...old, communityId: event.target.value })); navigateArea({ communityId: event.target.value || undefined }); }}
                  className="field mt-1 py-2"
                >
                  <option value="">ทุกชุมชน</option>
                  {communities.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-600">ตำบล
                <select
                  value={area.tambonId}
                  onChange={(event) => { setArea((old) => ({ ...old, tambonId: event.target.value })); navigateArea({ tambonId: event.target.value || undefined }); }}
                  className="field mt-1 py-2"
                >
                  <option value="">ทุกตำบล</option>
                  {tambons.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <details className="group rounded-xl border-2 border-slate-100" open={Boolean(filterError || view.dateFrom || view.dateTo)}>
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold text-slate-600">
                  ตัวกรองขั้นสูง
                  <span className="flex items-center gap-1.5">
                    {view.dateFrom || view.dateTo ? <span className="badge badge-brand">ช่วงวันที่</span> : null}
                    <span className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
                  </span>
                </summary>
                <form
                  key={`${view.dateFrom ?? ""}|${view.dateTo ?? ""}`}
                  className="space-y-2 border-t-2 border-slate-100 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    navigateArea({
                      dateFrom: String(data.get("from") ?? "") || undefined,
                      dateTo: String(data.get("to") ?? "") || undefined,
                    });
                  }}
                >
                  <ThaiDateRangeFields from={view.dateFrom} to={view.dateTo} fromLabel="ตั้งแต่วันที่สำรวจ" toLabel="ถึงวันที่สำรวจ" />
                  {filterError ? <p role="alert" className="text-xs font-semibold text-red-700">{filterError}</p> : null}
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="btn btn-primary btn-sm flex-1">ใช้ช่วงวันที่</button>
                    {view.dateFrom || view.dateTo ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateArea({ dateFrom: undefined, dateTo: undefined })}>ล้างวันที่</button>
                    ) : null}
                  </div>
                </form>
              </details>
            </div>
          </Group>

          <Group
            title="ครัวเรือน"
            aside={<SelectAll onAll={() => setLayers([...HOUSEHOLD_LAYER_KEYS])} onNone={() => setLayers([])} />}
          >
            <div className="space-y-0.5">
              {HOUSEHOLD_LAYERS.map((layer) => (
                <div key={layer.key}>
                  <LayerRow
                    checked={layers.includes(layer.key)}
                    onChange={(on) => toggleLayer(layer.key, on)}
                    icon={<LayerIcon path={layer.iconPath} color={layer.color} />}
                    label={layer.label}
                    count={layerCounts[layer.key]}
                  />
                  {layer.key === "volunteer" && layers.includes("volunteer") ? (
                    <label className="mb-1 ml-9 block text-[11px] font-bold text-slate-500">ทักษะอาสาสมัคร
                      <select value={skill} onChange={(event) => setSkill(event.target.value)} className="field mt-1 py-1.5 text-xs">
                        <option value="">ทุกทักษะ ({nf(points.filter((point) => point.volunteerSkills.length > 0).length)})</option>
                        {volunteerSkills.map((item) => (
                          <option key={item.code} value={item.code}>{item.label} ({nf(skillCounts.get(item.code) ?? 0)})</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))}
              <LayerRow
                checked={layers.includes("heat")}
                onChange={(on) => toggleLayer("heat", on)}
                icon={<LayerIcon path={HEAT_LAYER.iconPath} color={HEAT_LAYER.color} />}
                label={HEAT_LAYER.label}
                count={layerCounts.heat}
              />
            </div>
          </Group>

          <Group
            title="จุดสำคัญ"
            aside={<SelectAll onAll={() => setSiteTypes([...allSiteTypes])} onNone={() => setSiteTypes([])} />}
          >
            <div className="space-y-0.5">
              {siteTypeOptions.map((type) => {
                const style = SITE_STYLE[type.value] ?? SITE_STYLE.OTHER;
                return (
                  <LayerRow
                    key={type.value}
                    checked={siteTypes.includes(type.value)}
                    onChange={(on) => toggleSiteType(type.value, on)}
                    icon={<SiteSymbol color={style.color} symbol={style.symbol} size="sm" />}
                    label={type.label}
                    count={siteCounts.get(type.value) ?? 0}
                    unit="จุด"
                  />
                );
              })}
            </div>
          </Group>

          <p className="px-1 pt-2 text-[11px] leading-relaxed text-slate-500">
            จำนวนคือหลัง/จุดที่มีพิกัดบนแผนที่ · ใช้เฉพาะแบบสอบถามที่ตรวจแล้ว ไม่แสดงชื่อหรือเบอร์โทรศัพท์ ·
            ฮีตแมปใช้ระดับน้ำสูงสุดที่ครัวเรือนรายงาน ดูแนวโน้มพื้นที่ได้ แต่ไม่ใช่แบบจำลองน้ำท่วมทางวิศวกรรม
          </p>
        </div>
      </aside>

      {canManageSites ? (
        <ImportantSiteManager
          open={managerOpen}
          onClose={() => setManagerOpen(false)}
          onResult={setToast}
          sites={sites}
          siteTypes={siteTypeOptions}
          communities={communities}
          defaultCommunityId={view.communityId}
          mapCenter={managerCenter}
        />
      ) : null}
    </div>
  );
}

/** กลุ่มในแผงที่ย่อ/ขยายได้ */
function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b-2 border-slate-100 py-3 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((old) => !old)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 hover:text-slate-800"
        >
          <span className={`inline-block transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} aria-hidden="true">▾</span>
          {title}
        </button>
        {open ? aside : null}
      </div>
      {open ? children : null}
    </section>
  );
}

function SelectAll({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold">
      <button type="button" onClick={onAll} className="text-brand-700 hover:underline">เลือกทั้งหมด</button>
      <span className="text-slate-300" aria-hidden="true">|</span>
      <button type="button" onClick={onNone} className="text-slate-500 hover:underline">ล้าง</button>
    </span>
  );
}

function LayerRow({
  checked,
  onChange,
  icon,
  label,
  count,
  unit = "หลัง",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  label: string;
  count: number;
  unit?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 ${checked ? "" : "opacity-70"}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-brand-600" />
      {icon}
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">{label}</span>
      <span className={`text-xs font-bold tabular-nums ${count ? "text-slate-600" : "text-slate-400"}`} title={`${nf(count)} ${unit} บนแผนที่`}>
        {nf(count)}
      </span>
    </label>
  );
}

function Legend({
  open,
  onToggle,
  totals,
  missing,
  layers,
  boundary,
  skills,
  siteTypes,
}: {
  open: boolean;
  onToggle: () => void;
  totals: Totals;
  missing: Missing;
  layers: HouseholdLayerKey[];
  boundary: { draft: boolean } | null;
  skills: VolunteerMapSkill[];
  siteTypes: SiteTypeOption[];
}) {
  const shownLayers = HOUSEHOLD_LAYERS.filter((layer) => layers.includes(layer.key));
  const heatOn = layers.includes("heat");
  return (
    // มือถือ: วางเหนือแถบหัวของแผ่นด้านล่าง (3.5rem) และแถบ attribution ของแผนที่
    <div className="absolute bottom-[5.25rem] left-3 z-[1050] w-72 max-w-[calc(100%-1.5rem)] md:bottom-3">
      <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white/95 shadow-md backdrop-blur">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
          <span className="text-xs font-bold text-slate-800">คำอธิบายสัญลักษณ์</span>
          <span className="flex items-center gap-2">
            {missing.uniqueHouseholds ? <span className="badge badge-warning tabular-nums">ไม่มีพิกัด {nf(missing.uniqueHouseholds)} หลัง</span> : null}
            <span className="text-slate-400" aria-hidden="true">{open ? "▾" : "▴"}</span>
          </span>
        </button>
        {open ? (
          <div className="max-h-[38vh] space-y-3 overflow-y-auto border-t-2 border-slate-100 px-3 py-3 text-xs text-slate-600">
            {/* ตัวเลขสำคัญ — นับทุกหลังที่ตรวจแล้ว (รวมหลังที่ยังไม่มีพิกัด) */}
            <div className="grid grid-cols-3 gap-1.5">
              <KeyFigure label="กลุ่มเปราะบาง" value={totals.vulnerable} layer="vulnerable" />
              <KeyFigure label="สนใจอาสา" value={totals.volunteer} layer="volunteer" />
              <KeyFigure label="บ้านพักพิง" value={totals.hostHouse} layer="host" />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              หน่วย: หลัง จากแบบสอบถามที่ตรวจแล้วตามตัวกรองพื้นที่
              {missing.uniqueHouseholds ? (
                <> · <span className="font-semibold text-sun-800">ไม่มีพิกัด {nf(missing.uniqueHouseholds)} หลัง</span> (เปราะบาง {nf(missing.vulnerable)} · อาสา {nf(missing.volunteer)} · พักพิง {nf(missing.hostHouse)}) จึงไม่ปรากฏบนแผนที่</>
              ) : null}
            </p>

            {boundary || shownLayers.length || heatOn || siteTypes.length ? (
              <ul className="space-y-1.5">
                {boundary ? (
                  <li className="flex items-center gap-2">
                    <BoundarySwatch draft={boundary.draft} />
                    เส้นขอบชุมชน{boundary.draft ? " (เส้นประ = ร่าง ยังไม่รับรอง)" : ""}
                  </li>
                ) : null}
                {shownLayers.filter((layer) => layer.key !== "volunteer").map((layer) => layer.key === "vulnerable" ? (
                  // หมุดเปราะบางเปลี่ยนสีตามความเร่งด่วน — อธิบายด้วยคำไทย ไม่ใช้รหัส P1–P3
                  <li key={layer.key}>
                    <p className="mb-1 font-semibold text-slate-700">{layer.label} (สีตามความเร่งด่วน)</p>
                    <ul className="space-y-1 pl-1">
                      {MAP_URGENCY_ORDER.map((level) => (
                        <li key={level} className="flex items-center gap-2">
                          <span className={`map-urgency map-urgency-${level} shrink-0 scale-75`} aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={layer.iconPath} /></svg>
                          </span>
                          {MAP_URGENCY_LABELS[level]}
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={layer.key} className="flex items-center gap-2"><LayerIcon path={layer.iconPath} color={layer.color} size="sm" />{layer.label}</li>
                ))}
                {layers.includes("volunteer") ? (
                  skills.length ? skills.map((item) => {
                    const style = skillStyle(item);
                    return <li key={item.code} className="flex items-center gap-2"><LayerIcon path={style.iconPath} color={style.color} size="sm" />อาสา: {item.label}</li>;
                  }) : <li className="text-slate-400">อาสาสมัคร: ไม่มีจุดตามทักษะที่เลือก</li>
                ) : null}
                {siteTypes.map((type) => {
                  const style = SITE_STYLE[type.value] ?? SITE_STYLE.OTHER;
                  return <li key={type.value} className="flex items-center gap-2"><SiteSymbol color={style.color} symbol={style.symbol} size="sm" />{type.label}</li>;
                })}
                <li className="flex items-center gap-2 text-slate-500">
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink-900 px-1 text-[10px] font-bold text-white" aria-hidden="true">3</span>
                  ตัวเลขบนหมุด = หลายครัวเรือนในพิกัดเดียวกัน
                </li>
              </ul>
            ) : (
              <p className="text-slate-400">ยังไม่ได้เปิดชั้นข้อมูล — เลือกได้ที่แผง “ชั้นข้อมูล”</p>
            )}

            {heatOn ? (
              <div>
                <p className="mb-1 font-bold text-slate-700">ระดับน้ำสูงสุดที่ครัวเรือนเคยเจอ (ฮีตแมป)</p>
                <div className="grid grid-cols-2 gap-1">
                  {[...FLOOD_DEPTH_BINS].reverse().map((bin) => (
                    <span key={bin.level} className="flex items-center gap-1.5">
                      {/* สีเดียวกับที่วาดบน canvas (ตัวแปร --heat-* ใน globals.css) */}
                      <i className="h-3 w-5 shrink-0 rounded" style={{ backgroundColor: `var(${heatVar(bin.level)})` }} aria-hidden="true" />
                      {bin.label}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">บ้านหลายหลังซ้อนกัน แสดงระดับที่ลึกที่สุด</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KeyFigure({ label, value, layer }: { label: string; value: number; layer: HouseholdLayerKey }) {
  const style = HOUSEHOLD_LAYERS.find((item) => item.key === layer);
  return (
    <div className="rounded-lg bg-mist px-2 py-1.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        {/* จุดสีเดียวกับหมุด ให้จับคู่ตัวเลขกับสัญลักษณ์ได้ — ตัวเลขใช้สีหมึก ไม่ใช้แดง (สงวนไว้ให้ Error) */}
        {style ? <i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: style.color }} aria-hidden="true" /> : null}
        {label}
      </p>
      <p className="text-base font-bold tabular-nums text-ink-900">{nf(value)}</p>
    </div>
  );
}

function Toast({ result, onClose }: { result: SiteManagerResult; onClose: () => void }) {
  const cls = result.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : result.tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sun-200 bg-sun-50 text-sun-800";
  return (
    <div className="absolute inset-x-3 top-16 z-[1150] flex justify-center md:inset-x-auto md:left-1/2 md:top-3 md:-translate-x-1/2" role={result.tone === "error" ? "alert" : "status"}>
      <div className={`flex max-w-lg items-start gap-3 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold shadow-md ${cls}`}>
        <span className="flex-1">{result.text}</span>
        <button type="button" onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100" aria-label="ปิดข้อความ">✕</button>
      </div>
    </div>
  );
}

/** สัญลักษณ์เส้นขอบ — สี/เส้นประตรงกับ .map-boundary(-draft) ใน globals.css */
function BoundarySwatch({ draft }: { draft: boolean }) {
  return (
    <span
      className={`h-5 w-6 shrink-0 rounded-sm border-2 border-brand-600 bg-brand-500/10 ${draft ? "border-dashed" : ""}`}
      aria-hidden="true"
    />
  );
}

function LayersGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 text-brand-600" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
