"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { HouseholdLayerPoint, VolunteerMapSkill } from "@/lib/geo/household-layer-map";
import type { ImportantSitePoint } from "@/lib/geo/important-sites";
import type { BaseMapKey, HouseholdLayerKey } from "@/lib/geo/map-view-state";
import type { CommunityBoundaryShape } from "@/lib/geo/community-boundaries";
import { boundaryBounds } from "@/domain/geo/community-boundary";
import type { CommunityMapSummary } from "@/lib/geo/community-map-summary";
import { formatRai, thaiShortDate } from "@/domain/geo/community-summary";
import { depthBin, FLOOD_DEPTH_BINS, heatVar } from "@/domain/flood/depth-scale";
import { highestUrgency, MAP_URGENCY_LABELS } from "@/domain/geo/map-urgency";
import { HELP_URGENCY_LABELS, HELP_URGENCY_WORD } from "@/domain/geo/help-priority";
import { RISK_LEVEL_LABEL } from "@/domain/rules/priority-rules";
import { RED_GROUP_LABELS, RED_GROUP_NO } from "@/domain/vulnerable/red-group";
import type { HelpCase } from "@/lib/risk/help-priority";

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
  // ไอคอนวีลแชร์ (Owner Decision 2026-10-19 แทนรูปหัวใจ) — สีบนหมุดจริงเปลี่ยนตามความเร่งด่วน (.map-urgency-*)
  { key: "vulnerable", label: "มีกลุ่มเปราะบาง", shortLabel: "เปราะบาง", color: "#dc2626", iconPath: "M3 16a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M17 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M19 17a3 3 0 0 0 -3 -3h-3.4M3 3h1a2 2 0 0 1 2 2v6M6 8h11M15 8v6" },
  { key: "volunteer", label: "สนใจเป็นอาสาสมัคร", shortLabel: "อาสาสมัคร", color: "#2563eb", iconPath: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1M18 8V3M15.5 5.5h5" },
  // บ้านที่ติ๊กยินยอมแต่ยังไม่ได้ยืนยัน — ยืนยันแล้วจะย้ายไปเป็นจุดสำคัญ "บ้านพักพิง" (docs/38)
  { key: "host", label: "บ้านเสนอเป็นจุดพักพิง (ยังไม่ยืนยัน)", shortLabel: "เสนอพักพิง", color: "#059669", iconPath: "M3 11l9-7 9 7M5 10v10h14V10M9 20v-6h6v6" },
];

export const HEATMAP_ICON_PATH = "M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3s-4 4.5-4 7a4 4 0 008 0c0-2.5-4-7-4-7z";


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
  // โหมดกลุ่มสีแดง (docs/42) — บอกเลขกลุ่มตามเอกสารทีม ไม่มีชื่อคน/รายละเอียดโรค
  if (point.redGroups?.length) {
    details.push(popupRow("กลุ่มสีแดง", `<span style="color:#b91c1c">${point.redGroups.map((group) => escapeHtml(`${RED_GROUP_NO[group]}. ${RED_GROUP_LABELS[group]}`)).join("<br/>")}</span>`));
  }
  if (point.vulnerableCount) {
    details.push(popupRow("กลุ่มเปราะบาง", `<b>${point.vulnerableCount.toLocaleString("th-TH")}</b> คน<br/><span style="font-weight:400;color:#475569">วิกฤต ${point.triage.P1} · เร่งด่วน ${point.triage.P2} · เฝ้าระวัง ${point.triage.P3}${point.triage.UNASSESSED ? ` · ยังไม่ประเมิน ${point.triage.UNASSESSED}` : ""}</span>`));
  }
  if (point.assistanceNeeds.length) {
    details.push(popupRow("ต้องการช่วยเหลือ", point.assistanceNeeds.map((need) => `${escapeHtml(need.label)}${need.people === null ? "" : ` ${need.people.toLocaleString("th-TH")} คน`}`).join("<br/>")));
  }
  if (point.volunteerSkills.length) {
    details.push(popupRow("ทักษะอาสา", point.volunteerSkills.map((skill) => escapeHtml(skill.label)).join(" · ")));
  }
  if (point.potentialHostHouse) details.push(popupRow("จุดพักพิง", "ยินยอมเบื้องต้น — ยังไม่ได้ยืนยัน (ยืนยันได้ที่เมนู “ยืนยันบ้านพักพิง”)"));
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

