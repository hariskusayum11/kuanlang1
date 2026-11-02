// ฉากภาพประกอบ "สองคลอง · หาดใหญ่" — SVG ล้วน ไม่มี hook (เรนเดอร์ได้ทั้ง Server/Client)
// -----------------------------------------------------------------------------
// ไกล → ใกล้: เขาคอหงส์ + พระพุทธมงคลมหาราช + กระเช้า → ตึกเมืองหาดใหญ่ → ทางรถไฟ (ชุมทางหาดใหญ่)
// → บ้าน 5 ชุมชนริมคลอง → กำแพงคลอง + ไม้วัดระดับน้ำ → ผิวน้ำ (ระดับจริงจากสถานี)
// บ้านและน้ำใช้มาตราส่วนเดียวกัน (domain/water/scene-geometry.ts) — น้ำสูงกว่าตลิ่งเท่าไร ในภาพก็ท่วมบ้านเท่านั้น
// สีใช้คลาส Token ทั้งหมด · ไม่มี <defs>/gradient (ตามข้อบังคับ SVG ของระบบ)
import { gaugeMarks, mslToSceneY, SCENE, wavePath } from "@/domain/water/scene-geometry";
import type { EstimatedFlag } from "@/domain/water/community-flags";

const GROUND = SCENE.bankY;
const M = SCENE.pxPerM;
const GAUGE_X = 850;

export interface SceneMark {
  levelMsl: number;
  label: string;
}

/** ตึกฉากหลัง [x, กว้าง, สูง] — ฐานอยู่ที่ทางรถไฟ */
const SKYLINE: Array<[number, number, number]> = [
  [520, 60, 90], [585, 44, 130], [634, 70, 70], [700, 52, 150], [756, 80, 100], [842, 46, 175],
  [893, 64, 120], [962, 40, 95], [1006, 72, 160], [1084, 50, 80], [1180, 58, 110], [1243, 44, 215],
  [1292, 76, 140], [1372, 48, 100], [1424, 66, 185], [1495, 54, 125], [1553, 60, 90],
];
const RAIL_Y = GROUND + 35;

function Buddha({ x, y }: { x: number; y: number }) {
  // พระพุทธมงคลมหาราช (ปางห้ามญาติ ประทับยืน) — ภาพย่อแบบเรียบ ไม่ใส่รายละเอียดเกินจำเป็น
  return (
    <g transform={`translate(${x} ${y})`} className="fill-white stroke-brand-300" strokeWidth={1}>
      <rect x={-16} y={-7} width={32} height={7} rx={2} />
      <path d="M-9 -7 L-12 -42 Q0 -48 12 -42 L9 -7 Z" />
      <rect x={-12} y={-37} width={7} height={9} rx={3} />
      <rect x={5} y={-37} width={7} height={9} rx={3} />
      <circle cx={0} cy={-52} r={6.5} />
      <path d="M-2.5 -57 L0 -64 L2.5 -57 Z" />
    </g>
  );
}

function Palm({ x, h }: { x: number; h: number }) {
  return (
    <g transform={`translate(${x} ${GROUND})`}>
      <path d={`M0 0 Q${-h * 0.08} ${-h * 0.5} ${h * 0.06} ${-h}`} className="fill-none stroke-slate-500" strokeWidth={6} strokeLinecap="round" />
      <g transform={`translate(${h * 0.06} ${-h})`} className="fill-emerald-600">
        <path d="M0 0 Q-34 -14 -58 10 Q-30 -2 0 0Z" />
        <path d="M0 0 Q34 -14 58 10 Q30 -2 0 0Z" />
        <path d="M0 0 Q-20 -30 -44 -30 Q-18 -18 0 0Z" />
        <path d="M0 0 Q20 -30 44 -30 Q18 -18 0 0Z" />
        <path d="M0 0 Q-4 -32 6 -46 Q2 -22 0 0Z" />
      </g>
    </g>
  );
}

