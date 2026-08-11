"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { visibleSteps, type EntryField } from "@/lib/entry/steps";
import { collectMissing, missingCountByStep } from "@/lib/entry/validation";
import type { EntryMasterData } from "@/lib/entry/master-data";
import type { EntryPayload } from "@/lib/entry/payload";
import type { EntrySuggestion, EntrySuggestions } from "@/lib/entry/suggestions";
import {
  changeSheetCommunityAction,
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
import { Mascot } from "@/components/brand/mascot";
import { Modal } from "@/components/ui/modal";

type SheetInfo = {
  id: string;
  sheetNo: string;
  communityId: string;
  communityName: string;
};

type Props = {
  sheet: SheetInfo;
  /** ชุมชนที่เลือกเปลี่ยนได้ (เผื่อเลือกผิดตอนเริ่ม) — รหัสใบเดิมไม่เสีย */
  communities: { id: string; nameTh: string }[];
  master: EntryMasterData;
  lockExpiresAt: string;
  /** เวลาที่เหลือ (ms) คำนวณฝั่ง server — กัน hydration mismatch จาก Date.now() */
  initialRemainingMs: number;
  /** ร่างที่บันทึกไว้ (ถอดรหัสฝั่ง server แล้ว) — null = เริ่มฟอร์มว่าง */
  initialDraft: EntryPayload | null;
  suggestions: EntrySuggestions;
};

type SaveState = "idle" | "saving" | "saved" | "error";

// ให้ตรงกับ LOCK_DURATION_MS ฝั่ง server (lib/entry/lock.ts) — ใช้ตอน reclaim สำเร็จ
const LOCK_FULL_MS = 45 * 60 * 1000;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

/**
 * ฟิลด์ที่กินความกว้างเต็มแถวในเลย์เอาต์หลายคอลัมน์ — ชนิดที่มีตัวเลือก/ข้อความยาว
 * จะอึดอัดถ้าบีบลงช่องแคบ ส่วนช่องสั้น (ข้อความ/ตัวเลข/วันที่/เลือก) วางเรียงข้างกันได้
 * ลำดับ DOM = ลำดับ Tab เสมอ (ตรงกระดาษ) — Grid เติมซ้ายไปขวาบนลงล่างตาม source order
 */
const FULL_WIDTH_FIELD_TYPES: ReadonlySet<EntryField["type"]> = new Set([
  "textarea",
  "checkbox-group",
  "assistance-needs",
  "radio",
  "coordinate",
  "measure-pair",
]);

function fieldSpanClass(field: EntryField): string {
  const span = FULL_WIDTH_FIELD_TYPES.has(field.type) || field.fullWidth
    ? "md:col-span-2 2xl:col-span-3"
    : "";
  // startsRow: บังคับขึ้นคอลัมน์แรกของแถวใหม่ เพื่อจัดกลุ่มฟิลด์ให้อยู่แถวเดียวกัน
  const rowStart = field.startsRow ? "md:col-start-1 2xl:col-start-1" : "";
  return `${span} ${rowStart}`.trim();
}

/**
 * เงื่อนไขแสดงฟิลด์ตาม showWhen (เช่น "อื่นๆ ระบุ")
 * รองรับทั้ง radio/select (ค่าเดียว), checkbox-group (อาร์เรย์ — ติ๊ก OTHER ในกลุ่ม),
 * และ boolean — เทียบด้วย code ของ master เมื่อค่าที่เก็บเป็น id
 */
function fieldVisible(
  field: EntryField,
  answers: Record<string, unknown>,
  master: EntryMasterData,
): boolean {
  if (!field.showWhen) return true;
  const { field: depName, equals } = field.showWhen;
  const actual = answers[depName];
  if (typeof actual === "boolean") return String(actual) === equals;

  const dependsOn = visibleSteps(null)
    .flatMap((s) => s.fields)
    .find((f) => f.name === depName);
  const codeOf = (val: string): string | undefined => {
    if (!dependsOn?.masterKey) return val;
    return master[dependsOn.masterKey].find((o) => o.id === val)?.code;
  };

  if (Array.isArray(actual)) {
    return actual.some((v) => typeof v === "string" && codeOf(v) === equals);
  }
  if (typeof actual === "string" && actual !== "") return codeOf(actual) === equals;
  return false;
}

export function EntryWizard({
  sheet,
  communities,
  master,
  lockExpiresAt,
  initialRemainingMs,
  initialDraft,
  suggestions,
}: Props) {
  const router = useRouter();
  // ชุมชนของใบ — เปลี่ยนได้เผื่อเลือกผิดตอนเริ่ม (รหัสเดิมไม่เสีย)
  const [communityId, setCommunityId] = useState(sheet.communityId);
  const [changingCommunity, setChangingCommunity] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(initialDraft?.stepIndex ?? 0);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const base = { ...(initialDraft?.answers ?? {}) };
    // รหัสแบบสอบถามยึดรหัสใบที่ระบบออกให้เสมอ (#R7-A) — ผู้คีย์แก้ไม่ได้
    // เขียนทับค่าในร่างเก่าด้วย เผื่อร่างถูกบันทึกก่อนกติกานี้
    base.surveyNo = sheet.sheetNo;
    // Prefill ชื่อชุมชนจากชุมชนที่ผู้คีย์เลือกไว้ เมื่อยังไม่มีค่า — ลดการพิมพ์ผิด
    // (ยังแก้ได้ เพื่อคงความตรงตามกระดาษ QM-01 หากผู้สำรวจเขียนต่างออกไป)
    if (
      base.communityNameOnPaper == null ||
      (typeof base.communityNameOnPaper === "string" &&
        base.communityNameOnPaper.trim() === "")
    ) {
      base.communityNameOnPaper = sheet.communityName;
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
      prefix: r.prefix,
      prefixOther: r.prefixOther,
      firstName: r.firstName,
      lastName: r.lastName,
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
  // ถามยืนยันก่อนออกจากฟอร์ม — กันกดออกโดยไม่ตั้งใจแล้วต้องกลับมาเปิดใบใหม่
  const [confirmExit, setConfirmExit] = useState(false);
  // true = จองซ้ำอัตโนมัติแล้วไม่สำเร็จ (มีผู้อื่นถือใบไปจริง) — จึงค่อยเด้งกล่องให้รับรู้
  const [reclaimBlocked, setReclaimBlocked] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(
    initialDraft ? "saved" : "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [submitted, setSubmitted] = useState<{
    duplicateSuspected: boolean;
    reopenedForVerify: boolean;
  } | null>(
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

  // แยกช่องที่กำหนดตั้งแต่เริ่มใบ (รหัส + ชุมชน) ออกจากช่องที่ผู้คีย์ต้องกรอกจริง
  // ช่อง confirmed แสดงเป็นสรุปอ่านอย่างเดียว · ช่อง interactive คุมด้วย fieldVisible
  const confirmedFields = step.fields.filter((f) => f.confirmedFromStart);
  const interactiveFields = step.fields.filter(
    (f) => !f.confirmedFromStart && fieldVisible(f, answers, master),
  );

  /**
   * รายการที่ยังไม่ถูกตอบทั้งใบ — คำนวณด้วย Pure Function (lib/entry/validation.ts)
   * กติกา: ทุกช่องที่มองเห็นต้องมีค่า หรือถูกมาร์ก F2/F3 — ห้ามเว้นว่างเงียบ ๆ
   * รวมถึงชื่อ-สกุลในตาราง, รายละเอียดที่บังคับ และจำนวน/รายละเอียดของความต้องการ
   */
  const missing = useMemo(
    () =>
      collectMissing({
        steps,
        answers,
        marks,
        vulnerableRows,
        vulnerabilityTypes: master.vulnerabilityTypes.map((v) => ({
          id: v.id,
          label: v.label,
          requiresDetail: v.requiresDetail,
        })),
        assistanceTypes: master.assistanceNeedTypes.map((a) => ({
          id: a.id,
          label: a.label,
          requiresCount: a.requiresCount,
          requiresDetail: a.requiresDetail,
        })),
        codeOf: (masterKey, id) =>
          (master[masterKey as keyof typeof master] as { id: string; code: string }[])
            .find((o) => o.id === id)?.code,
      }),
    [steps, answers, marks, master, vulnerableRows],
  );
  const missingByStep = useMemo(() => missingCountByStep(missing), [missing]);
  const missingKeys = useMemo(() => new Set(missing.map((m) => m.key)), [missing]);

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

  // F3 = ไม่ได้กรอกในกระดาษบนฟิลด์ที่โฟกัสอยู่ (ปุ่มบนจอเป็นวิธีหลัก)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "F3") return;
      const target = document.activeElement as HTMLElement | null;
      const name =
        target?.dataset?.fieldName ??
        target?.closest<HTMLElement>("[data-field-name]")?.dataset.fieldName;
      if (!name) return;
      e.preventDefault();
      const mark: FieldMark = "BLANK_IN_PAPER";
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

  // เบราว์เซอร์หยุด/หน่วง timer ของแท็บที่ถูกซ่อนไว้ ทำให้ heartbeat ไม่ทันต่ออายุ
  // → พอผู้ใช้กลับมาที่แท็บ (visible/focus) ต่ออายุทันที ลดโอกาสเซสชันหมดแล้วถูกเด้ง
  // ออกไปหน้า login กลางคัน (renew → getSession ต่ออายุเซสชันด้วย เพราะ updateAge=0)
  useEffect(() => {
    if (lockExpired) return;
    function onWake() {
      if (document.visibilityState === "visible") void renew();
    }
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [lockExpired, renew]);

  // ผ่อนคลายล็อก (Owner feedback #9): ถ้าล็อกหมดอายุระหว่างฟอร์มเปิดอยู่ ให้จองซ้ำเงียบ ๆ
  // ก่อน — ต่ออายุให้อัตโนมัติโดยไม่เด้งกล่อง จะขึ้นกล่องเฉพาะเมื่อจองไม่ได้จริง (มีผู้อื่น
  // ถือใบไปแล้ว) ซึ่งเป็นการชนกันจริงที่ต้องหยุดตามกฎกันสองคนหยิบใบเดียวกัน
  useEffect(() => {
    if (!lockExpired || busy || reclaimBlocked) return;
    let cancelled = false;
    void (async () => {
      const result = await claimSheetAction(sheet.id);
      if (cancelled) return;
      if (result.ok) {
        const next = Date.now() + LOCK_FULL_MS;
        setExpiry(next);
        setRemainingMs(next - Date.now());
      } else {
        setReclaimBlocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockExpired, busy, reclaimBlocked, sheet.id]);

  function setAnswer(name: string, value: unknown) {
    touched.current = true;
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [name]: value }));
    setMarks((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  }

  function applySuggestion(suggestion: EntrySuggestion) {
    touched.current = true;
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, ...suggestion.fill }));
    setMarks((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(suggestion.fill)) next[key] = null;
      return next;
    });
  }

  // เปลี่ยนชุมชนของใบ (เลือกผิดตอนเริ่ม) — รหัสเดิมไม่เสีย · โหลด master ของชุมชนใหม่ด้วย
  // (ตัวเลือกตำบล/หมู่ต่างกันตามชุมชน) จึง router.refresh() หลังเปลี่ยนสำเร็จ
  async function changeCommunity(nextId: string) {
    if (nextId === communityId || changingCommunity) return;
    const prevId = communityId;
    setCommunityError(null);
    setChangingCommunity(true);
    setCommunityId(nextId);
    const result = await changeSheetCommunityAction(sheet.id, nextId);
    if (result.ok) {
      // ชื่อชุมชนตามกระดาษเดินตามชุมชนที่เลือก (ผู้คีย์ยังแก้เป็นค่าตามกระดาษได้ภายหลัง)
      setAnswer("communityNameOnPaper", result.communityName);
      router.refresh();
    } else {
      setCommunityId(prevId);
      setCommunityError("เปลี่ยนชุมชนไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
    setChangingCommunity(false);
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
        prefix: r.prefix,
        prefixOther: r.prefixOther,
        firstName: r.firstName,
        lastName: r.lastName,
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
    // เลื่อนขึ้นบนสุดเมื่อเปลี่ยนขั้นตอน — ไม่ให้ผู้คีย์เริ่มขั้นใหม่กลางหน้า (ตกหล่นช่องบน)
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    setSubmitted({
      duplicateSuspected: result.duplicateSuspected,
      reopenedForVerify: result.reopenedForVerify,
    });
    setConfirmOpen(false);
  }

  async function handleReclaim() {
    setBusy("reclaim");
    const result = await claimSheetAction(sheet.id);
    if (result.ok) {
      const next = Date.now() + LOCK_FULL_MS;
      setExpiry(next);
      setRemainingMs(next - Date.now());
      setReclaimBlocked(false);
      setBusy(null);
      return;
    }
    router.push("/surveys");
  }

  // ส่งใบสำเร็จ — หน้ายืนยันพร้อมคำเตือนใบซ้ำ (ถ้ามี)
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-8 text-center shadow-lg">
          <div className="animate-drop-in">
            <Mascot role="entry" mood="happy" tone="mint" motion="float" size={112} decorative className="mx-auto" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">ส่งใบเรียบร้อย</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
            ใบ <span className="font-mono font-bold">{sheet.sheetNo}</span>{" "}
            ถูกบันทึกเข้าระบบแล้ว (ข้อมูลอ่อนไหวถูกเข้ารหัส) — รอผู้ตรวจยืนยันความถูกต้อง
          </p>
          {submitted.reopenedForVerify && (
            <p className="mx-auto mt-3 max-w-sm rounded-xl border-2 border-sun-200 bg-sun-50 px-3 py-2 text-xs font-medium leading-relaxed text-sun-800">
              ใบนี้เคยตรวจยืนยันแล้ว การแก้ไขทำให้ใบกลับไปรอตรวจใหม่อัตโนมัติ
              เพื่อให้ตัวเลข &ldquo;ตรวจแล้ว&rdquo; ตรงกับข้อมูลจริงเสมอ
            </p>
          )}
          {submitted.duplicateSuspected && (
            <p className="mx-auto mt-3 max-w-sm rounded-xl border-2 border-sun-200 bg-sun-50 px-3 py-2 text-xs font-medium leading-relaxed text-sun-800">
              ⚠ เบอร์โทรผู้ให้ข้อมูลตรงกับใบอื่นในระบบ — ระบบติดธง &ldquo;สงสัยใบซ้ำ&rdquo;
              ให้ผู้ตรวจดูแล้ว ไม่ต้องทำอะไรเพิ่ม
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              router.replace("/surveys");
            }}
            className="btn btn-accent btn-lg mt-7"
          >
            คีย์ใบถัดไป
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1720px] flex-col gap-5 p-4 md:flex-row md:p-6 lg:p-8">
      {/* ── รางซ้าย: ข้อมูลใบ + ล็อก + ขั้นตอน ── */}
      <aside className="shrink-0 md:w-72">
        <div className="space-y-4 md:sticky md:top-6">
          {/* ข้อมูลใบ — แบบกระชับ (Owner: การ์ดเดิมมุมซ้ายบนใหญ่เกินไป)
              รหัส + ชุมชน เป็นบรรทัดเล็ก ๆ ไว้อ้างอิงระหว่างคีย์ทุกขั้นตอน */}
          <div className="px-1">
            <p className="break-all font-mono text-sm font-bold text-slate-800">
              {sheet.sheetNo}
            </p>
            <p className="text-xs font-medium text-slate-500">{sheet.communityName}</p>
            {/* Lock = กลไกเบื้องหลัง (กันเปิดใบซ้อนกัน) ต่ออายุอัตโนมัติเมื่อเปลี่ยนขั้น
                เตือนเฉพาะเมื่อใกล้หมด/หมดอายุ — ปกติไม่ต้องแสดงให้รกจอ */}
            {(lowLock || lockExpired) && (
              <p
                className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                  lockExpired ? "text-slate-500" : "font-bold text-sun-700"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                {lockExpired
                  ? "การจองใบหมดอายุ"
                  : `การจองใบใกล้หมดอายุ (${formatRemaining(remainingMs)}) — `}
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
            )}
          </div>

          {/* ขั้นตอน */}
          <nav className="card overflow-hidden p-2">
            {steps.map((s, i) => {
              const active = i === safeIndex;
              const gap = missingByStep[s.id] ?? 0;
              // เขียวต่อเมื่อ "กรอกครบจริง" ไม่ใช่แค่เคยเปิดผ่าน
              const done = visited.has(s.id) && !active && gap === 0;
              const incomplete = visited.has(s.id) && !active && gap > 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void goTo(i)}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    active
                      ? "bg-brand-50 shadow-[inset_3px_0_0_0_var(--color-brand-500)]"
                      : "hover:translate-x-0.5 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition-colors ${
                      active
                        ? "bg-brand-500 text-white shadow-[0_2px_0_0_var(--color-brand-700)]"
                        : done
                          ? "bg-emerald-100 text-emerald-700"
                          : incomplete
                            ? "bg-sun-100 text-sun-800"
                            : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : incomplete ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                        <path d="M12 8v5M12 17h.01" strokeLinecap="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {s.paperSection}
                    </span>
                    <span
                      className={`block truncate text-[13px] ${
                        active ? "font-bold text-brand-800" : "font-medium text-slate-600"
                      }`}
                    >
                      {s.title}
                    </span>
                    {gap > 0 && !active && (
                      <span className="mt-0.5 block text-[10px] font-bold text-sun-800">
                        ยังไม่ได้ตอบ {gap} ช่อง
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            disabled={busy !== null}
            className="btn btn-secondary btn-sm w-full"
          >
            {busy === "release" ? "กำลังออก…" : "ออกจากแบบฟอร์ม"}
          </button>
        </div>
      </aside>

      {/* ยืนยันก่อนออก — ร่างถูกบันทึกและใบยังกลับมาคีย์ต่อได้ทุกเมื่อ */}
      <Modal open={confirmExit} onClose={() => setConfirmExit(false)}>
        <div className="animate-rise max-w-sm rounded-3xl bg-white p-7 text-center shadow-lg">
          <span className="chip chip-lg chip-sun mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-7 w-7">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="text-lg font-bold text-slate-900">ออกจากแบบฟอร์มนี้?</h3>
          <p className="mt-1.5 text-sm text-slate-500">
            ระบบบันทึกร่างที่คีย์ไว้แล้ว ใบ <span className="font-mono text-xs font-bold">{sheet.sheetNo}</span>{" "}
            จะยังอยู่ในรายการ &ldquo;ใบที่คีย์ค้างอยู่&rdquo; ให้กลับมาคีย์ต่อได้เสมอ
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmExit(false)}
              disabled={busy !== null}
              className="btn btn-secondary btn-md flex-1"
            >
              คีย์ต่อ
            </button>
            <button
              type="button"
              onClick={handleRelease}
              disabled={busy !== null}
              className="btn btn-primary btn-md flex-1"
            >
              {busy === "release" ? "กำลังออก…" : "ออกจริง"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── เนื้อหา step ── */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* แถบสถานะการบันทึกร่าง + ปุ่มลัดคีย์บอร์ด */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-slate-200/80 bg-white px-4 py-3">
          <p
            className={`flex items-center gap-2 text-xs font-medium ${
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
          <div className="hidden items-center gap-3 text-[11px] text-slate-500 sm:flex">
            <span className="flex items-center gap-1">
              <kbd className="kbd">F3</kbd> ไม่ได้กรอกในกระดาษ
            </span>
          </div>
        </div>

        {/* progress */}
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${((safeIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums text-slate-600">
            ขั้นที่ {safeIndex + 1} / {steps.length}
          </span>
        </div>

        {showValidation && missing.length > 0 && (
          <div
            role="alert"
            className="animate-pop rounded-2xl border-2 border-sun-200 bg-sun-50 px-4 py-3"
          >
            <p className="flex items-center gap-1.5 text-sm font-bold text-sun-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ยังไม่ได้ตอบ {missing.length} ช่อง — ส่งใบไม่ได้
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-sun-700">
              ฟิลด์ ⭐ ต้องมีค่า หรือเลือก “ไม่ได้กรอกในกระดาษ” ที่คำถาม
              (คอมพิวเตอร์ยังใช้ <kbd className="kbd">F3</kbd> ได้) — คลิกเพื่อไปแก้
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missing.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => void goTo(m.stepIndex)}
                  className="rounded-lg border-2 border-sun-300 bg-white px-2.5 py-1 text-xs font-bold text-sun-800 transition-colors hover:bg-sun-100"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <section key={step.id} className="card animate-step-in p-6 md:p-7">
          <header className="mb-6 border-b-2 border-slate-100 pb-5">
            <span className="badge badge-brand">{step.paperSection}</span>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{step.title}</h2>
            {step.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>
            )}
          </header>

          {step.kind === "vulnerable-grid" ? (
            <VulnerableGrid
              master={master}
              rows={vulnerableRows}
              missingKeys={showValidation ? missingKeys : undefined}
              marks={marks}
              onClearMark={(key) =>
                setMarks((prev) => (prev[key] ? { ...prev, [key]: null } : prev))
              }
              onToggleVulnBlank={(index) => {
                touched.current = true;
                dirty.current = true;
                const key = `vg-${index}-vulnerabilities`;
                setMarks((prev) => ({
                  ...prev,
                  [key]: prev[key] === "BLANK_IN_PAPER" ? null : "BLANK_IN_PAPER",
                }));
              }}
              onDeleteRow={(index) => {
                touched.current = true;
                dirty.current = true;
                setVulnerableRows(vulnerableRows.filter((_, j) => j !== index));
                // ลบแถวแล้วต้อง remap คีย์มาร์กที่อิงดัชนี: ทิ้งของแถวที่ลบ
                // เลื่อนแถวที่อยู่ถัดลงมา 1 (ไม่งั้นมาร์กจะไปติดผิดคน)
                setMarks((prev) => {
                  const next: Record<string, FieldMark> = {};
                  for (const [k, v] of Object.entries(prev)) {
                    const m = /^vg-(\d+)-(.+)$/.exec(k);
                    if (!m) {
                      next[k] = v;
                      continue;
                    }
                    const rowIdx = Number(m[1]);
                    if (rowIdx === index) continue;
                    next[rowIdx > index ? `vg-${rowIdx - 1}-${m[2]}` : k] = v;
                  }
                  return next;
                });
              }}
              onChange={(rows) => {
                touched.current = true;
                dirty.current = true;
                setVulnerableRows(rows);
              }}
            />
          ) : (
            <div className="space-y-6">
              {/* ค่าที่กำหนดตั้งแต่เริ่มใบ (รหัส + ชุมชน) — แสดงเป็นส่วนที่กรอกแล้ว
                  ไม่ต้องให้ผู้คีย์กรอกซ้ำ ข้ามไปช่องถัดไปได้ทันที (Owner feedback) */}
              {confirmedFields.length > 0 && (
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3.5 w-3.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    กรอกให้แล้วตั้งแต่เริ่มใบ — ข้ามไปช่องถัดไปได้เลย
                  </p>
                  <dl className="mt-2.5 grid grid-cols-1 items-start gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {confirmedFields.map((f) =>
                      // ชุมชน: เปลี่ยนได้ (เผื่อเลือกผิดตอนเริ่ม) — รหัสเดิมไม่เสีย
                      f.name === "communityNameOnPaper" ? (
                        <div key={f.name}>
                          <dt className="text-[11px] font-semibold text-slate-500">ชุมชน</dt>
                          <dd className="mt-0.5">
                            <div className="flex items-center gap-2">
                              <select
                                value={communityId}
                                onChange={(e) => void changeCommunity(e.target.value)}
                                disabled={changingCommunity}
                                aria-label="เปลี่ยนชุมชนของใบนี้"
                                className="field w-full max-w-56 py-1.5 text-sm font-bold disabled:opacity-60"
                              >
                                {communities.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nameTh}
                                  </option>
                                ))}
                              </select>
                              {changingCommunity && (
                                <span className="text-[11px] font-medium text-slate-400">
                                  กำลังเปลี่ยน…
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">
                              เลือกผิดตอนเริ่ม? เปลี่ยนได้ที่นี่ — รหัส {sheet.sheetNo} เดิมไม่เสีย
                            </p>
                          </dd>
                        </div>
                      ) : (
                        <div key={f.name}>
                          <dt className="text-[11px] font-semibold text-slate-500">
                            {f.label}
                          </dt>
                          <dd className="mt-0.5 text-sm font-bold text-slate-900">
                            {String(answers[f.name] ?? "—") || "—"}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                  {communityError && (
                    <p className="mt-2 text-xs font-semibold text-red-600">{communityError}</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 md:grid-cols-2 2xl:grid-cols-3">
                {interactiveFields.map((f) => (
                  <div key={f.name} className={fieldSpanClass(f)}>
                    <FieldInput
                      field={f}
                      master={master}
                      value={answers[f.name]}
                      mark={marks[f.name] ?? null}
                      onChange={(v) => setAnswer(f.name, v)}
                      pairValue={f.pair ? answers[f.pair.name] : undefined}
                      pairMark={f.pair ? (marks[f.pair.name] ?? null) : undefined}
                      onPairChange={
                        f.pair ? (v) => setAnswer(f.pair!.name, v) : undefined
                      }
                      extraValues={
                        f.extraKeys
                          ? Object.fromEntries(f.extraKeys.map((k) => [k, answers[k]]))
                          : undefined
                      }
                      onExtraChange={(k, v) => setAnswer(k, v)}
                      missingKeys={showValidation ? missingKeys : undefined}
                      suggestions={suggestions[f.name]}
                      onSuggestionSelect={applySuggestion}
                      onMarkChange={(nextMark) => {
                        touched.current = true;
                        dirty.current = true;
                        setMarks((prev) => ({ ...prev, [f.name]: nextMark }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <footer className="mt-7 flex items-center justify-between border-t-2 border-slate-100 pt-5">
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
                  if (missing.length > 0) {
                    setShowValidation(true);
                    void goTo(missing[0].stepIndex);
                    return;
                  }
                  setConfirmOpen(true);
                }}
                className="btn btn-accent btn-lg"
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
      <Modal
        open={confirmOpen && !lockExpired}
        onClose={() => !submitting && setConfirmOpen(false)}
      >
          <div className="animate-rise rounded-3xl bg-white p-7 shadow-lg">
            <div className="flex items-center gap-3">
              <Mascot role="entry" mood="wink" motion="wiggle" size={56} decorative className="shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">ยืนยันการส่งใบ</h3>
                <p className="text-sm leading-relaxed text-slate-600">
                  ใบ <span className="font-mono font-bold">{sheet.sheetNo}</span> ·{" "}
                  {sheet.communityName}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
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
                        r.firstName.trim() !== "" ||
                        r.lastName.trim() !== "" ||
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
              <p role="alert" className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
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
                className="btn btn-accent btn-md"
              >
                {submitting ? "กำลังส่ง…" : "ยืนยันส่งใบ"}
              </button>
            </div>
          </div>
      </Modal>

      {/* Overlay เฉพาะเมื่อชนกันจริง — จองซ้ำอัตโนมัติไม่สำเร็จเพราะมีผู้อื่นถือใบไปแล้ว
          (ล็อกหมดอายุเฉย ๆ ระบบต่อให้เงียบ ไม่รบกวนผู้กำลังคีย์ — Owner feedback #9) */}
      <Modal open={reclaimBlocked}>
          <div className="animate-rise rounded-3xl bg-white p-7 text-center shadow-lg">
            <Mascot role="entry" mood="sleep" tone="sun" motion="float" size={96} decorative className="mx-auto" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">ใบนี้ถูกผู้อื่นเปิดแล้ว</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              ระหว่างที่พักไว้ ใบนี้ถูกเจ้าหน้าที่ท่านอื่นเปิดคีย์ต่อ — ร่างของคุณถูกเก็บไว้แล้ว
              กด “ลองจองอีกครั้ง” หากใบว่างแล้ว หรือกลับไปหยิบใบอื่น
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleReclaim}
                disabled={busy !== null}
                className="btn btn-primary btn-md"
              >
                {busy === "reclaim" ? "กำลังจองใบ…" : "ลองจองอีกครั้ง"}
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
      </Modal>
    </div>
  );
}
