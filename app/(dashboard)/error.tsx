"use client";

import { SAFE_ERROR_MESSAGES } from "@/lib/errors";
import { Mascot } from "@/components/brand/mascot";

// Error boundary ของโซนหลัง Login — ไม่แสดง stack trace / รายละเอียดภายใน
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="animate-rise max-w-md rounded-3xl border-2 border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <div className="animate-drop-in">
          <Mascot role="notify" mood="alert" tone="sun" motion="float" size={100} decorative className="mx-auto" />
        </div>
        <p className="mt-4 text-xl font-bold text-slate-900">ขออภัย เกิดข้อผิดพลาด</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{SAFE_ERROR_MESSAGES.database}</p>
        <button type="button" onClick={reset} className="btn btn-accent btn-lg mt-7">
          ลองใหม่
        </button>
      </div>
    </div>
  );
}
