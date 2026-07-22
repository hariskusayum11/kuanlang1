"use client";

import type { EntryMasterData } from "@/lib/entry/master-data";

export interface VulnerableRow {
  fullName: string;
  age: string;
  phone: string;
  vulnerabilities: string[]; // vulnerabilityType ids
  details: Record<string, string>; // vulnerabilityTypeId -> detail (เมื่อ requiresDetail)
}

export function emptyVulnerableRow(): VulnerableRow {
  return { fullName: "", age: "", phone: "", vulnerabilities: [], details: {} };
}

type Props = {
  master: EntryMasterData;
  rows: VulnerableRow[];
  onChange: (rows: VulnerableRow[]) => void;
};

/** ตารางกลุ่มเปราะบาง — 1 แถวต่อ 1 คน เพิ่มแถวได้ไม่จำกัด (FR-ENT-10/11) */
export function VulnerableGrid({ master, rows, onChange }: Props) {
  function update(index: number, patch: Partial<VulnerableRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function toggleVulnerability(index: number, typeId: string) {
    const row = rows[index];
    const has = row.vulnerabilities.includes(typeId);
    update(index, {
      vulnerabilities: has
        ? row.vulnerabilities.filter((id) => id !== typeId)
        : [...row.vulnerabilities, typeId],
    });
  }

  return (
    <div className="space-y-4">
      {rows.map((row, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                {i + 1}
              </span>
              คนที่ {i + 1}
            </p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-red-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
                  <path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M8 7l1 12a1 1 0 001 1h4a1 1 0 001-1l1-12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                ลบแถว
              </button>
            )}
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  ชื่อ-นามสกุล <span className="text-orange-500">⭐</span>
                </label>
                <input
                  value={row.fullName}
                  onChange={(e) => update(i, { fullName: e.target.value })}
                  className="field"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">อายุ (ปี)</label>
                <input
                  type="number"
                  value={row.age}
                  onChange={(e) => update(i, { age: e.target.value })}
                  className="field"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  เบอร์โทรศัพท์ (ถ้ามี) <span className="text-orange-500">⭐</span>
                </label>
                <input
                  type="tel"
                  value={row.phone}
                  onChange={(e) => update(i, { phone: e.target.value })}
                  className="field"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                ลักษณะความเปราะบาง <span className="text-slate-500">(ติ๊กได้มากกว่า 1 ข้อ)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {master.vulnerabilityTypes.map((vt) => {
                  const on = row.vulnerabilities.includes(vt.id);
                  return (
                    <label
                      key={vt.id}
                      className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-1 ${
                        on
                          ? "border-brand-500 bg-brand-50 text-brand-800 shadow-xs"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleVulnerability(i, vt.id)}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-2 w-2">
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {vt.label}
                    </label>
                  );
                })}
              </div>

              {master.vulnerabilityTypes
                .filter((vt) => vt.requiresDetail && row.vulnerabilities.includes(vt.id))
                .map((vt) => (
                  <div key={vt.id} className="mt-3 space-y-1.5 animate-fade-in">
                    <label className="text-xs font-medium text-slate-600">
                      {vt.detailLabel ?? `รายละเอียด (${vt.label})`}
                    </label>
                    <input
                      value={row.details[vt.id] ?? ""}
                      onChange={(e) =>
                        update(i, { details: { ...row.details, [vt.id]: e.target.value } })
                      }
                      className="field"
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyVulnerableRow()])}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        เพิ่มแถว (คนถัดไป)
      </button>
    </div>
  );
}
