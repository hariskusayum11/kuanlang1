"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { visibleSteps, type EntryField } from "@/lib/entry/steps";
import type { EntryMasterData } from "@/lib/entry/master-data";
import type { EntryPayload } from "@/lib/entry/payload";
import {
  claimSheetAction,
  releaseSheetAction,
  renewLockAction,
  saveDraftAction,
  submitEntryAction,
} from "@/lib/entry/actions";
import { FieldInput, type FieldMark } from "./field-input";
import {
  VulnerableGrid,
  emptyVulnerableRow,
  type VulnerableRow,
} from "./vulnerable-grid";

type SheetInfo = {
  id: string;
  sheetNo: string;
  batchCode: string;
  communityName: string;
};

/** ฟิลด์ถือว่า "ตอบแล้ว" เมื่อมีค่า (หรือถูกทำเครื่องหมาย F2/F3 ที่ระดับ caller) */
function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true; // boolean = ตอบแล้วเสมอ (true/false ต่างมีความหมาย)
}

type Props = {
  sheet: SheetInfo;
  master: EntryMasterData;
  lockExpiresAt: string;
  /** เวลาที่เหลือ (ms) คำนวณฝั่ง server — กัน hydration mismatch จาก Date.now() */
  initialRemainingMs: number;
  /** ร่างที่บันทึกไว้ (ถอดรหัสฝั่ง server แล้ว) — null = เริ่มฟอร์มว่าง */
  initialDraft: EntryPayload | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const LOCK_FULL_MS = 10 * 60 * 1000;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

/** เงื่อนไขแสดงฟิลด์ตาม showWhen (เช่น "อื่นๆ ระบุ") — เทียบด้วย code ของ master หรือค่า enum */
function fieldVisible(
  field: EntryField,
  answers: Record<string, unknown>,
  master: EntryMasterData,
): boolean {
  if (!field.showWhen) return true;
  const actual = answers[field.showWhen.field];
  if (typeof actual === "boolean") return String(actual) === field.showWhen.equals;
  if (typeof actual !== "string" || actual === "") return false;
  const dependsOn = visibleSteps(null)
    .flatMap((s) => s.fields)
    .find((f) => f.name === field.showWhen!.field);
  if (dependsOn?.masterKey) {
    const options = master[dependsOn.masterKey];
    const chosen = options.find((o) => o.id === actual);
    return chosen?.code === field.showWhen.equals;
  }
  return actual === field.showWhen.equals;
}

export function EntryWizard({
  sheet,
  master,
  lockExpiresAt,
  initialRemainingMs,
  initialDraft,
}: Props) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(initialDraft?.stepIndex ?? 0);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const base = initialDraft?.answers ?? {};
    // Prefill ชื่อชุมชนจากชุมชนของ Batch เมื่อยังไม่มีค่า — ลดการพิมพ์ผิด
    // (ยังแก้ได้ เพื่อคงความตรงตามกระดาษ QM-01 หากผู้สำรวจเขียนต่างออกไป)
    if (
      base.communityNameOnPaper == null ||
      (typeof base.communityNameOnPaper === "string" &&
        base.communityNameOnPaper.trim() === "")
    ) {
      return { ...base, communityNameOnPaper: sheet.communityName };
    }
    return base;
  });
  const [marks, setMarks] = useState<Record<string, FieldMark>>(
    (initialDraft?.marks as Record<string, FieldMark>) ?? {},
  );
  const [vulnerableRows, setVulnerableRows] = useState<VulnerableRow[]>(() => {
    const rows = initialDraft?.vulnerableRows ?? [];
    if (rows.length === 0) return [emptyVulnerableRow()];
    return rows.map((r) => ({
      fullName: r.fullName,
      age: String(r.age ?? ""),
      phone: r.phone,
      vulnerabilities: r.vulnerabilities,
      details: r.details,
    }));
  });
  const [expiry, setExpiry] = useState(() => new Date(lockExpiresAt).getTime());
  // ค่าเริ่มต้นจาก server (deterministic) — interval จะ recompute จาก expiry หลัง mount
  const [remainingMs, setRemainingMs] = useState(Math.max(0, initialRemainingMs));
  const [busy, setBusy] = useState<"release" | "reclaim" | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(
    initialDraft ? "saved" : "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [submitted, setSubmitted] = useState<{ duplicateSuspected: boolean } | null>(
    null,
  );
  const touched = useRef(false);
  /** มีการแก้ไขที่ยังไม่ถูกบันทึกร่าง */
  const dirty = useRef(false);

  const hasVulnerable =
    typeof answers.hasVulnerable === "boolean"
      ? (answers.hasVulnerable as boolean)
      : null;
  const steps = useMemo(() => visibleSteps(hasVulnerable), [hasVulnerable]);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const lockExpired = remainingMs <= 0;
  const lowLock = !lockExpired && remainingMs < 2 * 60 * 1000;

  // ฟิลด์สำคัญ ⭐ ที่ยังไม่ได้กรอกก่อนส่ง (นับ F2/F3 ว่าตอบแล้ว — ไม่บังคับเดาค่า)
  const missingCritical = useMemo(() => {
    const out: { key: string; label: string; stepIndex: number }[] = [];
    steps.forEach((s, idx) => {
      if (s.kind === "vulnerable-grid") {
        vulnerableRows.forEach((row, ri) => {
          const started =
            row.fullName.trim() !== "" ||
            row.phone.trim() !== "" ||
            row.age.trim() !== "" ||
            row.vulnerabilities.length > 0;
          if (started && row.fullName.trim() === "") {
            out.push({
              key: `vg-${ri}`,
              label: `กลุ่มเปราะบาง คนที่ ${ri + 1}: ชื่อ-นามสกุล`,
              stepIndex: idx,
            });
          }
        });
        return;
      }
      for (const f of s.fields) {
        if (!f.critical) continue;
        if (!fieldVisible(f, answers, master)) continue;
        if (marks[f.name]) continue; // F2/F3 = ตอบแล้ว
        if (!isAnswered(answers[f.name])) {
          out.push({ key: f.name, label: f.label, stepIndex: idx });
        }
      }
    });
    return out;
  }, [steps, answers, marks, master, vulnerableRows]);

  // นับถอยหลัง lock
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, expiry - Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  // เตือนก่อนออกเฉพาะเมื่อมีการแก้ไขที่ยังไม่ถูกบันทึกร่าง
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // F2 = ILLEGIBLE, F3 = BLANK_IN_PAPER บนฟิลด์ที่โฟกัสอยู่ (FR-ENT-06/07)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "F2" && e.key !== "F3") return;
      const target = document.activeElement as HTMLElement | null;
      const name =
        target?.dataset?.fieldName ??
        target?.closest<HTMLElement>("[data-field-name]")?.dataset.fieldName;
      if (!name) return;
      e.preventDefault();
      const mark: FieldMark = e.key === "F2" ? "ILLEGIBLE" : "BLANK_IN_PAPER";
      setMarks((prev) => ({ ...prev, [name]: prev[name] === mark ? null : mark }));
      touched.current = true;
      dirty.current = true;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renew = useCallback(async () => {
    const result = await renewLockAction(sheet.id);
    if (result.ok && result.lockExpiresAt) {
      // server เป็น source of truth ของเวลา — client countdown เป็นเพียงการแสดงผล
      setExpiry(new Date(result.lockExpiresAt).getTime());
    }
  }, [sheet.id]);

  // Heartbeat — ต่ออายุการจองทุก 4 นาทีระหว่างฟอร์มเปิดอยู่
  // (ทำให้ข้อความ "ต่ออายุอัตโนมัติ" เป็นจริง แม้ผู้ใช้ค้างอยู่ขั้นตอนเดียวนาน ๆ)
  // renewLock ฝั่ง server ยอมเฉพาะเจ้าของที่ lock ยังไม่หมดอายุ — ปลอดภัยเสมอ
  useEffect(() => {
    if (lockExpired) return;
    const heartbeat = setInterval(() => {
      void renew();
    }, 4 * 60 * 1000);
    return () => clearInterval(heartbeat);
  }, [lockExpired, renew]);

  function setAnswer(name: string, value: unknown) {
    touched.current = true;
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [name]: value }));
    setMarks((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  }

  /** payload ปัจจุบันของฟอร์ม — server เป็นผู้เข้ารหัสก่อนเก็บ */
  const buildPayload = useCallback((): EntryPayload => {
    const cleanMarks: EntryPayload["marks"] = {};
    for (const [k, v] of Object.entries(marks)) {
      if (v) cleanMarks[k] = v;
    }
    return {
      answers: answers as EntryPayload["answers"],
      marks: cleanMarks,
      vulnerableRows: vulnerableRows.map((r) => ({
        fullName: r.fullName,
        age: String(r.age ?? ""),
        phone: r.phone,
        vulnerabilities: r.vulnerabilities,
        details: r.details,
      })),
      stepIndex: safeIndex,
    };
  }, [answers, marks, vulnerableRows, safeIndex]);

  /** บันทึกร่าง (เรียกเมื่อ dirty เท่านั้น) — best-effort, สถานะแสดงในแถบบน */
  const persistDraft = useCallback(async () => {
    if (!dirty.current || lockExpired) return;
    setSaveState("saving");
    const result = await saveDraftAction(sheet.id, buildPayload());
    if (result.ok) {
      dirty.current = false;
      setSaveState("saved");
      setLastSavedAt(
        new Date(result.savedAt).toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } else {
      setSaveState("error");
    }
  }, [buildPayload, lockExpired, sheet.id]);

  // Auto-save: หน่วง 2.5 วินาทีหลังการแก้ไขล่าสุด
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      void persistDraft();
    }, 2500);
    return () => clearTimeout(timer);
  }, [answers, marks, vulnerableRows, persistDraft]);

  const markVisited = useCallback((id: string) => {
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (step) markVisited(step.id);
  }, [step, markVisited]);

  async function goTo(index: number) {
    setStepIndex(Math.max(0, Math.min(index, steps.length - 1)));
    if (!lockExpired) {
      void renew();
      void persistDraft(); // เปลี่ยนขั้นตอน = จุดบันทึกร่างธรรมชาติ
    }
  }

  async function handleRelease() {
    setBusy("release");
    // บันทึกร่างก่อนออกเสมอ — กลับมาคีย์ต่อจากที่ค้างได้
    await persistDraft();
    await releaseSheetAction(sheet.id);
    touched.current = false;
    dirty.current = false;
    // ห้ามเรียก router.refresh() ต่อท้าย — จะแทรก transition จนหน้าไม่เปลี่ยน
    // (/surveys เป็น force-dynamic โหลดสดอยู่แล้ว)
    router.push("/surveys");
  }

  const SUBMIT_ERRORS: Record<string, string> = {
    LOCK_LOST: "การจองใบหมดอายุระหว่างส่ง — กด \"คีย์ใบนี้ต่อ\" แล้วส่งใหม่ (ร่างถูกเก็บไว้แล้ว)",
    ALREADY_ENTERED: "ใบนี้ถูกส่งไปแล้ว — กลับหน้าคีย์แบบสอบถามเพื่อเปิดใบถัดไป",
    INVALID_MASTER: "ตัวเลือกบางข้อไม่ตรงกับข้อมูลระบบ — รีเฟรชหน้าแล้วตรวจตัวเลือกอีกครั้ง",
    NOT_ALLOWED: "ไม่มีสิทธิ์ส่งใบนี้ในขณะนี้",
  };

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitEntryAction(sheet.id, buildPayload());
    if (!result.ok) {
      setSubmitError(
        SUBMIT_ERRORS[result.reason] ?? "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง",
      );
      setSubmitting(false);
      return;
    }
    dirty.current = false;
    touched.current = false;
    setSubmitted({ duplicateSuspected: result.duplicateSuspected });
    setConfirmOpen(false);
  }

  async function handleReclaim() {
    setBusy("reclaim");
    const result = await claimSheetAction(sheet.id);
    if (result.ok) {
      const next = Date.now() + LOCK_FULL_MS;
      setExpiry(next);
      setRemainingMs(next - Date.now());
      setBusy(null);
      return;
    }
    router.push("/surveys");
  }

  // ส่งใบสำเร็จ — หน้ายืนยันพร้อมคำเตือนใบซ้ำ (ถ้ามี)
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md animate-rise rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-900">ส่งใบเรียบร้อย</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            ใบ <span className="font-mono font-medium">{sheet.sheetNo}</span>{" "}
            ถูกบันทึกเข้าระบบแล้ว (ข้อมูลอ่อนไหวถูกเข้ารหัส) — รอผู้ตรวจยืนยันความถูกต้อง
          </p>
          {submitted.duplicateSuspected && (
            <p className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              ⚠ เบอร์โทรผู้ให้ข้อมูลตรงกับใบอื่นในระบบ — ระบบติดธง &ldquo;สงสัยใบซ้ำ&rdquo;
              ให้ผู้ตรวจดูแล้ว ไม่ต้องทำอะไรเพิ่ม
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              router.replace("/surveys");
            }}
            className="btn btn-primary btn-md mt-7"
          >
            คีย์ใบถัดไป
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 p-4 md:flex-row md:p-6 lg:p-8">
      {/* ── รางซ้าย: ข้อมูลใบ + ล็อก + ขั้นตอน ── */}
      <aside className="shrink-0 md:w-72">
        <div className="space-y-4 md:sticky md:top-6">
          {/* ข้อมูลใบ */}
          <div className="card p-5">
            <div className="flex items-center gap-2">
              <span className="badge badge-brand">Entry รอบที่ 1</span>
            </div>
            <p className="mt-3 break-all font-mono text-sm font-semibold text-slate-900">
              {sheet.sheetNo}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {sheet.communityName} · <span className="font-mono">{sheet.batchCode}</span>
            </p>

            {/* Lock = กลไกความปลอดภัยเบื้องหลัง (กันเปิดใบซ้อนกัน) — แสดงแบบไม่รบกวน
                ต่ออายุอัตโนมัติเมื่อเปลี่ยนขั้นตอน · เตือนเฉพาะเมื่อใกล้หมด */}
            <p
              className={`mt-3 flex items-center gap-1.5 text-[11px] ${
                lowLock ? "font-medium text-amber-600" : "text-slate-500"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
              {lockExpired
                ? "การจองใบหมดอายุ"
                : lowLock
                  ? `การจองใบใกล้หมดอายุ (${formatRemaining(remainingMs)}) — `
                  : "จองใบนี้ไว้ให้คุณแล้ว (ต่ออายุอัตโนมัติ)"}
              {lowLock && !lockExpired && (
                <button
                  type="button"
                  onClick={() => void renew()}
                  className="font-medium text-brand-600 underline hover:text-brand-700"
                >
                  ต่ออายุ
                </button>
              )}
            </p>
          </div>

          {/* ขั้นตอน */}
          <nav className="card overflow-hidden p-2">
            {steps.map((s, i) => {
              const active = i === safeIndex;
              const done = visited.has(s.id) && !active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void goTo(i)}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                      active
                        ? "bg-brand-600 text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {s.paperSection}
                    </span>
                    <span
                      className={`block truncate text-[13px] ${
                        active ? "font-semibold text-brand-800" : "text-slate-600"
                      }`}
                    >
                      {s.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleRelease}
            disabled={busy !== null}
            className="btn btn-secondary btn-sm w-full"
          >
            {busy === "release" ? "กำลังออก…" : "ออกจากแบบฟอร์ม"}
          </button>
        </div>
      </aside>

      {/* ── เนื้อหา step ── */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* แถบสถานะการบันทึกร่าง + ปุ่มลัดคีย์บอร์ด */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3">
          <p
            className={`flex items-center gap-2 text-xs ${
              saveState === "error" ? "text-red-600" : "text-slate-600"
            }`}
            role="status"
          >
            {saveState === "saving" ? (
              <>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
                  <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                กำลังบันทึกร่าง…
              </>
            ) : saveState === "saved" ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-emerald-500">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                บันทึกร่างแล้ว{lastSavedAt ? ` · ${lastSavedAt} น.` : " (เข้ารหัสในระบบ)"}
              </>
            ) : saveState === "error" ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                </svg>
                บันทึกร่างไม่สำเร็จ — ระบบจะลองใหม่เมื่อคุณคีย์ต่อ
              </>
            ) : (
              <>ระบบบันทึกร่างอัตโนมัติระหว่างคีย์ (ข้อมูลถูกเข้ารหัสก่อนเก็บ)</>
            )}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="kbd">F2</kbd> อ่านไม่ออก
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">F3</kbd> ว่างในกระดาษ
            </span>
          </div>
        </div>

        {/* progress */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${((safeIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
            ขั้นที่ {safeIndex + 1} / {steps.length}
          </span>
        </div>

        {showValidation && missingCritical.length > 0 && (
          <div
            role="alert"
            className="animate-fade-in rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ยังกรอกฟิลด์สำคัญไม่ครบ ({missingCritical.length})
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
              ฟิลด์ ⭐ ต้องมีค่า หรือทำเครื่องหมาย <kbd className="kbd">F2</kbd> (อ่านไม่ออก) /{" "}
              <kbd className="kbd">F3</kbd> (ว่างในกระดาษ) — คลิกเพื่อไปแก้
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missingCritical.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => void goTo(m.stepIndex)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <section key={step.id} className="card animate-step-in p-6 md:p-7">
          <header className="mb-6 border-b border-slate-100 pb-5">
            <span className="badge badge-neutral">{step.paperSection}</span>
            <h2 className="mt-2 text-lg font-bold text-slate-900">{step.title}</h2>
            {step.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>
            )}
          </header>

          {step.kind === "vulnerable-grid" ? (
            <VulnerableGrid
              master={master}
              rows={vulnerableRows}
              onChange={(rows) => {
                touched.current = true;
                dirty.current = true;
                setVulnerableRows(rows);
              }}
            />
          ) : (
            <div className="space-y-6">
              {step.fields
                .filter((f) => fieldVisible(f, answers, master))
                .map((f) => (
                  <FieldInput
                    key={f.name}
                    field={f}
                    master={master}
                    value={answers[f.name]}
                    mark={marks[f.name] ?? null}
                    onChange={(v) => setAnswer(f.name, v)}
                  />
                ))}
            </div>
          )}

          <footer className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => void goTo(safeIndex - 1)}
              disabled={safeIndex === 0}
              className="btn btn-ghost btn-md"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ย้อนกลับ
            </button>
            {safeIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => void goTo(safeIndex + 1)}
                className="btn btn-primary btn-md"
              >
                ถัดไป
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  if (missingCritical.length > 0) {
                    setShowValidation(true);
                    void goTo(missingCritical[0].stepIndex);
                    return;
                  }
                  setConfirmOpen(true);
                }}
                className="btn btn-primary btn-md"
              >
                ส่งใบ
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </footer>
        </section>
      </div>

      {/* Overlay ยืนยันการส่งใบ */}
      {confirmOpen && !lockExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md animate-rise rounded-2xl bg-white p-7 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">ยืนยันการส่งใบ</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              ใบ <span className="font-mono font-medium">{sheet.sheetNo}</span> ·{" "}
              {sheet.communityName}
            </p>
            <ul className="mt-4 space-y-1.5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <li className="flex justify-between">
                <span>อ่านไม่ออก (F2)</span>
                <span className="tabular-nums font-medium">
                  {Object.values(marks).filter((m) => m === "ILLEGIBLE").length} ช่อง
                </span>
              </li>
              <li className="flex justify-between">
                <span>ว่างในกระดาษ (F3)</span>
                <span className="tabular-nums font-medium">
                  {Object.values(marks).filter((m) => m === "BLANK_IN_PAPER").length} ช่อง
                </span>
              </li>
              <li className="flex justify-between">
                <span>กลุ่มเปราะบางที่กรอก</span>
                <span className="tabular-nums font-medium">
                  {
                    vulnerableRows.filter(
                      (r) =>
                        r.fullName.trim() !== "" ||
                        r.phone.trim() !== "" ||
                        r.vulnerabilities.length > 0,
                    ).length
                  }{" "}
                  คน
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              ส่งแล้วใบจะเข้าสู่การตรวจสอบ — แก้ไขเพิ่มเติมได้โดยผู้ตรวจเท่านั้น
              ข้อมูลอ่อนไหวถูกเข้ารหัสก่อนบันทึก
            </p>
            {submitError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {submitError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="btn btn-secondary btn-md"
              >
                กลับไปตรวจอีกครั้ง
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="btn btn-primary btn-md"
              >
                {submitting ? "กำลังส่ง…" : "ยืนยันส่งใบ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay เมื่อ lock หมดอายุ */}
      {lockExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md animate-rise rounded-2xl bg-white p-7 text-center shadow-lg">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-5 text-lg font-bold text-slate-900">การจองใบหมดอายุ</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              คุณไม่ได้ใช้งานสักพัก ระบบจึงปล่อยใบนี้ให้ผู้อื่นเปิดได้ —
              กด “คีย์ใบนี้ต่อ” เพื่อจองอีกครั้ง (หากยังไม่มีผู้อื่นเปิด)
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleReclaim}
                disabled={busy !== null}
                className="btn btn-primary btn-md"
              >
                {busy === "reclaim" ? "กำลังจองใบ…" : "คีย์ใบนี้ต่อ"}
              </button>
              <button
                type="button"
                onClick={() => {
                  touched.current = false;
                  router.push("/surveys");
                }}
                className="btn btn-secondary btn-md"
              >
                กลับหน้าคีย์แบบสอบถาม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