function markerHtml(layers: typeof HOUSEHOLD_LAYERS, skills: VolunteerMapSkill[], members: HouseholdLayerPoint[]): string {
  const count = members.length;
  const nonVolunteerLayers = layers.filter((layer) => layer.key !== "volunteer");
  // บ้านที่มีกลุ่มเปราะบาง: สีตามความเร่งด่วนสูงสุดของกลุ่มบ้านในพิกัดนี้ (วิกฤตมีวงกระเพื่อม)
  const urgency = highestUrgency(members.map((member) => member.triage));
  return `<div style="position:relative;display:flex;gap:2px;width:max-content;padding:3px;border-radius:16px;background:white;box-shadow:0 2px 9px rgba(15,23,42,.45)">
    ${nonVolunteerLayers.map((layer) => layer.key === "vulnerable" && urgency
      ? `<span title="${MAP_URGENCY_LABELS[urgency]}" class="map-urgency map-urgency-${urgency}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${layer.iconPath}"/></svg>
    </span>`
      : `<span title="${layer.label}" style="display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:${layer.color};color:white">
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

/** หมุดลำดับการช่วยเหลือ — ตัวเลข = ลำดับในรายการ · สีตามความเร่งด่วน (คลาสใน globals.css) */
export function helpMarkerHtml(item: Pick<HelpCase, "rank" | "urgency">): string {
  const tone = item.urgency === "none" ? "map-help-none" : `map-urgency map-urgency-${item.urgency}`;
  return `<span class="${tone} map-help-rank" title="${HELP_URGENCY_LABELS[item.urgency]}">${item.rank.toLocaleString("th-TH")}</span>`;
}

function helpPopup(item: HelpCase): string {
  const t = item.triage;
  const people = t.P1 + t.P2 + t.P3 + t.UNASSESSED;
  const address = [item.houseNo ? `บ้านเลขที่ ${item.houseNo}` : "ไม่ระบุบ้านเลขที่", item.mooNo ? `หมู่ ${item.mooNo}` : null].filter(Boolean).join(" · ");
  const rows = [
    popupRow("ความเร่งด่วน", escapeHtml(HELP_URGENCY_LABELS[item.urgency])),
    people
      ? popupRow("กลุ่มเปราะบาง", `<b>${people.toLocaleString("th-TH")}</b> คน<br/><span style="font-weight:400;color:#475569">วิกฤต ${t.P1} · เร่งด่วน ${t.P2} · เฝ้าระวัง ${t.P3}${t.UNASSESSED ? ` · ยังไม่ประเมิน ${t.UNASSESSED}` : ""}</span>`)
      : "",
    popupRow(
      "ความเสี่ยงบ้าน",
      `${item.riskLevel ? RISK_LEVEL_LABEL[item.riskLevel] : "ข้อมูลไม่พอประเมิน"} · คะแนน ${item.absoluteScore.toLocaleString("th-TH")}<br/><span style="font-weight:400;color:#475569">ความมั่นใจ ${Math.round(item.confidence * 100)}%${item.hardRule ? " · เข้ากฎบังคับ (ผู้ป่วยติดเตียง/ฟอกไต)" : ""}</span>`,
    ),
  ];
  const googleMapsUrl = item.lat != null && item.lng != null ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}` : null;
  return `<div style="font-family:system-ui;min-width:250px;max-width:320px;line-height:1.45">
    <div style="padding-bottom:8px;border-bottom:2px solid #dbeafe">
      <div style="font-size:12px;font-weight:800;color:#2563eb">ลำดับที่ ${item.rank.toLocaleString("th-TH")}</div>
      <div style="font-size:15px;font-weight:800;color:#0f172a">${escapeHtml(address)}</div>
      <div style="margin-top:3px;font-size:12px;color:#64748b">${escapeHtml(item.communityName)} · รหัสใบ ${escapeHtml(item.sheetNo)}</div>
    </div>
    <div>${rows.join("")}</div>
    ${googleMapsUrl ? `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:10px;padding:8px 12px;border-radius:8px;background:#2563eb;color:white;text-align:center;text-decoration:none;font-size:12px;font-weight:700">เปิดเส้นทางใน Google Maps ↗</a>` : ""}
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
function popupStat(label: string, value: number, tone: string): string {
  return `<div class="rounded-lg px-1.5 py-1 ${tone}">
    <div class="text-base font-bold tabular-nums leading-tight">${value.toLocaleString("th-TH")}</div>
    <div class="text-[10px] font-semibold">${label}</div>
  </div>`;
}

function coverageLine(summary: CommunityMapSummary): string {
  const coverage = summary.verifiedCoverage;
  // ไม่มีจำนวนครัวเรือนทั้งหมด → "ยังไม่ทราบ" ห้ามแสดงเป็น 0% (CLAUDE.md: Data as hero)
  if (coverage.kind === "NOT_CALCULABLE" || summary.totalHouseholds == null) {
    return `<span class="text-slate-500">ยังไม่ทราบ — ยังไม่ได้กำหนดจำนวนครัวเรือนทั้งหมดของชุมชน</span>`;
  }
  const percent = Number.isFinite(coverage.percent) ? coverage.percent : 0;
  const status = coverage.meetsTarget
    ? `<span class="font-semibold text-emerald-700">ผ่านเป้า</span>`
    : `<span class="font-semibold text-sun-800">ยังไม่ถึงเป้า</span>`;
  return `<b class="tabular-nums text-ink-900">${percent.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%</b>
    <span class="text-slate-500">(${summary.verified.toLocaleString("th-TH")} จาก ${summary.totalHouseholds.toLocaleString("th-TH")} ครัวเรือน · เป้า &gt; ${summary.targetCoveragePercent}%)</span> ${status}`;
}

/**
 * กล่องข้อมูลชุมชน (docs/35) — ตัวเลขรวมระดับชุมชน ไม่มีข้อมูลรายบ้าน
 * ข้อมูลขอบเขต (เวอร์ชัน/ที่มา) เป็นบรรทัดเล็กท้ายกล่อง เพราะผู้ใช้ส่วนใหญ่ไม่ได้ใช้
 */
function boundaryPopup(
  boundary: CommunityBoundaryShape,
  summary: CommunityMapSummary | undefined,
  generatedAt: string,
  filterHref: string | null,
): string {
  const header = `<div class="font-bold text-ink-900">${escapeHtml(boundary.nameTh)} <span class="font-normal text-slate-500">(${escapeHtml(boundary.code)})</span></div>`;
  const footer = `<div class="mt-2 border-t border-slate-100 pt-1.5 text-[11px] leading-snug text-slate-400">
    ขอบเขตเวอร์ชัน ${boundary.version.toLocaleString("th-TH")} · ${boundary.isApproved ? "รับรองแล้ว" : '<span class="font-semibold text-sun-800">ร่าง — ยังไม่รับรอง</span>'}
    ${boundary.source ? `<br/>ที่มา: ${escapeHtml(boundary.source)}` : ""}
  </div>`;
  if (!summary) {
    return `<div class="min-w-[220px] font-sans leading-relaxed">${header}<div class="mt-1 text-xs text-slate-500">ยังไม่มีข้อมูลสรุปของชุมชนนี้</div>${footer}</div>`;
  }

  const vulnerable = summary.vulnerable;
  const typeRows = vulnerable.byType
    .map((type) => `<li class="flex justify-between gap-3"><span>${escapeHtml(type.name)}</span><b class="tabular-nums">${type.count.toLocaleString("th-TH")}</b></li>`)
    .join("");

  return `<div class="w-[260px] font-sans text-xs leading-relaxed text-slate-700">
    ${header}
    <div class="mt-2 grid grid-cols-3 gap-1.5 text-center">
      ${popupStat("สำรวจแล้ว", summary.surveyed, "bg-brand-50 text-brand-800")}
      ${popupStat("ตรวจแล้ว", summary.verified, "bg-emerald-50 text-emerald-800")}
      ${popupStat("รอตรวจ", summary.pending, summary.pending > 0 ? "bg-sun-50 text-sun-900" : "bg-slate-50 text-slate-500")}
    </div>
    <div class="mt-2"><span class="font-semibold text-slate-500">ความครอบคลุม (ตรวจแล้ว):</span> ${coverageLine(summary)}</div>
    <div class="mt-2">
      <span class="font-semibold text-slate-500">กลุ่มเปราะบาง:</span>
      <b class="tabular-nums text-ink-900">${vulnerable.activePersons.toLocaleString("th-TH")}</b> คน
      ${vulnerable.inactivePersons > 0 ? `<span class="text-slate-400">· ไม่นับแล้ว ${vulnerable.inactivePersons.toLocaleString("th-TH")} คน (เสียชีวิต/ย้ายออก)</span>` : ""}
      ${typeRows ? `<ul class="mt-1 space-y-0.5 rounded-lg bg-mist px-2 py-1.5">${typeRows}</ul>` : ""}
    </div>
    <div class="mt-2"><span class="font-semibold text-slate-500">พื้นที่:</span> ${formatRai(summary.areaRai)} · <span class="font-semibold text-slate-500">จุดอพยพในเขต:</span> ${summary.siteCount.toLocaleString("th-TH")} แห่ง</div>
    ${filterHref ? `<a href="${escapeHtml(filterHref)}" class="mt-2 inline-block font-semibold text-brand-700 underline underline-offset-2">แสดงเฉพาะชุมชนนี้ →</a>` : `<div class="mt-2 font-semibold text-brand-700">กำลังแสดงเฉพาะชุมชนนี้</div>`}
    <div class="mt-2 text-[11px] text-slate-400">ตัวเลขนับจากแบบสอบถามที่ตรวจแล้ว ณ ${thaiShortDate(new Date(generatedAt))} (สำรวจแล้ว/รอตรวจ รวมใบที่ยังไม่ตรวจ)</div>
    ${footer}
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
  map.getPanes().overlayPane.appendChild(canvas);
  // สีจาก Token (--heat-1..9 ใน globals.css) อ่านครั้งเดียว
  const rootStyle = getComputedStyle(document.documentElement);
  const colors = new Map(FLOOD_DEPTH_BINS.map((bin) => [bin.level, rootStyle.getPropertyValue(heatVar(bin.level)).trim()]));
  // ลึกสุดวาดทีหลัง → ทับบน จุดที่บ้านซ้อนกันจึงแสดงระดับที่ลึกที่สุด ไม่ใช่ความหนาแน่น
  const ordered = [...heatPoints].sort((a, b) => (a.floodDepthCm ?? 0) - (b.floodDepthCm ?? 0));
  const offscreen = document.createElement("canvas");

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
    offscreen.width = size.x;
    offscreen.height = size.y;
    const layer = offscreen.getContext("2d");
    if (!layer) return;
    const radius = Math.max(14, Math.min(40, 18 + (map.getZoom() - 13) * 4));
    for (const point of ordered) {
      const bin = depthBin(point.floodDepthCm);
      const color = bin ? colors.get(bin.level) : undefined;
      if (!color) continue;
      const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
      layer.fillStyle = color;
      layer.beginPath();
      layer.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
      layer.fill();
    }
    // เบลอขอบให้เป็นแผ่นต่อเนื่อง + โปร่งแสงทีเดียวทั้งชั้น (ไม่สะสมความเข้มตามจำนวนบ้าน)
    context.globalAlpha = 0.62;
    context.filter = `blur(${Math.round(radius / 2.5)}px)`;
    context.drawImage(offscreen, 0, 0);
    context.filter = "none";
    context.globalAlpha = 1;
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
  communitySummaries,
  summaryGeneratedAt,
  communityFilterHref,
  showBoundaries,
  selectedCommunityId,
  fitKey,
  onCenterChange,
  helpCases = null,
  helpOn = false,
  focusCase = null,
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
  /** สรุปรายชุมชนสำหรับกล่องข้อมูลเมื่อกดเขตชุมชน (docs/35) */
  communitySummaries?: Record<string, CommunityMapSummary>;
  summaryGeneratedAt?: string;
  /** ลิงก์ "แสดงเฉพาะชุมชนนี้" — คงชั้นข้อมูลที่เปิดอยู่ไว้ */
  communityFilterHref?: (communityId: string) => string;
  showBoundaries: boolean;
  /** ชุมชนที่กรองอยู่ — เน้นขอบเขตนั้น ชุมชนอื่นจางลง */
  selectedCommunityId?: string;
  fitKey: string;
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  /** ลำดับการช่วยเหลือ (docs/40) — null = ผู้ใช้ไม่มีสิทธิ์ */
  helpCases?: HelpCase[] | null;
  /** เปิดชั้นลำดับการช่วยเหลือ — ซ่อนหมุดชั้นครัวเรือนชั่วคราวไม่ให้ซ้อนกัน */
  helpOn?: boolean;
  /** กดรายการ → ซูมไปบ้านนั้นและเปิดกล่องข้อมูล (nonce ให้กดซ้ำบ้านเดิมได้) */
  focusCase?: { id: string; nonce: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<LeafletHandle | null>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);
  // อ่านตอนเปิดกล่องข้อมูล (bindPopup แบบฟังก์ชัน) — ไม่ต้องวาดเส้นขอบใหม่ทุกครั้งที่ชั้นข้อมูลเปลี่ยน
  const filterHrefRef = useRef(communityFilterHref);
  useEffect(() => { filterHrefRef.current = communityFilterHref; }, [communityFilterHref]);
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
        .bindPopup(
          () => boundaryPopup(
            boundary,
            communitySummaries?.[boundary.communityId],
            summaryGeneratedAt ?? new Date().toISOString(),
            boundary.communityId === selectedCommunityId ? null : (filterHrefRef.current?.(boundary.communityId) ?? null),
          ),
          { maxWidth: 300 },
        );
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
  }, [handle, boundaries, showBoundaries, selectedCommunityId, communitySummaries, summaryGeneratedAt]);

  // จุดครัวเรือน (รวมจุดที่พิกัดซ้ำเป็นหมุดเดียว) — ซ่อนเมื่อเปิดลำดับการช่วยเหลือ
  useEffect(() => {
    if (!handle || helpOn) return;
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
        html: markerHtml(shown, skills, members),
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
  }, [handle, points, layers, volunteerSkill, helpOn]);

  // ลำดับการช่วยเหลือ — หมุดตัวเลขตามลำดับ (ลำดับต้นอยู่บนสุดเมื่อซ้อนกัน)
  const helpMarkersRef = useRef(new Map<string, import("leaflet").Marker>());
  useEffect(() => {
    if (!handle || !helpOn || !helpCases) return;
    const { L, map } = handle;
    const group = L.layerGroup().addTo(map);
    const markers = helpMarkersRef.current;
    markers.clear();
    for (const item of helpCases) {
      if (item.lat == null || item.lng == null) continue;
      const width = 18 + String(item.rank).length * 7;
      const marker = L.marker([item.lat, item.lng], {
        icon: L.divIcon({ className: "", html: helpMarkerHtml(item), iconSize: [width, 26], iconAnchor: [width / 2, 13] }),
        zIndexOffset: 1000 + Math.max(0, 9000 - item.rank),
        title: `ลำดับ ${item.rank} · ${HELP_URGENCY_WORD[item.urgency]}`,
      })
        .addTo(group)
        .bindTooltip(`ลำดับ ${item.rank.toLocaleString("th-TH")} · ${HELP_URGENCY_WORD[item.urgency]}`, { direction: "top", offset: [0, -12] })
        .bindPopup(helpPopup(item), { maxWidth: 340 });
      markers.set(item.householdId, marker);
    }
    return () => { markers.clear(); group.remove(); };
  }, [handle, helpCases, helpOn]);

  useEffect(() => {
    if (!handle || !focusCase) return;
    const marker = helpMarkersRef.current.get(focusCase.id);
    if (!marker) return;
    handle.map.setView(marker.getLatLng(), Math.max(handle.map.getZoom(), 18), { animate: true });
    marker.openPopup();
  }, [handle, focusCase]);

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