function RubberTree({ x, h }: { x: number; h: number }) {
  return (
    <g transform={`translate(${x} ${GROUND})`}>
      <rect x={-4} y={-h * 0.62} width={8} height={h * 0.62} className="fill-slate-500" />
      <ellipse cx={0} cy={-h * 0.72} rx={h * 0.28} ry={h * 0.32} className="fill-emerald-600" />
      <ellipse cx={-h * 0.12} cy={-h * 0.8} rx={h * 0.16} ry={h * 0.18} className="fill-emerald-500" />
    </g>
  );
}

// ---------- บ้าน: มุมมอง 3/4 (เห็นผนังหน้า + ผนังข้างขวา + หลังคาเอียง) ----------
// ทุกความสูงเป็นเมตร × M — น้ำท่วมในภาพจึงเทียบกับประตู/หน้าต่างได้ตามจริง
const DX = 28;
const DY = -12;
const pts = (...p: Array<[number, number]>) => p.map(([a, b]) => `${a},${b}`).join(" ");
const back = ([a, b]: [number, number]): [number, number] => [a + DX, b + DY];

/** ผนังด้านข้าง (ขวา) ของกล่องที่ขอบขวาอยู่ที่ x */
function SideWall({ x, top, bottom, cls }: { x: number; top: number; bottom: number; cls: string }) {
  return <polygon points={pts([x, bottom], back([x, bottom]), back([x, top]), [x, top])} className={cls} />;
}

/** หลังคาจั่ว (จั่วหันหน้า) — แผ่นซ้ายเงา · แผ่นขวารับแสง · ลอนหลังคา · ปั้นลม */
function GableRoof({ x, w, top, rise, light, dark, trim, gable }: { x: number; w: number; top: number; rise: number; light: string; dark: string; trim: string; gable: string }) {
  const ov = 10;
  const apex: [number, number] = [x + w / 2, top - rise];
  const L: [number, number] = [x - ov, top + 5];
  const R: [number, number] = [x + w + ov, top + 5];
  return (
    <g>
      <polygon points={pts(apex, back(apex), back(L), L)} className={dark} />
      <polygon points={pts(apex, back(apex), back(R), R)} className={light} />
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={apex[0] + DX * t} y1={apex[1] + DY * t} x2={R[0] + DX * t} y2={R[1] + DY * t} className="stroke-white/25" strokeWidth={1.5} />
      ))}
      <polygon points={pts([x, top], apex, [x + w, top])} className={gable} />
      <circle cx={apex[0]} cy={top - rise * 0.42} r={5} className="fill-ink-800/40" />
      <polyline points={pts(L, apex, R)} className={`fill-none ${trim}`} strokeWidth={6} strokeLinejoin="round" />
    </g>
  );
}

function Win({ x, y, w, h, shutters }: { x: number; y: number; w: number; h: number; shutters?: string }) {
  return (
    <g>
      {shutters ? (
        <>
          <rect x={x - w * 0.42} y={y} width={w * 0.4} height={h} className={shutters} />
          <rect x={x + w * 1.02} y={y} width={w * 0.4} height={h} className={shutters} />
        </>
      ) : null}
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} className="fill-white stroke-slate-400" strokeWidth={1.5} />
      <rect x={x} y={y} width={w} height={h} className="fill-sky-200" />
      <rect x={x} y={y} width={w} height={h * 0.35} className="fill-sky-100" />
      <rect x={x + w / 2 - 1.5} y={y} width={3} height={h} className="fill-white" />
      <rect x={x} y={y + h / 2 - 1.5} width={w} height={3} className="fill-white" />
      <rect x={x - 6} y={y + h + 3} width={w + 12} height={5} className="fill-slate-400" />
    </g>
  );
}

function Door({ x, y, w, h, cls = "fill-ink-700" }: { x: number; y: number; w: number; h: number; cls?: string }) {
  return (
    <g>
      <rect x={x - 4} y={y - 4} width={w + 8} height={h + 4} className="fill-slate-300" />
      <rect x={x} y={y} width={w} height={h} className={cls} />
      <rect x={x + 5} y={y + 6} width={w - 10} height={h * 0.38} className="fill-white/10" />
      <circle cx={x + w - 7} cy={y + h * 0.55} r={2.5} className="fill-sun-300" />
    </g>
  );
}

