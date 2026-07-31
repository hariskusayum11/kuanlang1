"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeIntString, sanitizePhone } from "@/lib/entry/input-format";
import {
  EDITABLE_FIELDS,
  type EditableMasterKey,
} from "@/lib/verification/editable-fields";
import { editHouseholdAction } from "@/lib/verification/actions";

type Props = {
  householdId: string;
  initialValues: Record<string, string>;
  options: Record<EditableMasterKey, { id: string; label: string }[]>;
};

const ERRORS: Record<string, string> = {
  WRONG_STATUS: "ใบนี้ถูกยืนยัน/เปลี่ยนสถานะแล้ว — แก้ไขไม่ได้ (รีเฟรชหน้า)",
  SELF_EDIT: "คุณเป็นผู้คีย์ใบนี้ จึงแก้ไขเองไม่ได้",
  INVALID: "ค่าที่กรอกไม่ถูกต้อง — ตรวจตัวเลข/ความยาวอีกครั้ง",
  INVALID_MASTER: "ตัวเลือก (คำนำหน้า/หมู่/ตำบล) ไม่ตรงกับข้อมูลระบบ",
  NOT_FOUND: "ไม่พบใบนี้ในขอบเขตของคุณ",
  NOT_ALLOWED: "ไม่มีสิทธิ์แก้ไขใบนี้",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function EditPanel({ householdId, initialValues, options }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = EDITABLE_FIELDS.some((f) => (values[f.key] ?? "") !== (initialValues[f.key] ?? ""));

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // ส่งเฉพาะฟิลด์ที่รู้จัก (server re-diff + ตรวจซ้ำ)
    const payload: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) payload[f.key] = values[f.key] ?? "";

    const result = await editHouseholdAction(householdId, payload);
    if (result.ok) {
      if (result.changedCount === 0) {
        setNotice("ไม่มีการเปลี่ยนแปลง");
        setBusy(false);
        return;
      }
      // โหลดหน้าใหม่ให้แสดงค่าใหม่ + version log ที่อัปเดต
      setOpen(false);
      router.refresh();
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  function cancel() {
    setValues(initialValues);
    setError(null);
    setNotice(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-md"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        แก้ไขข้อมูล
      </button>
    );
  }

  return (
    <section className="card animate-fade-in !border-brand-300 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <span className="h-5 w-1.5 rounded-full bg-alert-400" />
          แก้ไขข้อมูลที่คีย์ผิด
        </h3>
        <span className="text-xs font-medium text-slate-400">ระบบเก็บสำเนาก่อนแก้ (version) ทุกครั้ง</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {EDITABLE_FIELDS.map((f) => {
          const val = values[f.key] ?? "";
          const changed = val !== (initialValues[f.key] ?? "");
          return (
            <div key={f.key} className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                {f.label}
                {f.sensitive && <span className="text-slate-400" title="เข้ารหัสเมื่อบันทึก">🔒</span>}
                {changed && (
                  <span className="badge badge-accent !px-2 !py-0.5 !text-[10px]" title="มีการแก้ไข">
                    แก้แล้ว
                  </span>
                )}
              </label>
              {f.kind === "select" && f.masterKey ? (
                <select
                  value={val}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={`field ${changed ? "!border-alert-400 !bg-alert-50/40" : ""}`}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {options[f.masterKey].map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  inputMode={f.kind === "phone" || f.kind === "number" ? "numeric" : undefined}
                  maxLength={f.kind === "phone" ? 10 : undefined}
                  value={val}
                  onChange={(e) => {
                    const raw = e.target.value;
                    set(
                      f.key,
                      f.kind === "phone"
                        ? sanitizePhone(raw)
                        : f.kind === "number"
                          ? sanitizeIntString(raw, f.max)
                          : raw,
                    );
                  }}
                  className={`field ${changed ? "!border-alert-400 !bg-alert-50/40" : ""}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-4 animate-pop rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 animate-pop rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600">
          {notice}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={cancel} disabled={busy} className="btn btn-ghost btn-md">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="btn btn-accent btn-md"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
      </div>
    </section>
  );
}
