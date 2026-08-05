"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimSheetAction } from "@/lib/entry/actions";
import { Mascot } from "@/components/brand/mascot";

type GateMode = "fresh" | "reopen" | "expired";

type Props = {
  sheetId: string;
  /** fresh = ใบว่างเริ่มคีย์ · reopen = ใบที่ตนคีย์แล้วกดกลับมาแก้ · expired = ล็อกเดิมหมดอายุ */
  mode: GateMode;
};

// ถ้อยคำแยกตามบริบท — "แก้ไข" ไม่ใช่ "เริ่มคีย์" เมื่อเป็นใบที่คีย์ส่งไปแล้ว (Owner feedback)
const GATE_COPY: Record<GateMode, { title: string; detail: string; cta: string }> = {
  fresh: {
    title: "พร้อมเริ่มคีย์ใบนี้",
    detail: "ระบบจะจองใบนี้ให้คุณระหว่างคีย์ เพื่อป้องกันการคีย์ซ้ำซ้อนกับเจ้าหน้าที่ท่านอื่น",
    cta: "เริ่มคีย์ใบนี้",
  },
  reopen: {
    title: "เปิดใบนี้เพื่อแก้ไข",
    detail:
      "ใบนี้คุณคีย์ส่งไปแล้ว — เปิดกลับมาแก้ได้ทุกเมื่อ ระบบจะจองใบไว้ให้ระหว่างแก้ไข " +
      "หากใบนี้เคยตรวจยืนยันแล้ว การแก้จะทำให้กลับไปรอตรวจใหม่อัตโนมัติ",
    cta: "เปิดแก้ไข",
  },
  expired: {
    title: "การจองใบหมดอายุ",
    detail: "จองใบนี้อีกครั้งเพื่อคีย์ต่อ — หากมีผู้อื่นเปิดอยู่จะเปิดไม่ได้",
    cta: "คีย์ใบนี้ต่อ",
  },
};

/** หน้าประตูก่อนเข้าฟอร์ม — ต้องหยิบ (ล็อก) ใบก่อนคีย์เสมอ */
export function SheetGate({ sheetId, mode }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = GATE_COPY[mode];

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
            role={mode === "expired" ? "notify" : mode === "reopen" ? "verify" : "entry"}
            mood={mode === "expired" ? "sleep" : "wink"}
            tone={mode === "expired" ? "sun" : mode === "reopen" ? "mint" : undefined}
            motion="float"
            size={104}
            decorative
            className="mx-auto"
          />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          {copy.detail}
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleClaim}
            disabled={pending}
            className="btn btn-accent btn-lg"
          >
            {pending ? "กำลังเปิด…" : copy.cta}
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
