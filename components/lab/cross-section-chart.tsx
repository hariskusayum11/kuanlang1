// ภาพตัดขวางคลองจริง + ระดับน้ำ — SVG ล้วน ไม่มี hook (Server/Client ได้)
// รูปคลองจากการสำรวจของกรมชลประทาน (domain/water/cross-section.ts) · น้ำวาดตามรูปคลองจริงทุกระดับ
// สีใช้คลาส Token · ไม่มี <defs>/gradient
import { waterPolygons, type ProfilePoint } from "@/domain/water/cross-section";

const W = 760;
const H = 400;
const PLOT = { x0: 52, x1: 744, y0: 18, y1: 368 };
// ขอบบนเผื่อหลังคาบ้านริมตลิ่ง (ตลิ่ง ~8.5 + บ้าน 3.5 + หลังคา 1.6)
const DOMAIN = { xMin: -30, xMax: 103, yMin: -3, yMax: 14 };

const sx = (m: number) => PLOT.x0 + ((m - DOMAIN.xMin) / (DOMAIN.xMax - DOMAIN.xMin)) * (PLOT.x1 - PLOT.x0);
const sy = (msl: number) => PLOT.y1 - ((msl - DOMAIN.yMin) / (DOMAIN.yMax - DOMAIN.yMin)) * (PLOT.y1 - PLOT.y0);
/** แนวตั้งขยายกี่เท่าเมื่อเทียบแนวนอน — บอกผู้อ่านตรง ๆ */
export const VERTICAL_EXAGGERATION = Math.round(
  ((PLOT.y1 - PLOT.y0) / (DOMAIN.yMax - DOMAIN.yMin)) / ((PLOT.x1 - PLOT.x0) / (DOMAIN.xMax - DOMAIN.xMin)) * 10,
) / 10;

const path = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(" ");
const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** บ้านริมคลองเป็นภาพประกอบขนาดตามจริงในหน่วยเมตร (กว้าง × สูง) */
function House({ x, ground, w, h, storeys }: { x: number; ground: number; w: number; h: number; storeys: 1 | 2 }) {
  const left = sx(x);
  const right = sx(x + w);
  const top = sy(ground + h);
  const base = sy(ground);
  const roof = sy(ground + h + 1.6);
  return (
    <g>
      <rect x={left} y={top} width={right - left} height={base - top} className="fill-white stroke-slate-400" strokeWidth={1.5} />
      <path d={`M${left - 4} ${top} L${(left + right) / 2} ${roof} L${right + 4} ${top} Z`} className="fill-slate-500" />
      {Array.from({ length: storeys }, (_, i) => {
        const floorTop = sy(ground + (h / storeys) * (i + 1)) + 8;
        return <rect key={i} x={left + (right - left) * 0.2} y={floorTop} width={(right - left) * 0.6} height={14} className="fill-sky-200" />;
      })}
    </g>
  );
}

