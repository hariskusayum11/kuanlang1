"use client";

// ตัวแก้เกณฑ์ธงเตือนภัยชุมชน (ADMIN · docs/44)
// แก้ระดับธง (เพิ่ม/ลบ/เรียง/สี) · เกณฑ์ของแต่ละสะพาน · ระดับท้องสะพาน/พื้นสะพาน → ดูผลกับระดับน้ำตอนนี้ → เหตุผล → บันทึกเวอร์ชันใหม่
// ตรวจซ้ำที่ server เสมอ (Zod + validateFlagCriteria + สิทธิ์ flag-criteria.manage)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_FLAG_CRITERIA,
  diffFlagCriteria,
  estimateBridgeFlag,
  FLAG_COLOR_LABEL,
  FLAG_COLORS,
  thresholdMsl,
  validateFlagCriteria,
  type FlagBridgeDef,
  type FlagColor,
  type FlagCriteriaConfig,
  type FlagLevelDef,
  type FlagThreshold,
} from "@/domain/water/community-flags";
import { flagCriteriaSchema } from "@/lib/water/flag-criteria-schema";
import { saveFlagCriteriaAction } from "@/lib/water/flag-criteria-actions";
import type { FlagCriteriaVersionSummary } from "@/lib/water/flag-criteria";
import { FLAG_BG, Flag, flagLabel } from "@/components/water/community-flag";
import { SectionTitle } from "@/components/layout/page-hero";

/** ระดับน้ำตอนนี้ของแต่ละสถานี (ม.รทก.) — ใช้ดูผลก่อนบันทึก */
export type LiveLevels = Record<string, { levelMsl: number | null; bankMsl: number | null; name: string; measuredAt: string | null }>;

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COLOR_DEFAULT_LABEL: Record<FlagColor, string> = { green: "ธงเขียว", yellow: "ธงเหลือง", orange: "ธงส้ม", red: "ธงแดง" };
const KEY_BY_COLOR: Record<FlagColor, string> = { green: "GREEN", yellow: "YELLOW", orange: "ORANGE", red: "RED" };
const SAVE_ERROR: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์แก้เกณฑ์ธง",
  CONFLICT: "มีผู้ดูแลบันทึกเกณฑ์ฉบับใหม่ระหว่างที่หน้านี้เปิดอยู่ — โหลดหน้าใหม่เพื่อดูค่าล่าสุดก่อนแก้",
  NO_CHANGE: "ยังไม่มีอะไรเปลี่ยนจากฉบับปัจจุบัน",
  ERROR: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
  UNAUTHENTICATED: "หมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบใหม่",
};

