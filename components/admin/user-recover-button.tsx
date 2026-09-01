"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recoverUserAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "ไม่มีสิทธิ์จัดการบัญชีผู้ใช้",
  USER_NOT_FOUND: "ไม่พบคำขอของบัญชีนี้",
  NOT_RECOVERABLE: "บัญชีนี้ไม่อยู่ในสถานะที่กู้คืนได้",
  INVALID_ROLE: "บทบาทที่ขอไม่สามารถอนุมัติผ่านช่องทางนี้ได้",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ปุ่ม "กู้คืน (อนุมัติใหม่)" — สำหรับบัญชีที่ถูกปฏิเสธ/ยกเลิกคำขอ (Owner Decision 2026-09-02)
 * เปิดบัญชี + มอบบทบาทที่เคยขอ + ตั้งคำขอเป็นอนุมัติแล้ว (guard จริงอยู่ที่ recoverUser ฝั่ง server)
 */
export function UserRecoverButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await recoverUserAction({ userId });
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="btn btn-secondary btn-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-15-2M4 15a8 8 0 0015 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        กู้คืน
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy="recover-user-title">
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          <h3 id="recover-user-title" className="text-lg font-bold text-slate-900">
            กู้คืนบัญชีผู้ใช้
          </h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

          <p className="mt-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-medium leading-relaxed text-emerald-800">
            เปิดใช้งานบัญชีนี้อีกครั้ง พร้อมมอบบทบาทที่เคยยื่นขอไว้ (เหมือนการอนุมัติใหม่)
            <br />
            <span className="text-emerald-700/80">
              ผู้ใช้จะเข้าสู่ระบบได้ทันที · คำขอลงทะเบียนจะเปลี่ยนเป็น “อนุมัติแล้ว”
            </span>
          </p>

          {error && (
            <p
              role="alert"
              className="animate-pop mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn btn-ghost btn-md"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="btn btn-primary btn-md"
            >
              {busy ? "กำลังกู้คืน…" : "ยืนยันกู้คืน"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