export function CrossSectionChart({
  points,
  levelMsl,
  bankMsl,
  historyMark,
}: {
  points: readonly ProfilePoint[];
  levelMsl: number | null;
  bankMsl: number | null;
  historyMark: { levelMsl: number; label: string } | null;
}) {
  const ground = [...points, [DOMAIN.xMax, DOMAIN.yMin] as const, [DOMAIN.xMin, DOMAIN.yMin] as const];
  const water = waterPolygons(points, levelMsl);
  const gridY = Array.from({ length: 8 }, (_, i) => -2 + i * 2);
  const leftBank = points.find((p) => p[0] === -20)?.[1] ?? 8.4;
  const rightBank = points.find((p) => p[0] === 88)?.[1] ?? 8.1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`ภาพตัดขวางคลองอู่ตะเภาที่หาดใหญ่ใน ระดับน้ำ ${levelMsl === null ? "ไม่มีข้อมูล" : `${fmt(levelMsl)} เมตร รทก.`}`}>
      {/* ตาราง + แกนระดับ */}
      {gridY.map((y) => (
        <g key={y}>
          <line x1={PLOT.x0} x2={PLOT.x1} y1={sy(y)} y2={sy(y)} className="stroke-slate-200" strokeWidth={1} />
          <text x={PLOT.x0 - 8} y={sy(y) + 4} textAnchor="end" fontSize={11} className="fill-slate-400">{y}</text>
        </g>
      ))}
      <text x={12} y={PLOT.y0 + 4} fontSize={11} className="fill-slate-400">ม.รทก.</text>

      {/* บ้านริมตลิ่ง (ภาพประกอบ) */}
      <House x={-27} ground={leftBank} w={11} h={3.6} storeys={1} />
      <House x={84} ground={rightBank} w={10} h={3.4} storeys={1} />

      {/* น้ำ — วาดก่อนพื้นเพื่อให้เส้นพื้นอยู่บน · ล้นตลิ่งจะเห็นท่วมบ้านตามจริง */}
      {water.map((poly, i) => (
        <path key={i} d={`${path(poly)} Z`} className="fill-brand-500/70" />
      ))}
      {water.map((poly, i) => {
        const xs = poly.map((p) => p[0]);
        return <line key={`s${i}`} x1={sx(Math.min(...xs))} x2={sx(Math.max(...xs))} y1={sy(levelMsl!)} y2={sy(levelMsl!)} className="stroke-sky-200" strokeWidth={3} />;
      })}

      {/* พื้นดินตามรูปตัดขวางจริง */}
      <path d={`${path(ground)} Z`} className="fill-sun-800/25 stroke-ink-800" strokeWidth={2} strokeLinejoin="round" />

      {/* ระดับตลิ่ง */}
      {bankMsl !== null ? (
        <g>
          <line x1={PLOT.x0} x2={PLOT.x1} y1={sy(bankMsl)} y2={sy(bankMsl)} className="stroke-ink-800" strokeWidth={1.5} strokeDasharray="8 6" />
          <text x={sx(30)} y={sy(bankMsl) - 6} textAnchor="middle" fontSize={13} fontWeight={700} className="fill-ink-900 stroke-white" strokeWidth={4} style={{ paintOrder: "stroke" }}>
            ตลิ่ง {fmt(bankMsl)} ม.รทก.
          </text>
        </g>
      ) : null}

      {/* น้ำท่วมในอดีต */}
      {historyMark ? (
        <g>
          <line x1={PLOT.x0} x2={PLOT.x1} y1={sy(historyMark.levelMsl)} y2={sy(historyMark.levelMsl)} className="stroke-red-600" strokeWidth={2} strokeDasharray="4 5" />
          <text x={sx(30)} y={sy(historyMark.levelMsl) - 7} textAnchor="middle" fontSize={13} fontWeight={700} className="fill-red-600 stroke-white" strokeWidth={4} style={{ paintOrder: "stroke" }}>
            {historyMark.label}
          </text>
        </g>
      ) : null}

      {/* ป้ายระดับน้ำ */}
      {levelMsl !== null && water.length ? (
        <g transform={`translate(${sx(38)} ${Math.min(sy(levelMsl) + 26, PLOT.y1 - 8)})`}>
          <rect x={-58} y={-15} width={116} height={24} rx={12} className="fill-white/90" />
          <text x={0} y={2} textAnchor="middle" fontSize={13} fontWeight={800} className="fill-brand-800">
            น้ำ {fmt(levelMsl)} ม.รทก.
          </text>
        </g>
      ) : null}
      {levelMsl === null ? (
        <text x={W / 2} y={sy(4)} textAnchor="middle" fontSize={14} className="fill-slate-500">ไม่มีข้อมูลระดับน้ำ</text>
      ) : null}

      {/* มาตราส่วนแนวนอน */}
      <g transform={`translate(${sx(-28)} ${PLOT.y1 + 20})`}>
        <line x1={0} x2={sx(-8) - sx(-28)} y1={0} y2={0} className="stroke-slate-500" strokeWidth={2} />
        <text x={sx(-8) - sx(-28) + 6} y={4} fontSize={11} className="fill-slate-500">20 ม.</text>
      </g>
    </svg>
  );
}
