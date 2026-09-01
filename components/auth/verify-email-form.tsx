"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
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
    const { error: sendError } = await authClient.sendVerificationEmail({
      email: normalized,
      callbackURL: "/email-verified",
    });
    setSubmitting(false);
    if (sendError?.status === 429) {
      setError("ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    if (sendError) {
      setError("ระบบส่งอีเมลไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลังหรือติดต่อผู้ดูแลระบบ");
      return;
    }
    // ตอบเหมือนกันทั้งอีเมลที่มี/ไม่มีบัญชี ป้องกัน account enumeration
    setSent(true);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {sent && (
        <p role="status" className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          หากอีเมลนี้รอยืนยันอยู่ ระบบได้ส่งลิงก์ใหม่แล้ว กรุณาตรวจกล่องจดหมายและอีเมลขยะ
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="verification-email" className="label">อีเมลที่ใช้สมัคร</label>
        <input id="verification-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} className="field disabled:bg-slate-50" />
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
        {submitting ? "กำลังส่ง…" : "ส่งลิงก์ยืนยันอีเมล"}
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-brand-600 hover:underline">กลับหน้าเข้าสู่ระบบ</Link>
    </form>
  );
}
