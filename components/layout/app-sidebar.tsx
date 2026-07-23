"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { APP_NAME } from "@/lib/app-config";

// รายการเมนูถูกกรองตาม permission จากฝั่ง Server (lib/navigation.ts) แล้ว
// Component นี้เป็นแค่ตัวแสดงผล — ไม่ใช่ Authorization
export type SidebarItem = {
  label: string;
  href: string;
  implemented: boolean;
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
  "/reports": (
    <path d="M5 21V5a1 1 0 011-1h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1zM8 13v4M12 10v7M16 14v3" />
  ),
  "/settings": (
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H10l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h3.2l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z" />
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
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        if (item.implemented) {
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-slate-300/90 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
              )}
              <span className={active ? "text-brand-300" : "text-slate-400 group-hover:text-slate-200"}>
                <NavIcon href={item.href} />
              </span>
              {item.label}
            </Link>
          );
        }
        return (
          <span
            key={item.href}
            aria-disabled="true"
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500"
          >
            <span className="flex items-center gap-3">
              <span className="text-slate-600">
                <NavIcon href={item.href} />
              </span>
              {item.label}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              เร็ว ๆ นี้
            </span>
          </span>
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
        className="fixed left-4 top-3 z-30 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur md:hidden"
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-ink-900 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-[18px]">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-lg transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm">
              SF
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight text-white">{APP_NAME}</p>
              <p className="text-[11px] text-slate-400">จัดการภัยพิบัติชุมชน</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-slate-400 transition-colors hover:text-white md:hidden"
            aria-label="ปิดเมนู"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {nav}
        <div className="border-t border-white/[0.06] px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Development Environment
          </span>
        </div>
      </aside>
    </>
  );
}
