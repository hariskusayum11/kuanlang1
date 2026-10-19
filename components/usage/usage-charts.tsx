// กราฟของหน้าสถิติการใช้งาน (docs/36) — HTML/CSS ล้วน ไม่มี charting library
// ไม่มี hook จึงเรนเดอร์ได้ทั้ง Server และ Client Component
// สีซีรีส์ผ่าน validator ของ dataviz แล้ว: brand-400/brand-600 และ brand-500/emerald-500
// ตัวเลขอยู่ในตัวหนังสือสี slate เสมอ — สีของแท่งบอกแค่ "ซีรีส์ไหน"

import type { DailyPoint, RankedList } from "@/domain/usage/aggregate";

export type SeriesTone = "brand-400" | "brand-500" | "brand-600" | "emerald-500";

const FILL: Record<SeriesTone, string> = {
  "brand-400": "bg-brand-400",
  "brand-500": "bg-brand-500",
  "brand-600": "bg-brand-600",
  "emerald-500": "bg-emerald-500",
};

export interface SeriesDef<K extends string> {
  key: K;
  label: string;
  tone: SeriesTone;
}

const thaiNumber = (n: number) => n.toLocaleString("th-TH");

/** กล่องตัวเลขของแท่งริมซ้าย/ขวาต้องไม่ล้นออกนอกการ์ด */
function tooltipAnchor(index: number, length: number): string {
  if (index < 4) return "left-0";
  if (index >= length - 4) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

/** "2026-10-19" → "19 ต.ค." (วันตามปฏิทินไทยที่คำนวณไว้แล้ว จึงแสดงแบบ UTC) */
export function shortThaiDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function longThaiDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function Legend<K extends string>({ series }: { series: readonly SeriesDef<K>[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${FILL[s.tone]}`} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * แท่งรายวันแบบซ้อน (stacked) — 1 แท่ง = 1 วัน · แกนเดียว เริ่มที่ 0
 * hover/focus แท่งเพื่อดูตัวเลขของวันนั้น · มีตารางให้เปิดดูแทนกราฟ (screen reader / พิมพ์)
 */
export function DailyBarChart<K extends string>({
  series,
  defs,
  caption,
  unit,
}: {
  series: readonly DailyPoint<K>[];
  defs: readonly SeriesDef<K>[];
  caption: string;
  unit: string;
}) {
  const max = Math.max(0, ...series.map((point) => point.total));
  const middle = series[Math.floor((series.length - 1) / 2)];
  return (
    <figure className="space-y-3">
      <Legend series={defs} />
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="tabular-nums">{thaiNumber(max)}</span>
          <span className="h-px flex-1 bg-slate-100" />
        </div>
        <div
          className="flex h-36 items-end gap-[2px] border-b border-slate-200 pt-5"
          role="img"
          aria-label={`${caption}: รวม ${thaiNumber(series.reduce((s, p) => s + p.total, 0))} ${unit} ใน ${series.length} วัน`}
        >
          {series.map((point, index) => (
            <div
              key={point.day}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
              tabIndex={0}
              aria-label={`${longThaiDay(point.day)} ${defs.map((d) => `${d.label} ${thaiNumber(point.values[d.key])}`).join(" · ")}`}
            >
              {max > 0 && point.total > 0 ? (
                <div
                  className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                  style={{ height: `${(point.total / max) * 100}%` }}
                >
                  {defs.map((d) =>
                    point.values[d.key] > 0 ? (
                      <div
                        key={d.key}
                        className={`${FILL[d.tone]} min-h-[2px] group-hover:opacity-80 group-focus:opacity-80`}
                        style={{ flexGrow: point.values[d.key], flexBasis: 0 }}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}
              <div
                className={`pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max rounded-lg ${tooltipAnchor(index, series.length)} bg-ink-900 px-2.5 py-1.5 text-[11px] leading-5 text-white shadow-lg group-hover:block group-focus:block`}
                aria-hidden="true"
              >
                <p className="font-bold">{longThaiDay(point.day)}</p>
                {defs.map((d) => (
                  <p key={d.key} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-sm ${FILL[d.tone]}`} />
                    {d.label} <span className="ml-auto pl-2 font-bold tabular-nums">{thaiNumber(point.values[d.key])}</span>
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{series[0] ? shortThaiDay(series[0].day) : ""}</span>
          <span>{middle ? shortThaiDay(middle.day) : ""}</span>
          <span>{series.length > 0 ? shortThaiDay(series[series.length - 1].day) : ""}</span>
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-brand-700">ดูเป็นตาราง</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border-2 border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">วันที่</th>
                {defs.map((d) => (
                  <th key={d.key} className="px-3 py-1.5 text-right font-semibold">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((point) => (
                <tr key={point.day} className="border-t border-slate-100">
                  <td className="px-3 py-1 text-slate-600">{longThaiDay(point.day)}</td>
                  {defs.map((d) => (
                    <td key={d.key} className="px-3 py-1 text-right tabular-nums text-slate-800">{thaiNumber(point.values[d.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** แท่งแนวนอนจัดอันดับ พร้อมสัดส่วนต่อยอดรวม (ตัวหาร) */
export function RankedBars({
  list,
  tone,
  empty,
  unit,
}: {
  list: RankedList;
  tone: SeriesTone;
  empty: string;
  unit: string;
}) {
  if (list.items.length === 0) {
    return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{empty}</p>;
  }
  const max = Math.max(1, ...list.items.map((item) => item.count));
  return (
    <div className="space-y-3">
      {list.items.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 break-words font-semibold leading-5 text-slate-600">{item.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold text-slate-800">{thaiNumber(item.count)}</span>
              <span className="ml-1.5 text-slate-400">{item.share.toLocaleString("th-TH")}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-400">
        ร้อยละจากยอดรวม {thaiNumber(list.total)} {unit}
        {list.distinct > list.items.length ? ` · แสดง ${list.items.length} จาก ${list.distinct} รายการ` : ""}
      </p>
    </div>
  );
}

/** ตัวเลขเดี่ยวพร้อมตัวหาร/ช่วงเวลา */
export function StatTile({
  label,
  value,
  denominator,
  tone = "brand",
}: {
  label: string;
  value: number | string;
  denominator: string;
  tone?: "brand" | "mint" | "sun" | "ink";
}) {
  const color = { brand: "text-brand-700", mint: "text-emerald-700", sun: "text-sun-800", ink: "text-ink-900" }[tone];
  return (
    <div className="rounded-2xl border-2 border-slate-100 bg-white px-4 py-3">
      <p className="text-xs font-semibold leading-5 text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${color}`}>
        {typeof value === "number" ? thaiNumber(value) : value}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{denominator}</p>
    </div>
  );
}
