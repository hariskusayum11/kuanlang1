"use client";

import { EXPLICIT_NONE, type EntryField } from "@/lib/entry/steps";
import type { EntryMasterData } from "@/lib/entry/master-data";
import {
  maskThaiDate,
  sanitizeDecimal,
  sanitizeIntString,
  sanitizePhone,
} from "@/lib/entry/input-format";
import { ThaiDatePicker } from "./thai-date-picker";
import { AutocompleteInput } from "./autocomplete-input";
import type { EntrySuggestion } from "@/lib/entry/suggestions";
import { parseThaiDate } from "@/lib/entry/payload";
import {
  composeCoordinateText,
  describeCoordinate,
  parseCoordinateText,
} from "@/domain/geo/coordinate";

export type FieldMark = "ILLEGIBLE" | "BLANK_IN_PAPER" | null;

type Props = {
  field: EntryField;
  master: EntryMasterData;
  value: unknown;
  mark: FieldMark;
  onChange: (value: unknown) => void;
  /** measure-pair เท่านั้น: ค่า/สถานะ/ตัวจัดการของช่องที่สอง (field.pair) */
  pairValue?: unknown;
  pairMark?: FieldMark;
  onPairChange?: (value: unknown) => void;
  /** assistance-needs เท่านั้น: ค่าของ answer key เสริม (จำนวน/รายละเอียดรายข้อ) */
  extraValues?: Record<string, unknown>;
  onExtraChange?: (key: string, value: unknown) => void;
  /** คีย์ของช่องที่ยังขาด — ใช้ขึ้นกรอบแดงหลังผู้ใช้กดส่ง */
  missingKeys?: ReadonlySet<string>;
  /** คำแนะนำจากประวัติของผู้กรอกคนปัจจุบันเท่านั้น */
  suggestions?: EntrySuggestion[];
  onSuggestionSelect?: (suggestion: EntrySuggestion) => void;
  /** ปุ่มสถานะบนจอสำหรับมือถือ (F2/F3 ยังคงเป็นคีย์ลัดบนคอม) */
  onMarkChange?: (mark: FieldMark) => void;
};

/** border สีเหลือง/เทา ตามสถานะ F2/F3 ของช่อง */
function markBorder(mark: FieldMark): string {
  if (mark === "ILLEGIBLE") return "!border-sun-400 !bg-sun-50";
  if (mark === "BLANK_IN_PAPER") return "!border-slate-300 !bg-slate-100";
  return "";
}

/** ช่องนี้มีค่าแล้วหรือยัง (boolean false = ตอบแล้ว เพราะ "ไม่มี" คือคำตอบ) */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** อ่านค่า answer key เสริมที่เก็บเป็น Record<id, string> อย่างปลอดภัย */
function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** ตัวเลือกของฟิลด์ — จาก Master Data (DB) หรือ enum ตามกระดาษ */
function optionsOf(field: EntryField, master: EntryMasterData) {
  if (field.masterKey) {
    return master[field.masterKey].map((o) => ({ value: o.id, code: o.code, label: o.label }));
  }
  return (field.options ?? []).map((o) => ({ value: o.value, code: o.value, label: o.label }));
}

// has-[:focus-visible] ทำให้ keyboard focus บน sr-only input แสดง ring ที่ chip
const OPTION_BASE =
  "flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:focus-visible]:ring-offset-1";
const OPTION_ON = "border-brand-500 bg-brand-50 font-bold text-brand-800";
const OPTION_OFF = "border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50/40";

// ปุ่ม +/- ของช่องจำนวน (ใช้ในช่องตัวเลขและช่องจำนวนคนของความต้องการช่วยเหลือ)
// tabIndex=-1 เพื่อไม่ขวางลำดับ Tab ระหว่างช่อง — ผู้คีย์ยังพิมพ์ตัวเลขได้ตามปกติ
const STEP_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 text-xl font-bold leading-none text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent";

