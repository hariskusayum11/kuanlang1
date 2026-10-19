"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { PublicMapCommunity, PublicMapSite } from "@/lib/public/stats";
import { formatRai, thaiShortDate } from "@/domain/geo/community-summary";

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

/**
 * แผนที่สาธารณะ — เส้นขอบชุมชน + หมุดชุมชน + จุดพักพิง/อพยพสาธารณะ
 * ไม่มีพิกัดรายบ้าน/PII (กติกา CLAUDE.md: Public map = aggregate เท่านั้น)
 * หมุดชุมชนวางที่จุดภายในขอบเขตจริง (ถ้ามี) ไม่งั้นใช้ centroid โดยประมาณ
 * Leaflet โหลดแบบ dynamic ใน useEffect เพื่อไม่พึ่ง window ตอน SSR
 */
export function PublicMap({
  communities,
  sites,
  generatedAt,
}: {
  communities: PublicMapCommunity[];
  sites: PublicMapSite[];
  generatedAt: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    (async () => {
      if (!ref.current) return;
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !ref.current) return;

        map = L.map(ref.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        const bounds = L.latLngBounds([]);

        // เส้นขอบชุมชน — สีจาก Token ผ่าน .map-boundary (globals.css) · เส้นประ = ร่าง
        for (const c of communities) {
          if (!c.boundary) continue;
          const className = c.boundaryApproved ? "map-boundary" : "map-boundary map-boundary-draft";
          const geometry: GeoJSON.MultiPolygon = { type: "MultiPolygon", coordinates: c.boundary };
          const layer = L.geoJSON(geometry, { style: () => ({ className }) })
            .addTo(map)
            .bindTooltip(escapeHtml(c.nameTh), { sticky: true, direction: "top" })
            .bindPopup(communityPopup(c, generatedAt), { maxWidth: 280 });
          bounds.extend(layer.getBounds());
        }

        for (const c of communities) {
          const icon = L.divIcon({
            className: "",
            html: `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#2563eb;color:#fff;font-weight:700;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff">${escapeHtml(c.nameTh.replace(/^ชุมชน/, "").trim().slice(0, 1))}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([c.lat, c.lng], { icon })
            .addTo(map)
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
            .addTo(map)
            .bindTooltip(`${escapeHtml(label)}: ${escapeHtml(s.name)}`, { direction: "top" })
            .bindPopup(`<b>${escapeHtml(s.name)}</b><br/><span style="color:#64748b">${escapeHtml(label)}</span>`);
          bounds.extend([s.lat, s.lng]);
        }

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        } else {
          map.setView([7.0075, 100.418], 13); // fallback: ตำบลควนลัง
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [communities, sites, generatedAt]);

  if (failed) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">
        ไม่สามารถโหลดแผนที่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-[340px] w-full rounded-2xl md:h-[420px]"
      role="application"
      aria-label="แผนที่ชุมชนและจุดพักพิง"
    />
  );
}
