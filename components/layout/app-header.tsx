"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { APP_NAME } from "@/lib/app-config";

type HeaderItem = { label: string; href: string; activeHrefs?: readonly string[] };

type Props = {
  items: HeaderItem[];
  userName: string;
  userEmail: string;
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppHeader({ items, userName, userEmail }: Props) {
  const pathname = usePathname();
  const title =
    items.find((item) =>
      (item.activeHrefs ?? [item.href]).some(
        (href) => pathname === href || pathname.startsWith(`${href}/`),
      ),
    )?.label ?? APP_NAME;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b-2 border-slate-200/70 bg-white/90 px-5 pl-16 backdrop-blur-md md:px-8 md:pl-8">
      <h1 className="flex min-w-0 items-center gap-2.5 text-[17px] font-bold text-slate-900">
        <span className="h-5 w-1.5 shrink-0 rounded-full bg-alert-400" aria-hidden="true" />
        <span className="truncate">{title}</span>
      </h1>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title="เปิดหน้าสาธารณะในแท็บใหม่ (ไม่ออกจากระบบ)"
          className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 sm:inline-flex"
        >
          {/* ไอคอนโลก = มุมมองสาธารณะ (ไม่ใช่ไอคอนบ้าน/ออกจากระบบ) + มุมชี้ว่าเปิดแท็บใหม่ */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          หน้าสาธารณะ
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3 opacity-70">
            <path d="M14 5h5v5M19 5l-7 7M12 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="h-6 w-px bg-slate-200" />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-bold leading-tight text-slate-800">{userName}</p>
          <p className="text-xs text-slate-500">{userEmail}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-alert-100 text-xs font-bold text-alert-700"
          title={userName}
          aria-hidden="true"
        >
          {initials(userName)}
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <LogoutButton />
      </div>
    </header>
  );
}
