"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordToggle } from "@/components/auth/password-toggle";
import { changeMyPasswordAction, type ProfileFormState } from "@/lib/profile/actions";

const INITIAL: ProfileFormState = { ok: false };

export function PasswordChangeForm() {
  const [state, action, pending] = useActionState(changeMyPasswordAction, INITIAL);
  const [shown, setShown] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // ล้างช่องรหัสผ่านหลังเปลี่ยนสำเร็จ — ไม่ค้างค่ารหัสไว้ในฟอร์ม (state ใหม่ทุกครั้งที่ submit)
  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <PasswordField
        id="current-password"
        name="currentPassword"
        label="รหัสผ่านปัจจุบัน"
        autoComplete="current-password"
        shown={shown}
        onToggle={() => setShown((v) => !v)}
      />
      <PasswordField
        id="new-password"
        name="newPassword"
        label="รหัสผ่านใหม่"
        autoComplete="new-password"
        shown={shown}
        onToggle={() => setShown((v) => !v)}
      />
      <PasswordField
        id="confirm-new-password"
        name="confirmPassword"
        label="ยืนยันรหัสผ่านใหม่"
        autoComplete="new-password"
        shown={shown}
        onToggle={() => setShown((v) => !v)}
      />
      <p className="text-xs text-slate-400">รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร · เมื่อเปลี่ยนแล้วอุปกรณ์อื่นที่เข้าสู่ระบบไว้จะถูกออกจากระบบ</p>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">เปลี่ยนรหัสผ่านสำเร็จแล้ว</p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn btn-primary btn-md">
          {pending ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
        </button>
      </div>
    </form>
  );
}

function PasswordField({ id, name, label, autoComplete, shown, onToggle }: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="field pr-11"
        />
        <PasswordToggle shown={shown} onToggle={onToggle} />
      </div>
    </div>
  );
}
