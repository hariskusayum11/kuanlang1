// ธงเตือนภัยชุมชน — ไอคอนและคำอธิบายที่ใช้ร่วมหลายหน้า (SVG ล้วน ไม่มี hook · Server/Client ได้)
import type { EstimatedFlag, FlagLevel } from "@/domain/water/community-flags";

// สีธงตามความหมายของระบบ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · อุทกภัย = red (วิกฤต) · ไม่มีข้อมูล = slate
const FLAG_FILL: Record<FlagLevel | "UNKNOWN", string> = {
  GREEN: "fill-emerald-500",
  YELLOW: "fill-sun-400",
  RED: "fill-red-600",
  RED_SIREN: "fill-red-600",
  UNKNOWN: "fill-slate-300",
};

export const ESTIMATED_FLAG_LABEL: Record<EstimatedFlag, string> = {
  GREEN: "ธงเขียว",
  YELLOW: "ธงเหลือง",
  RED: "ธงแดง",
  UNKNOWN: "ไม่ทราบ",
};

export function Flag({ level, className = "h-12 w-12" }: { level: FlagLevel | "UNKNOWN"; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden>
      <rect x={8} y={4} width={3} height={42} rx={1.5} className="fill-slate-400" />
      <circle cx={9.5} cy={4} r={3} className="fill-slate-300" />
      {/* ธงสามเหลี่ยม (ชายธง) — ไม่ให้คล้ายธงชาติ */}
      <path d="M11 6 Q26 10 41 16.5 Q26 23 11 27 Z" className={FLAG_FILL[level]} />
      {level === "RED_SIREN" ? (
        <g>
          <path d="M36 34 a6 6 0 0 1 12 0 v6 h-12 Z" className="fill-alert-500" />
          <rect x={34} y={40} width={16} height={3} rx={1} className="fill-ink-800" />
        </g>
      ) : null}
    </svg>
  );
}