/** ผนังไม้ตีซ้อน */
function Planks({ x, y, w, h, cls }: { x: number; y: number; w: number; h: number; cls: string }) {
  return (
    <>
      {Array.from({ length: Math.max(0, Math.floor(h / 10)) }, (_, i) => (
        <rect key={i} x={x} y={y + 10 + i * 10} width={w} height={1.5} className={cls} />
      ))}
    </>
  );
}

/** 1) บ้านไม้ใต้ถุนสูง — บันไดหน้าบ้าน · ตุ่มน้ำใต้ถุน (สอดคล้องกับโลโก้: บ้านอยู่เหนือน้ำ) */
function RaisedWoodHouse({ x, w }: { x: number; w: number }) {
  const stilt = 1.7 * M;
  const floor = GROUND - stilt;
  const top = floor - 2.6 * M;
  return (
    <g>
      <rect x={x} y={floor} width={w} height={stilt} className="fill-ink-900/15" />
      {[0.04, 0.5, 0.96].map((p) => (
        <rect key={p} x={x + w * p - 5} y={floor} width={10} height={stilt} className="fill-slate-500" />
      ))}
      <rect x={x + w + DX - 5} y={floor + DY} width={8} height={stilt - DY} className="fill-slate-600" />
      <ellipse cx={x + w * 0.4} cy={GROUND - 16} rx={14} ry={17} className="fill-sun-800" />
      <ellipse cx={x + w * 0.4} cy={GROUND - 31} rx={9} ry={3} className="fill-sun-900" />
      <SideWall x={x + w} top={top} bottom={floor} cls="fill-sun-300" />
      <rect x={x - 4} y={floor - 6} width={w + 8} height={8} className="fill-sun-800" />
      <rect x={x} y={top} width={w} height={floor - top - 6} className="fill-sun-100" />
      <Planks x={x} y={top} w={w} h={floor - top - 8} cls="fill-sun-300/80" />
      <rect x={x} y={top} width={w} height={9} className="fill-ink-900/20" />
      <Win x={x + w * 0.14} y={top + 26} w={w * 0.26} h={34} shutters="fill-sun-700" />
      <Door x={x + w * 0.6} y={floor - 6 - 2.05 * M} w={w * 0.26} h={2.05 * M} cls="fill-sun-800" />
      {/* บันได */}
      <polygon points={pts([x + w * 0.56, floor - 4], [x + w * 0.9, floor - 4], [x + w * 1.18, GROUND], [x + w * 0.84, GROUND])} className="fill-sun-700" />
      {[1, 2, 3, 4].map((i) => (
        <rect key={i} x={x + w * (0.56 + 0.07 * i)} y={floor - 4 + i * (stilt / 5)} width={w * 0.34} height={3} className="fill-sun-900/60" />
      ))}
      <GableRoof x={x} w={w} top={top} rise={58} light="fill-brand-600" dark="fill-brand-800" trim="stroke-brand-800" gable="fill-sun-200" />
    </g>
  );
}

