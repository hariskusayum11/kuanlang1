"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { visibleSteps, type EntryField } from "@/lib/entry/steps";
import type { EntryMasterData } from "@/lib/entry/master-data";
import {
  claimSheetAction,
  releaseSheetAction,
  renewLockAction,
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

type Props = {
  sheet: SheetInfo;
  master: EntryMasterData;
  lockExpiresAt: string;
  /** เวลาที่เหลือ (ms) คำนวณฝั่ง server — กัน hydration mismatch จาก Date.now() */
  initialRemainingMs: number;
};

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

export function EntryWizard({ sheet, master, lockExpiresAt, initialRemainingMs }: Props) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [marks, setMarks] = useState<Record<string, FieldMark>>({});
  const [vulnerableRows, setVulnerableRows] = useState<VulnerableRow[]>([
    emptyVulnerableRow(),
  ]);
  const [expiry, setExpiry] = useState(() => new Date(lockExpiresAt).getTime());
  // ค่าเริ่มต้นจาก server (deterministic) — interval จะ recompute จาก expiry หลัง mount
  const [remainingMs, setRemainingMs] = useState(Math.max(0, initialRemainingMs));
  const [busy, setBusy] = useState<"release" | "reclaim" | null>(null);
  const touched = useRef(false);

  const hasVulnerable =
    typeof answers.hasVulnerable === "boolean"
      ? (answers.hasVulnerable as boolean)
      : null;
  const steps = useMemo(() => visibleSteps(hasVulnerable), [hasVulnerable]);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const lockExpired = remainingMs <= 0;
  const lowLock = !lockExpired && remainingMs < 2 * 60 * 1000;

  // นับถอยหลัง lock
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, expiry - Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiry]);

  // เตือนก่อนออกเมื่อมีข้อมูลที่ยังไม่บันทึก (รอบนี้ระบบไม่บันทึกร่างเลย)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (touched.current) e.preventDefault();
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
    setAnswers((prev) => ({ ...prev, [name]: value }));
    setMarks((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  }

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
    if (!lockExpired) void renew();
  }

  async function handleRelease() {
    if (
      touched.current &&
      !window.confirm(
        "ข้อมูลที่คีย์ไว้จะหายทั้งหมด (ระบบยังไม่บันทึกร่าง) — ยืนยันออกจากแบบฟอร์ม?",
      )
    )
      return;
    setBusy("release");
    await releaseSheetAction(sheet.id);
    touched.current = false;
    router.push("/surveys");
    router.refresh();
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
    router.refresh();
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
        {/* แถบสถานะการบันทึก + ปุ่มลัดคีย์บอร์ด */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 h-4 w-4 shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
            <span>
              <strong className="font-semibold">โหมดทดลองคีย์</strong> — ยังไม่บันทึกคำตอบลงฐานข้อมูล
              (รอกลไกเข้ารหัสข้อมูลอ่อนไหว) ปิดหน้านี้แล้วข้อมูลจะหาย
            </span>
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
              <span
                title="การส่งใบ (สร้างข้อมูลครัวเรือน) เปิดใช้เมื่อระบบบันทึกได้จริง"
                className="btn btn-md cursor-not-allowed bg-slate-100 text-slate-400"
              >
                ส่งใบ (ยังไม่เปิดใช้)
              </span>
            )}
          </footer>
        </section>
      </div>

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
