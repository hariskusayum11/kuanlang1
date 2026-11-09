// ธงเตือนภัยชุมชน — ไอคอนที่ใช้ร่วมหลายหน้า (SVG ล้วน ไม่มี hook · Server/Client ได้)
// ระดับธงมาจากเกณฑ์ที่แก้ได้ในระบบ (docs/44) — สีจำกัดชุดตามความหมายสีของระบบ
import type { FlagColor, FlagLevelDef } from "@/domain/water/community-flags";

// ปกติ = มิ้นต์ · เฝ้าระวัง = sun · ต้องลงมือ = alert · วิกฤต = red · ไม่ทราบ = slate
export const FLAG_FILL: Record<FlagColor, string> = {
  green: "fill-emerald-500",
  yellow: "fill-sun-400",
  orange: "fill-alert-500",
  red: "fill-red-600",
};
/** สีตัวหนังสือชื่อธง (บนพื้นสว่าง) */
export const FLAG_TEXT: Record<FlagColor, string> = {
  green: "text-emerald-600",
  yellow: "text-sun-700",
  orange: "text-alert-600",
  red: "text-red-600",
};
/** สีพื้นจุดเล็ก/แถบ (คำอธิบายสี ตาราง) */
export const FLAG_BG: Record<FlagColor, string> = {
  green: "bg-emerald-500",
  yellow: "bg-sun-400",
  orange: "bg-alert-500",
  red: "bg-red-600",
};

export const UNKNOWN_FLAG_LABEL = "ไม่ทราบ";
export const flagLabel = (level: FlagLevelDef | null) => level?.label ?? UNKNOWN_FLAG_LABEL;

export function Flag({ level, className = "h-12 w-12" }: { level: FlagLevelDef | null; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden>
      <rect x={8} y={4} width={3} height={42} rx={1.5} className="fill-slate-400" />
      <circle cx={9.5} cy={4} r={3} className="fill-slate-300" />
      {/* ธงสามเหลี่ยม (ชายธง) — ไม่ให้คล้ายธงชาติ */}
      <path d="M11 6 Q26 10 41 16.5 Q26 23 11 27 Z" className={level ? FLAG_FILL[level.color] : "fill-slate-300"} />
      {level?.siren ? (
        <g>
          <path d="M36 34 a6 6 0 0 1 12 0 v6 h-12 Z" className="fill-alert-500" />
          <rect x={34} y={40} width={16} height={3} rx={1} className="fill-ink-800" />
        </g>
      ) : null}
    </svg>
  );
}