/** 2) บ้านปูนชั้นเดียว หลังคาปั้นหยา — รั้วเตี้ย · แอร์ข้างบ้าน · ประตูสูง 2 ม. (ตัวเทียบความลึกน้ำ) */
function ConcreteHouse({ x, w }: { x: number; w: number }) {
  const top = GROUND - 3.1 * M;
  const rise = 52;
  const ov = 12;
  const FL: [number, number] = [x - ov, top + 5];
  const FR: [number, number] = [x + w + ov, top + 5];
  const RL: [number, number] = [x + w * 0.24, top - rise];
  const RR: [number, number] = [x + w * 0.76, top - rise];
  return (
    <g>
      <SideWall x={x + w} top={top} bottom={GROUND} cls="fill-slate-200" />
      <rect x={x + w + 6} y={GROUND - 1.4 * M + DY / 2} width={18} height={14} className="fill-slate-100 stroke-slate-400" strokeWidth={1} />
      <rect x={x} y={top} width={w} height={GROUND - top} className="fill-white" />
      <rect x={x} y={top} width={w} height={9} className="fill-ink-900/15" />
      <Door x={x + w * 0.12} y={GROUND - 2 * M} w={w * 0.24} h={2 * M} />
      <Win x={x + w * 0.5} y={top + 0.9 * M} w={w * 0.36} h={0.95 * M} />
      <polygon points={pts(RR, back(RR), back(FR), FR)} className="fill-slate-700" />
      <polygon points={pts(FL, RL, RR, FR)} className="fill-slate-500" />
      {[0.33, 0.66].map((t) => (
        <line key={t} x1={FL[0] + (RL[0] - FL[0]) * t} y1={FL[1] + (RL[1] - FL[1]) * t} x2={FR[0] + (RR[0] - FR[0]) * t} y2={FR[1] + (RR[1] - FR[1]) * t} className="stroke-white/15" strokeWidth={2} />
      ))}
      <line x1={RL[0]} y1={RL[1]} x2={back(RR)[0]} y2={back(RR)[1]} className="stroke-slate-700" strokeWidth={4} />
      <polyline points={pts(FL, RL, RR, FR)} className="fill-none stroke-slate-700" strokeWidth={4} strokeLinejoin="round" />
      {/* รั้วหน้าบ้าน 1.2 ม. */}
      <rect x={x - 18} y={GROUND - 1.2 * M} width={w * 0.62} height={1.2 * M} className="fill-slate-200" />
      {[0, 0.3, 0.6].map((p) => (
        <rect key={p} x={x - 18 + w * p} y={GROUND - 1.2 * M - 6} width={12} height={1.2 * M + 6} className="fill-slate-300" />
      ))}
      <rect x={x - 18} y={GROUND - 1.2 * M} width={w * 0.62} height={4} className="fill-slate-300" />
    </g>
  );
}

/** 3) ตึกแถวสองชั้น — ประตูม้วน · กันสาด · ระเบียงชั้นสอง · แท็งก์น้ำสแตนเลสบนดาดฟ้า */
function Shophouse({ x, w }: { x: number; w: number }) {
  const top = GROUND - 6.6 * M;
  const mid = GROUND - 3.3 * M;
  const tankX = x + w * 0.62;
  return (
    <g>
      <rect x={tankX - 2} y={top - 30} width={4} height={20} className="fill-slate-500" />
      <rect x={tankX + 26} y={top - 30} width={4} height={20} className="fill-slate-500" />
      <rect x={tankX - 6} y={top - 62} width={40} height={36} rx={8} className="fill-slate-300" />
      <rect x={tankX - 6} y={top - 50} width={40} height={3} className="fill-slate-400" />
      <rect x={tankX + 2} y={top - 60} width={7} height={32} rx={3} className="fill-white/60" />
      <SideWall x={x + w} top={top - 14} bottom={GROUND} cls="fill-slate-200" />
      <rect x={x} y={top} width={w} height={GROUND - top} className="fill-white" />
      <rect x={x - 4} y={top - 14} width={w + 8} height={16} className="fill-slate-300" />
      <Win x={x + w * 0.12} y={top + 22} w={w * 0.32} h={1.5 * M} />
      <Win x={x + w * 0.56} y={top + 22} w={w * 0.32} h={1.5 * M} />
      <rect x={x - 6} y={mid - 0.9 * M} width={w + 12} height={4} className="fill-slate-500" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={x - 4 + i * ((w + 8) / 12)} y={mid - 0.9 * M} width={2.5} height={0.9 * M} className="fill-slate-500" />
      ))}
      <rect x={x - 8} y={mid - 2} width={w + 16} height={8} className="fill-slate-400" />
      <polygon points={pts([x - 8, mid + 18], [x + w + 8, mid + 18], [x + w + 18, mid + 38], [x - 18, mid + 38])} className="fill-brand-600" />
      <rect x={x + w * 0.08} y={GROUND - 2.5 * M} width={w * 0.84} height={2.5 * M} className="fill-slate-400" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={x + w * 0.08} y={GROUND - 2.5 * M + 6 + i * 8.6} width={w * 0.84} height={2} className="fill-slate-500/70" />
      ))}
    </g>
  );
}

