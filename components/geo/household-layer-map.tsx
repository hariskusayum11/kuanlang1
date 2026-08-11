"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { HouseholdLayerPoint, VolunteerMapSkill } from "@/lib/geo/household-layer-map";
import type { ImportantSitePoint } from "@/lib/geo/important-sites";

type LayerKey = "vulnerable" | "volunteer" | "host";
const LAYERS: { key: LayerKey; label: string; shortLabel: string; color: string; iconPath: string }[] = [
  { key: "vulnerable", label: "กลุ่มเปราะบาง", shortLabel: "เปราะบาง", color: "#dc2626", iconPath: "M12 21s-7-4.35-7-10a4 4 0 017-2.65A4 4 0 0119 11c0 5.65-7 10-7 10z" },
  { key: "volunteer", label: "ผู้สนใจเป็นอาสาสมัคร", shortLabel: "อาสาสมัคร", color: "#2563eb", iconPath: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1M18 8V3M15.5 5.5h5" },
  { key: "host", label: "บ้านที่ยินยอมเป็นจุดพักพิงเบื้องต้น", shortLabel: "จุดพักพิง", color: "#059669", iconPath: "M3 11l9-7 9 7M5 10v10h14V10M9 20v-6h6v6" },
];

function belongs(point: HouseholdLayerPoint, layer: LayerKey, volunteerSkill = ""): boolean {
  if (layer === "vulnerable") return point.vulnerableCount > 0;
  if (layer === "volunteer") return point.volunteerSkills.length > 0 && (!volunteerSkill || point.volunteerSkills.some((skill) => skill.code === volunteerSkill));
  return point.potentialHostHouse;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function popup(point: HouseholdLayerPoint): string {
  const parts = [`<b>${escapeHtml(point.communityName)}</b>`];
  if (point.vulnerableCount) {
    parts.push(`กลุ่มเปราะบาง <b>${point.vulnerableCount.toLocaleString("th-TH")}</b> คน (P1 ${point.triage.P1} · P2 ${point.triage.P2} · P3 ${point.triage.P3})`);
  }
  if (point.assistanceNeeds.length) {
    parts.push(`ความต้องการ: ${point.assistanceNeeds.map((need) => `${escapeHtml(need.label)}${need.people === null ? "" : ` ${need.people.toLocaleString("th-TH")} คน`}`).join(", ")}`);
  }
  if (point.volunteerSkills.length) parts.push(`สนใจอาสาสมัคร: ${point.volunteerSkills.map((skill) => escapeHtml(skill.label)).join(", ")}`);
  if (point.potentialHostHouse) parts.push("ยินยอมเป็นจุดพักพิงเบื้องต้น");
  return `<div style="font-family:system-ui;min-width:220px;line-height:1.6">${parts.join("<br/>")}</div>`;
}

function markerLayers(point: HouseholdLayerPoint, active: Record<LayerKey, boolean>, volunteerSkill: string) {
  return LAYERS
    .filter((layer) => active[layer.key] && belongs(point, layer.key, volunteerSkill));
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

function skillStyle(skill: VolunteerMapSkill): SkillStyle {
  return SKILL_STYLE[skill.code] ?? { label: skill.label, color: "#2563eb", iconPath: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1" };
}

function visibleSkills(points: HouseholdLayerPoint[], selectedCode: string): VolunteerMapSkill[] {
  const byCode = new Map<string, VolunteerMapSkill>();
  for (const skill of points.flatMap((point) => point.volunteerSkills)) {
    if (!selectedCode || skill.code === selectedCode) byCode.set(skill.code, skill);
  }
  return [...byCode.values()];
}

function markerHtml(layers: typeof LAYERS, skills: VolunteerMapSkill[], count: number): string {
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
  return `<div style="font-family:system-ui;min-width:240px;max-height:280px;overflow:auto;line-height:1.5">
    <b>พิกัดนี้มี ${points.length.toLocaleString("th-TH")} รายการ</b>
    ${points.map((point, index) => `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0"><b>รายการ ${index + 1}</b>${popup(point).replace(/^<div[^>]*>|<\/div>$/g, "")}</div>`).join("")}
  </div>`;
}

const SITE_STYLE = {
  SCHOOL: { label: "โรงเรียน", color: "#7c3aed", symbol: "🏫" },
  TEMPLE_OR_MOSQUE: { label: "วัด / มัสยิด", color: "#d97706", symbol: "🛕" },
  COMMUNITY_CENTER: { label: "ศูนย์ชุมชน / ศูนย์อพยพ", color: "#0891b2", symbol: "ⓔ" },
  MUNICIPAL_AREA: { label: "อาคารเทศบาล", color: "#475569", symbol: "🏢" },
  RELATIVE_HOME: { label: "บ้านพักพิง", color: "#059669", symbol: "⌂" },
  OTHER: { label: "จุดสำคัญ", color: "#334155", symbol: "★" },
} as const;

function sitePopup(site: ImportantSitePoint): string {
  const style = site.type ? SITE_STYLE[site.type] : SITE_STYLE.OTHER;
  return `<div style="font-family:system-ui;min-width:220px;line-height:1.6"><b>${escapeHtml(site.name)}</b><br/>${style.label} · ${escapeHtml(site.communityName)}${site.address ? `<br/>${escapeHtml(site.address)}` : ""}${site.capacity != null ? `<br/>รองรับได้ ${site.capacity.toLocaleString("th-TH")} คน` : ""}</div>`;
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
      const color = depth >= 150 ? "185,28,28" : depth >= 80 ? "234,88,12" : depth >= 30 ? "245,158,11" : "250,204,21";
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

export function HouseholdLayerMap({ points, sites, availableVolunteerSkills, center, defaultZoom = 14 }: { points: HouseholdLayerPoint[]; sites: ImportantSitePoint[]; availableVolunteerSkills: VolunteerMapSkill[]; center: { lat: number; lng: number }; defaultZoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<LayerKey, boolean>>({ vulnerable: true, volunteer: true, host: true });
  const [volunteerSkill, setVolunteerSkill] = useState("");
  const [showSites, setShowSites] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    let removeHeatmap: () => void = () => undefined;
    if (!ref.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], defaultZoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      const bounds = L.latLngBounds([]);
      const groups = new Map<string, HouseholdLayerPoint[]>();
      for (const point of points) {
        if (markerLayers(point, active, volunteerSkill).length === 0) continue;
        const key = `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
        groups.set(key, [...(groups.get(key) ?? []), point]);
      }
      for (const group of groups.values()) {
        const first = group[0];
        const layers = LAYERS.filter((layer) => group.some((point) => markerLayers(point, active, volunteerSkill).some((candidate) => candidate.key === layer.key)));
        const skills = active.volunteer ? visibleSkills(group, volunteerSkill) : [];
        const iconCount = layers.filter((layer) => layer.key !== "volunteer").length + skills.length;
        const iconWidth = 6 + Math.max(1, iconCount) * 27;
        const icon = L.divIcon({
          className: "",
          html: markerHtml(layers, skills, group.length),
          iconSize: [iconWidth, 31],
          iconAnchor: [iconWidth / 2, 16],
        });
        L.marker([first.lat, first.lng], { icon })
          .addTo(map)
          .bindTooltip(layers.some((layer) => layer.key === "volunteer") ? volunteerTooltip(group, layers.map((layer) => layer.shortLabel).join(" · ")) : layers.map((layer) => layer.shortLabel).join(" · "), { direction: "top", offset: [0, -12] })
          .bindPopup(groupedPopup(group));
        bounds.extend([first.lat, first.lng]);
      }
      if (showSites) {
        for (const site of sites) {
          const style = site.type ? SITE_STYLE[site.type] : SITE_STYLE.OTHER;
          const icon = L.divIcon({
            className: "",
            html: `<div title="${escapeHtml(style.label)}" style="display:grid;place-items:center;width:34px;height:34px;border:3px solid white;border-radius:10px;background:${style.color};box-shadow:0 2px 9px rgba(15,23,42,.5);color:white;font:700 18px/1 system-ui">${style.symbol}</div>`,
            iconSize: [34, 34], iconAnchor: [17, 17],
          });
          L.marker([site.lat, site.lng], { icon }).addTo(map).bindTooltip(`${style.label}: ${site.name}`, { direction: "top" }).bindPopup(sitePopup(site));
          bounds.extend([site.lat, site.lng]);
        }
      }
      if (showHeatmap) removeHeatmap = addFloodHeatmap(L, map, points);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(defaultZoom, 17) });
    })();
    return () => { cancelled = true; removeHeatmap(); map?.remove(); };
  }, [points, sites, center.lat, center.lng, defaultZoom, active, volunteerSkill, showSites, showHeatmap]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b-2 border-slate-100 bg-slate-50/70 p-4">
        {LAYERS.map((layer) => (
          <label key={layer.key} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={active[layer.key]} onChange={(event) => setActive((old) => ({ ...old, [layer.key]: event.target.checked }))} />
            <LayerIcon path={layer.iconPath} color={layer.color} />
            {layer.label}
          </label>
        ))}
        <label className="ml-auto flex min-w-[220px] items-center gap-2 text-xs font-semibold text-slate-600">
          ทักษะอาสาสมัคร
          <select value={volunteerSkill} onChange={(event) => setVolunteerSkill(event.target.value)} className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 bg-white px-2 py-1.5">
            <option value="">ทุกทักษะ</option>
            {availableVolunteerSkills.map((skill) => <option key={skill.code} value={skill.code}>{skill.label}</option>)}
          </select>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={showSites} onChange={(event) => setShowSites(event.target.checked)} />
          <span aria-hidden="true">🏫</span> จุดสำคัญพื้นที่
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={showHeatmap} onChange={(event) => setShowHeatmap(event.target.checked)} />
          <span aria-hidden="true">🌊</span> ฮีตแมประดับน้ำ
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-2 text-[11px] text-slate-600">
        <strong>สัญลักษณ์ทักษะ:</strong>
        {availableVolunteerSkills.map((skill) => { const style = skillStyle(skill); return <span key={skill.code} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-100 px-2 py-1"><LayerIcon path={style.iconPath} color={style.color} />{skill.label}</span>; })}
      </div>
      {showHeatmap ? <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-white px-4 py-2 text-[11px] text-slate-600"><strong>ระดับน้ำสูงสุด:</strong><span className="inline-flex items-center gap-1"><i className="h-3 w-5 rounded bg-yellow-300" /> ต่ำกว่า 30 ซม.</span><span className="inline-flex items-center gap-1"><i className="h-3 w-5 rounded bg-amber-500" /> 30–79 ซม.</span><span className="inline-flex items-center gap-1"><i className="h-3 w-5 rounded bg-orange-600" /> 80–149 ซม.</span><span className="inline-flex items-center gap-1"><i className="h-3 w-5 rounded bg-red-700" /> 150 ซม.ขึ้นไป</span><span>บริเวณที่จุดใกล้กันจะมีสีเข้มขึ้น</span></div> : null}
      <div ref={ref} className="h-[580px] w-full" role="img" aria-label="แผนที่จุดครัวเรือนแยกตามกลุ่มข้อมูล" />
    </div>
  );
}

function LayerIcon({ path, color }: { path: string; color: string }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d={path} /></svg>
    </span>
  );
}
