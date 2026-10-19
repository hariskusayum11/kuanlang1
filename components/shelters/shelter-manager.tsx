"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { revokeHostShelterAction, updateHostShelterAction, verifyHostShelterAction } from "@/lib/shelters/actions";
import { defaultShelterName, shelterFields } from "@/lib/shelters/validation";
import type { ShelterCandidateRow, VerifiedShelterRow } from "@/lib/shelters/core";

const ERRORS: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์ยืนยันบ้านพักพิง",
  NOT_FOUND: "ไม่พบรายการนี้แล้ว — โหลดหน้าใหม่",
  NOT_ELIGIBLE: "บ้านนี้ยังไม่เข้าเงื่อนไข (แบบสอบถามต้องตรวจแล้ว และติ๊กยินยอมเป็นจุดพักพิง)",
  NO_COORDINATES: "บ้านนี้ยังไม่มีพิกัด — เพิ่มพิกัดในแบบสอบถามก่อน จึงจะปักเป็นจุดพักพิงบนแผนที่ได้",
  ALREADY_VERIFIED: "บ้านนี้ถูกยืนยันไปแล้ว (อาจมีเจ้าหน้าที่อีกคนยืนยันพร้อมกัน) — โหลดหน้าใหม่",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

type Form = {
  mode: "verify" | "edit";
  id: string;
  title: string;
  name: string;
  capacity: string;
  hasToilet: boolean;
  hasKitchen: boolean;
  hasPowerBackup: boolean;
  isAccessibleForDisabled: boolean;
  isPublic: boolean;
  ownerContacted: boolean;
};

const FACILITIES: Array<[keyof Pick<Form, "hasToilet" | "hasKitchen" | "hasPowerBackup" | "isAccessibleForDisabled">, string]> = [
  ["hasToilet", "มีห้องน้ำ"],
  ["hasKitchen", "ทำอาหารได้"],
  ["hasPowerBackup", "มีไฟสำรอง"],
  ["isAccessibleForDisabled", "ผู้ใช้รถเข็นเข้าได้"],
];

