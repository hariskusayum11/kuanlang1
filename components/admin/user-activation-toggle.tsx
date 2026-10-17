"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserActiveAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";
import type { AccountStatus } from "@/domain/admin/account-status";

const ERRORS: Record<string, string> = {
  PROTECTED_ACCOUNT:
    "บัญชีนี้เป็นบัญชีคุ้มครอง — ผู้ดูแลระบบทั่วไปแก้ไขไม่ได้ ต้องให้บัญชีคุ้มครองด้วยกันเป็นผู้ดำเนินการ",
  NOT_ALLOWED: "ไม่มีสิทธิ์จัดการบัญชีผู้ใช้",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  SELF_DEACTIVATION:
    "ปิดบัญชีของตัวเองไม่ได้ — ให้แอดมินอีกคนเป็นผู้ปิดให้ (กันล็อกตัวเองออกจากระบบ)",
  LAST_ACTIVE_ADMIN:
    "นี่คือผู้ดูแลระบบที่ยังใช้งานอยู่คนสุดท้าย — ปิดบัญชีไม่ได้ ระบบจะไม่เหลือคนดูแล",
  NOT_TOGGLEABLE:
    "บัญชีนี้ยังไม่ผ่านการอนุมัติ — ใช้หน้าอนุมัติคำขอสมัครแทน จะได้มอบบทบาทและพื้นที่ให้พร้อมกัน",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function UserActivationToggle({
  userId,
  userName,
  accountStatus,
  isSelf,
}: {
  userId: string;
  userName: string;
  accountStatus: AccountStatus;
  /** บัญชีของผู้ที่กำลังใช้งานอยู่ — ปิดตัวเองไม่ได้ */
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = accountStatus === "ACTIVE";
  const nextActive = !isActive;

  // ซ่อนปุ่มเป็นเพียงความสะดวก — Guard จริงอยู่ฝั่ง server (setUserActive)
  if (isSelf && isActive) {
    return (
      <span
        className="text-[11px] font-medium text-slate-400"
        title="ปิดบัญชีของตัวเองไม่ได้"
      >
        บัญชีของคุณ
      </span>
    );
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await setUserActiveAction({ userId, isActive: nextActive });
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
        className={`btn btn-sm ${isActive ? "btn-warning" : "btn-secondary"}`}
      >
        {isActive ? "ปิดบัญชี" : "เปิดบัญชี"}
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        labelledBy="activation-title"
      >
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          <h3 id="activation-title" className="text-lg font-bold text-slate-900">
            {isActive ? "ปิดบัญชีผู้ใช้" : "เปิดบัญชีผู้ใช้"}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

          <p className="mt-5 rounded-xl border-2 border-slate-200 bg-mist px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700">
            {isActive ? (
              <>
                ผู้ใช้จะเข้าสู่ระบบไม่ได้ทันที และถ้ากำลังเปิดหน้าจอค้างอยู่
                จะถูกตัดออกในคำขอถัดไป
                <br />
                <span className="text-slate-500">
                  บทบาทและพื้นที่ที่เคยได้รับจะถูกเก็บไว้ครบ — เปิดบัญชีกลับเมื่อใดก็ได้สิทธิ์เดิมคืน
                </span>
              </>
            ) : (
              <>
                ผู้ใช้จะกลับมาเข้าสู่ระบบได้ และได้สิทธิ์ตามบทบาทและพื้นที่เดิมของบัญชี
                <br />
                <span className="text-slate-500">
                  การเปิดบัญชีไม่เปลี่ยนบทบาทหรือพื้นที่ให้อัตโนมัติ
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
              className={`btn btn-md ${isActive ? "btn-warning" : "btn-accent"}`}
            >
              {busy
                ? "กำลังบันทึก…"
                : isActive
                  ? "ยืนยันปิดบัญชี"
                  : "ยืนยันเปิดบัญชี"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
