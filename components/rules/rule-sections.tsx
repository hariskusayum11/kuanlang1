import Link from "next/link";
import type { RuleVersionSummary, RulesPageData, VulnerabilityTypeRule } from "@/lib/rules/core";
import { totalSystemWeight, type RiskWeightConfig } from "@/domain/risk/weights";
import { FLOOD_DEPTH_FULL_CM, FLOOD_DURATION_FULL_DAYS } from "@/domain/risk/factors";
import {
  describeRuleChange,
  factorLabel,
  factorSource,
  RISK_LEVEL_LABEL,
  TRIAGE_RESPONSE_TIME,
  toEditValues,
} from "@/domain/rules/priority-rules";
import type { TriageCode } from "@/domain/triage";
import type { RuleEditorProps } from "./rule-editor";

// =============================================================================
// ส่วนแสดงกฎการจัดลำดับ (docs/40) — ใช้ซ้ำที่หน้า /medical /risk และ /priority-rules
// ไม่มี hook → เรนเดอร์ฝั่ง server ได้ แล้วส่งเป็น children ให้กล่องแบบเปิด/ปิด (rules-panel.tsx)
// =============================================================================

// ปัจจัยที่แบบสอบถามยังไม่มีช่องให้ตอบ หรือต้องใช้ข้อมูล GIS — ยังไม่ถูกนับในทุกบ้าน (domain/risk/factors.ts)
export const NOT_COLLECTED = new Set(["NO_VEHICLE", "NO_RESOURCES", "NO_DIGITAL_CHANNEL", "FAR_FROM_EVAC"]);

export const TRIAGE_LEVELS = ["P1", "P2", "P3"] as const;

export const TRIAGE_CARD: Record<TriageCode, { title: string; cls: string; dot: string }> = {
  P1: { title: "วิกฤต", cls: "border-red-200 bg-red-50", dot: "bg-red-600" },
  P2: { title: "เร่งด่วน", cls: "border-sun-300 bg-sun-50", dot: "bg-sun-400" },
  P3: { title: "เฝ้าระวัง", cls: "border-brand-200 bg-brand-50", dot: "bg-brand-600" },
};

export type RuleNames = { factors: Record<string, string>; hardRules: Record<string, string>; types: Record<string, string> };

export const nf = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 1 });

export function ruleNames(risk: RiskWeightConfig, types: VulnerabilityTypeRule[]): RuleNames {
  return {
    factors: Object.fromEntries(risk.factors.map((f) => [f.code, factorLabel(f)])),
    hardRules: Object.fromEntries(risk.hardRules.map((r) => [r.code, r.nameTh])),
    types: Object.fromEntries(types.map((t) => [t.code, t.nameTh])),
  };
}

export function versionText(data: RulesPageData): string {
  return data.active.versionNo > 0 ? `เวอร์ชัน ${data.active.versionNo}` : "ค่าตั้งต้นในระบบ";
}

/** props ของตัวแก้กฎ — ส่งให้ client ได้ (ค่าล้วน ไม่มีฟังก์ชัน) */
export function ruleEditorProps(data: RulesPageData): RuleEditorProps {
  const risk = data.active.risk;
  return {
    baseVersionNo: data.active.versionNo,
    initial: toEditValues(data.active),
    factors: risk.factors.map((f) => ({ code: f.code, nameTh: factorLabel(f), collected: !NOT_COLLECTED.has(f.code) })),
    hardRules: risk.hardRules.map((r) => ({ code: r.code, nameTh: r.nameTh })),
    types: data.types.map((t) => ({ code: t.code, nameTh: t.nameTh, isActive: t.isActive })),
    names: ruleNames(risk, data.types),
  };
}

export function hardRuleText(when: "hasBedridden" | "hasDialysis"): string {
  return when === "hasBedridden" ? "ผู้ป่วยติดเตียง/พิการ" : "ผู้ป่วยฟอกไต";
}

export function thresholdRange(thresholds: RiskWeightConfig["thresholds"], index: number): string {
  const t = thresholds[index];
  return index === 0 ? `0 – ${nf(t.maxInclusive)}` : `มากกว่า ${nf(thresholds[index - 1].maxInclusive)} – ${nf(t.maxInclusive)}`;
}

