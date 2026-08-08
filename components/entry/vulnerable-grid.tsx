"use client";

import type { EntryMasterData } from "@/lib/entry/master-data";
import { sanitizeIntString, sanitizePhone } from "@/lib/entry/input-format";

export interface VulnerableRow {
  prefix: string; // NamePrefix id (master) — plaintext, ไม่ใช่ PII
  prefixOther: string; // ระบุคำนำหน้า เมื่อเลือก "อื่นๆ"
  firstName: string;
  lastName: string;
  age: string;
  phone: string;
  vulnerabilities: string[]; // vulnerabilityType ids
  details: Record<string, string>; // vulnerabilityTypeId -> detail (เมื่อ requiresDetail)
}

export function emptyVulnerableRow(): VulnerableRow {
  return {
    prefix: "",
    prefixOther: "",
    firstName: "",
    lastName: "",
    age: "",
    phone: "",
    vulnerabilities: [],
    details: {},
  };
}

type CellMark = "ILLEGIBLE" | "BLANK_IN_PAPER" | null;

type Props = {
  master: EntryMasterData;
  rows: VulnerableRow[];
  onChange: (rows: VulnerableRow[]) => void;
  /** คีย์ของช่องที่ยังขาด (จาก lib/entry/validation) — ใช้ขึ้นกรอบแดงหลังกดส่ง */
  missingKeys?: ReadonlySet<string>;
  /** มาร์ก F2/F3 รายเซลล์ คีย์ `vg-{i}-firstName|lastName|age|phone` */
  marks?: Record<string, CellMark>;
  /** ล้างมาร์กของเซลล์เมื่อผู้คีย์เริ่มพิมพ์ (แก้แล้ว = ไม่ใช่อ่านไม่ออกอีก) */
  onClearMark?: (key: string) => void;
  /** ลบแถว i — wizard เป็นผู้ remap คีย์มาร์กหลังลบ ถ้าไม่ส่งมาจะลบเฉพาะ rows */
  onDeleteRow?: (index: number) => void;
  /** สลับมาร์ก "ไม่ได้กรอกในกระดาษ" ของลักษณะความเปราะบาง (คีย์ vg-{i}-vulnerabilities) */
  onToggleVulnBlank?: (index: number) => void;
};

/** border สีเหลือง/เทา ตามสถานะ F2/F3 ของเซลล์ (ตรงกับ field-input) */
function markBorder(mark: CellMark): string {
  if (mark === "ILLEGIBLE") return "!border-sun-400 !bg-sun-50";
  if (mark === "BLANK_IN_PAPER") return "!border-slate-300 !bg-slate-100";
  return "";
}

