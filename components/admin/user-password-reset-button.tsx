"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetUserPasswordAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  PROTECTED_ACCOUNT:
    "บัญชีนี้เป็นบัญชีคุ้มครอง — ผู้ดูแลระบบทั่วไปแก้ไขไม่ได้ ต้องให้บัญชีคุ้มครองด้วยกันเป็นผู้ดำเนินการ",
  NOT_ALLOWED: "ไม่มีสิทธิ์ตั้งรหัสผ่านให้ผู้ใช้รายอื่น",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  SELF_RESET:
    "ตั้งรหัสชั่วคราวให้บัญชีตัวเองไม่ได้ — ถ้าต้องการเปลี่ยนรหัสของคุณเอง ใช้หน้าโปรไฟล์",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้ แล้วแสดงรหัสบนหน้าจอ "ครั้งเดียว"
 * รหัสไม่ถูกเก็บลงฐานข้อมูลและไม่ถูกเขียนลง log — ปิดหน้าต่างแล้วดูย้อนหลังไม่ได้
 */
export function UserPasswordResetButton({
  userId,
  userName,
  isSelf,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ซ่อนปุ่มกับบัญชีตนเองเป็นเพียงความสะดวก — Guard จริงอยู่ฝั่ง server (resetUserPassword)
  if (isSelf) return null;

  function close() {
    if (busy) return;
    setOpen(false);
    // ล้างรหัสออกจากหน่วยความจำฝั่ง client ทันทีที่ปิด — ไม่ให้ค้างอยู่ใน state
    setTempPassword(null);
    setCopied(false);
    setError(null);
    if (tempPassword) router.refresh();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await resetUserPasswordAction({ userId });
    setBusy(false);
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      return;
    }
    setTempPassword(result.tempPassword);
  }

  async function copy() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      // เบราว์เซอร์ไม่อนุญาตให้เขียนคลิปบอร์ด — ผู้ใช้ยังอ่านจากหน้าจอได้
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setTempPassword(null);
          setCopied(false);
          setOpen(true);
        }}
        className="btn btn-secondary btn-sm"
      >
        ตั้งรหัสใหม่
      </button>

      <Modal open={open} onClose={close} labelledBy="reset-password-title">
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          {tempPassword ? (
            <>
              <h3 id="reset-password-title" className="text-lg font-bold text-slate-900">
                รหัสผ่านชั่วคราวของ {userName}
              </h3>

              <p className="mt-4 rounded-xl border-2 border-slate-900 bg-ink-900 px-4 py-4 text-center font-mono text-xl font-bold tracking-wider text-white">
                {tempPassword}
              </p>

              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => void copy()} className="btn btn-ghost btn-sm">
                  {copied ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
                </button>
              </div>

              <p className="mt-5 rounded-xl border-2 border-sun-300 bg-sun-50 px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-800">
                <strong>รหัสนี้แสดงครั้งเดียว</strong> — ปิดหน้าต่างแล้วดูย้อนหลังไม่ได้
                กรุณาแจ้งผู้ใช้ก่อนปิด
                <br />
                <span className="text-slate-600">
                  ผู้ใช้จะถูกบังคับให้ตั้งรหัสใหม่ทันทีที่เข้าสู่ระบบ และอุปกรณ์ที่ค้างอยู่ถูกออกจากระบบแล้ว
                </span>
              </p>

              <div className="mt-6 flex justify-end">
                <button type="button" onClick={close} className="btn btn-primary btn-md">
                  แจ้งผู้ใช้แล้ว ปิดหน้าต่าง
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 id="reset-password-title" className="text-lg font-bold text-slate-900">
                ตั้งรหัสผ่านชั่วคราว
              </h3>
              <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

              <p className="mt-5 rounded-xl border-2 border-slate-200 bg-mist px-3.5 py-3 text-sm font-medium leading-relaxed text-slate-700">
                ระบบจะสุ่มรหัสผ่านใหม่ให้ และ<strong>รหัสเดิมของผู้ใช้จะใช้ไม่ได้ทันที</strong>
                <br />
                <span className="text-slate-500">
                  ใช้เมื่อผู้ใช้ลืมรหัสผ่านและยืนยันตัวตนกับคุณแล้ว ·
                  การตั้งรหัสให้ผู้อื่นถูกบันทึก Audit Log ทุกครั้ง
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
                <button type="button" onClick={close} disabled={busy} className="btn btn-ghost btn-md">
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className="btn btn-warning btn-md"
                >
                  {busy ? "กำลังตั้งรหัส…" : "ยืนยันตั้งรหัสใหม่"}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
