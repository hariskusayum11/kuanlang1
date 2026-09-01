"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { PasswordToggle } from "@/components/auth/password-toggle";

export function ResetPasswordForm({ token, invalid }: { token?: string; invalid: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [shown, setShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(
    invalid || !token ? "ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่" : null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    setError(null);
    if (password.length < 8) {
      setError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password.length > 128) {
      setError("รหัสผ่านยาวเกินไป");
      return;
    }
    if (password !== confirmation) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setSubmitting(false);
    if (resetError) {
      setError("ลิงก์นี้ไม่ถูกต้อง ถูกใช้แล้ว หรือหมดอายุ กรุณาขอลิงก์ใหม่");
      return;
    }
    setComplete(true);
  }

  if (complete) {
    return (
      <div className="space-y-5" role="status">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800">
          ตั้งรหัสผ่านใหม่สำเร็จแล้ว และนำอุปกรณ์ที่เคยเข้าสู่ระบบออกทั้งหมดเพื่อความปลอดภัย
        </div>
        <Link href="/login" className="btn btn-primary btn-lg w-full">เข้าสู่ระบบด้วยรหัสผ่านใหม่</Link>
      </div>
    );
  }

  if (!token || invalid) {
    return (
      <div className="space-y-5">
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>
        <Link href="/forgot-password" className="btn btn-primary w-full">ขอลิงก์ใหม่</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <PasswordField id="new-password" label="รหัสผ่านใหม่" value={password} onChange={setPassword} shown={shown} onToggle={() => setShown((value) => !value)} />
      <PasswordField id="confirm-password" label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} shown={shown} onToggle={() => setShown((value) => !value)} />
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
        {submitting ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
      </button>
    </form>
  );
}

function PasswordField({ id, label, value, onChange, shown, onToggle }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input id={id} type={shown ? "text" : "password"} autoComplete="new-password" required value={value} onChange={(event) => onChange(event.target.value)} className="field pr-11" />
        <PasswordToggle shown={shown} onToggle={onToggle} />
      </div>
    </div>
  );
}
