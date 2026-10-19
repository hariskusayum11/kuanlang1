"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { APP_NAME } from "@/lib/app-config";
import { LogoMark } from "@/components/brand/logo-mark";

/** true เฉพาะตอนรันบนเครื่องพัฒนา — Next แทนค่าคงที่นี้ตอน build ฝั่ง client */
const IS_DEV = process.env.NODE_ENV !== "production";

// รายการเมนูถูกกรองตาม permission จากฝั่ง Server (lib/navigation.ts) แล้ว
// Component นี้เป็นแค่ตัวแสดงผล — ไม่ใช่ Authorization
export type SidebarItem = {
  group: "overview" | "data" | "analysis" | "system";
  label: string;
  href: string;
  implemented: boolean;
  activeHrefs?: readonly string[];
  iconHref?: string;
  notificationCount?: number;
};

const GROUP_LABELS: Record<SidebarItem["group"], string> = {
  overview: "ภาพรวม",
  data: "จัดการข้อมูล",
  analysis: "วิเคราะห์และวางแผน",
  system: "ผู้ดูแลระบบ",
};

// ไอคอนเส้น (stroke) เรียบ — สื่อความหมายชัดโดยไม่ใช้สีจัด
const ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
  ),
  "/communities": (
    <path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5" />
  ),
  "/households": (
    <path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6" />
  ),
  "/surveys": (
    <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1zM6 4v14M9 8h6M9 12h4" />
  ),
  "/verification": (
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4" />
  ),
  "/admin/sheets": (
    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
  ),
  "/map": (
    <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6zM9 4v14M15 6v14" />
  ),
  "/medical": (
    <path d="M12 21s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.6-7 10-7 10zM12 10v6M9 13h6" />
  ),
  "/risk": (
    <path d="M12 3l9 16H3L12 3zM12 9v4M12 17h.01" />
  ),
  "/admin": (
    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1c0-2.5 2.7-4 6-4s6 1.5 6 4v1M17 11l1.5 1.5L22 9" />
  ),
  "/admin/registrations": (
    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1c0-2.5 2.7-4 6-4 1.2 0 2.3.2 3.2.6M16 14v6M13 17h6" />
  ),
  "/reports": (
    <path d="M5 21V5a1 1 0 011-1h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1zM8 13v4M12 10v7M16 14v3" />
  ),
  "/settings": (
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H10l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h3.2l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z" />
  ),
  // เสื้อชูชีพ — สื่อ "ความช่วยเหลือ/ความพร้อม" ตรงกับอุปกรณ์ของมาสคอตบทบาท rescue
  "/volunteer": (
    <path d="M9 4h6l1 4v9a1 1 0 01-1 1H9a1 1 0 01-1-1V8l1-4zM8 8H5l-1 5h4M16 8h3l1 5h-4M12 8v10" />
  ),
  // โซ่ลิงก์ — ลิงก์ระบบภายนอก
  "/admin/links": (
    <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
  ),
  // รายชื่อพร้อมเครื่องหมายถูก — "ทบทวนรายชื่อคนในชุมชน" (หัวหน้าชุมชน)
  "/community-status": (
    <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1c0-2.5 2.7-4 6-4s6 1.5 6 4v1M15 5h6M15 9h6M17 13l1.5 1.5L22 11" />
  ),
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {ICONS[href] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

export function AppSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item, index) => {
        const showGroup = index === 0 || items[index - 1]?.group !== item.group;
        const active = (item.activeHrefs ?? [item.href]).some(
          (href) => pathname === href || pathname.startsWith(`${href}/`),
        );
        if (item.implemented) {
          return (
            <div key={item.href}>
              {showGroup ? (
                <p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-200/55 ${index === 0 ? "mt-0" : "mt-4"}`}>
                  {GROUP_LABELS[item.group]}
                </p>
              ) : null}
              <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
                active
                  ? "bg-brand-500 text-white shadow-[0_3px_0_0_var(--color-brand-700)]"
                  : "text-white/70 hover:translate-x-0.5 hover:bg-white/[0.08] hover:text-white"
              }`}
              >
              <span
                className={
                  active
                    ? "text-white"
                    : "text-brand-300/70 group-hover:text-brand-200"
                }
              >
                <NavIcon href={item.iconHref ?? item.href} />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.notificationCount != null && item.notificationCount > 0 ? (
                <span
                  className="min-w-[1.5rem] shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-extrabold leading-4 text-white shadow-sm"
                  title={`มี ${item.notificationCount.toLocaleString("th-TH")} ใบรอดำเนินการ`}
                  aria-label={`${item.notificationCount.toLocaleString("th-TH")} รายการรอดำเนินการ`}
                >
                  {item.notificationCount.toLocaleString("th-TH")}
                </span>
              ) : active ? (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sun-400" />
              ) : null}
              </Link>
            </div>
          );
        }
        return (
          <div key={item.href}>
            {showGroup ? (
              <p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-200/55 ${index === 0 ? "mt-0" : "mt-4"}`}>
                {GROUP_LABELS[item.group]}
              </p>
            ) : null}
            <span
            aria-disabled="true"
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/35"
          >
            <span className="flex items-center gap-3">
              <span className="text-white/25">
                <NavIcon href={item.iconHref ?? item.href} />
              </span>
              {item.label}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">
              เร็ว ๆ นี้
            </span>
            </span>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* ปุ่มเปิดเมนูบน Mobile */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-3 z-30 inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur md:hidden"
        aria-label="เปิดเมนู"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
        เมนู
      </button>

      {/* Overlay บน Mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col band-ink transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="group flex items-center gap-2.5 rounded-xl transition-transform hover:scale-[1.02]"
          >
            <LogoMark size={32} className="text-white" />
            <div>
              <p className="text-[15px] font-bold leading-tight text-white">{APP_NAME}</p>
              <p className="text-[11px] font-medium text-brand-200/70">จัดการภัยพิบัติชุมชน</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-white/50 transition-colors hover:text-white md:hidden"
            aria-label="ปิดเมนู"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {nav}
        {/* ป้ายบอกว่ากำลังรันบนเครื่องพัฒนา — ต้องไม่โผล่บนระบบจริง
            เดิมเขียนตายตัวจึงขึ้นทุกที่ เจ้าหน้าที่/ผู้บริหารที่เปิดระบบจริงเห็นแล้ว
            เข้าใจว่าระบบยังไม่พร้อมใช้งาน ทั้งที่ใช้งานจริงอยู่
            Next แทนค่า process.env.NODE_ENV ตอน build ฝั่ง client ป้ายนี้จึง
            ถูกตัดออกจาก bundle ของ production ไปเลย ไม่ใช่แค่ซ่อนด้วย CSS */}
        {IS_DEV ? (
          <div className="border-t border-white/10 px-5 py-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium text-white/45">
              <span className="live-dot" />
              Development Environment
            </span>
          </div>
        ) : null}
      </aside>
    </>
  );
}
