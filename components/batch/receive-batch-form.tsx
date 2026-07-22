"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBatchAction } from "@/lib/batch/actions";
import {
  MAX_SHEETS_PER_BATCH,
  parseErrorMessage,
  parseSheetNumbers,
} from "@/lib/batch/sheet-numbers";
import { SAFE_ERROR_MESSAGES } from "@/lib/errors";

interface CommunityOption {
  id: string;
  nameTh: string;
}

type Mode = "PRINTED" | "AUTO";

export function ReceiveBatchForm({ communities }: { communities: CommunityOption[] }) {
  const router = useRouter();
  const [communityId, setCommunityId] = useState(
    communities.length === 1 ? communities[0].id : "",
  );
  const [mode, setMode] = useState<Mode>("PRINTED");
  const [numbersText, setNumbersText] = useState("");
  const [autoCount, setAutoCount] = useState("");
  const [handedOverBy, setHandedOverBy] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live preview — นับเลขที่กรอกทันที (pure function ตัวเดียวกับฝั่ง server)
  const preview = useMemo(() => {
    if (mode !== "PRINTED" || numbersText.trim() === "") return null;
    const parsed = parseSheetNumbers(numbersText);
    return parsed.ok
      ? { ok: true as const, count: parsed.numbers.length }
      : { ok: false as const, message: parseErrorMessage(parsed) };
  }, [mode, numbersText]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!communityId) {
      setError("กรุณาเลือกชุมชน");
      return;
    }
    let numbering;
    if (mode === "PRINTED") {
      if (preview && !preview.ok) {
        setError(preview.message);
        return;
      }
      if (numbersText.trim() === "") {
        setError("กรุณากรอกเลขใบ");
        return;
      }
      numbering = { mode: "PRINTED" as const, numbersText };
    } else {
      const count = Number(autoCount);
      if (!Number.isInteger(count) || count < 1 || count > MAX_SHEETS_PER_BATCH) {
        setError(`จำนวนใบต้องเป็น 1-${MAX_SHEETS_PER_BATCH.toLocaleString("th-TH")}`);
        return;
      }
      numbering = { mode: "AUTO" as const, count };
    }

    setSubmitting(true);
    const result = await createBatchAction({
      communityId,
      handedOverBy,
      storageLocation,
      note,
      numbering,
    });
    if (!result.ok) {
      if (result.reason === "SHEET_CONFLICT") {
        setError(
          `เลขใบชนกับปึกอื่นในระบบ: ${(result.conflicts ?? []).join(", ")} — ตรวจกระดาษหรือแก้เลข`,
        );
      } else if (result.reason === "PARSE_ERROR" && result.message) {
        setError(result.message);
      } else if (result.reason === "FORBIDDEN") {
        setError("คุณไม่มีสิทธิ์รับปึกของชุมชนนี้");
      } else {
        setError(SAFE_ERROR_MESSAGES.generic);
      }
      setSubmitting(false);
      return;
    }
    // ไม่เรียก router.refresh() ต่อท้าย — จะแทรก transition ของ replace จนหน้าไม่เปลี่ยน
    // (หน้า detail เป็น force-dynamic โหลดข้อมูลสดอยู่แล้ว)
    router.replace(`/batches/${result.batchId}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="batch-community" className="label">
            ชุมชนที่สำรวจ <span className="text-red-500">*</span>
          </label>
          <select
            id="batch-community"
            required
            value={communityId}
            onChange={(e) => setCommunityId(e.target.value)}
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
          <label htmlFor="batch-handed" className="label">
            ผู้ส่งมอบปึก
          </label>
          <input
            id="batch-handed"
            type="text"
            placeholder="เช่น ผู้ประสานชุมชนท่าเคียน"
            value={handedOverBy}
            onChange={(e) => setHandedOverBy(e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
      </div>

      {/* โหมดเลขใบ */}
      <fieldset className="space-y-3">
        <legend className="label">เลขใบแบบสอบถาม</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <ModeCard
            checked={mode === "PRINTED"}
            onSelect={() => setMode("PRINTED")}
            disabled={submitting}
            title="กระดาษมีเลขมาแล้ว"
            desc="กรอกช่วงเลขหรือไล่ทีละเลข — ระบบเช็คเลขซ้ำให้ทันที"
          />
          <ModeCard
            checked={mode === "AUTO"}
            onSelect={() => setMode("AUTO")}
            disabled={submitting}
            title="ให้ระบบรันเลขให้"
            desc="กระดาษไม่มีเลข — ระบบออกเลข 1, 2, 3, … ให้เขียน/ปั๊มตามตอนนับ"
          />
        </div>

        {mode === "PRINTED" ? (
          <div className="space-y-1.5">
            <textarea
              aria-label="เลขใบ (ช่วงเลขหรือรายการเลข)"
              rows={3}
              placeholder={"เช่น  101-150\nหรือคละเลข:  101 105 230 412\nหรือหลายช่วง:  101-130, 201-220"}
              value={numbersText}
              onChange={(e) => setNumbersText(e.target.value)}
              disabled={submitting}
              className="field min-h-[84px] font-mono text-[13px]"
            />
            {preview &&
              (preview.ok ? (
                <p className="text-xs font-medium text-emerald-600" role="status">
                  ✓ อ่านได้ {preview.count.toLocaleString("th-TH")} ใบ
                </p>
              ) : (
                <p className="text-xs text-red-600" role="alert">
                  {preview.message}
                </p>
              ))}
          </div>
        ) : (
          <div className="max-w-[220px] space-y-1.5">
            <label htmlFor="batch-count" className="label">
              จำนวนใบที่นับได้ <span className="text-red-500">*</span>
            </label>
            <input
              id="batch-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SHEETS_PER_BATCH}
              placeholder="เช่น 50"
              value={autoCount}
              onChange={(e) => setAutoCount(e.target.value)}
              disabled={submitting}
              className="field disabled:bg-slate-50"
            />
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="batch-storage" className="label">
            ตำแหน่งจัดเก็บกระดาษ
          </label>
          <input
            id="batch-storage"
            type="text"
            placeholder="เช่น ตู้ A ช่อง 3"
            value={storageLocation}
            onChange={(e) => setStorageLocation(e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="batch-note" className="label">
            หมายเหตุ
          </label>
          <input
            id="batch-note"
            type="text"
            placeholder="เช่น มีใบเปียกน้ำ 2 ใบ"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            className="field disabled:bg-slate-50"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 animate-fade-in"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="btn btn-primary btn-md">
          {submitting ? "กำลังบันทึก…" : "รับปึกเข้าระบบ"}
        </button>
        <p className="text-xs text-slate-500">
          รับแล้วสถานะเป็น &ldquo;รับปึกแล้ว&rdquo; — เปิดให้คีย์ได้จากหน้าปึก
        </p>
      </div>
    </form>
  );
}

function ModeCard({
  checked,
  onSelect,
  disabled,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40 ${
        checked
          ? "border-brand-500 bg-brand-50/50"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <input
        type="radio"
        name="numbering-mode"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-1 h-4 w-4 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
          {desc}
        </span>
      </span>
    </label>
  );
}
