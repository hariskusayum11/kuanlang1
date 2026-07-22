"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeBatchAction, openBatchAction } from "@/lib/batch/actions";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

const TRANSITION_ERRORS: Record<string, string> = {
  WRONG_STATUS: "สถานะปึกเปลี่ยนไปแล้ว (อาจมีคนอื่นทำรายการ) — รีเฟรชแล้ว",
  HAS_UNFINISHED: "ยังมีใบค้างงานในปึกนี้ — ปิดได้เมื่อทุกใบคีย์/ตรวจ/บันทึกผลครบ",
  NOT_FOUND: "ไม่พบปึกนี้ในขอบเขตของคุณ",
  FORBIDDEN: "คุณไม่มีสิทธิ์จัดการปึกนี้",
};

/** ปุ่มเปลี่ยนสถานะปึก — เปิดให้คีย์ (RECEIVED) / ปิดปึก (ยังไม่ CLOSED) */
export function BatchTransitionButton({
  batchId,
  kind,
}: {
  batchId: string;
  kind: "open" | "close";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result =
      kind === "open"
        ? await openBatchAction(batchId)
        : await closeBatchAction(batchId);
    if (!result.ok) {
      setError(TRANSITION_ERRORS[result.reason] ?? SAFE_ERROR_MESSAGES.generic);
      setPending(false);
      if (result.reason === "WRONG_STATUS") router.refresh();
      return;
    }
    router.refresh();
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`btn btn-md ${kind === "open" ? "btn-primary" : "btn-secondary"}`}
      >
        {pending
          ? "กำลังทำรายการ…"
          : kind === "open"
            ? "เปิดปึกให้คีย์"
            : "ปิดปึก"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
