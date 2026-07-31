"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRoleEnum } from "@prisma/client";
import { setUserRolesAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "ไม่มีสิทธิ์จัดการบทบาทผู้ใช้",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  INVALID_ROLE: "บทบาทไม่ถูกต้อง",
  SELF_ADMIN_REMOVAL:
    "ถอดสิทธิ์ผู้ดูแลระบบของตัวเองไม่ได้ — ให้แอดมินอีกคนเป็นผู้ถอดให้",
  LAST_ADMIN: "นี่คือผู้ดูแลระบบคนสุดท้าย — ถอดสิทธิ์ไม่ได้ ระบบจะไม่เหลือคนดูแล",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function UserRoleEditor({
  userId,
  userName,
  currentRoles,
  activeRoles,
  reservedRoles,
  roleLabels,
  roleHints,
  isSelf,
}: {
  userId: string;
  userName: string;
  currentRoles: UserRoleEnum[];
  /** บทบาทที่ใช้งานได้จริงแล้ว (มี permission + มีหน้าจอ) */
  activeRoles: UserRoleEnum[];
  /** บทบาทที่ประกาศไว้แต่ยังไม่มีโมดูลรองรับ — แยกกลุ่มกันแอดมินเลือกผิด */
  reservedRoles: UserRoleEnum[];
  roleLabels: Record<string, string>;
  roleHints: Record<string, string>;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UserRoleEnum[]>(currentRoles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    selected.length !== currentRoles.length ||
    selected.some((r) => !currentRoles.includes(r));

  function toggle(role: UserRoleEnum) {
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function openEditor() {
    setSelected(currentRoles);
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await setUserRolesAction({ userId, roles: selected });
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(false);
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={openEditor} className="btn btn-secondary btn-sm">
        แก้ไขบทบาท
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        labelledBy="role-editor-title"
      >
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
          <h3 id="role-editor-title" className="text-lg font-bold text-slate-900">
            แก้ไขบทบาท
          </h3>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{userName}</p>

          <p className="eyebrow mt-5">ใช้งานได้แล้ว</p>
          <div className="mt-2 space-y-2">
            {activeRoles.map((role) => (
              <RoleCheckbox
                key={role}
                role={role}
                label={roleLabels[role] ?? role}
                hint={roleHints[role]}
                checked={selected.includes(role)}
                onToggle={() => toggle(role)}
              />
            ))}
          </div>

          {reservedRoles.length > 0 && (
            <>
              <p className="eyebrow mt-5">ยังไม่มีโมดูลรองรับ</p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                มอบหมายได้ แต่ผู้ใช้จะยังทำงานในระบบไม่ได้จนกว่าโมดูลที่เกี่ยวข้องจะเสร็จ
              </p>
              <div className="mt-2 space-y-2">
                {reservedRoles.map((role) => (
                  <RoleCheckbox
                    key={role}
                    role={role}
                    label={roleLabels[role] ?? role}
                    hint={roleHints[role]}
                    checked={selected.includes(role)}
                    onToggle={() => toggle(role)}
                    reserved
                  />
                ))}
              </div>
            </>
          )}

          {isSelf && (
            <p className="mt-4 rounded-xl border-2 border-sun-200 bg-sun-50 px-3.5 py-2.5 text-xs font-medium text-sun-800">
              นี่คือบัญชีของคุณเอง — ถอดสิทธิ์ผู้ดูแลระบบของตัวเองไม่ได้
              ต้องให้แอดมินอีกคนเป็นผู้ถอดให้
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 animate-pop rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn btn-ghost btn-md"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="btn btn-accent btn-md"
            >
              {busy ? "กำลังบันทึก…" : "บันทึกบทบาท"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** ช่องติ๊กบทบาทหนึ่งรายการ — reserved = ยังไม่มีโมดูลรองรับ (ทำโทนจางลง) */
function RoleCheckbox({
  role,
  label,
  hint,
  checked,
  onToggle,
  reserved = false,
}: {
  role: string;
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
  reserved?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer select-none items-start gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-sm transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400 ${
        checked
          ? "border-brand-500 bg-brand-50 text-brand-800"
          : reserved
            ? "border-dashed border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-brand-50/30"
            : "border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50/40"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
          checked ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className={`block ${checked ? "font-bold" : "font-medium"}`}>
          {label}
          <span className="ml-1.5 font-mono text-[11px] font-medium text-slate-400">
            {role}
          </span>
        </span>
        {hint && (
          <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-slate-500">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