export function ShelterManager({ candidates, verified }: { candidates: ShelterCandidateRow[]; verified: VerifiedShelterRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openVerify(c: ShelterCandidateRow) {
    setError(null);
    setForm({
      mode: "verify", id: c.householdId, title: `${c.communityName} · ${c.houseNo ? `บ้านเลขที่ ${c.houseNo}` : c.sheetNo}`,
      name: defaultShelterName(c.communityName, c.houseNo), capacity: "", hasToilet: false, hasKitchen: false,
      hasPowerBackup: false, isAccessibleForDisabled: false, isPublic: false, ownerContacted: false,
    });
  }

  function openEdit(s: VerifiedShelterRow) {
    setError(null);
    setForm({
      mode: "edit", id: s.siteId, title: s.name, name: s.name, capacity: String(s.capacity ?? ""),
      hasToilet: s.hasToilet, hasKitchen: s.hasKitchen, hasPowerBackup: s.hasPowerBackup,
      isAccessibleForDisabled: s.isAccessibleForDisabled, isPublic: s.isPublic, ownerContacted: true,
    });
  }

  async function submit() {
    if (!form) return;
    setError(null);
    const fields = {
      name: form.name, capacity: form.capacity, hasToilet: form.hasToilet, hasKitchen: form.hasKitchen,
      hasPowerBackup: form.hasPowerBackup, isAccessibleForDisabled: form.isAccessibleForDisabled, isPublic: form.isPublic,
    };
    const check = shelterFields.safeParse(fields);
    if (!check.success) { setError(check.error.issues[0]?.message ?? ERRORS.INVALID); return; }
    if (form.mode === "verify" && !form.ownerContacted) { setError("ต้องติดต่อเจ้าของบ้านก่อนยืนยัน"); return; }
    setBusy(true);
    try {
      const result = form.mode === "verify"
        ? await verifyHostShelterAction({ ...fields, householdId: form.id, ownerContacted: form.ownerContacted })
        : await updateHostShelterAction({ ...fields, siteId: form.id });
      if (result.ok) { setForm(null); router.refresh(); }
      else setError(("message" in result && result.message) || ERRORS[result.reason] || ERRORS.ERROR);
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!form || form.mode !== "edit") return;
    setBusy(true);
    try {
      const result = await revokeHostShelterAction({ siteId: form.id });
      if (result.ok) { setForm(null); router.refresh(); }
      else setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">รอยืนยัน ({candidates.length.toLocaleString("th-TH")} หลัง)</h2>
          <p className="text-xs text-slate-500">บ้านที่ติ๊ก "ยินยอมเป็นจุดพักพิง" ในแบบสอบถามที่ตรวจแล้ว — ยังไม่ใช่จุดพักพิงจริงจนกว่าจะยืนยัน</p>
        </div>
        {candidates.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">ไม่มีบ้านที่รอยืนยัน</p>
        ) : (
          <ul className="divide-y-2 divide-slate-50">
            {candidates.map((c) => (
              <li key={c.householdId} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {c.houseNo ? `บ้านเลขที่ ${c.houseNo}` : "ไม่มีบ้านเลขที่"}
                    {c.mooNo != null && c.mooNo > 0 ? ` หมู่ ${c.mooNo}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.communityName} · {c.sheetNo}
                    {!c.hasCoordinates && <span className="ml-2 badge badge-warning">ยังไม่มีพิกัด</span>}
                  </p>
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={!c.hasCoordinates} title={c.hasCoordinates ? undefined : ERRORS.NO_COORDINATES} onClick={() => openVerify(c)}>
                  ยืนยันเป็นจุดพักพิง
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">ยืนยันแล้ว ({verified.length.toLocaleString("th-TH")} แห่ง)</h2>
          <p className="text-xs text-slate-500">แสดงบนแผนที่ภายในทุกแห่ง · แสดงบนหน้าสาธารณะเฉพาะที่เจ้าของยินยอมให้เผยแพร่</p>
        </div>
        {verified.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">ยังไม่มีบ้านพักพิงที่ยืนยันแล้ว</p>
        ) : (
          <ul className="divide-y-2 divide-slate-50">
            {verified.map((s) => (
              <li key={s.siteId} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {s.name}
                    {s.isPublic ? <span className="badge badge-success">แสดงต่อสาธารณะ</span> : <span className="badge badge-neutral">เฉพาะเจ้าหน้าที่</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.communityName} · รับได้ {s.capacity ?? "—"} คน
                    {FACILITIES.filter(([key]) => s[key]).map(([, label]) => ` · ${label}`).join("")}
                    {s.verifiedByName ? ` · ยืนยันโดย ${s.verifiedByName}` : ""}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>แก้ไข</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={form !== null} onClose={busy ? undefined : () => setForm(null)} labelledBy="shelter-form-title" size="lg">
        {form && (
          <form className="card animate-pop space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}>
            <div>
              <h3 id="shelter-form-title" className="text-lg font-bold text-slate-900">{form.mode === "verify" ? "ยืนยันเป็นจุดพักพิง" : "แก้ไขจุดพักพิง"}</h3>
              <p className="text-sm text-slate-500">{form.title}</p>
            </div>
            <label className="block">
              <span className="label">ชื่อที่แสดงบนแผนที่ (ห้ามใส่ชื่อเจ้าของบ้าน)</span>
              <input className="field" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="block">
              <span className="label">รับได้กี่คน</span>
              <input className="field" type="number" min={1} max={500} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
            </label>
            <fieldset>
              <legend className="label">สิ่งอำนวยความสะดวก</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FACILITIES.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-xl border-2 border-slate-100 px-3 py-2 text-sm">
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3 rounded-xl border-2 border-slate-100 px-3 py-2.5 text-sm">
              <input type="checkbox" className="mt-1" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
              <span>
                <span className="block font-semibold text-slate-900">เจ้าของยินยอมให้แสดงบนแผนที่สาธารณะ</span>
                <span className="block text-xs text-slate-500">ไม่ติ๊ก = เห็นเฉพาะเจ้าหน้าที่ในระบบ · การยินยอมเป็นจุดพักพิง ไม่ได้แปลว่ายินยอมให้เปิดเผยตำแหน่งบ้าน</span>
              </span>
            </label>
            {form.mode === "verify" && (
              <label className="flex items-start gap-3 rounded-xl border-2 border-sun-200 bg-sun-50 px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-1" checked={form.ownerContacted} onChange={(e) => setForm({ ...form, ownerContacted: e.target.checked })} />
                <span className="font-semibold text-sun-900">ติดต่อเจ้าของบ้านแล้ว และเจ้าของยืนยันว่ายังพร้อมเป็นจุดพักพิง</span>
              </label>
            )}
            {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-between gap-2">
              {form.mode === "edit" ? (
                <button type="button" className="btn btn-ghost btn-md" onClick={() => void revoke()} disabled={busy}>ยกเลิกการเป็นจุดพักพิง</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-md" onClick={() => setForm(null)} disabled={busy}>ปิด</button>
                <button type="submit" className="btn btn-primary btn-md" disabled={busy}>{busy ? "กำลังบันทึก…" : form.mode === "verify" ? "ยืนยัน" : "บันทึก"}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
