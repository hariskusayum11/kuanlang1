import type { CoverageResult } from "@/domain/coverage/coverage";
import { gaugeArc, targetTick, clampPercent } from "@/domain/coverage/gauge-geometry";

/**
 * เกจ Coverage — SVG ล้วน ไม่มี charting library (ตาม Tech Stack ที่กำหนด)
 *
 * กฎที่ต้องรักษา:
 *  - NOT_CALCULABLE → แสดง "ยังไม่ทราบ" ห้ามวาดเป็น 0% (คำตัดสินเจ้าของ #1)
 *  - เกณฑ์ผ่านใช้ strict `>` จาก domain layer — คอมโพเนนต์ไม่คำนวณเอง
 *  - ต้องมี Denominator กำกับเสมอ (ผู้เรียกส่งผ่าน caption)
 *  - ไม่มี hook / ไม่มี <defs> → ใช้ได้ทั้ง Server และ Client Component
 */
export function CoverageGauge({
  coverage,
  target,
  caption,
  size = 168,
}: {
  coverage: CoverageResult;
  target: number;
  /** ตัวเศษ/ตัวหารแบบอ่านออก เช่น "120 / 480 ครัวเรือน" */
  caption?: string;
  size?: number;
}) {
  const known = coverage.kind === "CALCULATED";
  const percent = known ? coverage.percent : 0;
  const passed = known && coverage.meetsTarget;

  // เรขาคณิต: ครึ่งวงกลมกว้าง 100 หน่วย สูง 58 หน่วย (เผื่อความหนาราง)
  const cx = 50;
  const cy = 52;
  const r = 40;
  const thickness = 11;

  const arc = gaugeArc(cx, cy, r, percent);
  const tick = targetTick(cx, cy, r, thickness, target);
  const track = gaugeArc(cx, cy, r, 100);

  const valueColor = !known
    ? "text-slate-400"
    : passed
      ? "text-emerald-700"
      : "text-sun-800";

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 100 62"
        width={size}
        height={(size * 62) / 100}
        role="img"
        aria-label={
          known
            ? `ความครอบคลุม ${percent.toFixed(1)} เปอร์เซ็นต์ จากเป้าหมายมากกว่า ${target} เปอร์เซ็นต์`
            : "ยังไม่ทราบความครอบคลุม เพราะยังไม่มีจำนวนครัวเรือนทั้งหมด"
        }
      >
        {/* ราง */}
        <path
          d={track.d}
          fill="none"
          stroke="var(--color-slate-200)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        {/* ส่วนที่ทำได้ */}
        {arc.d && (
          <path
            d={arc.d}
            fill="none"
            stroke={passed ? "var(--color-emerald-500)" : "var(--color-sun-400)"}
            strokeWidth={thickness}
            strokeLinecap="round"
          />
        )}
        {/* ขีดเป้าหมาย */}
        <line
          x1={tick.from.x}
          y1={tick.from.y}
          x2={tick.to.x}
          y2={tick.to.y}
          stroke="var(--color-ink-900)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>

      <p className={`-mt-1 text-[26px] font-bold leading-none tabular-nums ${valueColor}`}>
        {known ? `${percent.toFixed(1)}%` : "ยังไม่ทราบ"}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
        เป้า &gt; {target}%
        {known && (
          <>
            {" · "}
            <span className={passed ? "text-emerald-700" : "text-sun-800"}>
              {passed ? "ผ่านเป้า" : `ขาดอีก ${(target - clampPercent(percent)).toFixed(1)}%`}
            </span>
          </>
        )}
      </p>
      {caption && (
        <p className="mt-1 text-[11px] tabular-nums text-slate-400">{caption}</p>
      )}
    </div>
  );
}
