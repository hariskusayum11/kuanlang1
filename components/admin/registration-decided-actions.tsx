"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistrationRequestStatus } from "@prisma/client";
import {
  deleteRegistrationRequestAction,
  reopenRegistrationAction,
} from "@/lib/registration/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  NOT_FOUND_OR_DECIDED: "คำขอนี้ถูกตัดสิน/ลบไปแล้ว (อาจโดยแอดมินท่านอื่น) — รายการอัปเดตแล้ว",
  NOT_DELETABLE: "คำขอนี้ลบไม่ได้ (สถานะไม่รองรับการลบ)",
  FORBIDDEN: "คุณไม่มีสิทธิ์จัดการคำขอลงทะเบียน",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ปุ่มจัดการคำขอที่ตัดสินแล้ว (ในตาราง "ตัดสินล่าสุด"):
 * - REJECTED / CANCELLED → "กลับเป็นรอตรวจ" (REJECTED/CANCELLED → PENDING ให้พิจารณาใหม่)
 * - REJECTED / CANCELLED → "ลบ" (ลบคำขอ + ลบบัญชี inactive ที่ยังไม่เคยใช้งาน)
 *   ⚠️ คำขอ APPROVED ไม่มีปุ่มลบที่นี่ — บัญชีที่ใช้งานจริงต้องลบผ่านหน้าผู้ใช้ (soft delete)
 * ทุกการกระทำตรวจ RBAC ฝั่ง server ใน core — การซ่อนปุ่มไม่ใช่ Authorization
 */
export function RegistrationDecidedActions({
  requestId,
  status,
}: {
  requestId: string;
  /** เฉพาะคำขอที่ตัดสินแล้ว (REJECTED/CANCELLED มีปุ่มจัดการ) */
  status: RegistrationRequestStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reopen" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canManage = status === "REJECTED" || status === "CANCELLED";

  async function reopen() {
    if (busy) return;
    setBusy("reopen");
    setError(null);
    const result = await reopenRegistrationAction(requestId);
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(null);
      if (result.reason === "NOT_FOUND_OR_DECIDED") router.refresh();
      return;
    }
    router.refresh();
  }

  async function doDelete() {
    if (busy) return;
    setBusy("delete");
    setError(null);
    const result = await deleteRegistrationRequestAction(requestId);
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(null);
      if (result.reason === "NOT_FOUND_OR_DECIDED") router.refresh();
      return;
    }
    setConfirmDelete(false);
    router.refresh();
  }

  if (!canManage) {
    return (
      <span className="text-[11px] font-medium text-slate-300">
        บัญชีนี้ใช้งานแล้ว — ลบผ่านหน้าผู้ใช้
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {/* กลับเป็นรอตรวจ — ไม่ต้องยืนยันซ้ำ (ย้อนกลับได้ตลอด) */}
      <button
        type="button"
        onClick={() => void reopen()}
        disabled={busy !== null}
        className="btn btn-secondary btn-sm"
      >
        {busy === "reopen" ? "กำลังคืนสถานะ…" : "กลับเป็นรอตรวจ"}
      </button>

      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        disabled={busy !== null}
        className="btn btn-danger btn-sm"
      >
        ลบ
      </button>

      <Modal
        open={confirmDelete}
        onClose={() => !busy && setConfirmDelete(false)}
        labelledBy="delete-registration-title"
      >
        <div className="animate-rise max-w-sm rounded-3xl bg-white p-7 shadow-lg">
          <h3 id="delete-registration-title" className="text-lg font-bold text-slate-900">
            ลบคำขอนี้?
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            คำขอจะถูกลบออกจากระบบ · เพราะยังไม่เคยถูกอนุมัติ บัญชีที่สมัครไว้
            (ยังเข้าใช้งานไม่ได้) จะถูกนำออกด้วย — ไม่สามารถกู้คืนได้
          </p>
          {error && (
            <p
              role="alert"
              className="mt-3 animate-pop rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
            >
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy !== null}
              className="btn btn-ghost btn-md"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void doDelete()}
              disabled={busy !== null}
              className="btn btn-danger btn-md"
            >
              {busy === "delete" ? "กำลังลบ…" : "ยืนยันลบ"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
