"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionTitle } from "@/components/layout/page-hero";
import { previewRuleChangeAction, saveRuleVersionAction } from "@/lib/rules/actions";
import { rulePreviewSchema, ruleEditSchema } from "@/lib/rules/validation";
import { describeRuleChange, RISK_LEVEL_LABEL, RISK_LEVELS, type RuleChange, type RuleEditValues } from "@/domain/rules/priority-rules";
import type { RuleImpact } from "@/domain/rules/impact";
import type { RiskLevel } from "@/domain/risk/weights";
import type { TriageCode } from "@/domain/triage";

type Names = { factors: Record<string, string>; hardRules: Record<string, string>; types: Record<string, string> };

/** ค่าล้วน — server component สร้างแล้วส่งให้ client ได้ (components/rules/rule-sections.tsx → ruleEditorProps) */
export interface RuleEditorProps {
  baseVersionNo: number;
  initial: RuleEditValues;
  factors: { code: string; nameTh: string; collected: boolean }[];
  hardRules: { code: string; nameTh: string }[];
  types: { code: string; nameTh: string; isActive: boolean }[];
  names: Names;
}

const TRIAGE_OPTIONS: { value: TriageCode; label: string }[] = [
  { value: "P1", label: "วิกฤต — ภายใน 30 นาที" },
  { value: "P2", label: "เร่งด่วน — ภายใน 2 ชั่วโมง" },
  { value: "P3", label: "เฝ้าระวัง — ภายใน 6 ชั่วโมง" },
];

const ERRORS: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์แก้กฎ",
  CONFLICT: "มีผู้บันทึกกฎเวอร์ชันใหม่ระหว่างที่คุณแก้ — โหลดหน้าใหม่เพื่อดูค่าล่าสุดก่อน",
  NO_CHANGE: "ค่าที่แก้เหมือนเวอร์ชันปัจจุบันทุกข้อ — ไม่มีอะไรต้องบันทึก",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/** ค่าในฟอร์มเก็บเป็นข้อความ (ช่องตัวเลขลบจนว่างได้) แล้วแปลงก่อนตรวจด้วย Zod */
type Form = {
  weights: Record<string, string>;
  thresholds: { LOW: string; MEDIUM: string; HIGH: string };
  minConfidencePct: string;
  hardRules: Record<string, RiskLevel>;
  triage: Record<string, TriageCode>;
  approved: boolean;
  reason: string;
};

function toForm(v: RuleEditValues): Form {
  return {
    weights: Object.fromEntries(Object.entries(v.weights).map(([k, w]) => [k, String(w)])),
    thresholds: { LOW: String(v.thresholds.LOW), MEDIUM: String(v.thresholds.MEDIUM), HIGH: String(v.thresholds.HIGH) },
    minConfidencePct: String(Math.round(v.minConfidence * 100)),
    hardRules: { ...v.hardRules },
    triage: { ...v.triage },
    approved: v.approved,
    reason: "",
  };
}

const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

function toPayload(form: Form, baseVersionNo: number) {
  return {
    baseVersionNo,
    weights: Object.fromEntries(Object.entries(form.weights).map(([k, w]) => [k, num(w)])),
    thresholds: { LOW: num(form.thresholds.LOW), MEDIUM: num(form.thresholds.MEDIUM), HIGH: num(form.thresholds.HIGH) },
    minConfidence: num(form.minConfidencePct) / 100,
    hardRules: form.hardRules,
    triage: form.triage,
    approved: form.approved,
    reason: form.reason,
  };
}

const nf = (n: number) => n.toLocaleString("th-TH");

/**
 * ตัวแก้กฎ (ADMIN) — แก้ → ดูผลกระทบ → ระบุเหตุผล → บันทึกเป็นเวอร์ชันใหม่ (server ตรวจสิทธิ์ซ้ำ)
 * `onDone` = ฝังในกล่อง Modal (หน้า /medical /risk): เปิดฟอร์มทันที ยกเลิก/บันทึกแล้วเรียก onDone แทนการพับ
 */
