"use client";

import { useState } from "react";
import { ThaiDatePicker } from "@/components/entry/thai-date-picker";
import { isoToThaiDate, thaiDateToISO } from "@/lib/entry/input-format";

export function ThaiDateRangeFilter({ from = "", to = "" }: { from?: string; to?: string }) {
  return (
    <form method="get" className="card p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <rect x="4" y="5" width="16" height="16" rx="2" />
            <path d="M4 9h16M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <h2 className="font-bold text-slate-800">ช่วงวันที่ส่งข้อมูลเข้าระบบ</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">ใช้แบ่งรอบผลงานของผู้กรอก · วันที่แสดงเป็นปี พ.ศ.</p>
        </div>
      </div>
      <div className="grid items-end gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)_auto]">
        <ThaiDateRangeFields from={from} to={to} showConnector />
        <div className="flex gap-2 lg:pl-2">
          <button type="submit" className="btn btn-primary min-w-28 flex-1 lg:flex-none">แสดงผล</button>
          <a href="/keyer-performance" className="btn btn-secondary min-w-20 text-center">ล้าง</a>
        </div>
      </div>
    </form>
  );
}

export function ThaiDateRangeFields({
  from = "",
  to = "",
  fromLabel = "ตั้งแต่วันที่",
  toLabel = "ถึงวันที่",
  showConnector = false,
}: {
  from?: string;
  to?: string;
  fromLabel?: string;
  toLabel?: string;
  showConnector?: boolean;
}) {
  const [fromThai, setFromThai] = useState(() => isoToThaiDate(from));
  const [toThai, setToThai] = useState(() => isoToThaiDate(to));
  const fromIso = thaiDateToISO(fromThai);
  const toIso = thaiDateToISO(toThai);

  return (
    <>
      <ThaiFilterField label={fromLabel} name="from" value={fromThai} onChange={setFromThai} max={toIso || undefined} />
      {showConnector ? <span className="hidden pb-3 text-sm font-bold text-slate-400 lg:block">ถึง</span> : null}
      <ThaiFilterField label={toLabel} name="to" value={toThai} onChange={setToThai} min={fromIso || undefined} />
    </>
  );
}

function ThaiFilterField({
  label,
  name,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-600">
      {label}
      <span className="mt-1 flex min-h-11 gap-1 rounded-xl border-2 border-slate-200 bg-white p-0.5 transition-colors focus-within:border-brand-400">
        <input type="hidden" name={name} value={thaiDateToISO(value)} />
        <span className={`flex min-h-9 flex-1 items-center px-2.5 text-sm font-semibold tabular-nums ${value ? "text-slate-800" : "text-slate-400"}`}>
          {value || "วัน/เดือน/พ.ศ."}
        </span>
        <ThaiDatePicker value={value} onChange={onChange} min={min} max={max} />
      </span>
    </label>
  );
}
