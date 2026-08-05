"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type {
  SurveyMapPoint,
  BoundaryFeatureCollection,
  BoundaryProps,
} from "@/lib/geo/survey-map";

// แผนที่ภาพรวมการสำรวจระดับชุมชน (Leaflet)
// - โหลด Leaflet แบบ dynamic ใน useEffect (กันพัง SSR)
// - ชั้น choropleth: ระบายสีขอบเขตชุมชน (polygon) ตาม coverage · เส้นประ = ขอบเขตร่าง (ยังไม่รับรอง)
// - ชั้นหมุด: ใช้เฉพาะชุมชนที่ "ยังไม่มีขอบเขต" (fallback ด้วย centroid)
//   เขียว = ผ่านเป้า >60% · น้ำเงิน = มีการสำรวจแล้ว · เทา = ยังไม่สำรวจ

const COLOR = { met: "#14b8a6", active: "#2563eb", none: "#94a3b8" } as const;

function colorFor(keyed: number, meetsTarget: boolean | null): string {
  if (keyed === 0) return COLOR.none;
  if (meetsTarget === true) return COLOR.met;
  return COLOR.active;
}

function popupHtml(p: {
  nameTh: string;
  code: string;
  keyed: number;
  verified: number;
  coveragePercent: number | null;
  meetsTarget: boolean | null;
  approved?: boolean;
}): string {
  return `<div style="font-family:system-ui;min-width:160px">
    <b>${p.nameTh}</b> <span style="color:#94a3b8">(${p.code})</span><br/>
    คีย์แล้ว <b>${p.keyed.toLocaleString("th-TH")}</b> ใบ ·
    ตรวจแล้ว <b>${p.verified.toLocaleString("th-TH")}</b> ใบ<br/>
    ${
      p.coveragePercent === null
        ? '<span style="color:#94a3b8">Coverage: ยังไม่ทราบจำนวนครัวเรือน</span>'
        : `Coverage: <b>${p.coveragePercent.toFixed(1)}%</b> ${p.meetsTarget ? "✓ ผ่านเป้า" : ""}`
    }${
      p.approved === false
        ? '<br/><span style="color:#c99700;font-size:12px">⚠ ขอบเขตร่าง (ยังไม่รับรอง)</span>'
        : ""
    }
  </div>`;
}

export function SurveyMap({
  points,
  boundaries,
  center,
}: {
  points: SurveyMapPoint[];
  boundaries: BoundaryFeatureCollection;
  center: { lat: number; lng: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    if (!containerRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        [center.lat, center.lng],
        14,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      const bounds = L.latLngBounds([]);
      const covered = new Set<string>();

      // ── ชั้น choropleth (polygon) ──
      if (boundaries.features.length > 0) {
        const layer = L.geoJSON(boundaries as unknown as GeoJSON.GeoJsonObject, {
          style: (feature) => {
            const pr = (feature?.properties ?? {}) as BoundaryProps;
            const c = colorFor(pr.keyed, pr.meetsTarget);
            return {
              color: c,
              weight: 2,
              fillColor: c,
              fillOpacity: 0.4,
              dashArray: pr.approved ? undefined : "5,5", // ร่าง = เส้นประ
            };
          },
          onEachFeature: (feature, lyr) => {
            const pr = feature.properties as BoundaryProps;
            covered.add(pr.communityId);
            lyr.bindPopup(popupHtml(pr));
          },
        }).addTo(map);
        const b = layer.getBounds();
        if (b.isValid()) bounds.extend(b);
      }

      // ── ชั้นหมุด (เฉพาะชุมชนที่ยังไม่มีขอบเขต) ──
      for (const p of points) {
        if (p.lat === null || p.lng === null) continue;
        if (covered.has(p.communityId)) continue;
        const color = colorFor(p.keyed, p.meetsTarget);
        L.circleMarker([p.lat, p.lng], {
          radius: 9 + Math.min(p.keyed, 40) * 0.35,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.55,
        })
          .addTo(map)
          .bindPopup(popupHtml(p));
        bounds.extend([p.lat, p.lng]);
      }

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points, boundaries, center.lat, center.lng]);

  return (
    <div
      ref={containerRef}
      className="h-[520px] w-full overflow-hidden rounded-xl border border-slate-200"
      role="img"
      aria-label="แผนที่ภาพรวมการสำรวจแยกตามชุมชน"
    />
  );
}