/** 4) บ้านสองชั้นครึ่งปูนครึ่งไม้ (แบบพบมากในภาคใต้) */
function HalfWoodHouse({ x, w }: { x: number; w: number }) {
  const mid = GROUND - 2.8 * M;
  const top = mid - 2.6 * M;
  return (
    <g>
      <SideWall x={x + w} top={mid} bottom={GROUND} cls="fill-slate-200" />
      <SideWall x={x + w + 6} top={top} bottom={mid + 6} cls="fill-sun-300" />
      <rect x={x} y={mid} width={w} height={GROUND - mid} className="fill-white" />
      <Door x={x + w * 0.1} y={GROUND - 2 * M} w={w * 0.24} h={2 * M} />
      <Win x={x + w * 0.52} y={mid + 0.75 * M} w={w * 0.34} h={0.9 * M} />
      <rect x={x - 6} y={top} width={w + 12} height={mid - top + 6} className="fill-sun-100" />
      <Planks x={x - 6} y={top} w={w + 12} h={mid - top} cls="fill-sun-300/80" />
      <rect x={x - 6} y={top} width={w + 12} height={9} className="fill-ink-900/20" />
      <rect x={x - 8} y={mid} width={w + 16} height={7} className="fill-sun-800" />
      <Win x={x + w * 0.1} y={top + 24} w={w * 0.3} h={0.95 * M} shutters="fill-sun-700" />
      <Win x={x + w * 0.6} y={top + 24} w={w * 0.3} h={0.95 * M} />
      <GableRoof x={x - 6} w={w + 12} top={top} rise={56} light="fill-slate-500" dark="fill-slate-700" trim="stroke-slate-700" gable="fill-sun-200" />
    </g>
  );
}

/** 5) บ้านปูนยกพื้นสูง — เสาปูน · บันไดข้าง */
function RaisedConcreteHouse({ x, w }: { x: number; w: number }) {
  const stilt = 1.5 * M;
  const floor = GROUND - stilt;
  const top = floor - 2.7 * M;
  return (
    <g>
      <rect x={x} y={floor} width={w} height={stilt} className="fill-ink-900/15" />
      {[0.06, 0.94].map((p) => (
        <rect key={p} x={x + w * p - 7} y={floor} width={14} height={stilt} className="fill-slate-300" />
      ))}
      <rect x={x + w + DX - 7} y={floor + DY} width={12} height={stilt - DY} className="fill-slate-400" />
      <SideWall x={x + w} top={top} bottom={floor} cls="fill-slate-200" />
      <rect x={x - 4} y={floor - 7} width={w + 8} height={9} className="fill-slate-400" />
      <rect x={x} y={top} width={w} height={floor - top - 7} className="fill-mist" />
      <rect x={x} y={top} width={w} height={9} className="fill-ink-900/15" />
      <Door x={x + w * 0.12} y={floor - 7 - 2 * M} w={w * 0.26} h={2 * M} cls="fill-brand-800" />
      <Win x={x + w * 0.54} y={top + 0.8 * M} w={w * 0.32} h={0.9 * M} />
      <polygon points={pts([x - 30, GROUND], [x - 4, floor - 2], [x + 10, floor - 2], [x - 16, GROUND])} className="fill-slate-300" />
      <GableRoof x={x} w={w} top={top} rise={52} light="fill-brand-500" dark="fill-brand-700" trim="stroke-brand-700" gable="fill-mist" />
    </g>
  );
}

/** เสาไฟฟ้า + สายไฟ (ภาพจำของถนนไทย) */
function PowerLines({ poles }: { poles: number[] }) {
  const topY = GROUND - 9 * M;
  const xs = [600, ...poles, SCENE.width];
  const wire = (y: number) =>
    xs.slice(1).map((x2, i) => `M${xs[i]} ${y} Q${(xs[i]! + x2) / 2} ${y + 26} ${x2} ${y}`).join(" ");
  return (
    <g>
      {[0, 14, 28].map((o) => (
        <path key={o} d={wire(topY + 10 + o)} className="fill-none stroke-ink-800/60" strokeWidth={1.4} />
      ))}
      {poles.map((x, i) => (
        <g key={x}>
          <rect x={x - 5} y={topY} width={10} height={GROUND - topY} className="fill-slate-400" />
          <rect x={x - 26} y={topY + 8} width={52} height={5} className="fill-slate-500" />
          {[-20, 0, 20].map((o) => (
            <rect key={o} x={x + o - 2.5} y={topY + 2} width={5} height={8} className="fill-white" />
          ))}
          {i === 0 ? <rect x={x + 5} y={topY + 70} width={22} height={34} rx={3} className="fill-slate-500" /> : null}
        </g>
      ))}
    </g>
  );
}