export function RuleEditor({
  baseVersionNo,
  initial,
  factors,
  hardRules,
  types,
  names,
  titleId,
  onDone,
}: RuleEditorProps & { titleId?: string; onDone?: (savedMessage: string | null) => void }) {
  const router = useRouter();
  const embedded = onDone !== undefined;
  const [open, setOpen] = useState(embedded);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; impact: RuleImpact; changes: RuleChange[] } | null>(null);

  const payload = useMemo(() => toPayload(form, baseVersionNo), [form, baseVersionNo]);
  // ตัวอย่างผลกระทบผูกกับค่าที่กรอก (ไม่รวมเหตุผล) — แก้ค่าแล้วต้องดูผลกระทบใหม่ก่อนบันทึก
  const valueKey = useMemo(() => JSON.stringify({ ...payload, reason: undefined }), [payload]);
  const previewFresh = preview?.key === valueKey;
  const totalWeight = Object.values(payload.weights).reduce((s, w) => s + (Number.isFinite(w) ? w : 0), 0);

  const patch = (next: Partial<Form>) => { setForm((old) => ({ ...old, ...next })); setSaved(null); };

  async function runPreview() {
    setError(null);
    const parsed = rulePreviewSchema.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ERRORS.INVALID); return; }
    setBusy("preview");
    try {
      const result = await previewRuleChangeAction(payload);
      if (result.ok) setPreview({ key: valueKey, impact: result.impact, changes: result.changes });
      else setError(("message" in result && result.message) || ERRORS[result.reason] || ERRORS.ERROR);
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    if (!previewFresh) { setError("กด “ดูผลกระทบ” กับค่าล่าสุดก่อนบันทึก"); return; }
    const parsed = ruleEditSchema.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ERRORS.INVALID); return; }
    setBusy("save");
    try {
      const result = await saveRuleVersionAction(payload);
      if (result.ok) {
        const message = `บันทึกเป็นเวอร์ชัน ${result.versionNo} แล้ว${result.triageUpdated ? ` · ปรับระดับความเร่งด่วน ${nf(result.triageUpdated)} คน` : ""}`;
        setSaved(message);
        setPreview(null);
        setOpen(false);
        router.refresh();
        onDone?.(message);
      } else {
        setError(("message" in result && result.message) || ERRORS[result.reason] || ERRORS.ERROR);
      }
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card overflow-hidden border-alert-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
        <SectionTitle id={titleId} title={embedded ? `แก้เกณฑ์ → สร้างเวอร์ชัน ${baseVersionNo + 1}` : "แก้กฎ (เฉพาะผู้ดูแลระบบ)"} tone="alert" />
        {embedded ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDone(null)} disabled={busy !== null}>ปิด</button>
        ) : !open ? (
          <button type="button" className="btn btn-accent btn-sm" onClick={() => { setForm(toForm(initial)); setPreview(null); setError(null); setOpen(true); }}>
            แก้กฎ → สร้างเวอร์ชัน {baseVersionNo + 1}
          </button>
        ) : null}
      </div>
      {saved ? <p role="status" className="px-6 py-3 text-sm font-semibold text-emerald-700">{saved}</p> : null}
      {!open ? (
        <p className="px-6 py-4 text-sm text-slate-500">
          ค่าที่แก้จะไม่ทับของเดิม — ระบบสร้างเวอร์ชันใหม่ เก็บค่าก่อน/หลัง ผู้แก้ เวลา และเหตุผล และให้ดูผลกระทบก่อนบันทึกทุกครั้ง
        </p>
      ) : (
        <form
          className="space-y-6 p-6"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}
        >
          <fieldset className="space-y-2">
            <legend className="label">ความเร่งด่วนของแต่ละลักษณะความเปราะบาง</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {types.map((t) => (
                <label key={t.code} className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-100 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">{t.nameTh}{t.isActive ? "" : " (ปิดใช้งาน)"}</span>
                  <select
                    className="field w-56 py-1.5"
                    value={form.triage[t.code] ?? ""}
                    onChange={(e) => patch({ triage: { ...form.triage, [t.code]: e.target.value as TriageCode } })}
                  >
                    {TRIAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="label">น้ำหนักปัจจัยความเสี่ยง (คะแนนเต็มรวม {nf(totalWeight)})</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {factors.map((f) => (
                <label key={f.code} className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-100 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {f.nameTh}
                    {f.collected ? null : <span className="block text-[11px] font-normal text-slate-400">ยังไม่มีข้อมูล — มีผลต่อคะแนนเต็มเท่านั้น</span>}
                  </span>
                  <input
                    className="field w-24 py-1.5 text-right tabular-nums"
                    type="number" min={0} max={100} step={0.5} inputMode="decimal"
                    value={form.weights[f.code] ?? ""}
                    onChange={(e) => patch({ weights: { ...form.weights, [f.code]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="label">เกณฑ์ระดับ (คะแนนสูงสุดของแต่ละระดับ · สูงมาก = ไม่เกิน 100)</legend>
              {(["LOW", "MEDIUM", "HIGH"] as const).map((level) => (
                <label key={level} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">{RISK_LEVEL_LABEL[level]} ไม่เกิน</span>
                  <input
                    className="field w-24 py-1.5 text-right tabular-nums"
                    type="number" min={1} max={99} step={1} inputMode="decimal"
                    value={form.thresholds[level]}
                    onChange={(e) => patch({ thresholds: { ...form.thresholds, [level]: e.target.value } })}
                  />
                </label>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="label">ความมั่นใจและกฎบังคับ</legend>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">ความมั่นใจขั้นต่ำที่ให้ระดับได้ (%)</span>
                <input
                  className="field w-24 py-1.5 text-right tabular-nums"
                  type="number" min={0} max={100} step={5} inputMode="numeric"
                  value={form.minConfidencePct}
                  onChange={(e) => patch({ minConfidencePct: e.target.value })}
                />
              </label>
              {hardRules.map((r) => (
                <label key={r.code} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">{r.nameTh.split("→")[0].trim()} → อย่างน้อย</span>
                  <select
                    className="field w-32 py-1.5"
                    value={form.hardRules[r.code]}
                    onChange={(e) => patch({ hardRules: { ...form.hardRules, [r.code]: e.target.value as RiskLevel } })}
                  >
                    {RISK_LEVELS.map((l) => <option key={l} value={l}>{RISK_LEVEL_LABEL[l]}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          </div>

          <label className="flex items-start gap-2 rounded-xl border-2 border-slate-100 px-3 py-2">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={form.approved} onChange={(e) => patch({ approved: e.target.checked })} />
            <span className="text-sm text-slate-700">
              <b>เจ้าของระบบรับรองค่าชุดนี้แล้ว</b> — ติ๊กเมื่อได้รับการรับรองจริงเท่านั้น ไม่ติ๊ก = ยังเป็นร่าง (หน้าความเสี่ยงและแผนที่จะแสดงป้าย &quot;ร่าง&quot;)
            </span>
          </label>

          <div className="space-y-3 rounded-2xl border-2 border-brand-100 bg-mist p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-slate-900">ผลกระทบต่อข้อมูลที่ตรวจแล้ว</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void runPreview()} disabled={busy !== null}>
                {busy === "preview" ? "กำลังคำนวณ…" : previewFresh ? "คำนวณใหม่" : "ดูผลกระทบ"}
              </button>
            </div>
            {preview && previewFresh ? (
              <ImpactView impact={preview.impact} changes={preview.changes} names={names} />
            ) : (
              <p className="text-sm text-slate-500">
                {preview ? "ค่าถูกแก้หลังดูผลกระทบ — กด “ดูผลกระทบ” อีกครั้ง" : "กด “ดูผลกระทบ” เพื่อดูว่าจำนวนคนวิกฤต/บ้านความเสี่ยงสูงมากจะเปลี่ยนเท่าไร ก่อนบันทึก"}
              </p>
            )}
          </div>

          <label className="block">
            <span className="label">เหตุผลของการแก้ (บันทึกในประวัติ)</span>
            <textarea
              className="field min-h-20"
              maxLength={500}
              value={form.reason}
              onChange={(e) => patch({ reason: e.target.value })}
              placeholder="เช่น ที่ประชุม 19 ต.ค. ให้ผู้สูงอายุติดเตียงเป็นวิกฤต"
            />
          </label>

          {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-md" onClick={() => (embedded ? onDone(null) : setOpen(false))} disabled={busy !== null}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary btn-md" disabled={busy !== null || !previewFresh}>
              {busy === "save" ? "กำลังบันทึก…" : `บันทึกเป็นเวอร์ชัน ${baseVersionNo + 1}`}
            </button>
          </div>
          <p className="text-right text-[11px] text-slate-400"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> บันทึก</p>
        </form>
      )}
    </section>
  );
}

const TRIAGE_ROWS: { key: "P1" | "P2" | "P3" | "UNASSESSED"; label: string }[] = [
  { key: "P1", label: "วิกฤต" },
  { key: "P2", label: "เร่งด่วน" },
  { key: "P3", label: "เฝ้าระวัง" },
  { key: "UNASSESSED", label: "ยังไม่ประเมิน" },
];
const RISK_ROWS: { key: RiskLevel | "INSUFFICIENT"; label: string }[] = [
  { key: "CRITICAL", label: "สูงมาก" },
  { key: "HIGH", label: "สูง" },
  { key: "MEDIUM", label: "ปานกลาง" },
  { key: "LOW", label: "ต่ำ" },
  { key: "INSUFFICIENT", label: "ข้อมูลไม่พอประเมิน" },
];

function Delta({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  return (
    <span className="tabular-nums">
      {nf(before)} → <b className="text-ink-900">{nf(after)}</b>
      {diff !== 0 ? <span className={`ml-1 text-xs font-bold ${diff > 0 ? "text-alert-700" : "text-emerald-700"}`}>({diff > 0 ? "+" : ""}{nf(diff)})</span> : null}
    </span>
  );
}

function ImpactView({ impact, changes, names }: { impact: RuleImpact; changes: RuleChange[]; names: Names }) {
  return (
    <div className="space-y-3 text-sm">
      {changes.length ? (
        <ul className="space-y-0.5 text-slate-700">
          {changes.map((c) => <li key={c.field}>• {describeRuleChange(c, names)}</li>)}
        </ul>
      ) : (
        <p className="text-slate-500">ยังไม่มีค่าที่ต่างจากเวอร์ชันปัจจุบัน</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 font-semibold text-slate-800">กลุ่มเปราะบาง (คน)</p>
          <ul className="space-y-0.5">
            {TRIAGE_ROWS.map((r) => (
              <li key={r.key} className="flex justify-between gap-2"><span>{r.label}</span><Delta before={impact.people.before[r.key]} after={impact.people.after[r.key]} /></li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 font-semibold text-slate-800">ครัวเรือนตามระดับความเสี่ยง (หลัง)</p>
          <ul className="space-y-0.5">
            {RISK_ROWS.map((r) => (
              <li key={r.key} className="flex justify-between gap-2"><span>{r.label}</span><Delta before={impact.risk.before[r.key]} after={impact.risk.after[r.key]} /></li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        คำนวณจากครัวเรือนที่ตรวจแล้วทั้งหมด {nf(impact.households)} หลัง · ระดับความเร่งด่วนเปลี่ยน {nf(impact.peopleChanged)} คน ·
        ระดับความเสี่ยงเปลี่ยน {nf(impact.householdsChanged)} หลัง · คนที่ผู้ดูแลปรับระดับเองไว้จะไม่ถูกเปลี่ยน
      </p>
    </div>
  );
}
