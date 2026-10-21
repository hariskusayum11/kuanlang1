"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HELP_URGENCY_ORDER, HELP_URGENCY_WORD, type HelpUrgency } from "@/domain/geo/help-priority";
import { RISK_LEVEL_LABEL } from "@/domain/rules/priority-rules";
import type { HelpCase, HelpPriorityResult } from "@/lib/risk/help-priority";

const PAGE = 50;
const nf = (value: number) => value.toLocaleString("th-TH");

function rankClass(urgency: HelpUrgency): string {
  return `${urgency === "none" ? "map-help-none" : `map-urgency map-urgency-${urgency}`} map-help-rank map-help-static shrink-0`;
}

/**
 * รายการ "ลำดับการช่วยเหลือ" ข้างแผนที่ (docs/40) — ทุกบ้านที่ตรวจแล้วตามตัวกรอง
 * กดรายการ → แผนที่ซูมไปบ้านนั้นและเปิดกล่องข้อมูล · บ้านที่ไม่มีพิกัดยังอยู่ในรายการ (กดซูมไม่ได้)
 */
export function HelpCaseList({
  result,
  on,
  onToggle,
  onPick,
}: {
  result: HelpPriorityResult;
  on: boolean;
  onToggle: (on: boolean) => void;
  onPick: (item: HelpCase) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const { cases, rules } = result;
  const summary = useMemo(() => {
    const counts = Object.fromEntries(HELP_URGENCY_ORDER.map((u) => [u, 0])) as Record<HelpUrgency, number>;
    let noCoordinate = 0;
    for (const item of cases) {
      counts[item.urgency] += 1;
      if (item.lat == null) noCoordinate += 1;
    }
    return { counts, noCoordinate };
  }, [cases]);

  return (
    <div className="space-y-3 px-4 py-3">
      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-slate-100 px-3 py-2">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-brand-600" />
        <span className="flex-1 text-sm font-bold text-slate-800">แสดงหมุดลำดับบนแผนที่</span>
      </label>

      <p className="text-[11px] leading-relaxed text-slate-500">
        เรียงจากบ้านที่มีคนวิกฤตก่อน แล้วตามคะแนนความเสี่ยงและความมั่นใจของข้อมูล ·{" "}
        <Link href="/priority-rules" className="font-semibold text-brand-700 underline underline-offset-2">
          กฎเวอร์ชัน {rules.versionNo || "ตั้งต้น"}
        </Link>
        {rules.isDraft ? <span className="badge badge-warning ml-1">ร่าง ยังไม่รับรอง</span> : null}
      </p>

      <ul className="flex flex-wrap gap-1.5" aria-label="จำนวนครัวเรือนตามความเร่งด่วน">
        {HELP_URGENCY_ORDER.filter((u) => summary.counts[u] > 0).map((u) => (
          <li key={u} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <span className={`${rankClass(u)} scale-[0.6]`} aria-hidden="true" />
            {HELP_URGENCY_WORD[u]} <b className="tabular-nums text-ink-900">{nf(summary.counts[u])}</b>
          </li>
        ))}
      </ul>
      {summary.noCoordinate ? (
        <p className="text-[11px] font-semibold text-sun-800">ไม่มีพิกัด {nf(summary.noCoordinate)} หลัง — อยู่ในรายการแต่ไม่มีหมุด</p>
      ) : null}

      {cases.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">ไม่มีครัวเรือนที่ตรวจแล้วในพื้นที่ที่เลือก</p>
      ) : (
        <ol className="space-y-1.5">
          {cases.slice(0, shown).map((item) => {
            const t = item.triage;
            const people = t.P1 + t.P2 + t.P3 + t.UNASSESSED;
            const hasPoint = item.lat != null && item.lng != null;
            return (
              <li key={item.householdId}>
                <button
                  type="button"
                  disabled={!hasPoint}
                  onClick={() => onPick(item)}
                  className="flex w-full items-start gap-2.5 rounded-xl border-2 border-slate-100 px-2.5 py-2 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40 disabled:cursor-default disabled:hover:border-slate-100 disabled:hover:bg-transparent"
                  title={hasPoint ? "ซูมไปที่บ้านนี้" : "ยังไม่มีพิกัด"}
                >
                  <span className={rankClass(item.urgency)} aria-label={`ลำดับ ${item.rank}`}>{nf(item.rank)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {item.houseNo ? `บ้านเลขที่ ${item.houseNo}` : "ไม่ระบุบ้านเลขที่"}{item.mooNo ? ` · หมู่ ${item.mooNo}` : ""}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">{item.communityName} · {item.sheetNo}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-600">
                      {people ? <>{HELP_URGENCY_WORD[item.urgency]} · กลุ่มเปราะบาง {nf(people)} คน</> : HELP_URGENCY_WORD.none}
                    </span>
                    <span className="block text-[11px] text-slate-600">
                      ความเสี่ยง {item.riskLevel ? RISK_LEVEL_LABEL[item.riskLevel] : "ข้อมูลไม่พอ"} · {nf(item.absoluteScore)} คะแนน · มั่นใจ {Math.round(item.confidence * 100)}%
                    </span>
                  </span>
                  {!hasPoint ? <span className="badge badge-neutral shrink-0">ไม่มีพิกัด</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {cases.length > shown ? (
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => setShown((n) => n + PAGE)}>
          แสดงเพิ่ม ({nf(Math.min(PAGE, cases.length - shown))} จากที่เหลือ {nf(cases.length - shown)} หลัง)
        </button>
      ) : null}
    </div>
  );
}
