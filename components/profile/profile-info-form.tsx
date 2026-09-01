"use client";

import { useActionState } from "react";
import { updateMyProfileAction, type ProfileFormState } from "@/lib/profile/actions";

const INITIAL: ProfileFormState = { ok: false };

export function ProfileInfoForm({ name, phone }: { name: string; phone: string }) {
  const [state, action, pending] = useActionState(updateMyProfileAction, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="profile-name" className="label">ชื่อ - นามสกุล</label>
        <input
          id="profile-name"
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={name}
          autoComplete="name"
          className="field"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="profile-phone" className="label">เบอร์โทรศัพท์</label>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          defaultValue={phone}
          placeholder="เช่น 0812345678 (เว้นว่างได้)"
          autoComplete="tel"
          className="field"
        />
        <p className="text-xs text-slate-400">ตัวเลข 10 หลัก · เว้นว่างไว้หากไม่ต้องการระบุ</p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}
      {state.saved ? (
        <p role="status" className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">บันทึกข้อมูลส่วนตัวแล้ว</p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn btn-primary btn-md">
          {pending ? "กำลังบันทึก…" : "บันทึกข้อมูลส่วนตัว"}
        </button>
      </div>
    </form>
  );
}