/** ตารางกลุ่มเปราะบาง — 1 แถวต่อ 1 คน เพิ่มแถวได้ไม่จำกัด (FR-ENT-10/11) */
export function VulnerableGrid({
  master,
  rows,
  onChange,
  missingKeys,
  marks,
  onClearMark,
  onDeleteRow,
  onToggleVulnBlank,
}: Props) {
  // id ของคำนำหน้า "อื่นๆ" — ใช้เปิดช่องระบุเมื่อเลือก (ไม่ hardcode ค่า แต่เทียบด้วย code)
  const otherPrefixId = master.namePrefixes.find((p) => p.code === "OTHER")?.id ?? null;

  const markOf = (i: number, cell: string): CellMark => marks?.[`vg-${i}-${cell}`] ?? null;

  function update(index: number, patch: Partial<VulnerableRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // แก้ค่าเซลล์ที่รองรับ F2/F3 — พิมพ์แล้วล้างมาร์กเดิม (แก้ได้ = อ่านออกแล้ว)
  function editMarkableCell(i: number, cell: "firstName" | "lastName" | "age" | "phone", value: string) {
    update(i, { [cell]: value } as Partial<VulnerableRow>);
    if (markOf(i, cell)) onClearMark?.(`vg-${i}-${cell}`);
  }

  function toggleVulnerability(index: number, typeId: string) {
    const row = rows[index];
    const has = row.vulnerabilities.includes(typeId);
    // ติ๊กลักษณะจริง = ยกเลิกมาร์ก "ไม่ได้กรอกในกระดาษ" อัตโนมัติ (ขัดกันเอง)
    if (!has && markOf(index, "vulnerabilities")) {
      onClearMark?.(`vg-${index}-vulnerabilities`);
    }
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
          className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between border-b-2 border-slate-100 bg-mist px-4 py-2.5">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-alert-100 text-[11px] font-bold text-alert-700">
                {i + 1}
              </span>
              คนที่ {i + 1}
            </p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  onDeleteRow ? onDeleteRow(i) : onChange(rows.filter((_, j) => j !== i))
                }
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
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">คำนำหน้า</label>
                <select
                  value={row.prefix}
                  onChange={(e) =>
                    update(i, {
                      prefix: e.target.value,
                      // ล้างช่องระบุเมื่อไม่ได้เลือก "อื่นๆ" — กันค่าค้าง
                      ...(e.target.value === otherPrefixId ? {} : { prefixOther: "" }),
                    })
                  }
                  className="field"
                >
                  <option value="">— ไม่ระบุ —</option>
                  {master.namePrefixes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {otherPrefixId !== null && row.prefix === otherPrefixId && (
                  <input
                    value={row.prefixOther}
                    onChange={(e) => update(i, { prefixOther: e.target.value })}
                    placeholder="ระบุคำนำหน้า"
                    className="field mt-1.5 animate-fade-in"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600">
                  ชื่อ <span className="text-red-500">*</span>{" "}
                  <span className="text-alert-500">⭐</span>
                  <CellMarkBadge mark={markOf(i, "firstName")} />
                </label>
                <input
                  data-field-name={`vg-${i}-firstName`}
                  value={row.firstName}
                  onChange={(e) => editMarkableCell(i, "firstName", e.target.value)}
                  className={`field ${
                    missingKeys?.has(`vg-${i}-firstName`) ? "!border-red-400 !bg-red-50" : markBorder(markOf(i, "firstName"))
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600">
                  นามสกุล <span className="text-red-500">*</span>
                  <CellMarkBadge mark={markOf(i, "lastName")} />
                </label>
                <input
                  data-field-name={`vg-${i}-lastName`}
                  value={row.lastName}
                  onChange={(e) => editMarkableCell(i, "lastName", e.target.value)}
                  className={`field ${
                    missingKeys?.has(`vg-${i}-lastName`) ? "!border-red-400 !bg-red-50" : markBorder(markOf(i, "lastName"))
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600">
                  อายุ (ปี)
                  <CellMarkBadge mark={markOf(i, "age")} />
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  data-field-name={`vg-${i}-age`}
                  value={row.age}
                  onChange={(e) => editMarkableCell(i, "age", sanitizeIntString(e.target.value, 120))}
                  className={`field ${markBorder(markOf(i, "age"))}`}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600">
                  เบอร์โทรศัพท์ (ถ้ามี) <span className="text-alert-500">⭐</span>
                  <CellMarkBadge mark={markOf(i, "phone")} />
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  data-field-name={`vg-${i}-phone`}
                  value={row.phone}
                  onChange={(e) => editMarkableCell(i, "phone", sanitizePhone(e.target.value))}
                  className={`field ${markBorder(markOf(i, "phone"))}`}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600">
                  ลักษณะความเปราะบาง <span className="text-slate-500">(ติ๊กได้มากกว่า 1 ข้อ)</span>
                </p>
                {/* กระดาษไม่ได้ติ๊กมา = เลือก "ไม่ได้กรอกในกระดาษ" แทนการเดา (ไม่ต้องใช้ F3) */}
                <button
                  type="button"
                  onClick={() => onToggleVulnBlank?.(i)}
                  className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1 text-xs font-semibold transition-colors ${
                    markOf(i, "vulnerabilities") === "BLANK_IN_PAPER"
                      ? "border-slate-400 bg-slate-100 text-slate-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {markOf(i, "vulnerabilities") === "BLANK_IN_PAPER" ? "✓ " : ""}
                  ไม่ได้กรอกในกระดาษ
                </button>
              </div>
              {markOf(i, "vulnerabilities") === "BLANK_IN_PAPER" && (
                <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
                  ทำเครื่องหมายว่าช่องนี้ว่างในกระดาษ — ติ๊กลักษณะด้านล่างเพื่อยกเลิก
                </p>
              )}
              <div className={`flex flex-wrap gap-2 ${markOf(i, "vulnerabilities") === "BLANK_IN_PAPER" ? "opacity-50" : ""}`}>
                {master.vulnerabilityTypes.map((vt) => {
                  const on = row.vulnerabilities.includes(vt.id);
                  return (
                    <label
                      key={vt.id}
                      className={`flex cursor-pointer select-none items-center gap-1.5 rounded-xl border-2 px-2.5 py-1.5 text-xs font-medium transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 has-[:focus-visible]:ring-offset-1 ${
                        on
                          ? "border-brand-500 bg-brand-50 font-bold text-brand-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleVulnerability(i, vt.id)}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-md border-2 ${
                          on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-2.5 w-2.5">
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
                    <label className="text-xs font-bold text-slate-600">
                      {vt.detailLabel ?? `รายละเอียด (${vt.label})`}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={row.details[vt.id] ?? ""}
                      onChange={(e) =>
                        update(i, { details: { ...row.details, [vt.id]: e.target.value } })
                      }
                      className={`field ${
                        missingKeys?.has(`vg-${i}-detail-${vt.id}`)
                          ? "!border-red-400 !bg-red-50"
                          : ""
                      }`}
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
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3.5 text-sm font-bold text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        เพิ่มแถว (คนถัดไป)
      </button>
    </div>
  );
}

/** ป้าย F2/F3 รายเซลล์ — เหลือง = อ่านไม่ออก · เทา = ว่างในกระดาษ */
function CellMarkBadge({ mark }: { mark: CellMark }) {
  if (mark === "ILLEGIBLE") return <span className="badge badge-warning">อ่านไม่ออก · F2</span>;
  if (mark === "BLANK_IN_PAPER") return <span className="badge badge-neutral">ว่าง · F3</span>;
  return null;
}
