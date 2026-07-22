"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimSheetAction } from "@/lib/entry/actions";

type Props = {
  sheetId: string;
  /** true = ล็อกเดิมของผู้ใช้หมดอายุ, false = ใบยังว่าง (PENDING) */
  expired: boolean;
};

/** หน้าประตูก่อนเข้าฟอร์ม — ต้องหยิบ (ล็อก) ใบก่อนคีย์เสมอ */
export function SheetGate({ sheetId, expired }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClaim() {
    setPending(true);
    setMessage(null);
    const result = await claimSheetAction(sheetId);
    if (result.ok) {
      router.refresh();
      return;
    }
    setMessage("เปิดใบไม่สำเร็จ — ใบอาจถูกเจ้าหน้าที่ท่านอื่นเปิดอยู่");
    setPending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-rise rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-md">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            expired ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
            {expired ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1z" strokeLinejoin="round" />
            )}
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">
          {expired ? "การจองใบหมดอายุ" : "พร้อมเริ่มคีย์ใบนี้"}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          {expired
            ? "จองใบนี้อีกครั้งเพื่อคีย์ต่อ — หากมีผู้อื่นเปิดอยู่จะเปิดไม่ได้"
            : "ระบบจะจองใบนี้ให้คุณระหว่างคีย์ เพื่อป้องกันการคีย์ซ้ำซ้อนกับเจ้าหน้าที่ท่านอื่น"}
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleClaim}
            disabled={pending}
            className="btn btn-primary btn-md"
          >
            {pending ? "กำลังเปิด…" : expired ? "คีย์ใบนี้ต่อ" : "เริ่มคีย์ใบนี้"}
          </button>
          <Link href="/surveys" className="btn btn-secondary btn-md">
            กลับหน้าคีย์แบบสอบถาม
          </Link>
        </div>
        {message && (
          <p role="status" className="mt-4 text-xs text-amber-700 animate-fade-in">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
