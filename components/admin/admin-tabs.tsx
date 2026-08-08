"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// แท็บสลับหน้าในกลุ่มจัดการระบบ — เมนูข้างรวมเป็นรายการเดียวแล้ว
// จึงย้ายการแยกหน้าย่อยมาไว้ระดับนี้
const TABS = [
  { label: "ผู้ใช้และบทบาท", href: "/admin/users" },
  { label: "คำขอลงทะเบียน", href: "/admin/registrations" },
  { label: "แบบสอบถาม", href: "/admin/sheets" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-1.5">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 ${
              active
                ? "bg-brand-500 text-white shadow-[0_2px_0_0_var(--color-brand-700)]"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
