"use client";

import { useState } from "react";
import Link from "next/link";
import { submitRegistrationAction } from "@/lib/registration/actions";
import {
  REQUESTABLE_ROLES,
  REQUESTABLE_ROLE_LABELS,
  registrationSchema,
} from "@/lib/registration/validation";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";
import { Mascot } from "@/components/brand/mascot";
import { PasswordToggle } from "@/components/auth/password-toggle";

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: "อีเมลนี้ถูกใช้งานแล้ว — หากเป็นอีเมลของคุณ กรุณาติดต่อผู้ดูแลระบบ",
  INVALID_COMMUNITY: "ชุมชนที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่",
  RATE_LIMITED: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
};

// ไม่ถามชุมชนตอนสมัครแล้ว (Owner Decision 2026-08-03 #R7-B: Community Scope ถูกยกเลิก
// ทั้งระบบ — ทุกบัญชีเห็นทุกชุมชน) การถามชุมชนที่นี่จะสื่อผิดว่ายังจำกัดสิทธิ์ตามชุมชน
// ช่อง "หน่วยงาน/สังกัด" (อิสระ) ครอบคลุมข้อมูลสังกัดที่แอดมินอยากรู้อยู่แล้ว
export function RegisterForm() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    requestedRole: "",
    organization: "",
    note: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    const parsed = registrationSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? SAFE_ERROR_MESSAGES.generic);
      return;
    }

    setSubmitting(true);
    const result = await submitRegistrationAction(parsed.data);
    if (!result.ok) {
      setError(
        ("message" in result && result.message) ||
          SUBMIT_ERROR_MESSAGES[result.reason] ||
          SAFE_ERROR_MESSAGES.generic,
      );
      setSubmitting(false);
      return;
    }
    setVerificationEmailSent(result.verificationEmailSent);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-5 text-center animate-fade-in" role="status">
        <div className="animate-drop-in">
          <Mascot role="field" mood="happy" tone="mint" motion="float" size={100} decorative className="mx-auto" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">ส่งคำขอลงทะเบียนแล้ว</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            {verificationEmailSent
              ? "ระบบส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว กรุณายืนยันอีเมลก่อน จากนั้นรอผู้ดูแลระบบตรวจสอบและอนุมัติบัญชี"
              : "สร้างคำขอสำเร็จ แต่ยังส่งอีเมลยืนยันไม่ได้ กรุณากดส่งลิงก์อีกครั้งด้านล่าง หรือติดต่อผู้ดูแลระบบ"}
          </p>
        </div>
        <Link
          href={`/verify-email?email=${encodeURIComponent(form.email)}`}
          className="btn btn-secondary btn-lg w-full"
        >
          ไม่ได้รับอีเมล / ส่งลิงก์อีกครั้ง
        </Link>
        <Link href="/login" className="btn btn-accent btn-lg w-full">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="reg-firstname" className="label">
            ชื่อ <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-firstname"
            type="text"
            autoComplete="given-name"
            required
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reg-lastname" className="label">
            นามสกุล <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-lastname"
            type="text"
            autoComplete="family-name"
            required
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-email" className="label">
          อีเมล <span className="text-red-500">*</span>
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          disabled={submitting}
          className="field disabled:bg-slate-50"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="reg-password" className="label">
            รหัสผ่าน <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              required
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              disabled={submitting}
              className="field pr-11 disabled:bg-slate-50"
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reg-confirm" className="label">
            ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="reg-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              disabled={submitting}
              className="field pr-11 disabled:bg-slate-50"
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((s) => !s)} />
          </div>
        </div>
      </div>


      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="reg-role" className="label">
            บทบาทที่ขอ <span className="text-red-500">*</span>
          </label>
          <select
            id="reg-role"
            required
            value={form.requestedRole}
            onChange={(e) => set("requestedRole", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          >
            <option value="">— เลือกบทบาท —</option>
            {REQUESTABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {REQUESTABLE_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reg-phone" className="label">
            เบอร์โทรศัพท์
          </label>
          <input
            id="reg-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="0812345678"
            maxLength={10}
            value={form.phone}
            // รับเฉพาะตัวเลข ตัดอักขระอื่นทิ้ง จำกัด 10 หลัก
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-org" className="label">
          หน่วยงาน/สังกัด
        </label>
        <input
          id="reg-org"
          type="text"
          placeholder="เช่น เทศบาล, ม.ทักษิณ, ชุมชนท่าเคียน"
          value={form.organization}
          onChange={(e) => set("organization", e.target.value)}
          disabled={submitting}
          className="field disabled:bg-slate-50"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-note" className="label">
          หมายเหตุถึงผู้ดูแลระบบ
        </label>
        <textarea
          id="reg-note"
          rows={2}
          placeholder="เช่น ได้รับมอบหมายจากหัวหน้างานให้ช่วยคีย์ข้อมูล"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          disabled={submitting}
          className="field min-h-[64px] disabled:bg-slate-50"
        />
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
            กำลังส่งคำขอ
          </>
        ) : (
          "ส่งคำขอลงทะเบียน"
        )}
      </button>

      <p className="text-center text-sm text-slate-500">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="font-bold text-brand-700 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
