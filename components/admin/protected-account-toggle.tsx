"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setProtectedAccountAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  NOT_ALLOWED:
    "เฉพาะบัญชีคุ้มครองเท่านั้นที่ตั้งหรือถอดการคุ้มครองได้ — ผู้ดูแลระบบทั่วไปทำไม่ได้",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  LAST_PROTECTED_ACCOUNT:
    "นี่คือบัญชีคุ้มครองบัญชีสุดท้าย — ถอดไม่ได้ เพราะจะไม่มีใครตั้งกลับคืนได้จากในระบบอีก",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ตั้ง/ถอดธง "บัญชีคุ้มครอง"
 * ปุ่มนี้แสดงเฉพาะเมื่อผู้ที่กำลังใช้งานเป็นบัญชีคุ้มครองเอง — การซ่อนเป็นเพียง
 * ความสะดวก ด่านจริงตรวจซ้ำใน setProtectedAccount ฝั่ง server
 */
export function ProtectedAccountToggle({
  userId,
  userName,
  isProtectedAccount,
}: {
  userId: string;
  userName: string;
  isProtectedAccount: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = !isProtectedAccount;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await setProtectedAccountAction({
      userId,
      isProtectedAccount: next,
    });
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
        className="btn btn-ghost btn-sm"
      >
        {isProtectedAccount ? "ถอดการคุ้มครอง" : "ตั้งเป็นบัญชีคุ้มครอง"}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy="protected-title">
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          <h3 id="protected-title" className="text-lg font-bold text-slate-900">
            {isProtectedAccount ? "ถอดการคุ้มครองบัญชี" : "ตั้งเป็นบัญชีคุ้มครอง"}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

          <p className="mt-5 rounded-xl border-2 border-slate-200 bg-mist px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700">
            {isProtectedAccount ? (
              <>
                หลังถอดแล้ว <strong>ผู้ดูแลระบบคนใดก็ลบ ปิด ถอดบทบาท
                หรือตั้งรหัสผ่านให้บัญชีนี้ได้</strong>
                <br />
                <span className="text-slate-500">
                  ตั้งกลับได้เฉพาะบัญชีคุ้มครองด้วยกันเท่านั้น
                </span>
              </>
            ) : (
              <>
                บัญชีนี้จะ<strong>ถูกลบ ปิด ถอดบทบาท หรือตั้งรหัสผ่านใหม่
                โดยผู้ดูแลระบบคนอื่นไม่ได้อีก</strong>
                <br />
                <span className="text-slate-500">
                  ไม่ได้ให้สิทธิ์เพิ่ม — ให้เพียงความคุ้มกัน ·
                  เลือกเฉพาะบัญชีที่ไว้ใจได้จริง เพราะบัญชีคุ้มครองจัดการกันเองได้
                </span>
              </>
            )}
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
              className={`btn btn-md ${isProtectedAccount ? "btn-warning" : "btn-primary"}`}
            >
              {busy ? "กำลังบันทึก…" : isProtectedAccount ? "ยืนยันถอด" : "ยืนยันตั้ง"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
