"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { APP_NAME } from "@/lib/app-config";

type HeaderItem = { label: string; href: string };

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
    items.find((item) => pathname.startsWith(item.href))?.label ?? APP_NAME;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/85 px-5 pl-16 backdrop-blur-md md:px-8 md:pl-8">
      <h1 className="truncate text-[17px] font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          title="ดูหน้าสาธารณะ"
          className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          หน้าสาธารณะ
        </Link>
        <div className="h-6 w-px bg-slate-200" />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight text-slate-800">{userName}</p>
          <p className="text-xs text-slate-500">{userEmail}</p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700"
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
