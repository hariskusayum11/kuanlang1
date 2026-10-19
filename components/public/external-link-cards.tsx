import type { ExternalLinkRow } from "@/lib/external-links/core";
import { EXTERNAL_LINK_CATEGORY_LABELS, linkHost, type ExternalLinkCategory } from "@/lib/external-links/validation";

// การ์ดลิงก์ระบบภายนอกบนหน้าสาธารณะ (Owner Decision 2026-10-19 · docs/37)
// Server Component ล้วน — ลิงก์เปิดแท็บใหม่ (noopener) และแสดงชื่อโดเมนให้รู้ก่อนกดว่าจะไปเว็บไหน

const CATEGORY_CHIP: Record<ExternalLinkCategory, string> = {
  RAIN: "chip-brand",
  WATER: "chip-mint",
  SATELLITE: "chip-neutral",
  RESPONSE: "chip-accent",
  OTHER: "chip-neutral",
};

const CATEGORY_ICON: Record<ExternalLinkCategory, string> = {
  RAIN: "M7 15a4 4 0 01-.9-7.9A5 5 0 0116 6a4 4 0 011 7.9M9 18l-1 2M13 18l-1 2M17 18l-1 2",
  WATER: "M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3s-4 4.5-4 7a4 4 0 008 0c0-2.5-4-7-4-7z",
  SATELLITE: "M13 7l4 4M4 20l5-5M15 3l6 6-3 3-6-6 3-3zM9 9l-3 3 6 6 3-3M3 13a8 8 0 008 8",
  RESPONSE: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM12 8v6M9 11h6",
  OTHER: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
};

export function ExternalLinkCards({ links }: { links: ExternalLinkRow[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card card-interactive flex h-full flex-col gap-2 p-4"
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`chip chip-md ${CATEGORY_CHIP[link.category]}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={CATEGORY_ICON[link.category]} />
                </svg>
              </span>
              <span className="text-[11px] font-semibold text-slate-400">{EXTERNAL_LINK_CATEGORY_LABELS[link.category]}</span>
            </span>
            <span className="text-sm font-bold leading-snug text-slate-900">{link.title}</span>
            {link.description ? <span className="text-xs leading-relaxed text-slate-500">{link.description}</span> : null}
            <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-brand-700">
              {linkHost(link.url)}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">(เปิดในแท็บใหม่)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
