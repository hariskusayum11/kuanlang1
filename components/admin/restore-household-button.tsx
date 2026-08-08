"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreHouseholdAction } from "@/lib/household/admin-actions";

type Props = {
  householdId: string;
  sheetNo: string;
};

const ERRORS: Record<string, string> = {
  NOT_FOUND: "ไม่พบใบนี้แล้ว",
  NOT_DELETED: "ใบนี้ยังไม่ถูกลบ",
  INVALID: "รหัสใบไม่ถูกต้อง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  NOT_ALLOWED: "เฉพาะผู้ดูแลระบบเท่านั้นที่กู้คืนได้",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function RestoreHouseholdButton({ householdId, sheetNo }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await restoreHouseholdAction(householdId);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void restore()}
        disabled={busy}
        className="btn btn-success btn-sm"
        title={`กู้คืนใบ ${sheetNo} กลับสู่ระบบ`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "กำลังกู้…" : "กู้คืน"}
      </button>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