/** การ์ดสามระดับ วิกฤต/เร่งด่วน/เฝ้าระวัง พร้อมลักษณะความเปราะบางของแต่ละระดับ */
export function TriageRuleCards({ types, compact = false }: { types: VulnerabilityTypeRule[]; compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}>
      {TRIAGE_LEVELS.map((level) => {
        const meta = TRIAGE_CARD[level];
        const members = types.filter((t) => t.level === level && (!compact || t.isActive));
        return (
          <div key={level} className={`rounded-2xl border-2 ${compact ? "p-3" : "p-4"} ${meta.cls}`}>
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <span className={`h-3 w-3 rounded-full ${meta.dot}`} aria-hidden="true" />
              {meta.title}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-600">ควรเข้าช่วยเหลือ{TRIAGE_RESPONSE_TIME[level]}</p>
            {members.length ? (
              <ul className={`${compact ? "mt-2" : "mt-3"} space-y-1 text-sm text-slate-800`}>
                {members.map((t) => (
                  <li key={t.code} className="flex items-start gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{t.nameTh}{t.isActive ? "" : <span className="text-slate-400"> (ปิดใช้งาน)</span>}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${compact ? "mt-2" : "mt-3"} text-sm text-slate-400`}>ไม่มีลักษณะความเปราะบางในระดับนี้</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TriageRuleNote() {
  return (
    <p className="text-sm leading-relaxed text-slate-600">
      แต่ละคนในกลุ่มเปราะบางได้ระดับตาม &quot;ลักษณะความเปราะบาง&quot; ที่ผู้ตรวจยืนยันจากแบบสอบถาม
      ถ้าคนหนึ่งมีหลายลักษณะ ใช้ระดับที่เร่งด่วนที่สุด · ผู้ดูแลระบบปรับระดับรายคนตามสภาพจริงได้จากหน้ารายงาน
      และระดับที่ปรับเองจะ <b>ไม่ถูกเปลี่ยน</b> เมื่อแก้กฎชุดนี้
    </p>
  );
}

/** ตารางปัจจัย น้ำหนัก เกณฑ์ กฎบังคับ ข้อมูลขาด และความมั่นใจ — ฉบับเต็ม */
export function RiskRuleDetails({ risk }: { risk: RiskWeightConfig }) {
  const maxScore = totalSystemWeight(risk);
  const thresholds = risk.thresholds;
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600">
        คิดจาก <b>แบบสอบถามที่ตรวจแล้วเท่านั้น</b> (ใบร่าง/รอตรวจไม่ถูกนำมาคิด) · แต่ละปัจจัยมีระดับ 0 ถึง 1
        คูณน้ำหนักแล้วรวมกัน จากนั้นเทียบกับ <b>คะแนนเต็ม {nf(maxScore)}</b> (น้ำหนักรวมทุกปัจจัย) เป็นคะแนน 0–100
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-4">ปัจจัย</th>
              <th className="py-2 pr-4">มาจาก</th>
              <th className="py-2 pr-4 text-right">น้ำหนัก</th>
              <th className="py-2">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {risk.factors.map((f) => (
              <tr key={f.code}>
                <td className="py-2 pr-4 font-semibold text-slate-800">{factorLabel(f)}</td>
                <td className="py-2 pr-4 text-slate-500">{factorSource(f)}</td>
                <td className="py-2 pr-4 text-right font-bold tabular-nums text-slate-800">{nf(f.weight)}</td>
                <td className="py-2">
                  {NOT_COLLECTED.has(f.code)
                    ? <span className="badge badge-neutral">ยังไม่มีข้อมูล — ไม่นับ</span>
                    : <span className="badge badge-success">ใช้คำนวณ</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-100">
              <td className="py-2 pr-4 font-bold text-slate-900" colSpan={2}>คะแนนเต็ม (น้ำหนักรวม)</td>
              <td className="py-2 pr-4 text-right font-bold tabular-nums text-slate-900">{nf(maxScore)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-mist rounded-2xl p-4">
          <p className="font-bold text-slate-900">ระดับความเสี่ยงจากคะแนน</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {thresholds.map((t, i) => (
              <li key={t.level} className="flex justify-between gap-3">
                <span className="font-semibold">{RISK_LEVEL_LABEL[t.level]}</span>
                <span className="tabular-nums">{thresholdRange(thresholds, i)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card-mist rounded-2xl p-4">
          <p className="font-bold text-slate-900">กฎบังคับ (ทับผลคะแนน)</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {risk.hardRules.map((r) => (
              <li key={r.code}>
                บ้านที่มี{hardRuleText(r.when)} → ความเสี่ยงอย่างน้อย
                <b> {RISK_LEVEL_LABEL[r.minLevel]}</b> แม้ข้อมูลอื่นไม่ครบ
              </li>
            ))}
          </ul>
        </div>
        <div className="card-mist rounded-2xl p-4">
          <p className="font-bold text-slate-900">ข้อมูลขาดหรืออ่านไม่ออก</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            ช่องที่เว้นว่างในกระดาษหรืออ่านไม่ออก <b>ไม่นับ</b> (ไม่ถือว่าเสี่ยง และไม่ถือว่าไม่เสี่ยง) ·
            คำตอบ &quot;ไม่มี&quot; ที่ผู้ตอบยืนยันนับเป็นข้อมูล · คะแนนหารด้วยคะแนนเต็มเสมอ
            บ้านที่ข้อมูลน้อยจึงไม่ถูกดันเป็นความเสี่ยงสูงลวง
          </p>
        </div>
        <div className="card-mist rounded-2xl p-4">
          <p className="font-bold text-slate-900">ความมั่นใจ</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            ความมั่นใจ = สัดส่วนน้ำหนักของปัจจัยที่มีข้อมูล × ({nf(risk.confidenceBase * 100)}% + {nf(risk.confidenceVerificationBonus * 100)}% × สัดส่วนที่ตรวจแล้ว) ·
            ต่ำกว่า <b>{nf(risk.minConfidence * 100)}%</b> แสดงเป็น &quot;ข้อมูลไม่พอประเมิน&quot; (ยกเว้นบ้านที่เข้ากฎบังคับ)
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        วิธีแปลงคำตอบเป็นระดับ 0–1: พื้นบ้านต่ำกว่าถนน = 1 · เท่าถนน = 0.5 · สูงกว่า = 0 ·
        น้ำลึก {FLOOD_DEPTH_FULL_CM} ซม. ขึ้นไป = 1 · ท่วมนาน {FLOOD_DURATION_FULL_DAYS} วันขึ้นไป = 1 ·
        มีคนวิกฤต/เร่งด่วนในบ้าน = 1 (ค่าแปลงเหล่านี้กำหนดในโปรแกรม ยังเป็นร่างเช่นกัน)
      </p>
    </div>
  );
}

export function HelpOrderRules() {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
        <li>บ้านที่มีคน <b>วิกฤต</b> ก่อน แล้วจึง <b>เร่งด่วน</b> → <b>เฝ้าระวัง</b> → กลุ่มเปราะบางที่ยังไม่ประเมิน → บ้านที่ไม่มีกลุ่มเปราะบาง</li>
        <li>ระดับเดียวกัน เรียงตามคะแนนความเสี่ยงของครัวเรือน (มากก่อน)</li>
        <li>คะแนนเท่ากัน เรียงตามความมั่นใจของข้อมูล (มากก่อน)</li>
      </ol>
      <p className="text-sm text-slate-600">
        เปิดดูได้ที่ <Link href="/map?help=on" className="font-semibold text-brand-700 underline underline-offset-2">แผนที่ → ชั้น &quot;ลำดับการช่วยเหลือ&quot;</Link> ·
        ทุกครัวเรือนที่ตรวจแล้วอยู่ในรายการ รวมบ้านที่ยังไม่มีพิกัด
      </p>
    </div>
  );
}

function thaiDate(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

/** ประวัติการแก้กฎ — ใครแก้ เมื่อไร เพราะอะไร และค่าที่เปลี่ยน */
export function RuleHistoryList({
  history,
  activeVersionNo,
  names,
  limit,
}: {
  history: RuleVersionSummary[];
  activeVersionNo: number;
  names: RuleNames;
  limit?: number;
}) {
  if (history.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-slate-500">
        ยังไม่มีเวอร์ชันในฐานข้อมูล — ระบบใช้ค่าร่างตั้งต้น (บันทึกครั้งแรกจะเป็นเวอร์ชัน 1)
      </p>
    );
  }
  const shown = limit ? history.slice(0, limit) : history;
  return (
    <ul className="divide-y-2 divide-slate-50">
      {shown.map((v) => (
        <li key={v.versionNo} className="px-6 py-4">
          <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
            เวอร์ชัน {v.versionNo}
            {v.versionNo === activeVersionNo ? <span className="badge badge-brand">ใช้งานอยู่</span> : null}
            <span className={`badge ${v.isDraft ? "badge-warning" : "badge-success"}`}>{v.isDraft ? "ร่าง" : "รับรองแล้ว"}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {thaiDate(v.createdAt)} · {v.createdByName ?? "ระบบ (ค่าตั้งต้น)"}
          </p>
          <p className="mt-1 text-sm text-slate-700">เหตุผล: {v.reason}</p>
          {v.changes.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {v.changes.map((c) => <li key={c.field}>• {describeRuleChange(c, names)}</li>)}
            </ul>
          ) : null}
        </li>
      ))}
      {limit && history.length > limit ? (
        <li className="px-6 py-3 text-sm">
          <Link href="/priority-rules" className="font-semibold text-brand-700 underline underline-offset-2">
            ดูประวัติทั้งหมด {history.length} เวอร์ชัน
          </Link>
        </li>
      ) : null}
    </ul>
  );
}

