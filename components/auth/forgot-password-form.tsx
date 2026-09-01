"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const GENERIC_SUCCESS =
  "หากอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว กรุณาตรวจกล่องจดหมายและอีเมลขยะ";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setError("กรุณากรอกอีเมลให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    const { error: requestError } = await authClient.requestPasswordReset({
      email: normalized,
      redirectTo: "/reset-password",
    });
    setSubmitting(false);

    if (requestError?.status === 429) {
      setError("ส่งคำขอบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่");
      return;
    }
    if (requestError) {
      setError("ระบบส่งอีเมลไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ");
      return;
    }
    // ทั้งอีเมลที่มีและไม่มีบัญชีใช้ผลลัพธ์เดียวกัน ป้องกันการไล่หาอีเมลในระบบ
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-5" role="status">
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800">
          {GENERIC_SUCCESS}
        </div>
        <button type="button" onClick={() => setSent(false)} className="btn btn-secondary w-full">
          ส่งไปยังอีเมลอีกครั้ง
        </button>
        <Link href="/login" className="btn btn-primary w-full">กลับหน้าเข้าสู่ระบบ</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="reset-email" className="label">อีเมลของบัญชี</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          placeholder="you@example.com"
          className="field disabled:bg-slate-50"
        />
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
        {submitting ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-brand-600 hover:underline">
        กลับหน้าเข้าสู่ระบบ
      </Link>
    </form>
  );
}
