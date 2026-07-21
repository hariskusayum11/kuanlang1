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

export function AppSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((item) =>
        item.implemented ? (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
              pathname.startsWith(item.href)
                ? "bg-blue-700 text-white"
                : "text-slate-200 hover:bg-slate-700"
            }`}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.href}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500"
          >
            {item.label}
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
              เร็ว ๆ นี้
            </span>
          </span>
        ),
      )}
    </nav>
  );

  return (
    <>
      {/* ปุ่มเปิดเมนูบน Mobile */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-3.5 z-30 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm md:hidden"
        aria-label="เปิดเมนู"
      >
        เมนู
      </button>

      {/* Overlay บน Mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-slate-800 transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-4">
            <div>
              <p className="text-lg font-bold text-white">{APP_NAME}</p>
              <p className="text-xs text-slate-400">ระบบจัดการภัยพิบัติชุมชน</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded p-1 text-slate-400 hover:text-white md:hidden"
              aria-label="ปิดเมนู"
            >
              ✕
            </button>
          </div>
          {nav}
          <div className="border-t border-slate-700 px-4 py-3 text-[11px] text-slate-500">
            Development Environment
          </div>
        </div>
      </aside>
    </>
  );
}