export function FieldInput({
  field,
  master,
  value,
  mark,
  onChange,
  pairValue,
  pairMark,
  onPairChange,
  extraValues,
  onExtraChange,
  missingKeys,
  suggestions,
  onSuggestionSelect,
  onMarkChange,
}: Props) {
  // ช่องบังคับนี้ตอบแล้วหรือยัง — ใช้ขึ้นป้าย "ยังไม่ได้กรอก" ให้จับคู่กับตัวเลขในแถบซ้ายได้
  // "ตอบแล้ว" = มีค่า หรือถูกมาร์ก F2/F3 (ตรงกับกติกาใน lib/entry/validation.ts)
  const isFieldAnswered =
    Boolean(mark) ||
    hasValue(value) ||
    (field.pair ? Boolean(pairMark) || hasValue(pairValue) : false) ||
    // ติ๊ก "ไม่มี/ไม่สะดวก" (exclusive) = ตอบแล้ว แม้ array ว่าง
    (field.exclusiveNone ? extraValues?.[field.exclusiveNone.key] === true : false);

  // สถานะ F2/F3 ทำให้ input ดูเป็นเหลือง/เทา
  const markInput = markBorder(mark);
  const optOff = mark
    ? mark === "ILLEGIBLE"
      ? "border-sun-300 bg-sun-50/60"
      : "border-slate-300 bg-slate-100/60"
    : OPTION_OFF;

  const control = (() => {
    switch (field.type) {
      case "text":
        // รหัสใบระบบออกให้ — แสดงเป็นค่าคงที่ อ่านอย่างเดียว (ไม่มี data-field-name → F2/F3 ไม่จับ)
        if (field.readOnlyFromSheet) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-base font-bold tabular-nums text-slate-800">
                {typeof value === "string" && value !== "" ? value : "—"}
              </span>
              <span className="badge badge-neutral">ระบบออกให้</span>
            </div>
          );
        }
        if (suggestions && suggestions.length > 0 && onSuggestionSelect) {
          return (
            <AutocompleteInput
              fieldName={field.name}
              value={typeof value === "string" ? value : ""}
              suggestions={suggestions}
              onChange={(next) => onChange(next)}
              onSelect={onSuggestionSelect}
              className={`field ${markInput}`}
            />
          );
        }
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
              className={`field w-full ${markInput}`}
            />
            {short && (
              <p className="text-xs font-semibold text-sun-700">
                ยังไม่ครบ 10 หลัก ({phone.length}/10) — ถ้าอ่านไม่ออกกด F2
              </p>
            )}
          </div>
        );
      }
      case "number": {
        const raw =
          typeof value === "number" || typeof value === "string" ? String(value) : "";
        const current = raw === "" ? null : Number(raw);
        const min = field.min ?? 0;
        const atMin = current == null || !Number.isFinite(current) || current <= min;
        const atMax =
          field.max != null && current != null && Number.isFinite(current)
            ? current >= field.max
            : false;
        // ปุ่ม +/- เพิ่มลดทีละ 1 (สะดวกบนแท็บเล็ต) — clamp ที่ 0 และ field.max
        // tabIndex=-1 เพื่อไม่ขวางลำดับ Tab ระหว่างช่อง ผู้คีย์ยังพิมพ์ตัวเลขได้ตามปกติ
        const bump = (delta: number) => {
          const base = current != null && Number.isFinite(current) ? current : min - 1;
          let next = base + delta;
          if (next < min) next = min;
          if (field.max != null && next > field.max) next = field.max;
          onChange(next);
        };
        const stepBtn =
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 text-xl font-bold leading-none text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent";
        const inner = field.integer ? (
          <input
            type="text"
            inputMode="numeric"
            data-field-name={field.name}
            value={raw}
            onChange={(e) => {
              const s = sanitizeIntString(e.target.value, field.max);
              onChange(s === "" ? "" : Number(s));
            }}
            className={`field w-24 text-center ${markInput}`}
          />
        ) : (
          <input
            type="number"
            data-field-name={field.name}
            value={raw}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            className={`field w-24 text-center ${markInput}`}
          />
        );
        return (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label="ลดลง 1"
              disabled={atMin}
              onClick={() => bump(-1)}
              className={stepBtn}
            >
              −
            </button>
            {inner}
            <button
              type="button"
              tabIndex={-1}
              aria-label="เพิ่มขึ้น 1"
              disabled={atMax}
              onClick={() => bump(1)}
              className={stepBtn}
            >
              +
            </button>
          </div>
        );
      }
      /**
       * พิกัด — สองช่อง ละติจูด/ลองจิจูด (Owner Decision 2026-08-03) แต่เป็นพิกัดจุดเดียว
       * ประกอบกลับเป็นคู่แล้วอ่านค่าใต้ช่องทันที (QM-04: ค่าดิบเก็บตามที่คีย์ ไม่จัดรูปแบบให้)
       * F2/F3 มาร์กแยกช่องได้ (ละติจูดอ่านออก ลองจิจูดเลอะ) เหมือน measure-pair
       */
      case "coordinate": {
        const latRaw = typeof value === "string" ? value : "";
        const lngRaw = typeof pairValue === "string" ? pairValue : "";
        const parsed = parseCoordinateText(composeCoordinateText(latRaw, lngRaw));
        const note = describeCoordinate(parsed);
        const noteClass =
          note.tone === "ok"
            ? "text-emerald-700"
            : note.tone === "warn"
              ? "text-sun-800"
              : "text-slate-500";
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <label className="space-y-1">
                <span className="block text-xs font-bold text-slate-600">ละติจูด</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-field-name={field.name}
                  value={latRaw}
                  onChange={(e) => onChange(sanitizeDecimal(e.target.value, 6))}
                  placeholder="7.820213"
                  className={`field w-40 font-mono ${markInput}`}
                />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-bold text-slate-600">ลองจิจูด</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-field-name={field.pair?.name ?? `${field.name}-lng`}
                  value={lngRaw}
                  onChange={(e) => onPairChange?.(sanitizeDecimal(e.target.value, 6))}
                  placeholder="99.943592"
                  className={`field w-40 font-mono ${markBorder(pairMark ?? null)}`}
                />
              </label>
            </div>
            <p className={`text-xs font-medium leading-relaxed ${noteClass}`}>
              {note.tone === "ok" ? "✓ " : ""}
              {note.text}
            </p>
          </div>
        );
      }
      case "measure-pair": {
        const primary =
          typeof value === "number" || typeof value === "string" ? String(value) : "";
        const secondary =
          typeof pairValue === "number" || typeof pairValue === "string"
            ? String(pairValue)
            : "";
        return (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <input
              type="text"
              inputMode="numeric"
              data-field-name={field.name}
              value={primary}
              onChange={(e) => {
                const s = sanitizeIntString(e.target.value, field.max);
                onChange(s === "" ? "" : Number(s));
              }}
              className={`field w-20 text-right ${markBorder(mark)}`}
            />
            <span className="text-sm text-slate-600">{field.unit}</span>
            {field.pair && (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  data-field-name={field.pair.name}
                  value={secondary}
                  onChange={(e) => {
                    const s = sanitizeIntString(e.target.value, field.pair!.max);
                    onPairChange?.(s === "" ? "" : Number(s));
                  }}
                  className={`field w-20 text-right ${markBorder(pairMark ?? null)}`}
                />
                <span className="text-sm text-slate-600">{field.pair.unit}</span>
              </>
            )}
            {pairMark === "ILLEGIBLE" && <span className="badge badge-warning">ซม.อ่านไม่ออก · F2</span>}
            {pairMark === "BLANK_IN_PAPER" && <span className="badge badge-neutral">ซม.ว่าง · F3</span>}
          </div>
        );
      }
      case "date": {
        const raw = typeof value === "string" ? value : "";
        const invalid = raw.length === 10 && parseThaiDate(raw) === null;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="วว/ดด/ปปปป (พ.ศ. ตามกระดาษ)"
                maxLength={10}
                data-field-name={field.name}
                value={raw}
                onChange={(e) => onChange(maskThaiDate(e.target.value))}
                className={`field w-44 ${markInput} ${invalid ? "!border-red-400 !bg-red-50" : ""}`}
              />
              <ThaiDatePicker value={raw} onChange={(next) => onChange(next)} />
            </div>
            {invalid && (
              <p className="text-xs text-red-600">
                วันที่ไม่ถูกต้อง — ตรวจรูปแบบ วว/ดด/ปปปป (พ.ศ. ตามกระดาษ)
              </p>
            )}
            <p className="text-xs text-slate-500">
              พิมพ์ตามกระดาษ (พ.ศ.) หรือกดปฏิทินเพื่อเลือก — ระบบเก็บเป็น พ.ศ. เสมอ
            </p>
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
      case "select": {
        const options = optionsOf(field, master);
        return (
          <select
            data-field-name={field.name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={`field w-full ${markInput}`}
          >
            {/* มี explicitNone: ช่องว่าง = "ยังไม่เลือก" · "ไม่ระบุ" เป็นตัวเลือกที่นับว่าตอบแล้ว */}
            <option value="">{field.explicitNone ? "— เลือก —" : "— ไม่ระบุ —"}</option>
            {field.explicitNone && <option value={EXPLICIT_NONE}>{field.explicitNone}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
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
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                      on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 text-slate-400"
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
        // ตัวเลือก "ไม่มี/ไม่สะดวก" แบบ exclusive (ถ้ามี) — อยู่หัวกลุ่ม ติ๊กแล้วปิดตัวอื่น
        const none = field.exclusiveNone;
        const noneOn = none ? extraValues?.[none.key] === true : false;
        const checkBox = (on: boolean, accent: "brand" | "slate") => (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
              on
                ? accent === "slate"
                  ? "border-slate-500 bg-slate-500 text-white"
                  : "border-brand-500 bg-brand-500 text-white"
                : "border-slate-300"
            }`}
          >
            {on && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        );
        return (
          <div data-field-name={field.name} tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
            {none && (
              <label
                className={`${OPTION_BASE} ${
                  noneOn ? "border-slate-400 bg-slate-100 font-bold text-slate-700" : optOff
                }`}
              >
                <input
                  type="checkbox"
                  data-field-name={field.name}
                  checked={noneOn}
                  onChange={() => {
                    const next = !noneOn;
                    onExtraChange?.(none.key, next);
                    if (next) onChange([]); // ยืนยัน "ไม่มี" → ล้างตัวเลือกอื่นทั้งหมด
                  }}
                  className="sr-only"
                />
                {checkBox(noneOn, "slate")}
                {none.label}
              </label>
            )}
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className={`${OPTION_BASE} ${on ? OPTION_ON : optOff} ${
                    noneOn ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    data-field-name={field.name}
                    checked={on}
                    disabled={noneOn}
                    onChange={() => {
                      // ติ๊กตัวเลือกจริง → ยกเลิก "ไม่มี" อัตโนมัติ (กันสถานะขัดกัน)
                      if (none && noneOn) onExtraChange?.(none.key, false);
                      onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
                    }}
                    className="sr-only"
                  />
                  {checkBox(on, "brand")}
                  {o.label}
                </label>
              );
            })}
          </div>
        );
      }
      /**
       * ความต้องการช่วยเหลือ — ติ๊กแล้วเปิดช่องตาม flag ของ master
       * requiresCount → "จำนวน (คน)" · requiresDetail → "ระบุ"
       * (เก็บใน answer key เสริม assistanceNeedCounts / assistanceNeedDetails)
       */
      case "assistance-needs": {
        const options = master.assistanceNeedTypes;
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const counts = asStringRecord(extraValues?.assistanceNeedCounts);
        const details = asStringRecord(extraValues?.assistanceNeedDetails);

        const patch = (key: string, base: Record<string, string>, id: string, v: string) =>
          onExtraChange?.(key, { ...base, [id]: v });

        return (
          <div data-field-name={field.name} tabIndex={-1} className="space-y-2 outline-none">
            {options.map((o) => {
              const on = selected.includes(o.id);
              const needCount = on && o.requiresCount;
              const needDetail = on && o.requiresDetail;
              const missCount = missingKeys?.has(`an-count-${o.id}`) ?? false;
              const missDetail = missingKeys?.has(`an-detail-${o.id}`) ?? false;
              return (
                <div
                  key={o.id}
                  className={`rounded-xl border-2 transition-colors ${
                    on ? "border-brand-300 bg-brand-50/40" : "border-transparent"
                  }`}
                >
                  <label
                    className={`${OPTION_BASE} w-full ${on ? OPTION_ON : optOff} ${
                      on ? "!border-transparent !bg-transparent" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      data-field-name={field.name}
                      checked={on}
                      onChange={() =>
                        onChange(
                          on ? selected.filter((v) => v !== o.id) : [...selected, o.id],
                        )
                      }
                      className="sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                        on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
                      }`}
                    >
                      {on && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="text-left">{o.label}</span>
                  </label>

                  {(needCount || needDetail) && (
                    <div className="flex flex-wrap items-end gap-3 px-3 pb-3 animate-fade-in">
                      {needCount &&
                        (() => {
                          const cur = counts[o.id] ?? "";
                          const n = cur === "" ? null : Number(cur);
                          const atMin = n == null || !Number.isFinite(n) || n <= 0;
                          const atMax = n != null && Number.isFinite(n) && n >= 5000;
                          const bump = (d: number) => {
                            const base = n != null && Number.isFinite(n) ? n : 0;
                            let nx = base + d;
                            if (nx < 0) nx = 0;
                            if (nx > 5000) nx = 5000;
                            patch("assistanceNeedCounts", counts, o.id, String(nx));
                          };
                          return (
                            <label className="space-y-1">
                              <span className="block text-xs font-bold text-slate-600">
                                จำนวน (คน) <span className="text-red-500">*</span>
                              </span>
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  aria-label="ลดลง 1"
                                  disabled={atMin}
                                  onClick={() => bump(-1)}
                                  className={STEP_BTN}
                                >
                                  −
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={cur}
                                  onChange={(e) =>
                                    patch(
                                      "assistanceNeedCounts",
                                      counts,
                                      o.id,
                                      sanitizeIntString(e.target.value, 5000),
                                    )
                                  }
                                  className={`field w-20 text-center ${missCount ? "!border-red-400 !bg-red-50" : ""}`}
                                />
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  aria-label="เพิ่มขึ้น 1"
                                  disabled={atMax}
                                  onClick={() => bump(1)}
                                  className={STEP_BTN}
                                >
                                  +
                                </button>
                              </div>
                            </label>
                          );
                        })()}
                      {needDetail && (
                        <label className="min-w-[200px] flex-1 space-y-1">
                          <span className="block text-xs font-bold text-slate-600">
                            ระบุ <span className="text-red-500">*</span>
                          </span>
                          <input
                            type="text"
                            value={details[o.id] ?? ""}
                            onChange={(e) =>
                              patch("assistanceNeedDetails", details, o.id, e.target.value)
                            }
                            placeholder="คีย์ตามที่เขียนบนกระดาษ"
                            className={`field ${missDetail ? "!border-red-400 !bg-red-50" : ""}`}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
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
            className="inline-flex flex-wrap gap-2 outline-none"
          >
            {order.map((v) => {
              const on = value === v;
              // สถานะที่เลือก = เติมสีแบรนด์เต็ม + เครื่องหมายถูก ให้เห็นชัดว่ากดแล้ว
              const onClass = mark
                ? mark === "ILLEGIBLE"
                  ? "border-sun-500 bg-sun-400 text-sun-900 shadow-[0_2px_0_0_var(--color-sun-600)]"
                  : "border-slate-400 bg-slate-500 text-white shadow-[0_2px_0_0_var(--color-slate-700)]"
                : "border-brand-500 bg-brand-500 text-white shadow-[0_2px_0_0_var(--color-brand-700)]";
              return (
                <label
                  key={String(v)}
                  className={`flex cursor-pointer select-none items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:focus-visible]:ring-offset-1 ${
                    on ? onClass : optOff
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
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      on ? "border-white/70 bg-white/20 text-white" : "border-slate-300 text-transparent"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-2.5 w-2.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {v ? labels.true : labels.false}
                </label>
              );
            })}
          </div>
        );
      }
    }
  })();

  const flagged = !isFieldAnswered && (missingKeys?.has(field.name) ?? false);
  function toggleMark(nextMark: Exclude<FieldMark, null>) {
    if (!onMarkChange) return;
    if (mark === nextMark) {
      onMarkChange(null);
      return;
    }
    // เลือกว่าว่าง/อ่านไม่ออกแล้วต้องไม่เหลือคำตอบเดิมค้างคู่กับสถานะ
    onChange(
      field.type === "checkbox-group" || field.type === "assistance-needs" ? [] : "",
    );
    if (field.exclusiveNone) onExtraChange?.(field.exclusiveNone.key, false);
    onMarkChange(nextMark);
  }

  return (
    <div
      className={`space-y-1 ${
        flagged ? "-mx-3 rounded-xl border-2 border-red-300 bg-red-50/40 px-3 py-2" : ""
      }`}
    >
      {/* หัวข้อชิดกับช่องกรอก — คำถามป้ายยาวถูกตั้ง fullWidth ให้อยู่แถวเดียวลำพังแล้ว
          จึงไม่ต้องสำรองความสูง 2 บรรทัดซึ่งทำให้ label ห่างช่องกรอกเกินไป (Owner feedback) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="text-[15px] font-bold leading-snug text-slate-800">{field.label}</label>
        {/* ป้าย "ยังไม่ได้ตอบ" ขึ้นเฉพาะหลังกดส่งแล้วยังไม่ครบ — ระหว่างคีย์ไม่ขึ้น
            เพื่อไม่ให้จอรก และไม่ให้ป้ายดันความสูงของแต่ละช่องจนแถวเลื่อนไม่ตรงกัน */}
        {!isFieldAnswered && missingKeys?.has(field.name) && (
          <span className="badge badge-warning">ยังไม่ได้ตอบ</span>
        )}
        {field.critical && (
          <span
            title="ฟิลด์สำคัญ — ผู้ตรวจจะเทียบกับกระดาษอย่างละเอียด คีย์ให้ตรงตามตัวอักษร"
            className="badge badge-accent"
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
      {onMarkChange && (
        <div className="flex justify-start pt-0.5">
          <button
            type="button"
            onClick={() => toggleMark("BLANK_IN_PAPER")}
            className={`rounded-lg border-2 px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              mark === "BLANK_IN_PAPER"
                ? "border-slate-400 bg-slate-100 text-slate-800"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            {mark === "BLANK_IN_PAPER" ? "✓ " : ""}ไม่ได้กรอกในกระดาษ
          </button>
        </div>
      )}
      {field.hint && <p className="text-xs leading-relaxed text-slate-500">{field.hint}</p>}
    </div>
  );
}
