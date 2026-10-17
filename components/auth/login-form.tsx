"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { loginSchema } from "@/lib/validations/auth";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";
import { PasswordToggle } from "@/components/auth/password-toggle";

export function LoginForm({
  /** ระบบอีเมลเปิดอยู่หรือไม่ (lib/config/email.ts) — ปิดอยู่ = ไม่มีเส้นทางรีเซ็ตรหัสด้วยตนเอง */
  emailEnabled = true,
}: {
  emailEnabled?: boolean;
} = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? SAFE_ERROR_MESSAGES.generic);
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (signInError) {
      // 429 = ถูก rate limit — บอกให้รอ (ไม่ใช่รหัสผิด) เพื่อไม่ให้ผู้ใช้พิมพ์ซ้ำจนโดนล็อกนานขึ้น
      // 403 = รหัสถูกต้องแต่บัญชียังไม่ active (รออนุมัติ/ถูกระงับ) — บอกได้อย่างปลอดภัย
      //       เพราะข้อความนี้โผล่หลังยืนยันรหัสผ่านแล้วเท่านั้น ไม่เปิดช่อง enumeration
      // กรณีอื่นใช้ข้อความกลางเสมอ — ไม่เปิดเผยว่า email หรือ password ผิด
      setError(
        signInError.status === 429
          ? SAFE_ERROR_MESSAGES.rateLimited
          : signInError.status === 403
            ? SAFE_ERROR_MESSAGES.accountNotReady
            : SAFE_ERROR_MESSAGES.login,
      );
      setSubmitting(false);
      return;
    }

    // Hard navigation หลังตั้ง session cookie — กัน race ระหว่าง router.replace + refresh
    // (RSC ฝั่ง server จะอ่าน cookie ใหม่ครบถ้วน ไม่ค้างที่หน้า login)
    window.location.assign("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="label">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className="field disabled:bg-slate-50"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="label">รหัสผ่าน</label>
          {/* ปิดระบบอีเมล = ส่งลิงก์ตั้งรหัสใหม่ไม่ได้ จึงต้องไม่พาผู้ใช้ไปหน้าที่ทำอะไรไม่ได้
              เส้นทางที่ใช้จริงคือ ADMIN ตั้งรหัสชั่วคราวให้ (lib/admin/user-password.ts) */}
          {emailEnabled ? (
            <a href="/forgot-password" className="text-sm font-semibold text-brand-600 hover:underline">
              ลืมรหัสผ่าน?
            </a>
          ) : (
            <span className="text-xs font-medium text-slate-400">
              ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบ
            </span>
          )}
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="field pr-11 disabled:bg-slate-50"
          />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 animate-pop"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
        {submitting ? (
          <>
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
              <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            กำลังเข้าสู่ระบบ
          </>
        ) : (
          "เข้าสู่ระบบ"
        )}
      </button>
    </form>
  );
}
