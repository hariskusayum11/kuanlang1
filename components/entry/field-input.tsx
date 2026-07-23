"use client";

import type { EntryField } from "@/lib/entry/steps";
import type { EntryMasterData } from "@/lib/entry/master-data";
import { maskThaiDate, sanitizeIntString, sanitizePhone } from "@/lib/entry/input-format";
import { parseThaiDate } from "@/lib/entry/payload";

export type FieldMark = "ILLEGIBLE" | "BLANK_IN_PAPER" | null;

type Props = {
  field: EntryField;
  master: EntryMasterData;
  value: unknown;
  mark: FieldMark;
  onChange: (value: unknown) => void;
};

/** ตัวเลือกของฟิลด์ — จาก Master Data (DB) หรือ enum ตามกระดาษ */
function optionsOf(field: EntryField, master: EntryMasterData) {
  if (field.masterKey) {
    return master[field.masterKey].map((o) => ({ value: o.id, code: o.code, label: o.label }));
  }
  return (field.options ?? []).map((o) => ({ value: o.value, code: o.value, label: o.label }));
}

// has-[:focus-visible] ทำให้ keyboard focus บน sr-only input แสดง ring ที่ chip
const OPTION_BASE =
  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-1";
const OPTION_ON = "border-brand-500 bg-brand-50 text-brand-800 shadow-xs";
const OPTION_OFF = "text-slate-700 hover:border-slate-400 hover:bg-slate-50";

export function FieldInput({ field, master, value, mark, onChange }: Props) {
  // สถานะ F2/F3 ทำให้ input ดูเป็นเหลือง/เทา
  const markInput =
    mark === "ILLEGIBLE"
      ? "!border-amber-400 !bg-amber-50"
      : mark === "BLANK_IN_PAPER"
        ? "!border-slate-300 !bg-slate-100"
        : "";
  const optOff = mark ? (mark === "ILLEGIBLE" ? "border-amber-300 bg-amber-50/40" : "border-slate-300 bg-slate-100/60") : OPTION_OFF;

  const control = (() => {
    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            data-field-name={field.name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={`field ${markInput}`}
          />
        );
      case "phone": {
        const phone = typeof value === "string" ? value : "";
        const short = phone.length > 0 && phone.length < 9;
        return (
          <div className="space-y-1">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              data-field-name={field.name}
              value={phone}
              onChange={(e) => onChange(sanitizePhone(e.target.value))}
              className={`field max-w-52 ${markInput}`}
            />
            {short && (
              <p className="text-xs text-amber-600">
                ยังไม่ครบ 10 หลัก ({phone.length}/10) — ถ้าอ่านไม่ออกกด F2
              </p>
            )}
          </div>
        );
      }
      case "number": {
        const raw =
          typeof value === "number" || typeof value === "string" ? String(value) : "";
        if (field.integer) {
          return (
            <input
              type="text"
              inputMode="numeric"
              data-field-name={field.name}
              value={raw}
              onChange={(e) => {
                const s = sanitizeIntString(e.target.value, field.max);
                onChange(s === "" ? "" : Number(s));
              }}
              className={`field max-w-52 ${markInput}`}
            />
          );
        }
        return (
          <input
            type="number"
            data-field-name={field.name}
            value={raw}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className={`field max-w-52 ${markInput}`}
          />
        );
      }
      case "date": {
        const raw = typeof value === "string" ? value : "";
        const invalid = raw.length === 10 && parseThaiDate(raw) === null;
        return (
          <div className="space-y-1">
            <input
              type="text"
              inputMode="numeric"
              placeholder="วว/ดด/ปปปป (พ.ศ. ตามกระดาษ)"
              maxLength={10}
              data-field-name={field.name}
              value={raw}
              onChange={(e) => onChange(maskThaiDate(e.target.value))}
              className={`field max-w-72 ${markInput} ${invalid ? "!border-red-400 !bg-red-50" : ""}`}
            />
            {invalid && (
              <p className="text-xs text-red-600">
                วันที่ไม่ถูกต้อง — ตรวจรูปแบบ วว/ดด/ปปปป (พ.ศ. ตามกระดาษ)
              </p>
            )}
          </div>
        );
      }
      case "textarea":
        return (
          <textarea
            rows={3}
            data-field-name={field.name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={`field resize-y ${markInput}`}
          />
        );
      case "radio": {
        const options = optionsOf(field, master);
        return (
          <div data-field-name={field.name} tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
            {options.map((o, i) => {
              const on = value === o.value;
              return (
                <label key={o.value} className={`${OPTION_BASE} ${on ? OPTION_ON : optOff}`}>
                  <input
                    type="radio"
                    name={field.name}
                    data-field-name={field.name}
                    checked={on}
                    onChange={() => onChange(o.value)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold ${
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {o.label}
                </label>
              );
            })}
          </div>
        );
      }
      case "checkbox-group": {
        const options = optionsOf(field, master);
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div data-field-name={field.name} tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label key={o.value} className={`${OPTION_BASE} ${on ? OPTION_ON : optOff}`}>
                  <input
                    type="checkbox"
                    data-field-name={field.name}
                    checked={on}
                    onChange={() =>
                      onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                    }
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                    }`}
                  >
                    {on && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-2.5 w-2.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  {o.label}
                </label>
              );
            })}
          </div>
        );
      }
      case "boolean": {
        const labels = field.booleanLabels ?? { true: "ใช่", false: "ไม่ใช่", trueFirst: true };
        const order: boolean[] = labels.trueFirst ? [true, false] : [false, true];
        return (
          <div
            data-field-name={field.name}
            tabIndex={-1}
            className="inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 outline-none"
          >
            {order.map((v) => {
              const on = value === v;
              return (
                <label
                  key={String(v)}
                  className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                    on ? "bg-white text-brand-700 shadow-xs" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name={field.name}
                    data-field-name={field.name}
                    checked={on}
                    onChange={() => onChange(v)}
                    className="sr-only"
                  />
                  {v ? labels.true : labels.false}
                </label>
              );
            })}
          </div>
        );
      }
    }
  })();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-slate-800">{field.label}</label>
        {field.critical && (
          <span
            title="ฟิลด์สำคัญ — ผู้ตรวจจะเทียบกับกระดาษอย่างละเอียด คีย์ให้ตรงตามตัวอักษร"
            className="badge badge-warning !bg-orange-50 !text-orange-700"
          >
            ⭐ ฟิลด์สำคัญ
          </span>
        )}
        {field.sensitive && (
          <span title="ข้อมูลอ่อนไหว" className="text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
        )}
        {mark === "ILLEGIBLE" && <span className="badge badge-warning">อ่านไม่ออก · F2</span>}
        {mark === "BLANK_IN_PAPER" && <span className="badge badge-neutral">ว่างในกระดาษ · F3</span>}
      </div>
      {control}
      {field.hint && <p className="text-xs leading-relaxed text-slate-500">{field.hint}</p>}
    </div>
  );
}
