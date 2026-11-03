// แผง "ธงดูจาก 3 สะพาน" — Server/Client ได้ (ไม่มี hook)
// แต่ละสะพาน: แถบ เขียว → เหลือง → แดง ตามเกณฑ์ของกลุ่มสองคลองควนลัง + หมุดระดับน้ำตอนนี้
// ให้เห็นทันทีว่าทำไมได้ธงสีนี้ และอีกกี่เมตรถึงธงถัดไป (ไม่ต้องไปเปิดตาราง)
import { flagBarScale, type BridgeFlagEstimate } from "@/domain/water/community-flags";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function distanceText(b: BridgeFlagEstimate): string {
  if (b.levelMsl === null || b.yellowMsl === null || b.redMsl === null) return "ไม่มีข้อมูล";
  if (b.flag === "GREEN") return `อีก ${fmt(b.yellowMsl - b.levelMsl)} ม. ถึงธงเหลือง`;
  if (b.flag === "YELLOW") return `อีก ${fmt(b.redMsl - b.levelMsl)} ม. ถึงธงแดง`;
  return "ถึงเกณฑ์ธงแดงแล้ว";
}

export function BridgeFlagPanel({
  bridges,
  measuredAt,
  notes,
  closestBridge,
}: {
  bridges: BridgeFlagEstimate[];
  /** เวลาวัดล่าสุด (เวลาไทย "YYYY-MM-DD HH:mm") ตามรหัสสถานี */
  measuredAt: Record<string, string | null>;
  /** หมายเหตุเพิ่มรายสะพาน (เช่น เวลาที่ยอดน้ำเดินทาง) ตามรหัสสถานี */
  notes: Record<string, string | null>;
  /** ชื่อสะพานที่ใกล้เกณฑ์ธงถัดไปที่สุด — เน้นแถวนั้น */
  closestBridge: string | null;
}) {
  return (
    <div className="rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-200 backdrop-blur-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink-900">ธงดูจากระดับน้ำที่ 3 สะพาน</p>
        <p className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-block h-2 w-4 rounded-sm bg-emerald-300" />เขียว
          <span className="inline-block h-2 w-4 rounded-sm bg-sun-300" />เหลือง
          <span className="inline-block h-2 w-4 rounded-sm bg-red-300" />แดง
          <span className="inline-block h-3 w-1 rounded-sm bg-ink-900" />น้ำตอนนี้
        </p>
      </div>
      <ul className="mt-3 space-y-3">
        {bridges.map((b) => {
          const code = b.criterion.stationCode;
          const scale = flagBarScale(b);
          const at = measuredAt[code];
          const highlight = closestBridge === b.criterion.bridge;
          return (
            <li key={code} className={highlight ? "-mx-2 rounded-2xl bg-mist px-2 py-1.5" : ""}>
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Flag level={b.flag} className="h-5 w-5" />
                  <b className="text-sm text-ink-900">{b.criterion.bridge}</b>
                  <span className="truncate text-xs text-slate-500">{b.criterion.canal}</span>
                </span>
                <span className={`text-sm font-bold ${b.flag === "RED" ? "text-red-600" : "text-ink-900"}`}>
                  {ESTIMATED_FLAG_LABEL[b.flag]} · {distanceText(b)}
                </span>
              </div>
              {scale ? (
                <div className="relative mt-1.5 h-3" aria-hidden>
                  <div className="absolute inset-0 flex overflow-hidden rounded-full">
                    <span className="h-full bg-emerald-300" style={{ width: `${scale.yellowPct}%` }} />
                    <span className="h-full bg-sun-300" style={{ width: `${scale.redPct - scale.yellowPct}%` }} />
                    <span className="h-full flex-1 bg-red-300" />
                  </div>
                  <span className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full bg-ink-900 ring-2 ring-white" style={{ left: `${scale.levelPct}%` }} />
                </div>
              ) : (
                <div className="mt-1.5 h-3 rounded-full bg-slate-200" aria-hidden />
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                {b.levelMsl !== null ? `น้ำ ${fmt(b.levelMsl)} ม.รทก.` : "ไม่มีข้อมูลระดับน้ำ"}
                {at ? ` · วัดเมื่อ ${at.split(" ")[1] ?? at} น.` : ""}
                {notes[code] ? ` · ${notes[code]}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
