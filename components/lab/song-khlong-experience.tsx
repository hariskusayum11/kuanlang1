"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  flowSpeed,
  freeboard,
  gaugeFill,
  r1SimulatedIntensity,
  WATER_STATUS_LABEL,
  WATER_TREND_LABEL,
  waterStatus,
  waterTrend,
  type StationReading,
  type WaterStatus,
} from "@/domain/water/station-status";

type LngLat = [number, number];
interface CanalCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: { canal: "utapao" | "r1"; name: string }; geometry: { type: "LineString"; coordinates: LngLat[] } }>;
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
const STATUS_CHIP: Record<WaterStatus, string> = {
  NORMAL: "bg-sky-400/20 text-sky-200 ring-sky-300/40",
  WATCH: "bg-sun-400 text-ink-900 ring-sun-200",
  WARNING: "bg-alert-500 text-ink-900 ring-alert-200",
  OVERFLOW: "bg-red-600 text-white ring-red-300",
  UNKNOWN: "bg-slate-500/30 text-slate-200 ring-slate-300/30",
};

// ลำดับเส้นประที่เลื่อนเฟสทีละนิด → เส้นดูเหมือนไหลไปตามทิศของจุดในเส้น (ใต้ → เหนือ)
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];
const EXTRUDE_PER_M = 22; // ความสูงแท่งน้ำบนแผนที่ (ม.) ต่อระดับน้ำจริง 1 ม. — ขยายให้เห็นชัด

