"use client";

import { useState } from "react";
import { Portal } from "@/components/ui/portal";
import { authClient } from "@/lib/auth-client";
import { recordLogout } from "@/lib/auth-actions";

export function LogoutButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    // บันทึก Audit LOGOUT ขณะ session ยัง valid (best-effort — ไม่ขวางการออกจากระบบ)
    try {
      await recordLogout();
    } catch {
      // ไม่บล็อกการออกจากระบบถ้า audit ล้มเหลว
    }
    await authClient.signOut();
    // Hard navigation — ล้าง client router cache ของหน้าที่ต้องล็อกอิน กัน race
    window.location.assign("/login");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="btn btn-secondary btn-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
          <path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ออกจากระบบ
      </button>

      {confirmOpen && (
        // Portal ออกไปที่ body — กล่องนี้ถูกเรนเดอร์อยู่ใน header (sticky z-20)
        // ถ้าไม่ Portal จะถูกขังอยู่ใน stacking context ของ header แล้วโดนสิ่งที่
        // z สูงกว่า 20 ที่ระดับหน้า (เช่น เมนูมือถือ) วาดทับ (ดู components/ui/portal.tsx)
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm animate-rise rounded-2xl bg-white p-6 text-center shadow-lg">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
                <path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">ออกจากระบบ?</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-slate-600">
              คุณจะต้องเข้าสู่ระบบใหม่เพื่อกลับมาทำงานต่อ
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="btn btn-secondary btn-md"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={pending}
                className="btn btn-primary btn-md"
              >
                {pending ? (
                  <>
                    <Spinner />
                    กำลังออก
                  </>
                ) : (
                  "ออกจากระบบ"
                )}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
