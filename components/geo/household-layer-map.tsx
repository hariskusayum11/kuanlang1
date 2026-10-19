"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { HouseholdLayerPoint, VolunteerMapSkill } from "@/lib/geo/household-layer-map";
import type { ImportantSitePoint } from "@/lib/geo/important-sites";
import type { BaseMapKey, HouseholdLayerKey } from "@/lib/geo/map-view-state";
import type { CommunityBoundaryShape } from "@/lib/geo/community-boundaries";
import { boundaryBounds } from "@/domain/geo/community-boundary";

const MAP_VIEW_STORAGE_KEY = "skl-fris:household-map-view:v1";

type SavedMapView = { lat: number; lng: number; zoom: number };

function readSavedMapView(): SavedMapView | null {
  try {
    const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedMapView>;
    if (![value.lat, value.lng, value.zoom].every((item) => typeof item === "number" && Number.isFinite(item))) return null;
    if (value.lat! < -90 || value.lat! > 90 || value.lng! < -180 || value.lng! > 180 || value.zoom! < 1 || value.zoom! > 19) return null;
    return value as SavedMapView;
  } catch {
    return null;
  }
}

function saveMapView(map: import("leaflet").Map): void {
  const center = map.getCenter();
  try {
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
    } satisfies SavedMapView));
  } catch {
    // Storage อาจถูกปิดโดย browser — แผนที่ยังใช้งานต่อได้ตามปกติ
  }
}

/**
 * แผนที่พื้นฐาน
 * ดาวเทียมใช้ Esri World Imagery — เงื่อนไขของ Esri กำหนดให้แสดง "Powered by Esri"
 * และแหล่งภาพในแถบ attribution เสมอ (ห้ามซ่อน attribution control)
 * ต้องตรวจเงื่อนไขการใช้งาน (ปริมาณ/การใช้ในหน่วยงาน) ก่อนเปิดใช้จริงในวงกว้าง
 */
const BASE_MAPS: Record<BaseMapKey, { url: string; attribution: string; maxNativeZoom: number }> = {
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri</a> · Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxNativeZoom: 18,
  },
};

type MarkerLayerKey = Exclude<HouseholdLayerKey, "heat">;

/*
 * สีของหมุดอยู่ใน HTML ที่ Leaflet สร้างเอง (divIcon) จึงใช้คลาส Tailwind ไม่ได้
 * แผงชั้นข้อมูลและคำอธิบายสัญลักษณ์อ่านค่าจากชุดนี้ชุดเดียว เพื่อให้สีตรงกับหมุดเสมอ
 */