// สีธงตามความหมายของระบบ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · อุทกภัย = red · ไม่ทราบ = slate
const POLE_FLAG_FILL: Record<EstimatedFlag, string> = {
  GREEN: "fill-emerald-500",
  YELLOW: "fill-sun-400",
  RED: "fill-red-600",
  UNKNOWN: "fill-slate-300",
};
const POLE_FLAG_TEXT: Record<EstimatedFlag, string> = {
  GREEN: "ธงเขียว · โดยประมาณ",
  YELLOW: "ธงเหลือง · โดยประมาณ",
  RED: "ธงแดง · โดยประมาณ",
  UNKNOWN: "ธง · ไม่มีข้อมูล",
};

/** เสาธงเตือนภัยชุมชนริมคลอง — สีตามธงโดยประมาณ (ไม่ใช่ธงที่ประกาศ) · ธงสะบัดไปทางซ้าย (ฝั่งข้อความ) */
function FlagPole({ x, flag, animate }: { x: number; flag: EstimatedFlag; animate: boolean }) {
  const top = GROUND - 9.5 * M;
  return (
    <g>
      <rect x={x - 22} y={GROUND - 14} width={44} height={16} rx={3} className="fill-slate-400" />
      <rect x={x - 5} y={top} width={10} height={GROUND - top} rx={4} className="fill-slate-300" />
      <rect x={x - 1} y={top} width={3} height={GROUND - top} className="fill-white/60" />
      <circle cx={x} cy={top - 4} r={9} className="fill-slate-400" />
      <g transform={`translate(${2 * x} 0) scale(-1 1)`}>
        <g className={animate ? "animate-flag-wave" : undefined} style={{ transformBox: "fill-box", transformOrigin: "left center" }}>
          <path
            d={`M${x + 5} ${top + 6} C${x + 60} ${top - 14} ${x + 110} ${top + 30} ${x + 175} ${top + 8} L${x + 175} ${top + 112} C${x + 110} ${top + 134} ${x + 60} ${top + 90} ${x + 5} ${top + 110} Z`}
            className={POLE_FLAG_FILL[flag]}
          />
          <path
            d={`M${x + 5} ${top + 6} C${x + 60} ${top - 14} ${x + 110} ${top + 30} ${x + 175} ${top + 8} L${x + 175} ${top + 30} C${x + 110} ${top + 52} ${x + 60} ${top + 8} ${x + 5} ${top + 28} Z`}
            className="fill-white/20"
          />
        </g>
      </g>
      <Label x={x - 92} y={top + 158} text={POLE_FLAG_TEXT[flag]} tone="white" />
    </g>
  );
}

const HOUSES = [
  { x: 926, w: 104, kind: RaisedWoodHouse, labelY: GROUND - 4.3 * M - 102 },
  { x: 1064, w: 116, kind: ConcreteHouse, labelY: GROUND - 3.1 * M - 92 },
  { x: 1212, w: 96, kind: Shophouse, labelY: GROUND - 6.6 * M - 96 },
  { x: 1342, w: 104, kind: HalfWoodHouse, labelY: GROUND - 5.4 * M - 100 },
  { x: 1480, w: 92, kind: RaisedConcreteHouse, labelY: GROUND - 4.2 * M - 96 },
] as const;

function Label({ x, y, text, tone = "ink" }: { x: number; y: number; text: string; tone?: "ink" | "red" | "white" }) {
  // สระบน/ล่างและวรรณยุกต์ไม่กินความกว้าง — นับเฉพาะตัวที่วางบนบรรทัด
  const w = text.replace(/[ัิ-ฺ็-๎]/g, "").length * 11.6 + 30;
  const bg = tone === "red" ? "fill-red-600" : tone === "white" ? "fill-white/90" : "fill-ink-900/85";
  const fg = tone === "white" ? "fill-ink-900" : "fill-white";
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-17} width={w} height={32} rx={16} className={bg} />
      <text x={0} y={6} textAnchor="middle" fontSize={19} fontWeight={700} className={fg}>
        {text}
      </text>
    </g>
  );
}

