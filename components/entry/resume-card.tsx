"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimSheetAction, releaseSheetAction } from "@/lib/entry/actions";

type Props = {
  sheetId: string;
  sheetNo: string;
  communityName: string;
  expired: boolean;
};

/**
 * แถว "ใบที่คีย์ค้างอยู่" — ขนาดเล็ก ไม่ใช่จุดเด่นของหน้า
 * (Lock เป็นกลไกความปลอดภัยเบื้องหลัง ไม่ใช่แกนของประสบการณ์ใช้งาน)
 */
export function ResumeRow({ sheetId, sheetNo, communityName, expired }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"open" | "stop" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReopen() {
    setPending("open");
    const result = await claimSheetAction(sheetId);
    if (result.ok) {
      router.push(`/surveys/entry/${sheetId}`);
      return;
    }
    setMessage("เปิดใบไม่สำเร็จ — ใบอาจถูกเจ้าหน้าที่ท่านอื่นเปิดอยู่");
    setPending(null);
    router.refresh();
  }

  async function handleStop() {
    setPending("stop");
    await releaseSheetAction(sheetId);
    setPending(null);
    router.refresh();
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200/70 bg-brand-50/40 px-4 py-3 animate-fade-in">
      <p className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4 shrink-0 text-brand-500">
          <path d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1z" strokeLinejoin="round" />
        </svg>
        <span className="truncate">
          ใบที่คีย์ค้างอยู่: <span className="font-mono text-xs font-medium">{sheetNo}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          {communityName}
        </span>
      </p>
      <span className="flex items-center gap-2">
        {expired ? (
          <button
            type="button"
            onClick={handleReopen}
            disabled={pending !== null}
            className="btn btn-primary btn-sm"
          >
            {pending === "open" ? "กำลังเปิด…" : "เปิดใบนี้อีกครั้ง"}
          </button>
        ) : (
          <Link href={`/surveys/entry/${sheetId}`} className="btn btn-primary btn-sm">
            คีย์ต่อ
          </Link>
        )}
        <button
          type="button"
          onClick={handleStop}
          disabled={pending !== null}
          className="btn btn-ghost btn-sm"
        >
          {pending === "stop" ? "กำลังหยุด…" : "หยุดคีย์ใบนี้"}
        </button>
      </span>
      {message && (
        <p role="status" className="w-full text-xs text-amber-700">
          {message}
        </p>
      )}
    </section>
  );
}
