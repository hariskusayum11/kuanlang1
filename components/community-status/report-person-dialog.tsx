"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { reportVulnerablePersonAction } from "@/lib/vulnerable-status/actions";
import { reportPersonSchema } from "@/lib/vulnerable-status/validation";
import type { ReportFormOptions } from "@/lib/vulnerable-status/core";

const ERRORS: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์แจ้งเพิ่ม",
  OUT_OF_SCOPE: "บ้านนี้ไม่อยู่ในชุมชนที่คุณดูแล",
  NOT_FOUND: "ไม่พบบ้านนี้แล้ว กรุณาโหลดหน้าใหม่",
  CONFLICT: "มีการบันทึกพร้อมกัน กรุณาลองอีกครั้ง",
  INVALID: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

const MAX_LISTED = 60;

/**
 * แจ้งเพิ่มคนเปราะบางรายใหม่ในบ้านที่สำรวจแล้ว (docs/43)
 * นับทันทีพร้อมป้าย "หัวหน้าชุมชนแจ้งเพิ่ม" · ไม่แก้ข้อมูลแบบสอบถามเดิม
 * ตรวจด้วย Zod schema เดียวกับ server ก่อนส่ง (server ตรวจซ้ำ + ตรวจขอบเขตชุมชน)
 */
export function ReportPersonButton({ options }: { options: ReportFormOptions }) {
  const [open, setOpen] = useState(false);
  if (options.households.length === 0) return null;
  return (
    <>
      <button type="button" className="btn btn-accent btn-md" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        แจ้งเพิ่มคนเปราะบาง
      </button>
      {open ? <ReportPersonDialog options={options} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ReportPersonDialog({ options, onClose }: { options: ReportFormOptions; onClose: () => void }) {
  const router = useRouter();
  const [houseQuery, setHouseQuery] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [namePrefixId, setNamePrefixId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [phone, setPhone] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = houseQuery.trim().toLocaleLowerCase("th-TH");
    const list = q
      ? options.households.filter((h) => `${h.label} ${h.communityName}`.toLocaleLowerCase("th-TH").includes(q))
      : options.households;
    return list.slice(0, MAX_LISTED);
  }, [houseQuery, options.households]);
  const selectedHouse = options.households.find((h) => h.id === householdId) ?? null;
  const multiCommunity = new Set(options.households.map((h) => h.communityName)).size > 1;

  const toggleType = (id: string, on: boolean) =>
    setTypeIds((old) => (on ? [...old, id] : old.filter((item) => item !== id)));

  async function submit() {
    setError(null);
    const payload = {
      householdId,
      namePrefixId,
      firstName,
      lastName,
      ageYears: age.trim() === "" ? undefined : Number(age),
      ageMonths: age.trim() === "0" && ageMonths.trim() !== "" ? Number(ageMonths) : undefined,
      phone,
      vulnerabilityTypeIds: typeIds,
      details: Object.fromEntries(Object.entries(details).filter(([id, text]) => typeIds.includes(id) && text.trim())),
    };
    const parsed = reportPersonSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? ERRORS.INVALID);
      return;
    }
    setBusy(true);
    try {
      const result = await reportVulnerablePersonAction(payload);
      if (result.ok) {
        onClose();
        router.refresh();
      } else {
        setError(("message" in result && result.message) || ERRORS[result.reason] || ERRORS.ERROR);
      }
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? undefined : onClose} labelledBy="report-person-title">
      <form
        className="card animate-pop max-h-[90dvh] overflow-y-auto p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <h3 id="report-person-title" className="text-lg font-bold text-slate-900">แจ้งเพิ่มคนเปราะบาง</h3>
        <p className="mt-1 text-sm text-slate-600">
          สำหรับคนที่ไม่อยู่ในแบบสอบถาม เช่น เพิ่งติดเตียง เพิ่งตั้งครรภ์ หรือเพิ่งคลอด ·
          ระบบนับทันทีพร้อมป้าย “หัวหน้าชุมชนแจ้งเพิ่ม” และไม่แก้ข้อมูลแบบสอบถามเดิม
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="label">บ้าน (ต้องเป็นบ้านที่สำรวจแล้ว)</legend>
          {selectedHouse ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand-300 bg-brand-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-800">
                {selectedHouse.label}
                {multiCommunity ? <span className="block text-xs font-normal text-slate-500">{selectedHouse.communityName}</span> : null}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHouseholdId("")}>เปลี่ยน</button>
            </div>
          ) : (
            <>
              <input
                className="field"
                type="search"
                placeholder="พิมพ์บ้านเลขที่ หมู่ หรือรหัสแบบสอบถาม"
                value={houseQuery}
                onChange={(e) => setHouseQuery(e.target.value)}
                autoFocus
              />
              <ul className="max-h-48 overflow-y-auto rounded-xl border-2 border-slate-100" role="listbox" aria-label="บ้านที่เลือกได้">
                {matches.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-slate-500">ไม่พบบ้านที่ตรงกับคำค้น</li>
                ) : (
                  matches.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
                        onClick={() => setHouseholdId(h.id)}
                      >
                        {h.label}
                        {multiCommunity ? <span className="ml-2 text-xs text-slate-500">{h.communityName}</span> : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {options.households.length > MAX_LISTED && !houseQuery ? (
                <p className="text-xs text-slate-500">แสดง {MAX_LISTED} หลังแรก — พิมพ์ค้นหาเพื่อหาบ้านอื่น</p>
              ) : null}
            </>
          )}
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
          <label className="block">
            <span className="label">คำนำหน้า</span>
            <select className="field" value={namePrefixId} onChange={(e) => setNamePrefixId(e.target.value)}>
              <option value="">—</option>
              {options.namePrefixes.map((p) => (
                <option key={p.id} value={p.id}>{p.nameTh}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">ชื่อ</span>
            <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={100} />
          </label>
          <label className="block">
            <span className="label">นามสกุล</span>
            <input className="field" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">อายุ (ปี)</span>
            <input className="field" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="ไม่ทราบ เว้นว่าง" />
          </label>
          {age.trim() === "0" ? (
            <label className="block">
              <span className="label">อายุ (เดือน)</span>
              <input className="field" inputMode="numeric" value={ageMonths} onChange={(e) => setAgeMonths(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
          ) : null}
          <label className="block">
            <span className="label">เบอร์โทร (ถ้ามี)</span>
            <input className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))} />
          </label>
        </div>

        <fieldset className="mt-4 space-y-2">
          <legend className="label">ลักษณะความเปราะบาง (เลือกได้หลายข้อ)</legend>
          {options.vulnerabilityTypes.map((t) => {
            const checked = typeIds.includes(t.id);
            return (
              <div key={t.id} className={`rounded-xl border-2 px-3 py-2 ${checked ? "border-brand-300 bg-brand-50" : "border-slate-100"}`}>
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleType(t.id, e.target.checked)} />
                  {t.nameTh}
                </label>
                {checked && t.requiresDetail ? (
                  <input
                    className="field mt-2"
                    placeholder={t.detailLabel ?? "รายละเอียด"}
                    value={details[t.id] ?? ""}
                    onChange={(e) => setDetails((old) => ({ ...old, [t.id]: e.target.value.slice(0, 200) }))}
                  />
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <p className="mt-3 text-xs text-slate-500">
          รายละเอียดอื่น เช่น ใส่สายยางให้อาหาร หรืออยู่บ้านคนเดียว ให้เลือก “อื่นๆ” แล้วพิมพ์ในช่องรายละเอียด (ข้อมูลถูกเข้ารหัส)
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
