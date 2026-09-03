"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { PublicMapCommunity, PublicMapSite } from "@/lib/public/stats";

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
 * แผนที่สาธารณะ — แสดงจุดศูนย์กลางชุมชน (โดยประมาณ) + จุดพักพิง/อพยพสาธารณะ
 * ไม่มีพิกัดรายบ้าน/PII (กติกา CLAUDE.md: Public map = aggregate เท่านั้น)
 * Leaflet โหลดแบบ dynamic ใน useEffect เพื่อไม่พึ่ง window ตอน SSR
 */
export function PublicMap({
  communities,
  sites,
}: {
  communities: PublicMapCommunity[];
  sites: PublicMapSite[];
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
            .bindPopup(`<b>${escapeHtml(c.nameTh)}</b><br/><span style="color:#64748b">จุดศูนย์กลางชุมชนโดยประมาณ</span>`);
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
  }, [communities, sites]);

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
