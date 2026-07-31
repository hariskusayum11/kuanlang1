"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimSheetAction } from "@/lib/entry/actions";
import { Mascot } from "@/components/brand/mascot";

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
      <div className="w-full max-w-md animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <div className="animate-drop-in">
          <Mascot
            role={expired ? "notify" : "entry"}
            mood={expired ? "sleep" : "wink"}
            tone={expired ? "sun" : undefined}
            motion="float"
            size={104}
            decorative
            className="mx-auto"
          />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
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
            className="btn btn-accent btn-lg"
          >
            {pending ? "กำลังเปิด…" : expired ? "คีย์ใบนี้ต่อ" : "เริ่มคีย์ใบนี้"}
          </button>
          <Link href="/surveys" className="btn btn-secondary btn-lg">
            กลับหน้าคีย์แบบสอบถาม
          </Link>
        </div>
        {message && (
          <p role="status" className="mt-4 text-xs font-semibold text-sun-800 animate-pop">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