export const HOUSEHOLD_LAYERS: { key: MarkerLayerKey; label: string; shortLabel: string; color: string; iconPath: string }[] = [
  { key: "vulnerable", label: "มีกลุ่มเปราะบาง", shortLabel: "เปราะบาง", color: "#dc2626", iconPath: "M12 21s-7-4.35-7-10a4 4 0 017-2.65A4 4 0 0119 11c0 5.65-7 10-7 10z" },
  { key: "volunteer", label: "สนใจเป็นอาสาสมัคร", shortLabel: "อาสาสมัคร", color: "#2563eb", iconPath: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1M18 8V3M15.5 5.5h5" },
  { key: "host", label: "บ้านพักพิงเบื้องต้น", shortLabel: "จุดพักพิง", color: "#059669", iconPath: "M3 11l9-7 9 7M5 10v10h14V10M9 20v-6h6v6" },
];

export const HEATMAP_ICON_PATH = "M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3s-4 4.5-4 7a4 4 0 008 0c0-2.5-4-7-4-7z";

/** ระดับสีฮีตแมป — ใช้ทั้งวาด canvas และคำอธิบายสัญลักษณ์ */
export const FLOOD_DEPTH_SCALE: { minCm: number; rgb: string; label: string }[] = [
  { minCm: 150, rgb: "185,28,28", label: "1.50 ม. ขึ้นไป" },
  { minCm: 80, rgb: "234,88,12", label: "0.80–1.49 ม." },
  { minCm: 30, rgb: "245,158,11", label: "0.30–0.79 ม." },
  { minCm: 0, rgb: "250,204,21", label: "ต่ำกว่า 0.30 ม." },
];

export function belongsToLayer(point: HouseholdLayerPoint, layer: HouseholdLayerKey, volunteerSkill = ""): boolean {
  if (layer === "vulnerable") return point.vulnerableCount > 0;
  if (layer === "volunteer") return point.volunteerSkills.length > 0 && (!volunteerSkill || point.volunteerSkills.some((skill) => skill.code === volunteerSkill));
  if (layer === "host") return point.potentialHostHouse;
  return (point.floodDepthCm ?? 0) > 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function pointAddress(point: HouseholdLayerPoint): string {
  const parts = [
    point.houseNo ? `บ้านเลขที่ ${point.houseNo}` : "ไม่ระบุบ้านเลขที่",
    point.mooNo != null && point.mooNo > 0 ? `หมู่ ${point.mooNo}` : null,
    point.soi ? `ซอย ${point.soi}` : null,
    point.road ? `ถนน ${point.road}` : null,
    point.tambonName ? `ตำบล${point.tambonName}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function popupRow(label: string, value: string): string {
  return `<div style="display:grid;grid-template-columns:94px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid #eef2f7">
    <span style="color:#64748b;font-size:12px">${label}</span>
    <span style="color:#1e293b;font-size:12px;font-weight:600">${value}</span>
  </div>`;
}

function popup(point: HouseholdLayerPoint): string {
  const details: string[] = [];
  if (point.vulnerableCount) {
    details.push(popupRow("กลุ่มเปราะบาง", `<b>${point.vulnerableCount.toLocaleString("th-TH")}</b> คน<br/><span style="font-weight:400;color:#475569">วิกฤต ${point.triage.P1} · เร่งด่วน ${point.triage.P2} · เฝ้าระวัง ${point.triage.P3}${point.triage.UNASSESSED ? ` · ยังไม่ประเมิน ${point.triage.UNASSESSED}` : ""}</span>`));
  }
  if (point.assistanceNeeds.length) {
    details.push(popupRow("ต้องการช่วยเหลือ", point.assistanceNeeds.map((need) => `${escapeHtml(need.label)}${need.people === null ? "" : ` ${need.people.toLocaleString("th-TH")} คน`}`).join("<br/>")));
  }
  if (point.volunteerSkills.length) {
    details.push(popupRow("ทักษะอาสา", point.volunteerSkills.map((skill) => escapeHtml(skill.label)).join(" · ")));
  }
  if (point.potentialHostHouse) details.push(popupRow("จุดพักพิง", "ยินยอมเป็นจุดพักพิงเบื้องต้น"));
  if (point.floodDepthCm != null) {
    details.push(popupRow("ระดับน้ำสูงสุด", `${(point.floodDepthCm / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} เมตร`));
  }
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  return `<div style="font-family:system-ui;min-width:250px;max-width:320px;line-height:1.45">
    <div style="padding-bottom:8px;border-bottom:2px solid #dbeafe">
      <div style="font-size:15px;font-weight:800;color:#0f172a">${escapeHtml(pointAddress(point))}</div>
      <div style="margin-top:3px;font-size:12px;color:#64748b">${escapeHtml(point.communityName)} · รหัสใบ ${escapeHtml(point.sheetNo)}${point.surveyNo ? ` · ลำดับ ${escapeHtml(point.surveyNo)}` : ""}</div>
    </div>
    <div>${details.join("") || `<p style="margin:10px 0;color:#64748b">ไม่มีข้อมูลกลุ่มที่เลือกเพิ่มเติม</p>`}</div>
    <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:10px;padding:8px 12px;border-radius:8px;background:#2563eb;color:white;text-align:center;text-decoration:none;font-size:12px;font-weight:700">เปิดเส้นทางใน Google Maps ↗</a>
  </div>`;
}

type SkillStyle = { label: string; color: string; iconPath: string };
const SKILL_STYLE: Record<string, SkillStyle> = {
  EARLY_WARNING: { label: "เตือนภัย", color: "#e11d48", iconPath: "M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" },
  RESCUE: { label: "กู้ภัย", color: "#dc2626", iconPath: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 5a4 4 0 110 8 4 4 0 010-8zm-6.4-2.4l3.6 3.6m5.6 5.6l3.6 3.6m0-12.8l-3.6 3.6m-5.6 5.6l-3.6 3.6" },
  KITCHEN: { label: "ช่วยครัวชุมชน", color: "#ea580c", iconPath: "M4 10h16l-2 9H6l-2-9zM8 10V7a4 4 0 018 0v3M3 10h18" },
  ELDERLY_CARE: { label: "ดูแลผู้สูงอายุ", color: "#7c3aed", iconPath: "M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10zM12 7V3m-2 2h4" },
  RECOVERY: { label: "ฟื้นฟูหลังน้ำลด", color: "#059669", iconPath: "M4 20h16M6 20v-8l6-5 6 5v8M9 20v-5h6M18 6c-3 0-5-2-5-5 3 0 5 2 5 5z" },
  MECHANIC: { label: "ช่างซ่อมรถ", color: "#475569", iconPath: "M14 6a4 4 0 01-5 5L4 16l4 4 5-5a4 4 0 005-5l-3 2-3-3 2-3z" },
  ELECTRICIAN: { label: "ช่างไฟ", color: "#ca8a04", iconPath: "M13 2L5 14h6l-1 8 9-13h-6V2z" },
  CONSTRUCTION: { label: "ช่างก่อสร้าง", color: "#0891b2", iconPath: "M14 5l5 5M12 7l5 5M3 21l7-7m7-9l2-2 2 2-2 2M5 19l-2 2" },
};

export function skillStyle(skill: VolunteerMapSkill): SkillStyle {
  return SKILL_STYLE[skill.code] ?? { label: skill.label, color: "#2563eb", iconPath: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1" };
}

function visibleSkills(points: HouseholdLayerPoint[], selectedCode: string): VolunteerMapSkill[] {
  const byCode = new Map<string, VolunteerMapSkill>();
  for (const skill of points.flatMap((point) => point.volunteerSkills)) {
    if (!selectedCode || skill.code === selectedCode) byCode.set(skill.code, skill);
  }
  return [...byCode.values()];
}

function markerHtml(layers: typeof HOUSEHOLD_LAYERS, skills: VolunteerMapSkill[], count: number): string {
  const nonVolunteerLayers = layers.filter((layer) => layer.key !== "volunteer");
  return `<div style="position:relative;display:flex;gap:2px;width:max-content;padding:3px;border-radius:16px;background:white;box-shadow:0 2px 9px rgba(15,23,42,.45)">
    ${nonVolunteerLayers.map((layer) => `<span title="${layer.label}" style="display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:${layer.color};color:white">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${layer.iconPath}"/></svg>
    </span>`).join("")}
    ${skills.map((skill) => { const style = skillStyle(skill); return `<span title="${escapeHtml(skill.label)}" style="display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:${style.color};color:white"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${style.iconPath}"/></svg></span>`; }).join("")}
    ${count > 1 ? `<span style="position:absolute;right:-9px;top:-9px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#0f172a;color:white;font:700 10px/18px system-ui;text-align:center">${count}</span>` : ""}
  </div>`;
}

function groupedPopup(points: HouseholdLayerPoint[]): string {
  if (points.length === 1) return popup(points[0]);
  return `<div style="font-family:system-ui;min-width:270px;max-height:380px;overflow:auto;line-height:1.5">
    <div style="position:sticky;top:0;z-index:1;padding:8px;background:white;border-bottom:2px solid #cbd5e1;font-weight:800">พิกัดนี้มี ${points.length.toLocaleString("th-TH")} ครัวเรือน</div>
    ${points.map((point, index) => `<div style="margin-top:10px;padding:8px;border:1px solid #e2e8f0;border-radius:10px"><div style="margin-bottom:6px;color:#2563eb;font-size:12px;font-weight:800">ครัวเรือนที่ ${index + 1}</div>${popup(point)}</div>`).join("")}
  </div>`;
}

/** สี/สัญลักษณ์ของจุดสำคัญ แยกตามประเภท (ป้ายชื่อมาจาก IMPORTANT_SITE_TYPES ฝั่ง server) */
export const SITE_STYLE: Record<string, { color: string; symbol: string }> = {
  SCHOOL: { color: "#7c3aed", symbol: "🏫" },
  TEMPLE_OR_MOSQUE: { color: "#d97706", symbol: "🛕" },
  COMMUNITY_CENTER: { color: "#0891b2", symbol: "ⓔ" },
  MUNICIPAL_AREA: { color: "#475569", symbol: "🏢" },
  RELATIVE_HOME: { color: "#059669", symbol: "⌂" },
  OTHER: { color: "#334155", symbol: "★" },
};

export function siteTypeKey(site: Pick<ImportantSitePoint, "type">): string {
  return site.type ?? "OTHER";
}

function sitePopup(site: ImportantSitePoint, typeLabel: string): string {
  return `<div style="font-family:system-ui;min-width:220px;line-height:1.6"><b>${escapeHtml(site.name)}</b><br/>${escapeHtml(typeLabel)} · ${escapeHtml(site.communityName)}${site.address ? `<br/>${escapeHtml(site.address)}` : ""}${site.capacity != null ? `<br/>รองรับได้ ${site.capacity.toLocaleString("th-TH")} คน` : ""}</div>`;
}

/** popup ใช้คลาส Tailwind/Token (HTML นี้อยู่ใน document เดียวกัน ไม่ใช่ SVG) */
function boundaryPopup(boundary: CommunityBoundaryShape): string {
  return `<div class="min-w-[220px] font-sans leading-relaxed">
    <b class="text-ink-900">${escapeHtml(boundary.nameTh)}</b> <span class="text-slate-500">(${escapeHtml(boundary.code)})</span>
    <div class="mt-1 text-xs text-slate-600">ขอบเขตเวอร์ชัน ${boundary.version.toLocaleString("th-TH")} · ${boundary.isApproved ? "รับรองแล้ว" : '<span class="font-semibold text-sun-800">ร่าง — ยังไม่รับรอง</span>'}</div>
    ${boundary.source ? `<div class="mt-0.5 text-xs text-slate-500">ที่มา: ${escapeHtml(boundary.source)}</div>` : ""}
  </div>`;
}

function volunteerTooltip(points: HouseholdLayerPoint[], fallback: string): string {
  const skills = visibleSkills(points, "");
  return skills.length ? `อาสาสมัคร: ${skills.map((skill) => skill.label).join(", ")}` : fallback;
}

function addFloodHeatmap(L: typeof import("leaflet"), map: import("leaflet").Map, points: HouseholdLayerPoint[]) {
  const heatPoints = points.filter((point) => (point.floodDepthCm ?? 0) > 0);
  if (!heatPoints.length) return () => undefined;
  const canvas = L.DomUtil.create("canvas", "leaflet-flood-heatmap") as HTMLCanvasElement;
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  canvas.style.mixBlendMode = "multiply";
  map.getPanes().overlayPane.appendChild(canvas);

  const draw = () => {
    const size = map.getSize();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.x * ratio;
    canvas.height = size.y * ratio;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.globalCompositeOperation = "source-over";
    const radius = Math.max(24, Math.min(58, 28 + (map.getZoom() - 13) * 5));
    for (const point of heatPoints) {
      const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
      const depth = point.floodDepthCm ?? 0;
      const color = (FLOOD_DEPTH_SCALE.find((step) => depth >= step.minCm) ?? FLOOD_DEPTH_SCALE[FLOOD_DEPTH_SCALE.length - 1]).rgb;
      const alpha = Math.min(0.72, 0.24 + depth / 450);
      const gradient = context.createRadialGradient(pixel.x, pixel.y, 0, pixel.x, pixel.y, radius);
      gradient.addColorStop(0, `rgba(${color},${alpha})`);
      gradient.addColorStop(0.45, `rgba(${color},${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      context.fillStyle = gradient;
      context.fillRect(pixel.x - radius, pixel.y - radius, radius * 2, radius * 2);
    }
  };
  map.on("moveend zoomend resize", draw);
  draw();
  return () => {
    map.off("moveend zoomend resize", draw);
    canvas.remove();
  };
}

type LeafletHandle = { L: typeof import("leaflet"); map: import("leaflet").Map };

/**
 * แผนที่ Leaflet แบบ "ควบคุมจากภายนอก" — สร้างแผนที่ครั้งเดียว แล้วสลับชั้นข้อมูลในที่
 * (เดิมสร้างแผนที่ใหม่ทั้งก้อนทุกครั้งที่ติ๊ก checkbox ทำให้กระพริบและมุมกล้องกระโดด)
 *
 * `fitKey` เปลี่ยนเมื่อพื้นที่/ช่วงวันที่เปลี่ยน → จัดมุมกล้องให้ครอบข้อมูลชุดใหม่
 * การติ๊กชั้นข้อมูลไม่ขยับกล้อง เพื่อให้ผู้ใช้เปรียบเทียบชั้นในบริเวณเดิมได้
 */
export function HouseholdLayerMap({
  points,
  sites,
  siteTypeLabels,
  center,
  defaultZoom = 14,
  base,
  layers,
  volunteerSkill,
  siteTypes,
  boundaries,
  showBoundaries,
  selectedCommunityId,
  fitKey,
  onCenterChange,
}: {
  points: HouseholdLayerPoint[];
  sites: ImportantSitePoint[];
  siteTypeLabels: Record<string, string>;
  center: { lat: number; lng: number };
  defaultZoom?: number;
  base: BaseMapKey;
  layers: HouseholdLayerKey[];
  volunteerSkill: string;
  siteTypes: string[];
  boundaries: CommunityBoundaryShape[];
  showBoundaries: boolean;
  /** ชุมชนที่กรองอยู่ — เน้นขอบเขตนั้น ชุมชนอื่นจางลง */
  selectedCommunityId?: string;
  fitKey: string;
  onCenterChange?: (center: { lat: number; lng: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<LeafletHandle | null>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);
  // มุมกล้องเริ่มต้นอ่านครั้งเดียวตอนสร้างแผนที่ — ค่าที่มาทีหลังจัดการผ่าน fitKey
  const initialRef = useRef({ center, defaultZoom });
  // มุมที่ผู้ใช้เคยดูไว้ อ่านก่อนสร้างแผนที่ — ต้องเก็บแยก เพราะแผนที่จะบันทึกมุมเริ่มต้นทับทันทีที่สร้าง
  const savedViewRef = useRef<SavedMapView | null>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      const { center: start, defaultZoom: zoom } = initialRef.current;
      const savedView = readSavedMapView();
      savedViewRef.current = savedView;
      map = L.map(ref.current, { scrollWheelZoom: true }).setView(
        savedView ? [savedView.lat, savedView.lng] : [start.lat, start.lng],
        savedView?.zoom ?? zoom,
      );
      const created = map;
      const reportView = () => {
        saveMapView(created);
        const c = created.getCenter();
        onCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
      };
      map.on("moveend zoomend", reportView);
      reportView();
      // แผงชั้นข้อมูล/แผ่นด้านล่างเปลี่ยนขนาดพื้นที่แผนที่บนมือถือ — ให้ Leaflet วัดใหม่
      observer = new ResizeObserver(() => created.invalidateSize());
      observer.observe(ref.current);
      setHandle({ L, map });
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (map) {
        saveMapView(map);
        map.remove();
      }
      setHandle(null);
    };
  }, []);

  // แผนที่พื้นฐาน
  useEffect(() => {
    if (!handle) return;
    const config = BASE_MAPS[base];
    const tiles = handle.L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: 19,
      maxNativeZoom: config.maxNativeZoom,
    }).addTo(handle.map);
    tiles.bringToBack();
    // สีเส้นขอบชุมชนสลับตามพื้นแผนที่ (ดู .map-satellite ใน globals.css)
    // ใช้ classList ไม่ใช่ prop className — React จะเขียนทับคลาส leaflet-container ที่ Leaflet ใส่ไว้
    const container = handle.map.getContainer();
    container.classList.toggle("map-satellite", base === "satellite");
    return () => {
      tiles.remove();
      container.classList.remove("map-satellite");
    };
  }, [handle, base]);

  // เส้นขอบชุมชน + ป้ายชื่อ — อยู่ใต้หมุดเสมอ (overlayPane / zIndexOffset ติดลบ)
  useEffect(() => {
    if (!handle || !showBoundaries || !boundaries.length) return;
    const { L, map } = handle;
    const group = L.layerGroup().addTo(map);
    for (const boundary of boundaries) {
      const dim = Boolean(selectedCommunityId && boundary.communityId !== selectedCommunityId);
      const className = ["map-boundary", boundary.isApproved ? "" : "map-boundary-draft", dim ? "map-boundary-dim" : ""].filter(Boolean).join(" ");
      L.geoJSON(boundary.geometry, { style: () => ({ className }) })
        .addTo(group)
        .bindTooltip(escapeHtml(boundary.nameTh), { sticky: true, direction: "top" })
        .bindPopup(boundaryPopup(boundary));
      if (boundary.labelPoint) {
        L.marker([boundary.labelPoint.lat, boundary.labelPoint.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span class="map-boundary-label${dim ? " map-boundary-label-dim" : ""}">${escapeHtml(boundary.nameTh)}</span>`,
            iconSize: [0, 0],
          }),
          interactive: false,
          keyboard: false,
          zIndexOffset: -1000,
        }).addTo(group);
      }
    }
    return () => { group.remove(); };
  }, [handle, boundaries, showBoundaries, selectedCommunityId]);

  // จุดครัวเรือน (รวมจุดที่พิกัดซ้ำเป็นหมุดเดียว)
  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const group = L.layerGroup().addTo(map);
    const markerKeys = HOUSEHOLD_LAYERS.filter((layer) => layers.includes(layer.key));
    const groups = new Map<string, HouseholdLayerPoint[]>();
    for (const point of points) {
      if (!markerKeys.some((layer) => belongsToLayer(point, layer.key, volunteerSkill))) continue;
      const key = `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
      groups.set(key, [...(groups.get(key) ?? []), point]);
    }
    for (const members of groups.values()) {
      const first = members[0];
      const shown = markerKeys.filter((layer) => members.some((point) => belongsToLayer(point, layer.key, volunteerSkill)));
      const skills = shown.some((layer) => layer.key === "volunteer") ? visibleSkills(members, volunteerSkill) : [];
      const iconCount = shown.filter((layer) => layer.key !== "volunteer").length + skills.length;
      const iconWidth = 6 + Math.max(1, iconCount) * 27;
      const icon = L.divIcon({
        className: "",
        html: markerHtml(shown, skills, members.length),
        iconSize: [iconWidth, 31],
        iconAnchor: [iconWidth / 2, 16],
      });
      const fallback = shown.map((layer) => layer.shortLabel).join(" · ");
      L.marker([first.lat, first.lng], { icon })
        .addTo(group)
        .bindTooltip(shown.some((layer) => layer.key === "volunteer") ? volunteerTooltip(members, fallback) : fallback, { direction: "top", offset: [0, -12] })
        .bindPopup(groupedPopup(members), { maxWidth: 340 });
    }
    return () => { group.remove(); };
  }, [handle, points, layers, volunteerSkill]);

  // จุดสำคัญ แยกตามประเภท
  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const group = L.layerGroup().addTo(map);
    for (const site of sites) {
      const type = siteTypeKey(site);
      if (!siteTypes.includes(type)) continue;
      const style = SITE_STYLE[type] ?? SITE_STYLE.OTHER;
      const label = siteTypeLabels[type] ?? "จุดสำคัญ";
      const icon = L.divIcon({
        className: "",
        html: `<div title="${escapeHtml(label)}" style="display:grid;place-items:center;width:34px;height:34px;border:3px solid white;border-radius:10px;background:${style.color};box-shadow:0 2px 9px rgba(15,23,42,.5);color:white;font:700 18px/1 system-ui">${style.symbol}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker([site.lat, site.lng], { icon, zIndexOffset: 500 })
        .addTo(group)
        .bindTooltip(`${label}: ${site.name}`, { direction: "top" })
        .bindPopup(sitePopup(site, label));
    }
    return () => { group.remove(); };
  }, [handle, sites, siteTypes, siteTypeLabels]);

  // ฮีตแมประดับน้ำ
  const heatOn = layers.includes("heat");
  useEffect(() => {
    if (!handle || !heatOn) return;
    return addFloodHeatmap(handle.L, handle.map, points);
  }, [handle, points, heatOn]);

  // จัดมุมกล้อง: ครั้งแรกคงมุมที่เคยดูไว้ (ถ้ายังครอบข้อมูล) · เปลี่ยนพื้นที่แล้วจัดใหม่เสมอ
  const lastFitKey = useRef<string | null>(null);
  useEffect(() => {
    if (!handle || lastFitKey.current === fitKey) return;
    const isFirst = lastFitKey.current === null;
    lastFitKey.current = fitKey;
    const { L, map } = handle;
    const bounds = L.latLngBounds([]);
    for (const point of points) bounds.extend([point.lat, point.lng]);
    for (const site of sites) bounds.extend([site.lat, site.lng]);
    // ขอบเขตชุมชน: เลือกชุมชนอยู่ → ครอบขอบเขตนั้นด้วย (เห็นทั้งพื้นที่แม้หมุดยังน้อย)
    // ไม่มีหมุดเลย → ครอบทุกชุมชน แทนการค้างอยู่ที่มุมเริ่มต้น
    const fitShapes = selectedCommunityId
      ? boundaries.filter((boundary) => boundary.communityId === selectedCommunityId)
      : bounds.isValid() ? [] : boundaries;
    const shapeBox = boundaryBounds(fitShapes.map((boundary) => boundary.geometry));
    if (shapeBox) bounds.extend([[shapeBox.south, shapeBox.west], [shapeBox.north, shapeBox.east]]);
    if (!bounds.isValid()) return;
    // คงมุมเดิมเฉพาะเมื่อยังเห็นข้อมูลอย่างน้อยหนึ่งจุดในกรอบจอ (แผนที่เพิ่งสร้างด้วยมุมที่บันทึกไว้)
    // เทียบแค่จุดกึ่งกลางไม่พอ: ซูมลึกที่กึ่งกลางกลุ่มอาจไม่มีหมุดสักจุดในจอ
    if (isFirst && savedViewRef.current) {
      const visible = map.getBounds();
      if (points.some((point) => visible.contains([point.lat, point.lng])) || sites.some((site) => visible.contains([site.lat, site.lng]))) return;
    }
    // เว้นขอบให้แผงชั้นข้อมูลที่ลอยทับแผนที่ (ขวา 340px บนเดสก์ท็อป · แถบล่าง 56px บนมือถือ)
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    map.fitBounds(bounds, {
      paddingTopLeft: [48, 48],
      paddingBottomRight: desktop ? [400, 48] : [48, 104],
      maxZoom: Math.min(initialRef.current.defaultZoom, 17),
    });
  }, [handle, fitKey, points, sites, boundaries, selectedCommunityId]);

  return <div ref={ref} className="h-full w-full" role="region" aria-label="แผนที่จุดครัวเรือน จุดสำคัญ และเส้นขอบชุมชน" />;
}

export function LayerIcon({ path, color, size = "md" }: { path: string; color: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full text-white ${size === "sm" ? "h-5 w-5" : "h-6 w-6"}`}
      // สีมาจากชุดเดียวกับหมุดบนแผนที่ (ดูคอมเมนต์ HOUSEHOLD_LAYERS)
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}><path d={path} /></svg>
    </span>
  );
}
