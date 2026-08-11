"use client";

import { useId, useMemo, useState } from "react";
import type { EntrySuggestion } from "@/lib/entry/suggestions";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("th-TH");
}

export function AutocompleteInput({
  value,
  suggestions,
  className,
  fieldName,
  onChange,
  onSelect,
}: {
  value: string;
  suggestions: EntrySuggestion[];
  className: string;
  fieldName: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: EntrySuggestion) => void;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = normalized(value);
  const matches = useMemo(
    () => suggestions
      .filter((item) => !query || normalized(`${item.value} ${item.label}`).includes(query))
      .slice(0, 6),
    [query, suggestions],
  );
  const open = focused && matches.length > 0;

  const choose = (item: EntrySuggestion) => {
    onSelect(item);
    setFocused(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-field-name={fieldName}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setFocused(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(matches[activeIndex] ?? matches[0]);
          } else if (event.key === "Escape") {
            setFocused(false);
          }
        }}
        className={className}
        autoComplete="off"
      />
      {open && (
        <div id={listId} role="listbox" className="absolute z-30 mt-1.5 max-h-64 w-full min-w-[260px] overflow-y-auto rounded-xl border-2 border-brand-100 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">ข้อมูลที่คุณเคยกรอก</p>
          {matches.map((item, index) => (
            <button
              key={`${item.value}-${item.label}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                index === activeIndex ? "bg-brand-50 text-brand-900" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] text-slate-400">เลือกแล้วเติมชื่อ นามสกุล และเบอร์โทรให้อัตโนมัติ</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
