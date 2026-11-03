"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BridgeFlagEstimate } from "@/domain/water/community-flags";
import {
  flowSpeed,
  freeboard,
  r1SimulatedIntensity,
  WATER_STATUS_LABEL,
  WATER_TREND_LABEL,
  waterStatus,
  waterTrend,
  type StationReading,
  type WaterStatus,
  type WaterTrend,
} from "@/domain/water/station-status";
import { DAILY_RAIN_LABEL, dailyRain, type DailyRain } from "@/domain/water/sky";
import type { RainStation } from "@/lib/water/rain-stations";

type LngLat = [number, number];
interface CanalCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: { canal: "utapao" | "r1" | "wha"; name: string }; geometry: { type: "LineString"; coordinates: LngLat[] } }>;
}
interface Community { id: string; nameTh: string; lat: number; lng: number; boundary: LngLat[][][] | null }
interface GridCell { bounds: [number, number, number, number]; households: number; avgDepthCm: number | null }
interface Site { id: string; name: string; type: string | null; lat: number; lng: number }

/*
 * สีบน WebGL ใช้คลาส Tailwind ไม่ได้ จึงอ้างค่าจาก Token ใน globals.css ตรง ๆ (ให้ตรงกับ Design System)
 * ปกติ = ฟ้าน้ำ · เฝ้าระวัง = sun · เตือนภัย = alert (ต้องลงมือทำ) · ล้นตลิ่ง = red (วิกฤต) · ไม่มีข้อมูล = slate
 */
const STATUS_COLOR: Record<WaterStatus, string> = {
  NORMAL: "#38BDF8",
  WATCH: "#FFCF1F",
  WARNING: "#FF6A00",
  OVERFLOW: "#DC2626",
  UNKNOWN: "#94A3B8",
};

// ลำดับเส้นประที่เลื่อนเฟสทีละนิด → เส้นดูเหมือนไหลไปตามทิศของจุดในเส้น (ใต้ → เหนือ)
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];
const EXTRUDE_PER_M = 22; // ความสูงแท่งน้ำบนแผนที่ (ม.) ต่อระดับน้ำจริง 1 ม. — ขยายให้เห็นชัด

const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// ชั้นอ้างอิงโปร่งใสของ Esri วางทับภาพดาวเทียม — ถนนและชื่อสถานที่ ให้รู้ว่าตรงไหนเป็นตรงไหน
const ROADS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const PLACES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// ลูกศรแนวโน้มบนหมุดจุดวัดน้ำ — น้ำขึ้น = คำเตือน (sun) · น้ำลด = มิ้นต์ · ทรงตัว/ไม่ทราบ = slate
const TREND_ARROW: Record<WaterTrend, { icon: string; cls: string }> = {
  RISING: { icon: "▲", cls: "text-sun-600 animate-trend-up" },
  FALLING: { icon: "▼", cls: "text-emerald-600 animate-trend-down" },
  STEADY: { icon: "■", cls: "text-slate-500 text-[8px]" },
  UNKNOWN: { icon: "•", cls: "text-slate-400" },
};

// หมุดจุดวัดฝนตามฝนสะสม 24 ชม. (เกณฑ์กรมอุตุนิยมวิทยา) — ฝนหนักขึ้นไปเป็นคำเตือน (sun) · ไม่มีฝน = slate
const RAIN_PIN: Record<DailyRain, string> = {
  none: "bg-white/90 text-slate-500 ring-slate-300",
  light: "bg-white text-brand-700 ring-brand-300",
  moderate: "bg-brand-500 text-white ring-brand-700",
  heavy: "bg-sun-400 text-ink-900 ring-sun-600",
  veryHeavy: "bg-sun-500 text-ink-900 ring-ink-900",
};
const DROP_PATH = "M6 0C6 0 0 7 0 10.5A6 6 0 0 0 12 10.5C12 7 6 0 6 0Z";

/** "บ้านหาดใหญ่ใน" → "หาดใหญ่ใน" — แสดงชื่อพื้นที่แทนรหัสสถานี */
const placeName = (stationName: string) => stationName.replace(/^บ้าน/, "");

