"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { openSheetAction } from "@/lib/entry/actions";

const STATUS_MESSAGE: Record<string, string> = {
  ENTERED_1: "ใบนี้คีย์เสร็จแล้ว รอผู้ตรวจสอบ",
  ENTERED_2: "ใบนี้คีย์ครบสองรอบแล้ว (รอเปรียบเทียบ)",
  DISCREPANCY: "ใบนี้อยู่ระหว่างการตัดสินข้อมูลไม่ตรงกัน",
  NEEDS_FIELD_QUERY: "ใบนี้รอคำตอบจากภาคสนาม",
  VERIFIED: "ใบนี้ยืนยันข้อมูลแล้ว",
  UNRESOLVABLE: "ใบนี้ถูกปิดเนื่องจากแก้ไขไม่ได้",
  SHEET_LOST: "ใบนี้ถูกบันทึกว่ากระดาษสูญหาย",
  MERGED_INTO: "ใบนี้ถูกรวมเข้ากับใบอื่นแล้ว",
};

/**
 * เปิดใบที่มีรหัสอยู่แล้วกลับมาคีย์ต่อ — Secondary Action ของหน้าคีย์
 *
 * ใบใหม่ใช้ StartSheetForm (ระบบออกรหัสให้) ฟอร์มนี้ไว้สำหรับกรณีถือกระดาษ
 * ที่มีรหัสเขียนไว้แล้วกลับมาทำต่อ — พิมพ์เฉพาะตัวเลขก็ได้ เช่น 123
 */
export function SheetOpenForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
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

    const result = await openSheetAction(trimmed);
    if (result.ok) {
      router.push(`/surveys/entry/${result.sheetId}`);
      return;
    }
    switch (result.reason) {
      case "NOT_FOUND":
        setError("ไม่พบใบรหัสนี้ — ตรวจรหัสบนหัวกระดาษอีกครั้ง");
        break;
      case "IN_USE":
        setError("ใบนี้กำลังถูกคีย์โดยเจ้าหน้าที่ท่านอื่น — หยิบใบถัดไปที่ถืออยู่ได้เลย");
        break;
      case "WRONG_STATUS":
        setError(
          ("status" in result && result.status && STATUS_MESSAGE[result.status]) ||
            "ใบนี้ไม่ได้อยู่ในขั้นตอนคีย์ข้อมูลแล้ว",
        );
        break;
      case "INVALID":
        setError("รูปแบบรหัสไม่ถูกต้อง — เช่น SK-000123 หรือพิมพ์เฉพาะตัวเลข 123");
        break;
      default:
        setError("ไม่สามารถเปิดใบได้ กรุณาลองใหม่");
    }
    setPending(false);
    inputRef.current?.select();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="sheet-code" className="label">
        มีรหัสอยู่แล้ว? เปิดใบเดิมกลับมาคีย์ต่อ
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id="sheet-code"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="เช่น SK-000123 หรือ 123"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          disabled={pending}
          className="field font-mono text-base font-bold uppercase tracking-wide placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
          aria-describedby={error ? "sheet-code-error" : undefined}
        />
        <button type="submit" disabled={pending} className="btn btn-secondary btn-md shrink-0">
          เปิดใบ
        </button>
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
    </form>
  );
}
