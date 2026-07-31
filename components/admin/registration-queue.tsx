"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
} from "@/lib/registration/actions";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

const DECIDE_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND_OR_DECIDED: "คำขอนี้ถูกตัดสินไปแล้ว (อาจโดยแอดมินท่านอื่น) — รายการอัปเดตแล้ว",
  FORBIDDEN: "คุณไม่มีสิทธิ์ตัดสินคำขอลงทะเบียน",
  INVALID_ROLE: "บทบาทในคำขอไม่ถูกต้อง — ไม่สามารถอนุมัติได้",
};

/** ปุ่มอนุมัติ/ปฏิเสธของคำขอ 1 รายการ — ปฏิเสธต้องกรอกเหตุผลก่อน */
export function RegistrationDecideButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(kind: "approve" | "reject") {
    if (pending) return;
    setError(null);
    setPending(kind);
    const result =
      kind === "approve"
        ? await approveRegistrationAction(requestId)
        : await rejectRegistrationAction(requestId, reason);
    if (!result.ok) {
      setError(DECIDE_ERROR_MESSAGES[result.reason] ?? SAFE_ERROR_MESSAGES.generic);
      setPending(null);
      // คำขอถูกตัดสินแล้วโดยคนอื่น → refresh ให้เห็นสถานะจริง
      if (result.reason === "NOT_FOUND_OR_DECIDED") router.refresh();
      return;
    }
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <label htmlFor={`reject-reason-${requestId}`} className="sr-only">
          เหตุผลการปฏิเสธ
        </label>
        <input
          id={`reject-reason-${requestId}`}
          type="text"
          autoFocus
          placeholder="เหตุผลการปฏิเสธ (จำเป็น)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending !== null}
          className="field h-9 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decide("reject")}
            disabled={pending !== null || reason.trim().length < 2}
            className="btn btn-danger btn-sm"
          >
            {pending === "reject" ? "กำลังปฏิเสธ…" : "ยืนยันปฏิเสธ"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRejecting(false);
              setError(null);
            }}
            disabled={pending !== null}
            className="btn btn-secondary btn-sm"
          >
            ยกเลิก
          </button>
        </div>
        {error && (
          <p role="alert" className="animate-pop text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide("approve")}
          disabled={pending !== null}
          className="btn btn-primary btn-sm"
        >
          {pending === "approve" ? "กำลังอนุมัติ…" : "อนุมัติ"}
        </button>
        <button
          type="button"
          onClick={() => setRejecting(true)}
          disabled={pending !== null}
          className="btn btn-secondary btn-sm"
        >
          ปฏิเสธ
        </button>
      </div>
      {error && (
        <p role="alert" className="animate-pop text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