function uniqueKey(levels: FlagLevelDef[], base: string): string {
  const used = new Set(levels.map((l) => l.key));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${Date.now() % 1000}`;
}

/** ช่องตัวเลขที่พิมพ์ทศนิยมค้างได้ (เก็บข้อความ แปลงเป็นตัวเลขเมื่อถูกต้อง) */
function NumberField({ value, onChange, label, placeholder, step = "0.01", allowEmpty = false }: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  placeholder?: string;
  step?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      aria-label={label}
      placeholder={placeholder}
      className="field tabular-nums"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.trim();
        if (raw === "") return onChange(allowEmpty ? null : value);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function FlagCriteriaEditor({
  versionNo,
  initial,
  live,
  history,
}: {
  versionNo: number;
  initial: FlagCriteriaConfig;
  live: LiveLevels;
  history: FlagCriteriaVersionSummary[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState<FlagCriteriaConfig>(() => structuredClone(initial));
  // เปลี่ยน key เพื่อรีเซ็ตช่องตัวเลขทั้งหมดเมื่อโหลดค่าชุดอื่นเข้ามา
  const [formKey, setFormKey] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; items?: string[] } | null>(null);

  const zodError = useMemo(() => {
    const r = flagCriteriaSchema.safeParse(config);
    return r.success ? null : (r.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  }, [config]);
  const invalid = zodError ?? validateFlagCriteria(config);
  const changes = useMemo(() => diffFlagCriteria(initial, config), [initial, config]);
  const canSave = !invalid && reason.trim().length >= 3 && (changes.length > 0 || versionNo === 0) && !saving;

  const update = (fn: (c: FlagCriteriaConfig) => void) =>
    setConfig((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const load = (c: FlagCriteriaConfig, note: string) => {
    setConfig(structuredClone(c));
    setFormKey((k) => k + 1);
    setMessage({ ok: true, text: note });
  };

  // ---------- ระดับธง ----------
  const addLevel = () =>
    update((c) => {
      const color: FlagColor = "orange";
      // แทรกก่อนระดับสีแดงระดับแรก (ส่วนใหญ่ธงส้มอยู่ระหว่างเหลืองกับแดง) · ไม่มีแดง = ต่อท้าย
      const redAt = c.levels.findIndex((l, i) => i > 0 && l.color === "red");
      const at = redAt > 0 ? redAt : c.levels.length;
      c.levels.splice(at, 0, {
        key: uniqueKey(c.levels, KEY_BY_COLOR[color]),
        label: COLOR_DEFAULT_LABEL[color],
        title: "",
        headline: "",
        action: "",
        color,
        siren: false,
      });
    });
  const moveLevel = (i: number, dir: -1 | 1) =>
    update((c) => {
      const j = i + dir;
      if (i < 1 || j < 1 || j >= c.levels.length) return; // ระดับปกติอยู่บนสุดเสมอ
      [c.levels[i], c.levels[j]] = [c.levels[j]!, c.levels[i]!];
    });
  const removeLevel = (i: number) =>
    update((c) => {
      if (i < 1 || c.levels.length <= 2) return;
      const [gone] = c.levels.splice(i, 1);
      for (const b of c.bridges) delete b.thresholds[gone!.key];
    });

  // ---------- สะพาน ----------
  const addBridge = () =>
    update((c) => {
      c.bridges.push({ stationCode: "", bridge: "", canal: "", soffitMsl: null, deckMsl: null, sourceNote: "", sourceUrl: null, thresholds: {} });
    });
  const removeBridge = (i: number) => {
    update((c) => void c.bridges.splice(i, 1));
    // ช่องตัวเลขเก็บข้อความของตัวเอง — ลบสะพานกลางรายการแล้วต้องรีเซ็ต ไม่ให้ค่าเลื่อนไปอยู่สะพานถัดไป
    setFormKey((k) => k + 1);
  };
  const setThreshold = (bi: number, key: string, t: FlagThreshold | null) =>
    update((c) => {
      const b = c.bridges[bi]!;
      if (t) b.thresholds[key] = t;
      else delete b.thresholds[key];
    });

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await saveFlagCriteriaAction({ baseVersionNo: versionNo, reason, config });
    setSaving(false);
    if (result.ok) {
      setMessage({ ok: true, text: `บันทึกเกณฑ์ฉบับที่ ${result.versionNo} แล้ว — หน้าแรกใช้เกณฑ์ใหม่ทันที`, items: result.changes });
      setReason("");
      router.refresh();
    } else {
      setMessage({ ok: false, text: result.reason === "INVALID" ? result.message : (SAVE_ERROR[result.reason] ?? SAVE_ERROR.ERROR!) });
    }
  }

  const levels = config.levels;
  const warnLevels = levels.slice(1);

  return (
    <div key={formKey} className="space-y-7">
      {/* 1. ระดับธง */}
      <section className="card space-y-4 p-6">
        <SectionTitle title="1. ระดับธง" tone="brand" />
        <p className="text-sm text-slate-600">
          ระดับแรกคือสถานการณ์ปกติ (ไม่มีเกณฑ์) · ระดับถัดไปเรียงจากเบาไปรุนแรง — ระดับล่างกว่าต้องมีเกณฑ์ระดับน้ำสูงกว่า ·
          เพิ่มธงสีส้มได้ด้วยปุ่มด้านล่าง
        </p>
        <ol className="space-y-3">
          {levels.map((l, i) => (
            <li key={l.key} className="rounded-2xl border-2 border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Flag level={l} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink-900">{l.label || "(ยังไม่ตั้งชื่อ)"}</p>
                  <p className="text-xs text-slate-500">{i === 0 ? "ระดับปกติ — ไม่มีเกณฑ์" : `ระดับที่ ${i} · รหัส ${l.key}`}</p>
                </div>
                {i > 0 ? (
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLevel(i, -1)} disabled={i === 1} aria-label={`เลื่อน ${l.label} ขึ้น`}>▲</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveLevel(i, 1)} disabled={i === levels.length - 1} aria-label={`เลื่อน ${l.label} ลง`}>▼</button>
                    <button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={() => removeLevel(i)} disabled={levels.length <= 2}>ลบ</button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="label">ชื่อธง</span>
                  <input className="field" value={l.label} maxLength={40} onChange={(e) => update((c) => void (c.levels[i]!.label = e.target.value))} />
                </label>
                <div>
                  <span className="label">สีธง</span>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`สีของ ${l.label}`}>
                    {FLAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={l.color === color}
                        onClick={() => update((c) => void (c.levels[i]!.color = color))}
                        className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1.5 text-sm font-semibold ${l.color === color ? "border-brand-500 bg-mist" : "border-slate-200 bg-white"}`}
                      >
                        <span className={`h-3.5 w-3.5 rounded-sm ${FLAG_BG[color]}`} />
                        {FLAG_COLOR_LABEL[color]}
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 px-2 text-sm text-slate-700">
                      <input type="checkbox" checked={l.siren} onChange={(e) => update((c) => void (c.levels[i]!.siren = e.target.checked))} className="accent-brand-600" />
                      มีไซเรน
                    </label>
                  </div>
                </div>
                <label className="block">
                  <span className="label">สถานการณ์</span>
                  <input className="field" value={l.title} maxLength={80} placeholder="เช่น เฝ้าระวัง" onChange={(e) => update((c) => void (c.levels[i]!.title = e.target.value))} />
                </label>
                <label className="block">
                  <span className="label">ข้อความบนหน้าแรก (สั้น)</span>
                  <input className="field" value={l.headline} maxLength={120} placeholder="เช่น เฝ้าระวัง · อพยพผู้ป่วยติดเตียงก่อน" onChange={(e) => update((c) => void (c.levels[i]!.headline = e.target.value))} />
                </label>
                <label className="block md:col-span-2">
                  <span className="label">สิ่งที่ชุมชนต้องทำ</span>
                  <textarea className="field min-h-16" value={l.action} maxLength={300} onChange={(e) => update((c) => void (c.levels[i]!.action = e.target.value))} />
                </label>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-secondary btn-md" onClick={addLevel} disabled={levels.length >= 8}>
          + เพิ่มระดับธง
        </button>
      </section>

      {/* 2. สะพานและเกณฑ์ */}
      <section className="card space-y-4 p-6">
        <SectionTitle title="2. สะพานและเกณฑ์ยกธง" tone="brand" />
        <p className="text-sm text-slate-600">
          เกณฑ์แต่ละระดับเลือกได้ 3 แบบ: ผิวน้ำต่ำกว่าท้องสะพาน x ม. · น้ำถึงพื้นสะพาน · ระดับน้ำถึง x ม.รทก. —
          ระบบแปลงเป็น ม.รทก. ให้ดูทันที และเทียบกับระดับน้ำตอนนี้
        </p>
        {config.bridges.map((b, bi) => (
          <BridgeCard
            key={bi}
            bridge={b}
            levels={warnLevels}
            config={config}
            live={live[b.stationCode]}
            onField={(fn) => update((c) => fn(c.bridges[bi]!))}
            onThreshold={(key, t) => setThreshold(bi, key, t)}
            onRemove={config.bridges.length > 1 ? () => removeBridge(bi) : undefined}
          />
        ))}
        <button type="button" className="btn btn-secondary btn-md" onClick={addBridge} disabled={config.bridges.length >= 12}>
          + เพิ่มสะพาน
        </button>
      </section>

      {/* 3. ที่มา */}
      <section className="card space-y-4 p-6">
        <SectionTitle title="3. ที่มาของเกณฑ์" tone="brand" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">ผู้กำหนดเกณฑ์</span>
            <input className="field" value={config.source.publisher} onChange={(e) => update((c) => void (c.source.publisher = e.target.value))} />
          </label>
          <label className="block">
            <span className="label">ลิงก์ที่มา</span>
            <input className="field" value={config.source.url} onChange={(e) => update((c) => void (c.source.url = e.target.value))} />
          </label>
          <label className="block">
            <span className="label">สัญญาอนุญาต</span>
            <input className="field" value={config.source.license} onChange={(e) => update((c) => void (c.source.license = e.target.value))} />
          </label>
          <label className="block">
            <span className="label">หมายเหตุบนหน้าแรก</span>
            <input className="field" value={config.source.note} onChange={(e) => update((c) => void (c.source.note = e.target.value))} />
          </label>
        </div>
      </section>

      {/* 4. บันทึก */}
      <section className="card space-y-4 p-6">
        <SectionTitle title="4. ตรวจและบันทึกเป็นฉบับใหม่" tone="brand" />
        {invalid ? (
          <p className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{invalid}</p>
        ) : changes.length ? (
          <div className="rounded-xl bg-mist px-4 py-3 text-sm text-slate-700">
            <p className="font-bold text-ink-900">สิ่งที่จะเปลี่ยน ({changes.length} รายการ)</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{versionNo === 0 ? "ยังไม่มีฉบับในระบบ — บันทึกครั้งแรกเพื่อเริ่มเก็บประวัติได้แม้ยังไม่แก้ค่า" : "ยังไม่มีอะไรเปลี่ยน"}</p>
        )}
        <label className="block">
          <span className="label">เหตุผลการแก้ (บังคับ — เก็บในประวัติและ Audit Log)</span>
          <textarea className="field min-h-20" value={reason} maxLength={500} placeholder="เช่น ได้ระดับท้องสะพานทางการจากชลประทานสงขลา / กลุ่มเพิ่มธงส้มปี 2570" onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary btn-md" disabled={!canSave} onClick={save}>
            {saving ? "กำลังบันทึก…" : "บันทึกเกณฑ์ฉบับใหม่"}
          </button>
          <button type="button" className="btn btn-ghost btn-md" onClick={() => load(initial, "คืนค่าเป็นฉบับปัจจุบันแล้ว (ยังไม่บันทึก)")}>
            ยกเลิกการแก้
          </button>
          <button type="button" className="btn btn-ghost btn-md" onClick={() => load(DEFAULT_FLAG_CRITERIA, "โหลดค่าตั้งต้นของระบบแล้ว — ตรวจแล้วกดบันทึกถ้าต้องการใช้")}>
            โหลดค่าตั้งต้นของระบบ
          </button>
        </div>
        {message ? (
          <div className={`rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} role="status">
            <p className="font-semibold">{message.text}</p>
            {message.items?.length ? <ul className="mt-1 list-disc pl-5">{message.items.map((i) => <li key={i}>{i}</li>)}</ul> : null}
          </div>
        ) : null}
      </section>

      {/* 5. ประวัติ */}
      <section className="card space-y-3 p-6">
        <SectionTitle title="ประวัติการแก้เกณฑ์" tone="brand" />
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีการบันทึก — หน้าแรกใช้ค่าตั้งต้นของระบบ</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.versionNo} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <b className="text-ink-900">ฉบับที่ {h.versionNo}</b>
                    {h.versionNo === versionNo ? <span className="badge badge-success ml-2">ใช้อยู่</span> : null}
                    <span className="text-slate-500"> · {new Date(h.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · {h.createdByName ?? "ระบบ"}</span>
                  </p>
                  {h.config && h.versionNo !== versionNo ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => load(h.config!, `โหลดฉบับที่ ${h.versionNo} มาแก้แล้ว — กดบันทึกเพื่อใช้เป็นฉบับใหม่`)}>
                      นำค่าฉบับนี้มาแก้
                    </button>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-slate-700">เหตุผล: {h.reason}</p>
                {h.changes.length ? <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">{h.changes.map((c) => <li key={c}>{c}</li>)}</ul> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

const THRESHOLD_TYPES: { value: "none" | FlagThreshold["type"]; label: string }[] = [
  { value: "none", label: "ไม่ใช้กับสะพานนี้" },
  { value: "belowSoffit", label: "ต่ำกว่าท้องสะพาน (ม.)" },
  { value: "deck", label: "น้ำถึงพื้นสะพาน" },
  { value: "msl", label: "ระดับน้ำถึง (ม.รทก.)" },
];

function BridgeCard({ bridge, levels, config, live, onField, onThreshold, onRemove }: {
  bridge: FlagBridgeDef;
  levels: FlagLevelDef[];
  config: FlagCriteriaConfig;
  live: LiveLevels[string] | undefined;
  onField: (fn: (b: FlagBridgeDef) => void) => void;
  onThreshold: (key: string, t: FlagThreshold | null) => void;
  onRemove?: () => void;
}) {
  const estimate = estimateBridgeFlag(config, bridge, live?.levelMsl ?? null);
  return (
    <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-ink-900">{bridge.bridge || "(สะพานใหม่)"}</p>
          <p className="text-xs text-slate-500">
            {live ? (
              <>ระดับน้ำตอนนี้ (สถานี {bridge.stationCode} {live.name}) <b className="text-ink-900">{live.levelMsl !== null ? `${fmt(live.levelMsl)} ม.รทก.` : "ไม่มีข้อมูล"}</b>{live.measuredAt ? ` · วัดเมื่อ ${live.measuredAt.split(" ")[1] ?? live.measuredAt} น.` : ""}</>
            ) : bridge.stationCode ? (
              `ไม่พบข้อมูลสถานี ${bridge.stationCode} ในคลังข้อมูลน้ำแห่งชาติตอนนี้ — ตรวจรหัสสถานี`
            ) : (
              "ใส่รหัสสถานีโทรมาตรที่ตั้งอยู่ที่สะพาน"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-sm font-semibold text-ink-900">
            <Flag level={estimate.flag} className="h-5 w-5" />
            ตอนนี้: {flagLabel(estimate.flag)}
          </span>
          {onRemove ? <button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={onRemove}>ลบสะพาน</button> : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="label">ชื่อสะพาน</span>
          <input className="field" value={bridge.bridge} maxLength={80} onChange={(e) => onField((b) => void (b.bridge = e.target.value))} />
        </label>
        <label className="block">
          <span className="label">ลำน้ำ</span>
          <input className="field" value={bridge.canal} maxLength={80} onChange={(e) => onField((b) => void (b.canal = e.target.value))} />
        </label>
        <label className="block">
          <span className="label">รหัสสถานี (ThaiWater)</span>
          <input className="field" value={bridge.stationCode} maxLength={16} placeholder="เช่น X.90" onChange={(e) => onField((b) => void (b.stationCode = e.target.value.trim()))} />
        </label>
        <label className="block">
          <span className="label">ระดับท้องสะพาน / พื้นล่างสะพาน (ม.รทก.)</span>
          <NumberField label="ระดับท้องสะพาน" value={bridge.soffitMsl} allowEmpty onChange={(v) => onField((b) => void (b.soffitMsl = v))} />
        </label>
        <label className="block">
          <span className="label">ระดับพื้นสะพาน (ม.รทก.)</span>
          <NumberField label="ระดับพื้นสะพาน" value={bridge.deckMsl} allowEmpty onChange={(v) => onField((b) => void (b.deckMsl = v))} />
        </label>
        <div className="text-xs text-slate-500 md:self-end">
          {live?.bankMsl != null ? <>ระดับตลิ่งของสถานี (ThaiWater) {fmt(live.bankMsl)} ม.รทก. — ใช้เทียบเท่านั้น</> : null}
        </div>
        <label className="block md:col-span-2">
          <span className="label">ที่มาของระดับสะพาน</span>
          <input className="field" value={bridge.sourceNote} maxLength={200} onChange={(e) => onField((b) => void (b.sourceNote = e.target.value))} />
        </label>
        <label className="block">
          <span className="label">ลิงก์เอกสาร (ถ้ามี)</span>
          <input className="field" value={bridge.sourceUrl ?? ""} onChange={(e) => onField((b) => void (b.sourceUrl = e.target.value.trim() || null))} />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">ระดับธง</th>
              <th className="py-2 pr-3 font-semibold">เกณฑ์</th>
              <th className="py-2 pr-3 font-semibold">ค่า</th>
              <th className="py-2 font-semibold">เท่ากับระดับน้ำ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {levels.map((l) => {
              const t = bridge.thresholds[l.key];
              const msl = t ? thresholdMsl(t, bridge) : null;
              const reached = msl !== null && live?.levelMsl != null && live.levelMsl >= msl;
              return (
                <tr key={l.key}>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900"><Flag level={l} className="h-5 w-5" />{l.label}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="field"
                      aria-label={`เกณฑ์${l.label}ของ${bridge.bridge}`}
                      value={t?.type ?? "none"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "none") onThreshold(l.key, null);
                        else if (v === "deck") onThreshold(l.key, { type: "deck" });
                        else if (v === "msl") onThreshold(l.key, { type: "msl", value: msl ?? 0 });
                        else onThreshold(l.key, { type: "belowSoffit", meters: 1 });
                      }}
                    >
                      {THRESHOLD_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="w-32 py-2 pr-3">
                    {t?.type === "belowSoffit" ? (
                      <NumberField key={`${l.key}-b`} label={`ระยะใต้ท้องสะพานของ${l.label}`} value={t.meters} step="0.1" onChange={(v) => v !== null && onThreshold(l.key, { type: "belowSoffit", meters: v })} />
                    ) : t?.type === "msl" ? (
                      <NumberField key={`${l.key}-m`} label={`ระดับน้ำของ${l.label}`} value={t.value} onChange={(v) => v !== null && onThreshold(l.key, { type: "msl", value: v })} />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 tabular-nums">
                    {msl !== null ? (
                      <span className={reached ? "font-bold text-red-700" : "text-slate-700"}>
                        ≈ {fmt(msl)} ม.รทก.{reached ? " · ถึงแล้ว" : live?.levelMsl != null ? ` · อีก ${fmt(msl - live.levelMsl)} ม.` : ""}
                      </span>
                    ) : t ? (
                      <span className="text-red-600">คำนวณไม่ได้ — ใส่ระดับสะพานก่อน</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
