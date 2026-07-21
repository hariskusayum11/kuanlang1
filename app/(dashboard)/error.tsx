"use client";

import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

// Error boundary ของโซนหลัง Login — ไม่แสดง stack trace / รายละเอียดภายใน
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-slate-900">ขออภัย เกิดข้อผิดพลาด</p>
        <p className="mt-2 text-sm text-slate-600">{SAFE_ERROR_MESSAGES.database}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          ลองใหม่
        </button>
      </div>
    </div>
  );
}
