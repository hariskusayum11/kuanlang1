"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteHouseholdAction } from "@/lib/household/admin-actions";

type Props = {
  householdId: string;
  sheetNo: string;
};

const ERRORS: Record<string, string> = {
  NOT_FOUND: "ไม่พบใบนี้แล้ว",
  ALREADY_DELETED: "ใบนี้ถูกลบไปแล้ว",
  INVALID: "รหัสใบไม่ถูกต้อง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  NOT_ALLOWED: "เฉพาะผู้ดูแลระบบเท่านั้นที่ลบได้",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

export function DeleteHouseholdButton({ householdId, sheetNo }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    const ok = window.confirm(
      `ลบแบบสอบถาม ${sheetNo} หรือไม่?\n\nใบจะถูกซ่อนจากทุกมุมมอง (coverage/ความเสี่ยง/รายงาน/คิวตรวจ)\nยังกู้คืนได้ภายหลังที่หน้า "แบบสอบถามที่ถูกลบ"`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    const result = await softDeleteHouseholdAction(householdId);
    if (result.ok) {
      router.push("/verification");
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
        onClick={() => void remove()}
        disabled={busy}
        className="btn btn-danger btn-sm"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
          <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "กำลังลบ…" : "ลบใบ"}
      </button>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