const fmt = (n: number, digits = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const LEGEND = "inline-flex items-center gap-2 rounded-full bg-ink-900/80 px-3 py-1.5 ring-1 ring-white/15 backdrop-blur";

const FLAG_WORD = { GREEN: "ธงเขียว", YELLOW: "ธงเหลือง", RED: "ธงแดง", UNKNOWN: "ไม่ทราบ" } as const;

/** เนื้อหาป๊อปอัปของหมุดจุดวัด — สร้างด้วย DOM (textContent) ไม่ใช้ innerHTML กับข้อมูลจากต้นทาง */
function stationPopup(s: StationReading, bridge: BridgeFlagEstimate | undefined): HTMLElement {
  const root = document.createElement("div");
  root.className = "min-w-[220px] text-ink-900";
  const add = (cls: string, text: string) => {
    const el = document.createElement("p");
    el.className = cls;
    el.textContent = text;
    root.append(el);
  };
  add("text-[11px] text-slate-500", `${bridge?.criterion.canal ?? (s.river || "คลองอู่ตะเภา")} · สถานีวัดระดับน้ำ กรมชลประทาน`);
  add("text-base font-black leading-tight", bridge?.criterion.bridge ?? `จุดวัดน้ำ${placeName(s.name)}`);
  const trend = waterTrend(s);
  const diff = s.levelMsl !== null && s.previousMsl !== null ? s.levelMsl - s.previousMsl : null;
  const trendText = trend === "UNKNOWN" ? "" : ` · ${WATER_TREND_LABEL[trend]}${diff !== null ? ` (${diff >= 0 ? "+" : ""}${fmt(diff)} ม.)` : ""}`;
  add("mt-2 text-sm", `ระดับน้ำ ${s.levelMsl !== null ? fmt(s.levelMsl) : "—"} ม.รทก.${trendText}`);
  const fb = freeboard(s);
  add("text-sm", fb === null ? "ไม่ทราบระดับตลิ่ง" : fb > 0 ? `ต่ำกว่าตลิ่ง ${fmt(fb)} ม. · ${WATER_STATUS_LABEL[waterStatus(s)]}` : `ล้นตลิ่ง ${fmt(-fb)} ม.`);
  if (bridge && bridge.levelMsl !== null && bridge.yellowMsl !== null && bridge.redMsl !== null) {
    const next =
      bridge.flag === "GREEN"
        ? `อีก ${fmt(bridge.yellowMsl - bridge.levelMsl)} ม. ถึงธงเหลือง`
        : bridge.flag === "YELLOW"
          ? `อีก ${fmt(bridge.redMsl - bridge.levelMsl)} ม. ถึงธงแดง`
          : "ถึงเกณฑ์ธงแดงแล้ว";
    add("mt-2 rounded-lg bg-mist px-2 py-1 text-sm font-bold", `${FLAG_WORD[bridge.flag]} (โดยประมาณ) · ${next}`);
  }
  if (s.measuredAt) add("mt-2 text-[11px] text-slate-500", `วัดเมื่อ ${s.measuredAt.split(" ")[1] ?? s.measuredAt} น.`);
  add("text-[11px] text-slate-500", "ที่มา: คลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน.) · สถานีของกรมชลประทาน");
  if (bridge) add("text-[11px] text-slate-500", "เกณฑ์ธง: กลุ่มสองคลองควนลัง (hatyaicityclimate.org) · ท้องสะพานประมาณจากรูปตัดลำน้ำ ชป.");
  return root;
}

/** ชื่อสถานีวัดฝน — สถานีที่ชื่อเป็นรหัส (เช่น "สถานี X.44") แสดงเป็นคำที่คนทั่วไปอ่านเข้าใจ */
const rainStationName = (r: RainStation) => (/^สถานี\s*X\./.test(r.name) ? `สถานีวัดน้ำคลองอู่ตะเภา (${r.name.replace(/^สถานี\s*/, "")})` : r.name);

/** เนื้อหาป๊อปอัปของหมุดจุดวัดฝน — DOM textContent เช่นเดียวกับหมุดจุดวัดน้ำ */
function rainPopup(r: RainStation): HTMLElement {
  const root = document.createElement("div");
  root.className = "min-w-[210px] text-ink-900";
  const add = (cls: string, text: string) => {
    const el = document.createElement("p");
    el.className = cls;
    el.textContent = text;
    root.append(el);
  };
  add("text-[11px] text-slate-500", "สถานีวัดฝน");
  add("text-base font-black leading-tight", rainStationName(r));
  add("mt-2 text-sm", r.rain24h === null ? "ฝน 24 ชม.: ไม่มีข้อมูล" : `ฝนสะสม 24 ชม. ${fmt(r.rain24h, 1)} มม. · ${DAILY_RAIN_LABEL[dailyRain(r.rain24h)]}`);
  if (r.rain1h !== null) add("text-sm", `ฝน 1 ชม. ล่าสุด ${fmt(r.rain1h, 1)} มม.`);
  if (r.measuredAt) add("mt-2 text-[11px] text-slate-500", `ข้อมูลถึง ${r.measuredAt.split(" ")[1] ?? r.measuredAt} น. · ห่างควนลัง ~${fmt(r.distanceKm, 1)} กม.`);
  add("text-[11px] text-slate-500", `ที่มา: คลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน.) · สถานีของ${r.agency}`);
  return root;
}

function gridGeoJson(cells: GridCell[]) {
  return {
    type: "FeatureCollection" as const,
    features: cells
      .filter((c) => c.avgDepthCm !== null && c.avgDepthCm > 0)
      .map((c) => {
        const [s, w, n, e] = c.bounds;
        return {
          type: "Feature" as const,
          properties: { d: (c.avgDepthCm ?? 0) / 100, hh: c.households },
          geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        };
      }),
  };
}

function communityGeoJson(communities: Community[]) {
  return {
    type: "FeatureCollection" as const,
    features: communities
      .filter((c) => c.boundary)
      .map((c) => ({ type: "Feature" as const, properties: { name: c.nameTh }, geometry: { type: "MultiPolygon" as const, coordinates: c.boundary! } })),
  };
}

export function SongKhlongExperience({
  canals,
  communities,
  floodGrid,
  sites,
  stations,
  markerStations = stations,
  bridges = [],
  rainStations = [],
}: {
  canals: CanalCollection;
  communities: Community[];
  floodGrid: GridCell[];
  sites: Site[];
  stations: StationReading[];
  /** สถานีที่ปักหมุดบนแผนที่ (รวมสะพานคลองหวะที่ใช้ตัดสินธง) — ค่าเริ่มต้น = สถานีบนคลองอู่ตะเภา */
  markerStations?: StationReading[];
  /** ธงโดยประมาณรายสะพาน — ใส่ในป๊อปอัปของหมุดสะพาน */
  bridges?: BridgeFlagEstimate[];
  /** สถานีวัดฝนรอบควนลัง (ThaiWater rain_24h) */
  rainStations?: RainStation[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(true);
  const [showRain, setShowRain] = useState(true);

  // สถานีหลัก = ใกล้ควนลังที่สุด (ตัวสุดท้ายในลำดับต้นน้ำ → ควนลัง)
  const main = stations.at(-1) ?? null;
  const mainStatus: WaterStatus = main ? waterStatus(main) : "UNKNOWN";
  // คลองหวะไหลตามสถานะของสถานีสะพานบ้านคลองหวะ (ไม่มีข้อมูล = ไหลช้า สีเทา)
  const wha = markerStations.find((s) => s.code === "X.174");
  const whaStatus: WaterStatus = wha ? waterStatus(wha) : "UNKNOWN";

  const grid = useMemo(() => gridGeoJson(floodGrid), [floodGrid]);
  const hasGrid = grid.features.length > 0;
  // ปัดลงทีละ 0.1 ม. — ถ้าปัดขึ้น ตำแหน่งสูงสุดจะไม่มีช่องไหนลึกถึงและตัวนับขึ้น 0
  const maxDepth = useMemo(() => Math.max(0.1, Math.floor(Math.max(0, ...grid.features.map((f) => f.properties.d)) * 10) / 10), [grid]);
  const [level, setLevel] = useState(maxDepth);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useRef(false);

  const reached = useMemo(() => {
    const cells = grid.features.filter((f) => f.properties.d >= level && level > 0);
    return { cells: cells.length, households: cells.reduce((a, f) => a + f.properties.hh, 0) };
  }, [grid, level]);

  // ---------- สร้างแผนที่ครั้งเดียว ----------
  useEffect(() => {
    if (!containerRef.current) return;
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // เยื้องไปทางตะวันออกให้เห็นหมุดสะพานบ้านคลองหวะ (สะพานที่ใช้ตัดสินธง) ในมุมมองแรก
    const center: LngLat = [100.4665, 6.9885];
    const zoom = window.innerWidth < 768 ? 13 : 14;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [SATELLITE],
            tileSize: 256,
            maxzoom: 18,
            attribution: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a> · Imagery © Esri, Maxar, Earthstar Geographics · ถนน/ชื่อสถานที่ © Esri, HERE, Garmin, OpenStreetMap contributors',
          },
          roads: { type: "raster", tiles: [ROADS], tileSize: 256, maxzoom: 18 },
          places: { type: "raster", tiles: [PLACES], tileSize: 256, maxzoom: 18 },
        },
        // ภาพดาวเทียมสีจริง (ไม่หรี่) + ถนนและชื่อสถานที่ทับบาง ๆ
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#1E293B" } },
          { id: "satellite", type: "raster", source: "satellite" },
          { id: "roads", type: "raster", source: "roads", paint: { "raster-opacity": 0.55 } },
          { id: "places", type: "raster", source: "places", paint: { "raster-opacity": 0.9 } },
        ],
      },
      center: reducedMotion.current ? center : [100.4398, 6.9312],
      zoom: reducedMotion.current ? zoom : zoom - 1.8,
      pitch: reducedMotion.current ? 55 : 20,
      bearing: reducedMotion.current ? -22 : 0,
      maxPitch: 70,
      attributionControl: { compact: true },
      // แผนที่อยู่ใต้ส่วนหัว — เลื่อนหน้าได้ปกติ ซูมต้องกด Ctrl / ใช้สองนิ้ว
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "กด Ctrl ค้างแล้วเลื่อนเพื่อซูมแผนที่",
        "CooperativeGesturesHandler.MacHelpText": "กด ⌘ ค้างแล้วเลื่อนเพื่อซูมแผนที่",
        "CooperativeGesturesHandler.MobileHelpText": "ใช้สองนิ้วเพื่อเลื่อนแผนที่",
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      map.addSource("communities", { type: "geojson", data: communityGeoJson(communities) });
      map.addLayer({ id: "community-fill", type: "fill", source: "communities", paint: { "fill-color": "#FF6A00", "fill-opacity": 0.08 } });
      map.addLayer({ id: "community-line", type: "line", source: "communities", paint: { "line-color": "#FFB27A", "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0.8 } });

      map.addSource("grid", { type: "geojson", data: grid });
      map.addLayer({
        id: "grid-water",
        type: "fill-extrusion",
        source: "grid",
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["get", "d"], 0.5, "#7DD3FC", 2, "#38BDF8", 3.5, "#2563EB", 5, "#1E3A8A", 8, "#172554"],
          "fill-extrusion-height": ["*", ["min", ["get", "d"], maxDepth], EXTRUDE_PER_M],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.72,
        },
      });

      map.addSource("canals", { type: "geojson", data: canals });
      for (const canal of ["utapao", "r1", "wha"] as const) {
        const filter: maplibregl.FilterSpecification = ["==", ["get", "canal"], canal];
        const main = canal === "utapao";
        map.addLayer({ id: `${canal}-glow`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#38BDF8", "line-width": main ? 18 : 16, "line-blur": 10, "line-opacity": 0.55 } });
        map.addLayer({ id: `${canal}-core`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0EA5E9", "line-width": main ? 6 : 5 } });
        map.addLayer({ id: `${canal}-flow`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#F0F9FF", "line-width": 2.6, "line-opacity": 0.95, "line-dasharray": DASH_SEQUENCE[0] } });
      }

      // ป้ายชื่อชุมชน · สถานี · จุดอพยพ (HTML marker — ไม่ต้องโหลดชุดฟอนต์ของ WebGL)
      for (const c of communities) {
        const el = document.createElement("div");
        el.className = "pointer-events-none rounded-full bg-ink-900/75 px-2.5 py-1 text-[11px] font-semibold text-orange-100 ring-1 ring-orange-300/40 backdrop-blur";
        el.textContent = c.nameTh;
        new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
      }
      for (const s of sites) {
        const el = document.createElement("div");
        el.className = "h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white";
        el.title = s.name;
        new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      }
      setReady(true);
      if (!reducedMotion.current && containerRef.current) {
        // เริ่มจากต้นน้ำ (บางศาลา) แล้วบินตามน้ำขึ้นมาที่ควนลัง — เมื่อเลื่อนมาเห็นแผนที่แล้วเท่านั้น
        const io = new IntersectionObserver((entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          map.flyTo({ center, zoom, pitch: 58, bearing: -22, duration: 5200, essential: true, curve: 1.3 });
        }, { threshold: 0.4 });
        io.observe(containerRef.current);
        map.once("remove", () => io.disconnect());
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // สร้างครั้งเดียว — ข้อมูลหน้าเป็นแบบ static ต่อการโหลด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- หมุดสถานี (กดแล้วขึ้นข้อมูล) + สีคลองตามสถานะ ----------
  // ป้ายแสดงชื่อพื้นที่อย่างเดียว ไม่ใส่รหัสสถานี (X.44 ฯลฯ) ที่คนทั่วไปไม่เข้าใจ
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = markerStations.map((s) => {
      const trend = waterTrend(s);
      const diff = s.levelMsl !== null && s.previousMsl !== null ? s.levelMsl - s.previousMsl : null;
      const fb = freeboard(s);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "flex cursor-pointer items-center gap-2 rounded-2xl bg-white/95 py-1 pl-1.5 pr-3 text-left text-ink-900 shadow-lg ring-1 ring-ink-900/10 hover:ring-brand-400";
      el.setAttribute("aria-label", `ดูข้อมูลจุดวัดน้ำ${placeName(s.name)}`);
      const dot = document.createElement("span");
      dot.className = "inline-block h-3.5 w-3.5 shrink-0 rounded-full shadow ring-2 ring-white";
      dot.style.background = STATUS_COLOR[waterStatus(s)];
      const text = document.createElement("span");
      text.className = "leading-tight";
      const name = document.createElement("span");
      name.className = "block text-[11px] font-bold";
      name.textContent = `จุดวัดน้ำ${placeName(s.name)}`;
      // บรรทัดสอง: ลูกศรแนวโน้ม + ต่างจากค่าก่อนหน้า + ระยะถึงตลิ่ง
      const line = document.createElement("span");
      line.className = "flex items-center gap-1 text-[11px] text-slate-600";
      const arrow = document.createElement("span");
      arrow.className = `inline-block ${TREND_ARROW[trend].cls}`;
      arrow.textContent = TREND_ARROW[trend].icon;
      const trendWord = document.createElement("b");
      trendWord.className = trend === "RISING" ? "text-sun-700" : trend === "FALLING" ? "text-emerald-700" : "text-slate-600";
      trendWord.textContent =
        trend === "UNKNOWN" ? "ไม่มีค่าก่อนหน้า" : `${WATER_TREND_LABEL[trend]}${diff !== null && trend !== "STEADY" ? ` ${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff) * 100)} ซม.` : ""}`;
      const bank = document.createElement("span");
      bank.className = fb !== null && fb <= 0 ? "font-bold text-red-600" : "";
      bank.textContent = fb === null ? "" : fb > 0 ? `· ต่ำกว่าตลิ่ง ${fmt(fb)} ม.` : `· ล้นตลิ่ง ${fmt(-fb)} ม.`;
      line.append(arrow, trendWord, bank);
      text.append(name, line);
      el.append(dot, text);
      const popup = new maplibregl.Popup({ offset: 14, maxWidth: "290px" }).setDOMContent(stationPopup(s, bridges.find((b) => b.criterion.stationCode === s.code)));
      return new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(map);
    });
    const color = STATUS_COLOR[mainStatus];
    map.setPaintProperty("utapao-glow", "line-color", color);
    map.setPaintProperty("r1-glow", "line-color", color);
    map.setPaintProperty("wha-glow", "line-color", STATUS_COLOR[whaStatus]);
    // คลอง ร.1 = ภาพจำลอง: ความจางของแสงตามความแรงที่จำลองจากคลองอู่ตะเภา
    const r1 = r1SimulatedIntensity(mainStatus);
    map.setPaintProperty("r1-glow", "line-opacity", 0.2 + 0.45 * r1);
    map.setPaintProperty("r1-flow", "line-opacity", 0.35 + 0.6 * r1);
    return () => markers.forEach((m) => m.remove());
  }, [ready, markerStations, bridges, mainStatus, whaStatus]);

  // ---------- หมุดจุดวัดฝน (ฝนสะสม 24 ชม.) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !showRain) return;
    const markers = rainStations.map((r) => {
      const lvl = dailyRain(r.rain24h);
      const el = document.createElement("button");
      el.type = "button";
      el.className = `flex cursor-pointer items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[10px] font-bold shadow-md ring-1 ${RAIN_PIN[lvl]}`;
      el.setAttribute("aria-label", `ดูข้อมูลจุดวัดฝน${rainStationName(r)}`);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 12 17");
      svg.setAttribute("class", "h-3 w-2.5 fill-current");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", DROP_PATH);
      svg.append(path);
      el.append(svg, r.rain24h === null ? "—" : `${fmt(r.rain24h, r.rain24h >= 10 ? 0 : 1)} มม.`);
      const popup = new maplibregl.Popup({ offset: 12, maxWidth: "280px" }).setDOMContent(rainPopup(r));
      // ปักไว้ทางซ้ายของจุด — หมุดจุดวัดน้ำปักทางขวา จึงไม่ทับกันเมื่ออยู่สถานีเดียวกัน (เช่น หาดใหญ่ใน)
      return new maplibregl.Marker({ element: el, anchor: "right", offset: [-4, 0] }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [ready, rainStations, showRain]);

  // ---------- แอนิเมชันน้ำไหล ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || reducedMotion.current) return;
    const speedU = flowSpeed(mainStatus);
    const speedR = speedU * (0.5 + 0.5 * r1SimulatedIntensity(mainStatus));
    const speedW = flowSpeed(whaStatus);
    let raf = 0;
    let lastU = -1;
    let lastR = -1;
    let lastW = -1;
    const tick = (t: number) => {
      const stepU = Math.floor((t / 1000) * 9 * speedU) % DASH_SEQUENCE.length;
      const stepR = Math.floor((t / 1000) * 9 * speedR) % DASH_SEQUENCE.length;
      if (stepU !== lastU) { map.setPaintProperty("utapao-flow", "line-dasharray", DASH_SEQUENCE[stepU]); lastU = stepU; }
      if (stepR !== lastR) { map.setPaintProperty("r1-flow", "line-dasharray", DASH_SEQUENCE[stepR]); lastR = stepR; }
      const stepW = Math.floor((t / 1000) * 9 * speedW) % DASH_SEQUENCE.length;
      if (stepW !== lastW) { map.setPaintProperty("wha-flow", "line-dasharray", DASH_SEQUENCE[stepW]); lastW = stepW; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, mainStatus, whaStatus]);

  // ---------- ระดับน้ำย้อนหลัง (แถบเลื่อน) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty("grid-water", "fill-extrusion-height", ["*", ["min", ["get", "d"], level], EXTRUDE_PER_M]);
  }, [ready, level]);

  const play = useCallback(() => {
    if (reducedMotion.current) { setLevel(maxDepth); return; }
    setPlaying(true);
    const start = performance.now();
    const duration = 7000;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setLevel(Math.round(p * maxDepth * 10) / 10);
      if (p < 1) requestAnimationFrame(step);
      else setPlaying(false);
    };
    setLevel(0);
    requestAnimationFrame(step);
  }, [maxDepth]);

  const togglePitch = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: pitched ? 0 : 58, bearing: pitched ? 0 : -22, duration: 900 });
    setPitched(!pitched);
  };

  return (
    <div className="relative h-[72vh] min-h-[520px] w-full overflow-hidden rounded-3xl bg-ink-900 text-white shadow-xl ring-1 ring-slate-200">
      {/* maplibre ใส่ position:relative ให้ container เอง จึงต้องให้ div นอกเป็นตัวกำหนดขนาด */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* ---- คำอธิบายเส้นและหมุด — ระดับน้ำปัจจุบันอยู่ที่ส่วนหัวของหน้าแล้ว จึงไม่ซ้ำในแผนที่ ---- */}
      <div className="absolute left-4 right-16 top-4 z-10 flex flex-wrap gap-2 text-[11px] font-semibold md:left-6 md:top-6">
        <span className={LEGEND}>
          <span className="h-1 w-6 rounded-full" style={{ background: STATUS_COLOR[mainStatus] }} />
          คลองอู่ตะเภา · ไหลตามระดับน้ำจริง
        </span>
        <span className={LEGEND}>
          <span className="h-1 w-6 rounded-full bg-sky-300/60" />
          คลอง ร.1 · ภาพจำลอง
        </span>
        <span className={LEGEND}>
          <span className="h-1 w-6 rounded-full" style={{ background: STATUS_COLOR[whaStatus] }} />
          คลองหวะ · ไหลตามระดับน้ำจริง
        </span>
        <span className={LEGEND}>
          จุดวัดน้ำ: <span className="text-sun-300">▲ ขึ้น</span> <span className="text-emerald-300">▼ ลด</span> <span className="text-slate-300">■ ทรงตัว</span> · กดดูข้อมูล
        </span>
        {rainStations.length ? (
          <button type="button" onClick={() => setShowRain((v) => !v)} aria-pressed={showRain} className={`${LEGEND} cursor-pointer hover:bg-ink-800`}>
            <svg viewBox="0 0 12 17" className="h-3 w-2.5 fill-sky-300" aria-hidden>
              <path d={DROP_PATH} />
            </svg>
            จุดวัดฝน (ฝน 24 ชม.) · {showRain ? "ซ่อน" : "แสดง"}
          </button>
        ) : null}
        <span className={LEGEND}>
          <span className="h-2.5 w-4 rounded-sm border border-dashed border-orange-200 bg-orange-400/20" />
          เขตชุมชน
        </span>
      </div>

      {/* ---- ย้อนดูน้ำท่วมจากแบบสำรวจ ---- */}
      <section className="absolute bottom-4 left-4 right-4 z-10 rounded-3xl bg-ink-900/80 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-md md:left-6 md:right-auto md:w-[30rem] md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">ระดับน้ำที่ชาวบ้านเคยเจอ</h2>
            <p className="text-[11px] text-slate-400">จากแบบสำรวจที่ตรวจแล้ว · แสดงเป็นช่องพื้นที่ ~200 ม. ที่มีอย่างน้อย 5 หลัง</p>
          </div>
          {hasGrid ? (
            <button type="button" onClick={play} disabled={playing} className="shrink-0 rounded-full bg-sky-400 px-4 py-2 text-xs font-bold text-ink-900 transition hover:bg-sky-300 disabled:opacity-60">
              {playing ? "กำลังเล่น…" : "▶ เล่นน้ำขึ้น"}
            </button>
          ) : null}
        </div>
        {hasGrid ? (<>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={maxDepth}
            step={0.1}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="w-full accent-sky-400"
            aria-label="ระดับน้ำ (เมตร)"
          />
          <span className="w-16 text-right text-lg font-bold tabular-nums">{fmt(level, 1)} ม.</span>
        </div>
        <p className="mt-1 text-xs text-slate-300">
          {level > 0 ? (
            <>พื้นที่ที่น้ำเฉลี่ยเคยลึกอย่างน้อยระดับนี้ <b>{reached.cells.toLocaleString("th-TH")}</b> ช่อง · <b>{reached.households.toLocaleString("th-TH")}</b> หลัง</>
          ) : "ลากแถบหรือกด “เล่นน้ำขึ้น” เพื่อดูน้ำค่อย ๆ สูงขึ้น"}
        </p>
        </>) : (
          // ไม่มีข้อมูล = บอกตามจริง ห้ามวาดแถบ/ตัวเลขสมมติ
          <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-slate-300">
            ยังไม่มีพื้นที่ที่มีข้อมูลระดับน้ำท่วมจากแบบสำรวจที่ตรวจแล้วพอจะแสดง (ต้องมีอย่างน้อย 5 หลังต่อช่อง)
          </p>
        )}
      </section>

      {/* ---- ปุ่มเครื่องมือ ---- */}
      <button type="button" onClick={togglePitch} className="absolute bottom-40 left-4 z-10 hidden rounded-full bg-ink-900/80 px-3 py-2 text-xs font-semibold ring-1 ring-white/15 backdrop-blur md:bottom-6 md:left-[33rem] md:block">
        {pitched ? "มุมบน 2D" : "มุมเอียง 3D"}
      </button>

      {/* ---- เครดิตและข้อจำกัด ---- */}
      <p className="absolute bottom-9 right-14 z-10 hidden max-w-md rounded-2xl bg-ink-900/75 px-3 py-2 text-right text-[10px] leading-4 text-slate-200 ring-1 ring-white/10 backdrop-blur md:block">
        ที่มา: ระดับน้ำและฝน — คลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน.) จากสถานีของกรมชลประทาน กรมทรัพยากรน้ำ สสน. และกรมอุตุนิยมวิทยา ·
        ภาพดาวเทียม/ถนน — Esri · เส้นคลอง © OpenStreetMap contributors · ระดับน้ำท่วมจากแบบสำรวจ SKL-FRIS ·
        คลอง ร.1 ไม่มีสถานีวัด แสดงเป็นภาพจำลองตามระดับคลองอู่ตะเภา
      </p>
    </div>
  );
}
