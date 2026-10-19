"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { PublicMapCommunity, PublicMapSite } from "@/lib/public/stats";
import { formatRai, thaiShortDate } from "@/domain/geo/community-summary";
import {
  GRID_METRIC_LABELS,
  GRID_MIN_HOUSEHOLDS,
  gridLegend,
  gridLevel,
  type FloodGridCell,
  type GridMetric,
} from "@/domain/geo/flood-grid";
import { FLOOD_DEPTH_BINS, heatVar } from "@/domain/flood/depth-scale";

const SITE_TYPE_LABEL: Record<string, string> = {
  SCHOOL: "โรงเรียน",
  TEMPLE_OR_MOSQUE: "วัด / มัสยิด",
  COMMUNITY_CENTER: "ศูนย์ชุมชน / ศูนย์อพยพ",
  MUNICIPAL_AREA: "อาคาร/พื้นที่เทศบาล",
  RELATIVE_HOME: "บ้านพักพิง",
  OTHER: "จุดสำคัญอื่น ๆ",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;",
  );
}

/**
 * กล่องข้อมูลชุมชนฝั่งประชาชน (docs/35) — พื้นที่ · ครัวเรือนที่ตรวจแล้ว · จุดอพยพในเขตพร้อมปุ่มนำทาง
 * **ไม่มีตัวเลขกลุ่มเปราะบาง/สุขภาพ** แม้เป็นตัวเลขรวม (ชุมชนเล็ก ย้อนระบุตัวได้)
 */
