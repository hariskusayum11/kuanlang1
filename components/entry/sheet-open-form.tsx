"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openSheetAction } from "@/lib/entry/actions";

type BatchOption = {
  id: string;
  code: string;
  communityName: string;
};

type Props = {
  batches: BatchOption[];
};

const STATUS_MESSAGE: Record<string, string> = {
  ENTERED_1: "ใบนี้คีย์รอบที่ 1 เสร็จแล้ว (รอคีย์ยืนยันรอบที่ 2)",
  ENTERED_2: "ใบนี้คีย์ครบสองรอบแล้ว (รอเปรียบเทียบ)",
  DISCREPANCY: "ใบนี้อยู่ระหว่างการตัดสินข้อมูลไม่ตรงกัน",
  NEEDS_FIELD_QUERY: "ใบนี้รอคำตอบจากภาคสนาม",
  VERIFIED: "ใบนี้ยืนยันข้อมูลแล้ว",
  UNRESOLVABLE: "ใบนี้ถูกปิดเนื่องจากแก้ไขไม่ได้",
  SHEET_LOST: "ใบนี้ถูกบันทึกว่ากระดาษสูญหาย",
  MERGED_INTO: "ใบนี้ถูกรวมเข้ากับใบอื่นแล้ว",
};

/**
 * แบบฟอร์มเปิดใบจากรหัสบนกระดาษ — Primary Action ของหน้าคีย์
 * เจ้าหน้าที่ถือกระดาษอยู่แล้ว: พิมพ์รหัสใบเต็ม → Enter → เข้าฟอร์ม
 *
 * ปึกเป็นทางเลือก (#R6-B/#R6-F): ไม่เลือกปึกก็เปิดใบได้ · เลือกปึกเป็นเพียงทางลัด
 * ให้พิมพ์เลขลำดับสั้น ๆ แทนรหัสเต็ม — ฟอร์มนี้ต้องใช้งานได้แม้ระบบยังไม่มีปึกเลย
 */
export function SheetOpenForm({ batches }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [batchId, setBatchId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const trimmed = code.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);

    const result = await openSheetAction(trimmed, batchId || undefined);
    if (result.ok) {
      router.push(`/surveys/entry/${result.sheetId}`);
      return;
    }
    switch (result.reason) {
      case "NOT_FOUND":
        setError("ไม่พบใบงานรหัสนี้ในพื้นที่ของคุณ — ตรวจรหัสบนหัวกระดาษอีกครั้ง");
        break;
      case "IN_USE":
        setError("ใบนี้กำลังถูกคีย์โดยเจ้าหน้าที่ท่านอื่น — หยิบใบถัดไปที่ถืออยู่ได้เลย");
        break;
      case "BATCH_NOT_OPEN":
        setError("ปึกของใบนี้ยังไม่เปิดให้คีย์หรือปิดแล้ว — กรุณาแจ้งหัวหน้างาน");
        break;
      case "WRONG_STATUS":
        setError(
          ("status" in result && result.status && STATUS_MESSAGE[result.status]) ||
            "ใบนี้ไม่ได้อยู่ในขั้นตอนคีย์รอบที่ 1",
        );
        break;
      case "INVALID":
        setError("รูปแบบรหัสไม่ถูกต้อง — ใช้ตัวอักษร ตัวเลข และขีด (-) เท่านั้น");
        break;
      default:
        setError("ไม่สามารถเปิดใบได้ กรุณาลองใหม่");
    }
    setPending(false);
    inputRef.current?.select();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="mb-5 flex items-center gap-3">
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
          <h3 className="text-lg font-bold text-slate-900">เปิดใบจากรหัสบนกระดาษ</h3>
          <p className="text-sm text-slate-500">
            พิมพ์รหัสที่หัวกระดาษของใบที่ถืออยู่ แล้วกด Enter — ไม่ต้องเลือกปึกก่อน
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* ทางลัดเท่านั้น — เลือกปึกแล้วพิมพ์เลขลำดับสั้นแทนรหัสเต็มได้ */}
        {batches.length > 0 && (
          <div className="lg:w-64">
            <label htmlFor="batch-select" className="label mb-1.5">
              ปึกที่ถืออยู่ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            </label>
            <select
              id="batch-select"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="field"
              disabled={pending}
            >
              <option value="">ไม่ระบุปึก — ใช้รหัสใบเต็ม</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.communityName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor="sheet-code" className="label mb-1.5">
            รหัสใบแบบสอบถาม (จากหัวกระดาษ)
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id="sheet-code"
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={
                batchId ? "เช่น 024 หรือรหัสเต็ม" : "เช่น SHEET-TK01-001-024"
              }
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              disabled={pending}
              className="field font-mono text-lg font-bold uppercase tracking-wide placeholder:text-base placeholder:font-normal placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
              aria-describedby={error ? "sheet-code-error" : undefined}
            />
            <button
              type="submit"
              disabled={pending}
              className="btn btn-accent btn-lg shrink-0"
            >
              {pending ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
                  <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              เปิดใบ
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          id="sheet-code-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border-2 border-sun-200 bg-sun-50 px-3.5 py-2.5 text-sm font-medium text-sun-800 animate-pop"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      )}

      <p className="text-xs text-slate-500">
        {batchId
          ? "พิมพ์เลขลำดับใบในปึก (เช่น 24) หรือรหัสเต็ม แล้วกด Enter · รองรับสแกนบาร์โค้ดในอนาคต"
          : "พิมพ์รหัสใบเต็มจากหัวกระดาษ แล้วกด Enter · รองรับสแกนบาร์โค้ดในอนาคต"}
      </p>
    </form>
  );
}
