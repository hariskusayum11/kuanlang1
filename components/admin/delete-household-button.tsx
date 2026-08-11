"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteHouseholdAction } from "@/lib/household/admin-actions";
import { Modal } from "@/components/ui/modal";

type Props = {
  householdId: string;
  sheetNo: string;
  redirectTo?: string;
};

const ERRORS: Record<string, string> = {
  NOT_FOUND: "ไม่พบใบนี้แล้ว",
  ALREADY_DELETED: "ใบนี้ถูกลบไปแล้ว",
  INVALID: "รหัสใบไม่ถูกต้อง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  NOT_ALLOWED: "เฉพาะผู้ดูแลระบบเท่านั้นที่ลบได้",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function DeleteHouseholdButton({ householdId, sheetNo, redirectTo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await softDeleteHouseholdAction(householdId);
    if (result.ok) {
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
        className="btn btn-danger btn-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
          <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "กำลังลบ…" : "ลบใบ"}
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy={`delete-household-${householdId}`}>
        <div className="animate-rise rounded-3xl border-2 border-red-200 bg-white p-7 shadow-lg">
          <h3 id={`delete-household-${householdId}`} className="text-lg font-bold text-slate-900">
            ลบแบบสอบถาม {sheetNo}?
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            ใบจะถูกซ่อนจาก Coverage, ความเสี่ยง, รายงาน และคิวตรวจทันที แต่ยังสามารถกู้คืนได้จากหน้า
            &ldquo;แบบสอบถามที่ถูกลบ&rdquo;
          </p>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn btn-secondary btn-md">
              ยกเลิก
            </button>
            <button type="button" disabled={busy} onClick={() => void remove()} className="btn btn-danger btn-md">
              {busy ? "กำลังลบ…" : "ยืนยันลบใบ"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
