"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyHouseholdAction } from "@/lib/verification/actions";

type Props = {
  householdId: string;
  sheetNo: string;
};

const ERRORS: Record<string, string> = {
  WRONG_STATUS: "ใบนี้ถูกตรวจสอบไปแล้ว หรือสถานะเปลี่ยนไป — รีเฟรชหน้าอีกครั้ง",
  SELF_VERIFY: "คุณเป็นผู้คีย์ใบนี้ จึงยืนยันเองไม่ได้ — ต้องให้ผู้ตรวจคนอื่นยืนยัน",
  NOT_FOUND: "ไม่พบใบนี้ในขอบเขตของคุณ",
  NOT_ALLOWED: "ไม่มีสิทธิ์ตรวจสอบใบนี้",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function VerifyPanel({ householdId, sheetNo }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyHouseholdAction(householdId);
    if (result.ok) {
      // /verification เป็น force-dynamic โหลดสดอยู่แล้ว
      router.push("/verification");
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-md">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ยืนยันข้อมูลถูกต้อง
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md animate-rise rounded-2xl bg-white p-7 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">ยืนยันการตรวจสอบ</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              ยืนยันว่าข้อมูลใบ{" "}
              <span className="font-mono font-medium">{sheetNo}</span>{" "}
              ถูกต้องตรงกับกระดาษ — ใบจะเปลี่ยนเป็นสถานะ &ldquo;ตรวจสอบแล้ว&rdquo; (VERIFIED)
              และนำไปใช้คำนวณความเสี่ยง/Dashboard ได้
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
              ระบบจะบันทึกผู้ตรวจ เวลา และเก็บสำเนาข้อมูล (version) ไว้ตรวจสอบย้อนหลัง
              — หากพบข้อผิดพลาด ควรแก้ก่อนยืนยัน (การแก้ไขจะเปิดใช้ในเวอร์ชันถัดไป)
            </p>
            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="btn btn-secondary btn-md"
              >
                กลับไปตรวจอีกครั้ง
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="btn btn-primary btn-md"
              >
                {busy ? "กำลังยืนยัน…" : "ยืนยัน VERIFIED"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