const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function thaiTime(measuredAt: string | null): string {
  if (!measuredAt) return "—";
  const [d, t] = measuredAt.split(" ");
  const [, m, day] = (d ?? "").split("-").map(Number);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${t ?? ""} น. · ${day} ${months[(m ?? 1) - 1] ?? ""}`;
}

/** "บ้านหาดใหญ่ใน" → "หาดใหญ่ใน" — แสดงชื่อพื้นที่แทนรหัสสถานี */
const placeName = (stationName: string) => stationName.replace(/^บ้าน/, "");

const fmt = (n: number, digits = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });

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
  feedError,
}: {
  canals: CanalCollection;
  communities: Community[];
  floodGrid: GridCell[];
  sites: Site[];
  stations: StationReading[];
  feedError: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [pitched, setPitched] = useState(true);
  // จอแคบ: ซ่อนไม้วัดไว้ก่อนให้เห็นแผนที่ (จอกว้างแสดงเสมอด้วย md:block)
  const [showGauges, setShowGauges] = useState(false);

  // สถานีหลัก = ใกล้ควนลังที่สุด (ตัวสุดท้ายในลำดับต้นน้ำ → ควนลัง)
  const main = stations.at(-1) ?? null;
  const mainStatus: WaterStatus = main ? waterStatus(main) : "UNKNOWN";
  const mainTrend = main ? waterTrend(main) : "UNKNOWN";
  const mainFreeboard = main ? freeboard(main) : null;

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
    const center: LngLat = [100.4515, 6.9885];
    const zoom = window.innerWidth < 768 ? 13.4 : 14.4;
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
            attribution: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a> · Imagery © Esri, Maxar, Earthstar Geographics',
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0B1437" } },
          { id: "satellite", type: "raster", source: "satellite", paint: { "raster-brightness-max": 0.55, "raster-saturation": -0.45, "raster-contrast": 0.1 } },
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
      for (const canal of ["utapao", "r1"] as const) {
        const filter: maplibregl.FilterSpecification = ["==", ["get", "canal"], canal];
        map.addLayer({ id: `${canal}-glow`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#38BDF8", "line-width": canal === "r1" ? 16 : 18, "line-blur": 10, "line-opacity": 0.55 } });
        map.addLayer({ id: `${canal}-core`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0EA5E9", "line-width": canal === "r1" ? 5 : 6 } });
        map.addLayer({ id: `${canal}-flow`, type: "line", source: "canals", filter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#F0F9FF", "line-width": 2.6, "line-opacity": 0.95, "line-dasharray": DASH_SEQUENCE[0] } });
      }

      // ป้ายชื่อชุมชน · สถานี · จุดอพยพ (HTML marker — ไม่ต้องโหลดชุดฟอนต์ของ WebGL)
      for (const c of communities) {
        const el = document.createElement("div");
        el.className = "pointer-events-none rounded-full bg-ink-900/70 px-2.5 py-1 text-[11px] font-semibold text-orange-100 ring-1 ring-orange-300/30 backdrop-blur";
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

  // ---------- หมุดสถานี + สีคลองตามสถานะ ----------
  // ป้ายแสดงชื่อพื้นที่อย่างเดียว ไม่ใส่รหัสสถานี (X.44 ฯลฯ) ที่คนทั่วไปไม่เข้าใจ
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = stations.map((s) => {
      const el = document.createElement("div");
      el.className = "flex items-center gap-1.5 rounded-full bg-ink-900/85 py-1 pl-1 pr-2.5 text-[11px] font-semibold text-white shadow-lg ring-1 ring-white/20";
      const dot = document.createElement("span");
      dot.className = "inline-block h-3 w-3 rounded-full ring-2 ring-white/70";
      dot.style.background = STATUS_COLOR[waterStatus(s)];
      el.append(dot, `จุดวัดน้ำ${placeName(s.name)}`);
      return new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([s.lng, s.lat]).addTo(map);
    });
    const color = STATUS_COLOR[mainStatus];
    map.setPaintProperty("utapao-glow", "line-color", color);
    map.setPaintProperty("r1-glow", "line-color", color);
    // คลอง ร.1 = ภาพจำลอง: ความจางของแสงตามความแรงที่จำลองจากคลองอู่ตะเภา
    const r1 = r1SimulatedIntensity(mainStatus);
    map.setPaintProperty("r1-glow", "line-opacity", 0.2 + 0.45 * r1);
    map.setPaintProperty("r1-flow", "line-opacity", 0.35 + 0.6 * r1);
    return () => markers.forEach((m) => m.remove());
  }, [ready, stations, mainStatus]);

  // ---------- แอนิเมชันน้ำไหล ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || reducedMotion.current) return;
    const speedU = flowSpeed(mainStatus);
    const speedR = speedU * (0.5 + 0.5 * r1SimulatedIntensity(mainStatus));
    let raf = 0;
    let lastU = -1;
    let lastR = -1;
    const tick = (t: number) => {
      const stepU = Math.floor((t / 1000) * 9 * speedU) % DASH_SEQUENCE.length;
      const stepR = Math.floor((t / 1000) * 9 * speedR) % DASH_SEQUENCE.length;
      if (stepU !== lastU) { map.setPaintProperty("utapao-flow", "line-dasharray", DASH_SEQUENCE[stepU]); lastU = stepU; }
      if (stepR !== lastR) { map.setPaintProperty("r1-flow", "line-dasharray", DASH_SEQUENCE[stepR]); lastR = stepR; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, mainStatus]);

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
    <div className="relative h-dvh w-full overflow-hidden bg-ink-900 text-white">
      {/* maplibre ใส่ position:relative ให้ container เอง จึงต้องให้ div นอกเป็นตัวกำหนดขนาด */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* ---- หัวเรื่อง: ประโยคจากข้อมูลจริง ---- */}
      <section className="absolute left-4 right-4 top-4 z-10 max-w-xl rounded-3xl bg-ink-900/75 p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur-md md:left-6 md:top-6 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">สองคลอง · ควนลัง</p>
        <h1 className="mt-2 text-2xl font-bold leading-snug md:text-3xl">
          คลองอู่ตะเภาตอนนี้ น้ำ
          <span className={`ml-2 inline-flex items-center rounded-full px-3 py-0.5 align-middle text-xl ring-1 md:text-2xl ${STATUS_CHIP[mainStatus]}`}>
            {main ? (mainTrend === "UNKNOWN" ? WATER_STATUS_LABEL[mainStatus] : WATER_TREND_LABEL[mainTrend]) : "ไม่มีข้อมูล"}
          </span>
        </h1>
        {main ? (
          <p className="mt-3 text-sm leading-6 text-slate-200">
            จุดวัดน้ำ<b>{placeName(main.name)}</b> (ใกล้ควนลังที่สุด) · ระดับ {main.levelMsl !== null ? fmt(main.levelMsl) : "—"} ม.รทก. ·{" "}
            {mainFreeboard !== null ? (mainFreeboard > 0 ? <>ต่ำกว่าตลิ่ง <b>{fmt(mainFreeboard)} ม.</b></> : <b className="text-red-300">ล้นตลิ่ง {fmt(-mainFreeboard)} ม.</b>) : "ไม่ทราบระดับตลิ่ง"}{" "}
            · สถานะ <b>{WATER_STATUS_LABEL[mainStatus]}</b>
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-300">{feedError ?? "ยังไม่มีข้อมูลสถานีวัดน้ำ"}</p>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <span className={`inline-block h-2 w-2 rounded-full ${main ? "bg-emerald-400" : "bg-slate-400"} ${main && !reducedMotion.current ? "animate-pulse" : ""}`} />
          {main ? <>วัดเมื่อ {thaiTime(main.measuredAt)} · อัปเดตอัตโนมัติทุก 10 นาที</> : "เชื่อมต่อไม่สำเร็จ"}
        </p>
        {stations.length ? (
          <button type="button" onClick={() => setShowGauges((v) => !v)} aria-expanded={showGauges} className="mt-3 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15 md:hidden">
            {showGauges ? "ซ่อนไม้วัดน้ำ" : "ดูไม้วัดน้ำ 3 สถานี"}
          </button>
        ) : null}
      </section>

      {/* ---- ไม้วัดระดับน้ำ ต้นน้ำ → ควนลัง ---- */}
      {stations.length ? (
        <aside className={`absolute bottom-48 right-4 z-10 w-[17rem] rounded-3xl bg-ink-900/75 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur-md md:bottom-auto md:right-6 md:top-6 ${showGauges ? "" : "hidden md:block"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">ระดับน้ำตามลำคลอง</h2>
            <span className="text-[10px] text-slate-400">ต้นน้ำ → ควนลัง</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            {stations.map((s, i) => {
              const st = waterStatus(s);
              const fill = gaugeFill(s);
              const fb = freeboard(s);
              return (
                <div key={s.code} className="flex flex-1 flex-col items-center text-center">
                  <div className="relative h-32 w-9 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15">
                    <div className="absolute inset-x-0 border-t-2 border-dashed border-white/70" style={{ bottom: `${100 / 1.2}%` }} title="ระดับตลิ่ง" />
                    <div className="absolute inset-x-0 bottom-0 rounded-b-full transition-[height] duration-700" style={{ height: `${((fill ?? 0) / 1.2) * 100}%`, background: STATUS_COLOR[st] }} />
                  </div>
                  <p className="mt-2 text-[11px] font-bold leading-tight">{placeName(s.name)}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{fb !== null ? (fb > 0 ? `−${fmt(fb, 1)} ม.` : `ล้น ${fmt(-fb, 1)} ม.`) : "—"}</p>
                  {i === stations.length - 1 ? <p className="mt-0.5 rounded-full bg-sky-400/20 px-1.5 text-[9px] text-sky-200">ใกล้ควนลัง</p> : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-400">
            เส้นประ = ระดับตลิ่ง · ตัวเลข = ห่างจากตลิ่ง · น้ำที่ต้นน้ำสูงขึ้นก่อนมาถึงควนลังหลายชั่วโมง
          </p>
        </aside>
      ) : null}

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
      <p className="absolute bottom-9 right-16 z-10 hidden max-w-xl text-right text-[10px] leading-4 text-slate-400 md:block">
        ระดับน้ำ: คลังข้อมูลน้ำแห่งชาติ (สสน./กรมชลประทาน) · เส้นคลอง © OpenStreetMap contributors · คลอง ร.1 ไม่มีสถานีวัด แสดงเป็น<b>ภาพจำลอง</b>ตามระดับคลองอู่ตะเภา · เกณฑ์สถานะเป็นฉบับร่าง · หน้าต้นแบบ
      </p>
    </div>
  );
}