function communityPopup(c: PublicMapCommunity, generatedAt: string): string {
  const sites = c.summary.sites.length
    ? `<ul class="mt-1 space-y-1">${c.summary.sites
        .map(
          (s) => `<li class="flex items-center justify-between gap-2"><span>${escapeHtml(s.name)}</span>
            <a class="shrink-0 font-semibold text-brand-700 underline underline-offset-2" target="_blank" rel="noopener noreferrer"
               href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">นำทาง</a></li>`,
        )
        .join("")}</ul>`
    : `<div class="text-slate-500">ยังไม่มีจุดอพยพที่บันทึกไว้ในเขตนี้</div>`;
  const draft = c.boundary && !c.boundaryApproved
    ? `<div class="mt-2 text-[11px] text-sun-800">ขอบเขตชุมชนเป็นฉบับร่าง อยู่ระหว่างตรวจสอบ</div>`
    : c.positionSource === "CENTROID"
      ? `<div class="mt-2 text-[11px] text-slate-500">ตำแหน่งชุมชนโดยประมาณ</div>`
      : "";
  return `<div class="w-[240px] font-sans text-xs leading-relaxed text-slate-700">
    <div class="text-sm font-bold text-ink-900">${escapeHtml(c.nameTh)}</div>
    <div class="mt-1.5 grid grid-cols-2 gap-1.5">
      <div class="rounded-lg bg-mist px-2 py-1"><div class="text-[10px] font-semibold text-slate-500">พื้นที่</div><div class="font-bold text-ink-900">${formatRai(c.summary.areaRai)}</div></div>
      <div class="rounded-lg bg-mist px-2 py-1"><div class="text-[10px] font-semibold text-slate-500">ครัวเรือนที่สำรวจแล้ว</div><div class="font-bold tabular-nums text-ink-900">${c.summary.verifiedHouseholds.toLocaleString("th-TH")}</div></div>
    </div>
    <div class="mt-2 font-semibold text-slate-500">จุดอพยพ/พักพิงในเขต</div>
    ${sites}
    ${draft}
    <div class="mt-2 text-[11px] text-slate-400">นับเฉพาะแบบสำรวจที่ตรวจสอบแล้ว ณ ${thaiShortDate(new Date(generatedAt))}</div>
  </div>`;
}

type LeafletHandle = { L: typeof import("leaflet"); map: import("leaflet").Map };
type MetricChoice = GridMetric | "off";

function gridPopup(cell: FloodGridCell): string {
  const depth = cell.avgDepthCm == null ? "ไม่มีคำตอบ" : `${(cell.avgDepthCm / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ม. <span class="text-slate-400">(ตอบ ${cell.depthAnswered} หลัง)</span>`;
  const floor = cell.belowRoadPercent == null ? "ไม่มีคำตอบ" : `${cell.belowRoadPercent}% <span class="text-slate-400">(ตอบ ${cell.floorAnswered} หลัง)</span>`;
  const duration = cell.avgDurationDays == null ? "ไม่มีคำตอบ" : `${cell.avgDurationDays.toLocaleString("th-TH")} วัน <span class="text-slate-400">(ตอบ ${cell.durationAnswered} หลัง)</span>`;
  return `<div class="w-[230px] font-sans text-xs leading-relaxed text-slate-700">
    <div class="font-bold text-ink-900">พื้นที่ประมาณ 200 × 200 ม.</div>
    <div class="text-slate-500">ครัวเรือนที่สำรวจในช่องนี้ ${cell.households.toLocaleString("th-TH")} หลัง</div>
    <div class="mt-1.5"><span class="font-semibold text-slate-500">ระดับน้ำเฉลี่ยที่เคยท่วม:</span> ${depth}</div>
    <div><span class="font-semibold text-slate-500">บ้านพื้นต่ำกว่าถนน:</span> ${floor}</div>
    <div><span class="font-semibold text-slate-500">ท่วมนานเฉลี่ย:</span> ${duration}</div>
    <div class="mt-1.5 text-[11px] text-slate-400">ค่าเฉลี่ยจากคำบอกเล่าของครัวเรือน ไม่ใช่แบบจำลองน้ำท่วมทางวิศวกรรม · ไม่แสดงช่องที่มีน้อยกว่า ${GRID_MIN_HOUSEHOLDS} หลัง</div>
  </div>`;
}

/**
 * แผนที่สาธารณะ — เส้นขอบชุมชน + หมุดชุมชน + จุดพักพิง/อพยพ + ช่องความรุนแรงน้ำท่วม (docs/39)
 * ไม่มีพิกัดรายบ้าน/PII (กติกา CLAUDE.md: Public map = aggregate เท่านั้น)
 * ใช้ซ้ำที่หน้าศูนย์อาสาสมัคร (ข้อมูลชุดเดียวกับสาธารณะ — อาสาเห็นเฉพาะที่จำเป็นต่อภารกิจ)
 * Leaflet โหลดแบบ dynamic ใน useEffect เพื่อไม่พึ่ง window ตอน SSR
 */
export function PublicMap({
  communities,
  sites,
  generatedAt,
  floodGrid,
}: {
  communities: PublicMapCommunity[];
  sites: PublicMapSite[];
  generatedAt: string;
  floodGrid: FloodGridCell[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [handle, setHandle] = useState<LeafletHandle | null>(null);
  const [metric, setMetric] = useState<MetricChoice>(floodGrid.length ? "depth" : "off");
  const [expanded, setExpanded] = useState(false);
  const [communityId, setCommunityId] = useState("");
  const overviewBounds = useRef<import("leaflet").LatLngBounds | null>(null);

  // สร้างแผนที่ครั้งเดียว
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      if (!ref.current) return;
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
        // ช่องความรุนแรงอยู่ใต้เส้นขอบและหมุดเสมอ
        map.createPane("floodGrid").style.zIndex = "350";
        setHandle({ L, map });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      setHandle(null);
    };
  }, []);

  // เส้นขอบ หมุดชุมชน จุดพักพิง
  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const group = L.layerGroup().addTo(map);
    const bounds = L.latLngBounds([]);

    // เส้นขอบชุมชน — สีจาก Token ผ่าน .map-boundary (globals.css) · เส้นประ = ร่าง
    for (const c of communities) {
      if (!c.boundary) continue;
      const className = c.boundaryApproved ? "map-boundary" : "map-boundary map-boundary-draft";
      const geometry: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: c.boundary };
      const layer = L.geoJSON(geometry, { style: () => ({ className }) })
        .addTo(group)
        .bindTooltip(escapeHtml(c.nameTh), { sticky: true, direction: "top" })
        .bindPopup(communityPopup(c, generatedAt), { maxWidth: 280 });
      bounds.extend(layer.getBounds());
    }

    for (const c of communities) {
      // ชื่อชุมชนเต็ม (Owner Decision 2026-10-19) — สไตล์ .map-community-pin ใน globals.css
      const icon = L.divIcon({ className: "", html: `<span class="map-community-pin">${escapeHtml(c.nameTh)}</span>`, iconSize: [0, 0] });
      L.marker([c.lat, c.lng], { icon })
        .addTo(group)
        .bindTooltip(escapeHtml(c.nameTh), { direction: "top" })
        .bindPopup(communityPopup(c, generatedAt), { maxWidth: 280 });
      bounds.extend([c.lat, c.lng]);
    }

    for (const s of sites) {
      const label = s.type ? SITE_TYPE_LABEL[s.type] ?? "จุดสำคัญ" : "จุดพักพิง";
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px 9999px 9999px 2px;transform:rotate(45deg);background:#ff6a00;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff"><span style="transform:rotate(-45deg);color:#0b1437;font-size:14px">⛑️</span></span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      });
      L.marker([s.lat, s.lng], { icon })
        .addTo(group)
        .bindTooltip(`${escapeHtml(label)}: ${escapeHtml(s.name)}`, { direction: "top" })
        .bindPopup(`<b>${escapeHtml(s.name)}</b><br/><span style="color:#64748b">${escapeHtml(label)}</span><br/><a style="color:#1d4ed8;font-weight:600" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">นำทาง</a>`);
      bounds.extend([s.lat, s.lng]);
    }

    overviewBounds.current = bounds.isValid() ? bounds : null;
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    else map.setView([7.0075, 100.418], 13); // fallback: ตำบลควนลัง
    return () => { group.remove(); };
  }, [handle, communities, sites, generatedAt]);

  // ช่องความรุนแรงน้ำท่วม — สีจาก Token --heat-* (อ่านค่าจริงจาก CSS เพราะ SVG attribute ใช้ var() ไม่ได้)
  useEffect(() => {
    if (!handle || metric === "off" || floodGrid.length === 0) return;
    const { L, map } = handle;
    const style = getComputedStyle(document.documentElement);
    const group = L.layerGroup().addTo(map);
    for (const cell of floodGrid) {
      const level = gridLevel(cell, metric);
      if (level == null) continue;
      const color = style.getPropertyValue(heatVar(level)).trim();
      const [s, w, n, e] = cell.bounds;
      L.rectangle([[s, w], [n, e]], { pane: "floodGrid", stroke: false, fillColor: color, fillOpacity: 0.6 })
        .addTo(group)
        .bindPopup(gridPopup(cell), { maxWidth: 260 });
    }
    return () => { group.remove(); };
  }, [handle, floodGrid, metric]);

  // ขยาย/ย่อ — แจ้ง Leaflet ให้คำนวณขนาดใหม่หลังกล่องเปลี่ยนขนาด
  useEffect(() => {
    if (!handle) return;
    const timer = window.setTimeout(() => handle.map.invalidateSize(), 50);
    if (!expanded) return () => window.clearTimeout(timer);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [handle, expanded]);

  function focusCommunity(id: string) {
    setCommunityId(id);
    if (!handle) return;
    const { L, map } = handle;
    const target = communities.find((c) => c.id === id);
    if (!target) {
      if (overviewBounds.current) map.fitBounds(overviewBounds.current, { padding: [40, 40], maxZoom: 15 });
      return;
    }
    if (target.boundary) {
      const layer = L.geoJSON({ type: "MultiPolygon", coordinates: target.boundary } as GeoJSON.MultiPolygon);
      map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    } else {
      map.setView([target.lat, target.lng], 16);
    }
  }

  if (failed) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
        ไม่สามารถโหลดแผนที่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  const legend = metric === "off" ? [] : gridLegend(metric, FLOOD_DEPTH_BINS.map((b) => ({ level: b.level, label: b.label })));

  return (
    <div className={expanded ? "fixed inset-0 z-[2000] flex flex-col bg-canvas p-3" : "space-y-3"}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem]">
          <span className="label">ชุมชน</span>
          <select className="field" value={communityId} onChange={(e) => focusCommunity(e.target.value)}>
            <option value="">ทุกชุมชน</option>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.nameTh}</option>)}
          </select>
        </label>
        <div role="group" aria-label="แสดงความรุนแรงน้ำท่วมตาม" className="flex flex-wrap gap-1">
          {(["depth", "belowRoad", "duration", "off"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={metric === value}
              disabled={value !== "off" && floodGrid.length === 0}
              onClick={() => setMetric(value)}
              className={`btn btn-sm ${metric === value ? "btn-primary" : "btn-secondary"}`}
            >
              {value === "depth" ? "ระดับน้ำ" : value === "belowRoad" ? "บ้านพื้นต่ำ" : value === "duration" ? "ท่วมนาน" : "ปิดชั้นความรุนแรง"}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm ml-auto" onClick={() => setExpanded((v) => !v)} aria-pressed={expanded}>
          {expanded ? "ย่อแผนที่ (Esc)" : "ขยายเต็มจอ"}
        </button>
      </div>

      {/* ขนาดอยู่ที่กล่องครอบเท่านั้น — className ของ div แผนที่ต้องคงที่
          มิฉะนั้น React จะเขียนทับคลาสที่ Leaflet ใส่ไว้ (leaflet-container ฯลฯ) แล้วภาพแผนที่ฐานหาย */}
      <div className={`relative ${expanded ? "min-h-0 flex-1" : "h-[360px] md:h-[460px]"}`}>
        <div
          ref={ref}
          className="h-full w-full rounded-2xl"
          role="application"
          aria-label="แผนที่ชุมชน จุดพักพิง และความรุนแรงน้ำท่วม"
        />
        {legend.length > 0 && metric !== "off" ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[14rem] rounded-xl border-2 border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-md">
            <p className="mb-1 font-bold text-slate-800">{GRID_METRIC_LABELS[metric]}</p>
            <ul className="space-y-0.5">
              {legend.map((step) => (
                <li key={`${step.level}-${step.label}`} className="flex items-center gap-1.5">
                  <i className="h-3 w-5 shrink-0 rounded" style={{ backgroundColor: `var(${heatVar(step.level)})`, opacity: 0.75 }} aria-hidden="true" />
                  {step.label}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-slate-400">ช่องละ ~200 ม. · ต้องมีอย่างน้อย {GRID_MIN_HOUSEHOLDS} หลัง</p>
          </div>
        ) : null}
      </div>
      {floodGrid.length === 0 ? (
        <p className="text-xs text-slate-500">ยังไม่มีพื้นที่ที่มีแบบสำรวจพร้อมพิกัดมากพอจะแสดงความรุนแรงน้ำท่วม (ต้องมีอย่างน้อย {GRID_MIN_HOUSEHOLDS} หลังต่อช่อง)</p>
      ) : null}
    </div>
  );
}
