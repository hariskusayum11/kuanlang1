"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { registerSheetAction } from "@/lib/batch/actions";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

interface CommunityOption {
  id: string;
  nameTh: string;
}

interface BatchOption {
  id: string;
  code: string;
  communityId: string;
}

interface Registered {
  sheetNo: string;
  communityName: string;
  batchCode: string | null;
  sequence: number | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_SHEET_NO: "รหัสแบบสอบถามใช้ได้เฉพาะตัวอักษร ตัวเลข และขีด ยาวไม่เกิน 32 ตัว",
  SHEET_CONFLICT: "รหัสนี้มีอยู่ในระบบแล้ว — ตรวจกระดาษอีกครั้งหรือใช้รหัสอื่น",
  COMMUNITY_MISMATCH: "ปึกที่เลือกอยู่คนละชุมชนกับที่ระบุ",
  BATCH_CLOSED: "ปึกนี้ปิดแล้ว — เพิ่มแบบสอบถามเข้าปึกไม่ได้",
  BATCH_NOT_FOUND: "ไม่พบปึกที่เลือก",
  FORBIDDEN: "คุณไม่มีสิทธิ์ลงทะเบียนแบบสอบถามของชุมชนนี้",
  INVALID_COMMUNITY: "ไม่พบชุมชนที่เลือก",
};

export function RegisterSheetForm({
  communities,
  batches,
}: {
  communities: CommunityOption[];
  batches: BatchOption[];
}) {
  const router = useRouter();
  const [sheetNo, setSheetNo] = useState("");
  const [communityId, setCommunityId] = useState(
    communities.length === 1 ? communities[0].id : "",
  );
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Registered | null>(null);

  // ปึกที่เลือกได้ต้องอยู่ชุมชนเดียวกับใบเสมอ — server ตรวจซ้ำอยู่ดี
  const batchOptions = useMemo(
    () => batches.filter((b) => b.communityId === communityId),
    [batches, communityId],
  );

  function handleCommunityChange(value: string) {
    setCommunityId(value);
    setBatchId(""); // ปึกเดิมอาจอยู่คนละชุมชน
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setDone(null);

    if (sheetNo.trim() === "") {
      setError("กรุณากรอกรหัสแบบสอบถามที่อยู่บนกระดาษ");
      return;
    }
    if (!communityId) {
      setError("กรุณาเลือกชุมชน");
      return;
    }

    setSubmitting(true);
    const result = await registerSheetAction({ sheetNo, communityId, batchId });
    setSubmitting(false);
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.reason] ?? SAFE_ERROR_MESSAGES.generic);
      return;
    }
    setDone({
      sheetNo: result.sheetNo,
      communityName: result.communityName,
      batchCode: result.batchCode,
      sequence: result.sequence,
    });
    setSheetNo("");
    setBatchId("");
    // ตัวนับของปึกเปลี่ยนเมื่อผูกใบเข้าปึก — ตารางด้านล่างต้องตรงกับความจริง
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="sheet-no" className="label">
            รหัสแบบสอบถาม <span className="text-red-500">*</span>
          </label>
          <input
            id="sheet-no"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            placeholder="เช่น SHEET-TK01-001-024"
            value={sheetNo}
            onChange={(e) => setSheetNo(e.target.value)}
            disabled={submitting}
            className="field font-mono text-[13px] uppercase disabled:bg-slate-50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sheet-community" className="label">
            ชุมชน <span className="text-red-500">*</span>
          </label>
          <select
            id="sheet-community"
            required
            value={communityId}
            onChange={(e) => handleCommunityChange(e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          >
            <option value="">— เลือกชุมชน —</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTh}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sheet-batch" className="label">
            ปึกเอกสาร <span className="font-medium text-slate-400">(ไม่บังคับ)</span>
          </label>
          <select
            id="sheet-batch"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            disabled={submitting || batchOptions.length === 0}
            className="field disabled:bg-slate-50"
          >
            <option value="">ไม่ระบุปึก</option>
            {batchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </select>
          <p id="sheet-batch-hint" className="text-xs leading-relaxed text-slate-500">
            หากไม่ได้แบ่งเอกสารเป็นปึก เว้นช่องนี้ได้
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 animate-pop"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      {done && (
        <div
          role="status"
          className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3.5 py-3 animate-pop"
        >
          <p className="text-sm font-bold text-emerald-800">
            ลงทะเบียนแล้ว — เจ้าหน้าที่คีย์เปิดใบนี้ได้ด้วยรหัสแบบสอบถาม
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-emerald-900">
            <div className="flex gap-1.5">
              <dt className="font-semibold">รหัส:</dt>
              <dd className="font-mono font-bold">{done.sheetNo}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold">ชุมชน:</dt>
              <dd>{done.communityName}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-semibold">ปึก:</dt>
              <dd>
                {done.batchCode
                  ? `${done.batchCode} (ลำดับที่ ${done.sequence?.toLocaleString("th-TH")})`
                  : "ไม่ระบุปึก"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
          {submitting ? "กำลังบันทึก…" : "บันทึกแบบสอบถาม"}
        </button>
        <p className="text-xs font-medium text-slate-500">
          ไม่ต้องมีปึกก็ลงทะเบียนและเปิดคีย์ได้ทันที
        </p>
      </div>
    </form>
  );
}