export function HadYaiScene({
  levelMsl,
  bankMsl,
  groundMsl,
  historyMark,
  communityNames,
  animate,
  flag,
}: {
  /** ระดับน้ำที่กำลังแสดง (ม.รทก.) · null = ไม่มีข้อมูล */
  levelMsl: number | null;
  bankMsl: number;
  groundMsl: number | null;
  historyMark: SceneMark | null;
  communityNames: string[];
  animate: boolean;
  /** ธงเตือนภัยชุมชนโดยประมาณ — แสดงบนเสาธงริมคลอง */
  flag: EstimatedFlag;
}) {
  const waterY = mslToSceneY(levelMsl, bankMsl);
  const marks = gaugeMarks(bankMsl);
  const gaugeTop = mslToSceneY(bankMsl + 3.6, bankMsl);
  const bedMsl = groundMsl !== null && groundMsl < bankMsl ? groundMsl : bankMsl - 10;
  const ticks: number[] = [];
  for (let m = Math.ceil(bedMsl * 2) / 2; m <= bankMsl + 3.6; m += 0.5) ticks.push(m);
  const histY = historyMark ? mslToSceneY(historyMark.levelMsl, bankMsl) : null;

  return (
    <svg viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} preserveAspectRatio="xMaxYMax slice" className="h-full w-full" role="img" aria-label="ภาพประกอบคลองอู่ตะเภาที่หาดใหญ่ แสดงระดับน้ำเทียบตลิ่งและบ้านริมคลอง">
      {/* เขาคอหงส์ + เขาชุมสัก */}
      <path d="M560 600 C760 520 940 290 1120 196 C1200 214 1262 300 1318 330 C1360 284 1396 236 1420 232 C1480 246 1546 340 1600 380 L1600 600 Z" className="fill-brand-200/70" />
      <path d="M1128 178 Q1270 210 1414 216" className="fill-none stroke-slate-500/70" strokeWidth={1.5} />
      <g transform="translate(1262 198)">
        <rect x={-1} y={0} width={2} height={8} className="fill-slate-500" />
        <rect x={-9} y={8} width={18} height={13} rx={3} className="fill-brand-500" />
      </g>
      <Buddha x={1120} y={198} />

      {/* ตึกเมืองหาดใหญ่ */}
      {SKYLINE.map(([x, w, h]) => (
        <g key={x}>
          <rect x={x} y={RAIL_Y - h} width={w} height={h} className="fill-brand-300/60" />
          {Array.from({ length: Math.floor((h - 16) / 20) }, (_, i) => (
            <rect key={i} x={x + 8} y={RAIL_Y - h + 12 + i * 20} width={w - 16} height={5} className="fill-white/45" />
          ))}
        </g>
      ))}

      {/* ทางรถไฟ + ขบวนรถ (ชุมทางหาดใหญ่) */}
      <rect x={0} y={RAIL_Y - 4} width={SCENE.width} height={8} className="fill-slate-400" />
      <g className={animate ? "animate-train-run" : undefined} style={{ transformBox: "view-box" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${i * 76} ${RAIL_Y - 26})`}>
            <rect width={72} height={22} rx={i === 0 ? 9 : 3} className={i === 0 ? "fill-brand-700" : "fill-brand-500"} />
            <rect y={9} width={72} height={4} className="fill-white/80" />
            <rect x={8} y={3} width={56} height={5} rx={1} className="fill-sky-100" />
          </g>
        ))}
      </g>

      {/* พื้นดินริมคลอง */}
      <rect x={0} y={GROUND - 14} width={SCENE.width} height={20} className="fill-emerald-200" />
      {[120, 330, 560].map((x, i) => <RubberTree key={x} x={x} h={150 + (i % 2) * 40} />)}
      {[240, 470].map((x, i) => <Palm key={x} x={x} h={200 + i * 18} />)}
      <FlagPole x={826} flag={flag} animate={animate} />
      {[1056, 1206, 1336, 1472, 1594].map((x, i) => (i % 2 ? <Palm key={x} x={x} h={230} /> : <RubberTree key={x} x={x} h={190} />))}

      {HOUSES.map(({ x, w, kind: House }) => (
        <g key={x}>
          <ellipse cx={x + w / 2 + DX / 2} cy={GROUND + 2} rx={w * 0.7} ry={7} className="fill-ink-900/15" />
          <House x={x} w={w} />
        </g>
      ))}
      <PowerLines poles={[1196, 1462]} />
      {HOUSES.slice(0, communityNames.length).map(({ x, w, labelY }, i) => (
        <Label key={x} x={x + w / 2} y={labelY} text={communityNames[i]!} tone="white" />
      ))}

      {/* กำแพงคลอง */}
      <rect x={0} y={GROUND} width={SCENE.width} height={SCENE.height - GROUND} className="fill-slate-300" />
      <rect x={0} y={GROUND} width={SCENE.width} height={12} className="fill-slate-400" />
      {Array.from({ length: 8 }, (_, r) => (
        <g key={r}>
          <rect x={0} y={GROUND + 12 + (r + 1) * 56} width={SCENE.width} height={2} className="fill-slate-400/50" />
          {Array.from({ length: 11 }, (_, c) => (
            <rect key={c} x={c * 160 + (r % 2) * 80} y={GROUND + 12 + r * 56} width={2} height={56} className="fill-slate-400/50" />
          ))}
        </g>
      ))}

      {/* ไม้วัดระดับน้ำ */}
      <rect x={GAUGE_X} y={gaugeTop} width={34} height={SCENE.height - gaugeTop} rx={4} className="fill-white stroke-slate-300" strokeWidth={2} />
      {ticks.map((m) => {
        const y = mslToSceneY(m, bankMsl);
        const whole = Math.abs(m - Math.round(m)) < 0.01;
        return <rect key={m} x={GAUGE_X + 4} y={y - 2.5} width={whole ? 24 : 13} height={5} className="fill-ink-800" />;
      })}
      {[
        { y: marks.watch, text: "เฝ้าระวัง", cls: "stroke-sun-500", tone: "fill-sun-700" },
        { y: marks.warning, text: "เตือนภัย", cls: "stroke-alert-500", tone: "fill-alert-700" },
        { y: marks.bank, text: "ตลิ่ง", cls: "stroke-ink-800", tone: "fill-ink-900" },
      ].map((l) => (
        <g key={l.text}>
          <line x1={GAUGE_X + 34} x2={SCENE.width} y1={l.y} y2={l.y} className={l.cls} strokeWidth={3} strokeDasharray="16 12" />
          <text x={GAUGE_X + 46} y={l.y - 10} fontSize={24} fontWeight={800} className={`${l.tone} stroke-white/90`} strokeWidth={6} style={{ paintOrder: "stroke" }}>
            {l.text}
          </text>
        </g>
      ))}

      {/* ผิวน้ำ — ระดับจริงจากสถานี */}
      <g style={{ transform: `translateY(${waterY}px)`, transition: "transform 700ms cubic-bezier(.2,.8,.2,1)" }}>
        <g className={animate ? "animate-wave-drift-slow" : undefined} style={{ transformBox: "fill-box" }}>
          <path d={wavePath(10, 200, SCENE.height)} className="fill-sky-400/55" transform="translate(0 -6)" />
        </g>
        <g className={animate ? "animate-wave-drift" : undefined} style={{ transformBox: "fill-box" }}>
          <path d={wavePath(7, 160, SCENE.height)} className="fill-brand-500/75" />
        </g>
      </g>

      {/* เส้นน้ำท่วมในอดีต (วาดเหนือผิวน้ำให้อ่านได้เสมอ) */}
      {histY !== null && historyMark ? (
        <g>
          <line x1={GAUGE_X + 34} x2={SCENE.width} y1={histY} y2={histY} className="stroke-red-600" strokeWidth={3} strokeDasharray="6 8" />
          <Label x={GAUGE_X + 34 + (historyMark.label.replace(/[ัิ-ฺ็-๎]/g, "").length * 11.6 + 30) / 2 + 12} y={histY - 24} text={historyMark.label} tone="red" />
        </g>
      ) : null}

    </svg>
  );
}
