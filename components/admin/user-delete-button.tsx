"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteUserAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "ไม่มีสิทธิ์จัดการบัญชีผู้ใช้",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  SELF_DELETION: "ลบบัญชีตัวเองไม่ได้ — ให้แอดมินอีกคนเป็นผู้ลบให้",
  LAST_ACTIVE_ADMIN:
    "นี่คือผู้ดูแลระบบที่ยังใช้งานอยู่คนสุดท้าย — ลบไม่ได้ ระบบจะไม่เหลือคนดูแล",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ปุ่ม "ลบบัญชี" — Hard Delete + Soft Fallback (Owner Decision 2026-09-02):
 * ลบแถว user ออกจากฐานข้อมูลจริงเมื่อบัญชีไม่มีประวัติการทำงานผูก (เช่น ถูกปฏิเสธ/รออนุมัติ)
 * แต่ถ้าบัญชีมีประวัติคีย์/ตรวจ ระบบจะ **ปิดใช้งานแทน** เพื่อรักษา Audit trail (BR-29)
 * Guard ฝั่ง server: ห้ามลบตัวเอง · ห้ามลบ Active ADMIN คนสุดท้าย
 */
export function UserDeleteButton({
  userId,
  userName,
  isSelf,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [softened, setSoftened] = useState(false);
  const [open, setOpen] = useState(false);

  // Guard ฝั่ง UI เป็นแค่ความสะดวก — Guard จริงอยู่ที่ deleteUser() ฝั่ง server
  if (isSelf) return null;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteUserAction({ userId });
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(false);
      return;
    }
    if (!result.hard) {
      // มีประวัติการทำงาน → ระบบปิดใช้งานแทนการลบจริง แจ้งให้แอดมินทราบก่อนปิด modal
      setSoftened(true);
      setBusy(false);
      router.refresh();
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
          setSoftened(false);
          setOpen(true);
        }}
        className="btn btn-danger btn-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ลบบัญชี
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy="delete-user-title">
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          <h3 id="delete-user-title" className="text-lg font-bold text-slate-900">
            ลบบัญชีผู้ใช้
          </h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

          <p className="mt-5 rounded-xl border-2 border-slate-200 bg-mist px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700">
            บัญชีนี้จะถูก <span className="font-bold text-red-700">ลบออกจากฐานข้อมูลถาวร</span>{" "}
            พร้อมบทบาท สิทธิ์พื้นที่ คำขอลงทะเบียน และเซสชันทั้งหมด — กู้คืนไม่ได้
            <br />
            <span className="text-slate-500">
              หากบัญชีนี้เคยคีย์หรือตรวจข้อมูลไว้ ระบบจะ “ปิดใช้งาน” แทนการลบจริง
              โดยอัตโนมัติ เพื่อรักษาประวัติการทำงาน (Audit trail)
            </span>
          </p>

          {softened && (
            <p
              role="status"
              className="animate-pop mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700"
            >
              บัญชีนี้มีประวัติการทำงาน จึงถูก <span className="font-bold">ปิดใช้งาน</span>{" "}
              แทนการลบออกจากฐานข้อมูล (ประวัติการคีย์/ตรวจยังคงอยู่)
            </p>
          )}

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
              {softened ? "ปิด" : "ยกเลิก"}
            </button>
            {!softened && (
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="btn btn-danger btn-md"
              >
                {busy ? "กำลังลบ…" : "ยืนยันลบบัญชี"}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
