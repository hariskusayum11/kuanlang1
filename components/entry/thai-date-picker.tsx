"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { thaiDateToISO } from "@/lib/entry/input-format";

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toThaiDate(day: number, month: number, year: number): string {
  return `${pad(day)}/${pad(month + 1)}/${year + 543}`;
}

function selectedParts(value: string): { day: number; month: number; year: number } | null {
  const iso = thaiDateToISO(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

export function ThaiDatePicker({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  /** ขอบเขตแบบ ISO YYYY-MM-DD; ใช้กับตัวกรองโดยไม่กระทบวันที่แบบสอบถาม */
  min?: string;
  max?: string;
}) {
  const selected = useMemo(() => selectedParts(value), [value]);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({
    month: selected?.month ?? today.getMonth(),
    year: selected?.year ?? today.getFullYear(),
  }));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (selected) setView({ month: selected.month, year: selected.year });
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, selected]);

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const moveMonth = (delta: number) => {
    const date = new Date(view.year, view.month + delta, 1);
    setView({ month: date.getMonth(), year: date.getFullYear() });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-colors ${
          open
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-brand-50"
        }`}
        aria-label="เปิดปฏิทินภาษาไทย"
        aria-expanded={open}
        title="เลือกจากปฏิทินภาษาไทย"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 9h16M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-40 w-[min(264px,calc(100vw-2rem))] animate-pop rounded-xl border-2 border-brand-100 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => moveMonth(-1)} className="btn btn-ghost btn-sm" aria-label="เดือนก่อนหน้า">‹</button>
            <div className="text-center">
              <p className="font-bold text-slate-900">{MONTHS[view.month]}</p>
              <p className="text-xs font-semibold tabular-nums text-brand-700">พ.ศ. {view.year + 543}</p>
            </div>
            <button type="button" onClick={() => moveMonth(1)} className="btn btn-ghost btn-sm" aria-label="เดือนถัดไป">›</button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1 text-[11px] font-bold text-slate-400">{weekday}</span>
            ))}
            {cells.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} className="h-7" />;
              const active = selected?.day === day && selected.month === view.month && selected.year === view.year;
              const isToday = today.getDate() === day && today.getMonth() === view.month && today.getFullYear() === view.year;
              const iso = `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
              const disabled = Boolean((min && iso < min) || (max && iso > max));
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(toThaiDate(day, view.month, view.year));
                    setOpen(false);
                  }}
                  className={`h-7 rounded-md text-xs font-semibold tabular-nums transition-colors ${
                    disabled
                      ? "cursor-not-allowed text-slate-300"
                      : active
                      ? "bg-brand-600 text-white shadow-sm"
                      : isToday
                        ? "border border-brand-300 bg-brand-50 text-brand-800"
                        : "text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs font-bold text-slate-500 hover:text-red-600">ล้างวันที่</button>
            <button
              type="button"
              onClick={() => {
                onChange(toThaiDate(today.getDate(), today.getMonth(), today.getFullYear()));
                setOpen(false);
              }}
              className="text-xs font-bold text-brand-700 hover:text-brand-900"
            >
              วันนี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
