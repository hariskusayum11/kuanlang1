"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startSheetAction } from "@/lib/sheet/actions";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

interface CommunityOption {
  id: string;
  nameTh: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_COMMUNITY: "ไม่พบชุมชนที่เลือก กรุณาเลือกใหม่",
  NUMBER_EXHAUSTED:
    "รหัสแบบสอบถามถูกใช้ครบแล้ว — กรุณาแจ้งผู้ดูแลระบบก่อนคีย์ใบถัดไป",
  FORBIDDEN: "คุณไม่มีสิทธิ์คีย์แบบสอบถาม",
};

/**
 * เริ่มแบบสอบถามใบใหม่ — Primary Action ของหน้าคีย์ (Owner Decision 2026-08-03)
 *
 * ผู้คีย์เลือกชุมชนจากรายการ (ไม่ต้องพิมพ์) แล้วกดเริ่ม ระบบออกรหัส SK-XXXXXX ให้
 * ผู้คีย์เขียนรหัสลงบนกระดาษแล้วคีย์ต่อได้ทันที — ไม่ต้องมีใครลงทะเบียนใบล่วงหน้า
 */
export function StartSheetForm({
  communities,
  hideHeader = false,
}: {
  communities: CommunityOption[];
  /** ซ่อนหัวเรื่องภายในฟอร์ม — ใช้เมื่อวางในกล่อง Modal ที่มีหัวเรื่องของตัวเองแล้ว */
  hideHeader?: boolean;
}) {
  const router = useRouter();
  const [communityId, setCommunityId] = useState(
    communities.length === 1 ? communities[0].id : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!communityId) {
      setError("กรุณาเลือกชุมชนของแบบสอบถามใบนี้");
      return;
    }
    setPending(true);
    setError(null);

    const result = await startSheetAction({ communityId });
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.reason] ?? SAFE_ERROR_MESSAGES.generic);
      setPending(false);
      return;
    }
    // ส่งรหัสไปกับ URL เพื่อให้หน้าฟอร์มแสดงตัวใหญ่ทันทีให้เขียนลงกระดาษ
    router.push(`/surveys/entry/${result.sheetId}?new=1`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-3">
          <span className="chip chip-lg chip-accent shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
              <path
                d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1zM9 9h6M9 13h4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">เริ่มกรอกแบบสอบถามใบใหม่</h3>
            <p className="text-sm text-slate-500">
              เลือกชุมชนของกระดาษที่ถืออยู่ ระบบจะออกรหัสให้เขียนลงบนกระดาษ
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="start-community" className="label mb-1.5">
            ชุมชนของแบบสอบถามใบนี้ <span className="text-red-500">*</span>
          </label>
          <select
            id="start-community"
            required
            value={communityId}
            onChange={(e) => {
              setCommunityId(e.target.value);
              if (error) setError(null);
            }}
            disabled={pending}
            className="field text-base disabled:bg-slate-50"
          >
            <option value="">— เลือกชุมชน —</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTh}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="btn btn-accent btn-lg shrink-0">
          {pending ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
              <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          เริ่มกรอก
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 animate-pop"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      )}

      <p className="text-xs text-slate-500">
        เลือกชุมชนผิดแก้ไขภายหลังได้ — รหัสจะไม่เปลี่ยนตามชุมชน
      </p>
    </form>
  );
}
