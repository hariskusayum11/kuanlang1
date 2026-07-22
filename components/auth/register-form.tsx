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

interface CommunityOption {
  id: string;
  nameTh: string;
}

const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: "อีเมลนี้ถูกใช้งานแล้ว — หากเป็นอีเมลของคุณ กรุณาติดต่อผู้ดูแลระบบ",
  INVALID_COMMUNITY: "ชุมชนที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่",
  RATE_LIMITED: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
};

export function RegisterForm({ communities }: { communities: CommunityOption[] }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    requestedRole: "",
    communityId: "",
    organization: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-5 text-center animate-fade-in" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">ส่งคำขอลงทะเบียนแล้ว</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            ผู้ดูแลระบบจะตรวจสอบและอนุมัติคำขอของคุณ
            เมื่อได้รับการอนุมัติแล้ว คุณสามารถเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้ทันที
          </p>
        </div>
        <Link href="/login" className="btn btn-primary w-full">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="reg-name" className="label">
          ชื่อ-นามสกุล <span className="text-red-500">*</span>
        </label>
        <input
          id="reg-name"
          type="text"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          disabled={submitting}
          className="field disabled:bg-slate-50"
        />
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
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            placeholder="อย่างน้อย 8 ตัวอักษร"
            required
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reg-confirm" className="label">
            ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
          </label>
          <input
            id="reg-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-phone" className="label">
          เบอร์โทรศัพท์
        </label>
        <input
          id="reg-phone"
          type="tel"
          autoComplete="tel"
          placeholder="08x-xxx-xxxx"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          disabled={submitting}
          className="field disabled:bg-slate-50"
        />
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
          <label htmlFor="reg-community" className="label">
            ชุมชนที่ทำงานด้วย
          </label>
          <select
            id="reg-community"
            value={form.communityId}
            onChange={(e) => set("communityId", e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          >
            <option value="">— ไม่ระบุ —</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTh}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reg-org" className="label">
          หน่วยงาน/สังกัด
        </label>
        <input
          id="reg-org"
          type="text"
          placeholder="เช่น เทศบาลเมืองควนลัง, ม.ทักษิณ, ชุมชนท่าเคียน"
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
          className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 animate-fade-in"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 h-4 w-4 shrink-0">
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
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
