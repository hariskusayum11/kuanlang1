import type { DepthBinCount } from "@/domain/flood/depth-scale";
import { heatVar } from "@/domain/flood/depth-scale";
import type { CommunityComparisonRow } from "@/lib/dashboard/questionnaire-analytics";

// กราฟของแดชบอร์ด (Owner Decision 2026-10-19 ข้อ 2) — SVG/CSS ล้วน ไม่เพิ่ม charting library
// ทุกกราฟแสดงตัวหาร (รวมกี่หลัง/กี่คน) และค่า 0 แสดงเป็น 0 จริง ไม่ซ่อน

const nf = (n: number) => n.toLocaleString("th-TH");
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export interface StackSegment {
  key: string;
  label: string;
  hint?: string;
  count: number;
  /** คลาสสีพื้นจาก Token เช่น "bg-red-600" */
  colorClass: string;
}

/** แท่งซ้อนเดียว + คำอธิบายพร้อมจำนวนและร้อยละ — ใช้กับสัดส่วนที่รวมกันเป็นทั้งหมด */
export function StackedBar({ segments, unit, totalLabel }: { segments: StackSegment[]; unit: string; totalLabel: string }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</p>;
  }
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={segments.map((s) => `${s.label} ${nf(s.count)} ${unit}`).join(", ")}>
        {segments.filter((s) => s.count > 0).map((s) => (
          <div key={s.key} className={`h-full ${s.colorClass}`} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label} ${nf(s.count)} ${unit}`} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <i className={`mt-0.5 h-3 w-3 shrink-0 rounded-sm ${s.colorClass}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold text-slate-700">{s.label}</span>
                {s.hint ? <span className="block text-[11px] text-slate-400">{s.hint}</span> : null}
              </span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-slate-800">
              {nf(s.count)} {unit} <span className="font-normal text-slate-400">({pct(s.count, total)}%)</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">{totalLabel} {nf(total)} {unit}</p>
    </div>
  );
}

/** การกระจายระดับน้ำ 9 ช่วง — สีเดียวกับฮีตแมปบนแผนที่ (โทนน้ำ) */
export function DepthHistogram({ bins }: { bins: DepthBinCount[] }) {
  const total = bins.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูลระดับน้ำ</p>;
  }
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={bins.map((b) => `${b.label} ${nf(b.count)} หลัง`).join(", ")}>
        {bins.map((b) => (
          <div key={b.level} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-bold tabular-nums text-slate-600">{b.count > 0 ? nf(b.count) : ""}</span>
            <div
              className="w-full rounded-t-md"
              style={{ height: `${b.count > 0 ? Math.max(4, (b.count / max) * 100) : 2}%`, backgroundColor: `var(${heatVar(b.level)})`, opacity: b.count > 0 ? 1 : 0.35 }}
              title={`${b.label}: ${nf(b.count)} หลัง`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bins.map((b) => (
          <span key={b.level} className="min-w-0 flex-1 text-center text-[9px] leading-tight text-slate-500">{b.label.replace(" ม.", "")}</span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">หน่วย: เมตร · รวม {nf(total)} หลังที่เคยท่วมและตอบระดับน้ำ · แท่งตามสีเดียวกับฮีตแมปบนแผนที่</p>
    </div>
  );
}

/** ตารางเปรียบเทียบรายชุมชน — แท่งเล็กในเซลล์ให้เทียบด้วยตาได้เร็ว */
export function CommunityComparison({ rows }: { rows: CommunityComparisonRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">ไม่มีข้อมูลตามตัวกรอง</p>;
  }
  const maxHouseholds = Math.max(1, ...rows.map((r) => r.households));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold text-slate-400">
            <th className="py-2 pr-3">ชุมชน</th>
            <th className="py-2 pr-3">ครัวเรือน</th>
            <th className="py-2 pr-3 text-right">กลุ่มเปราะบาง</th>
            <th className="py-2 pr-3">เคยน้ำท่วม</th>
            <th className="py-2">พื้นต่ำกว่าถนน</th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-slate-50">
          {rows.map((r) => (
            <tr key={r.communityId}>
              <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.label}</td>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-20 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.households / maxHouseholds) * 100}%` }} /></span>
                  <span className="tabular-nums">{nf(r.households)}</span>
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{nf(r.vulnerablePeople)} คน</td>
              <td className="py-2.5 pr-3 tabular-nums">
                {nf(r.flooded)} <span className="text-xs text-slate-400">({pct(r.flooded, r.households)}% จาก {nf(r.households)})</span>
              </td>
              <td className="py-2.5 tabular-nums">
                {r.floorAnswered > 0 ? (
                  <>{nf(r.belowRoad)} <span className="text-xs text-slate-400">({pct(r.belowRoad, r.floorAnswered)}% จาก {nf(r.floorAnswered)} ที่ตอบ)</span></>
                ) : (
                  <span className="text-slate-400">ยังไม่มีคำตอบ</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
