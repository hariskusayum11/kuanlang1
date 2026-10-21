import { SectionTitle } from "@/components/layout/page-hero";
import type { RulesPageData } from "@/lib/rules/core";
import { totalSystemWeight } from "@/domain/risk/weights";
import { factorLabel, RISK_LEVEL_LABEL } from "@/domain/rules/priority-rules";
import { RulesPanel } from "./rules-panel";
import {
  hardRuleText,
  HelpOrderRules,
  NOT_COLLECTED,
  nf,
  RiskRuleDetails,
  RuleHistoryList,
  ruleEditorProps,
  ruleNames,
  thresholdRange,
  TriageRuleCards,
  TriageRuleNote,
  versionText,
} from "./rule-sections";

// กล่องเกณฑ์บนหน้าที่ใช้กฎจริง (Owner Decision 2026-10-21 · docs/40)
// ข้อมูลมาจาก getRulesPageData(ctx) — null (ไม่มีสิทธิ์ดูกฎ) ผู้เรียกไม่ต้องเรนเดอร์กล่องนี้

const HISTORY_LIMIT = 5;

function statusText(data: RulesPageData): string {
  return `${versionText(data)} · ${data.active.isDraft ? "ร่าง ยังไม่รับรอง" : "รับรองแล้ว"}`;
}

function History({ data }: { data: RulesPageData }) {
  return (
    <div className="space-y-2">
      <SectionTitle title="ประวัติการแก้เกณฑ์ล่าสุด" tone="brand" />
      <div className="-mx-6">
        <RuleHistoryList
          history={data.history}
          activeVersionNo={data.active.versionNo}
          names={ruleNames(data.active.risk, data.types)}
          limit={HISTORY_LIMIT}
        />
      </div>
    </div>
  );
}

function DraftNote({ data }: { data: RulesPageData }) {
  if (!data.active.isDraft) return null;
  return (
    <p className="rounded-xl border border-sun-400 bg-sun-100 px-4 py-2 text-sm text-ink-900" role="note">
      <b>เกณฑ์ชุดนี้ยังเป็นร่าง</b> — รอเจ้าของระบบรับรอง ตัวเลขที่จัดตามเกณฑ์นี้จึงเป็นตัวเลขทดลอง
    </p>
  );
}

/** หน้า /medical — ลักษณะความเปราะบางแต่ละระดับ + เวลาที่ควรเข้าช่วยเหลือ */
export function TriageRulesPanel({ data }: { data: RulesPageData }) {
  return (
    <RulesPanel
      id="priority-rules"
      title="เกณฑ์ความเร่งด่วนที่ใช้จัดระดับ"
      status={statusText(data)}
      isDraft={data.active.isDraft}
      editor={data.canManage ? ruleEditorProps(data) : null}
      summary={<TriageSummary data={data} />}
      details={<TriageDetails data={data} />}
    />
  );
}

// summary/details ส่งเป็น element เดียวที่เป็น server component — ถ้าส่ง element ที่มีลูกหลายตัวเป็น prop
// ให้ client component ตรง ๆ React (dev) เตือนเรื่อง key ของลูกที่ไม่ได้อยู่ใน list จริง
function TriageSummary({ data }: { data: RulesPageData }) {
  return (
    <div className="space-y-4">
      <DraftNote data={data} />
      <TriageRuleCards types={data.types} compact />
    </div>
  );
}

function TriageDetails({ data }: { data: RulesPageData }) {
  return (
    <div className="space-y-6">
      <TriageRuleNote />
      {data.types.some((t) => !t.isActive) ? (
        <div className="space-y-2">
          <SectionTitle title="ทุกลักษณะ รวมที่ปิดใช้งาน" tone="alert" />
          <TriageRuleCards types={data.types} />
        </div>
      ) : null}
      <div className="space-y-2">
        <SectionTitle title="ลำดับการช่วยเหลือบนแผนที่" tone="mint" />
        <HelpOrderRules />
      </div>
      <History data={data} />
    </div>
  );
}

/** สรุปเกณฑ์ความเสี่ยง (หน้า /risk) */
function RiskRuleSummary({ risk }: { risk: RulesPageData["active"]["risk"] }) {
  const used = risk.factors.filter((f) => !NOT_COLLECTED.has(f.code)).sort((a, b) => b.weight - a.weight);
  const unused = risk.factors.filter((f) => NOT_COLLECTED.has(f.code));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card-mist rounded-2xl p-4">
        <p className="font-bold text-slate-900">ปัจจัยและน้ำหนัก <span className="font-normal text-slate-500">(คะแนนเต็ม {nf(totalSystemWeight(risk))})</span></p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {used.map((f) => (
            <li key={f.code} className="flex justify-between gap-3">
              <span>{factorLabel(f)}</span>
              <span className="font-bold tabular-nums">{nf(f.weight)}</span>
            </li>
          ))}
        </ul>
        {unused.length ? (
          <p className="mt-2 text-xs text-slate-500">
            ยังไม่มีข้อมูล (ไม่นับ แต่รวมในคะแนนเต็ม): {unused.map((f) => factorLabel(f)).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="card-mist rounded-2xl p-4">
        <p className="font-bold text-slate-900">ระดับจากคะแนน 0–100</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {risk.thresholds.map((t, i) => (
            <li key={t.level} className="flex justify-between gap-3">
              <span className="font-semibold">{RISK_LEVEL_LABEL[t.level]}</span>
              <span className="tabular-nums">{thresholdRange(risk.thresholds, i)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          ความมั่นใจต่ำกว่า {nf(risk.minConfidence * 100)}% → &quot;ข้อมูลไม่พอประเมิน&quot;
        </p>
      </div>
      <div className="card-mist rounded-2xl p-4">
        <p className="font-bold text-slate-900">กฎบังคับ (ทับผลคะแนน)</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {risk.hardRules.map((r) => (
            <li key={r.code}>
              บ้านที่มี{hardRuleText(r.when)} → อย่างน้อย <b>{RISK_LEVEL_LABEL[r.minLevel]}</b>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          ใช้เฉพาะแบบสอบถามที่ตรวจแล้ว · สูตรรุ่น {risk.formulaVersion} · น้ำหนักรุ่น {risk.weightVersion}
        </p>
      </div>
    </div>
  );
}

/** หน้า /risk — ปัจจัย น้ำหนัก เกณฑ์ระดับ กฎบังคับ */
export function RiskRulesPanel({ data }: { data: RulesPageData }) {
  const risk = data.active.risk;
  return (
    <RulesPanel
      id="priority-rules"
      title="เกณฑ์ความเสี่ยงที่ใช้คำนวณ"
      status={statusText(data)}
      isDraft={data.active.isDraft}
      editor={data.canManage ? ruleEditorProps(data) : null}
      summary={<RiskRuleSummary risk={risk} />}
      details={<RiskDetails data={data} />}
    />
  );
}

function RiskDetails({ data }: { data: RulesPageData }) {
  return (
    <div className="space-y-6">
      <RiskRuleDetails risk={data.active.risk} />
      <div className="space-y-2">
        <SectionTitle title="ลำดับการช่วยเหลือบนแผนที่" tone="mint" />
        <HelpOrderRules />
      </div>
      <History data={data} />
    </div>
  );
}
