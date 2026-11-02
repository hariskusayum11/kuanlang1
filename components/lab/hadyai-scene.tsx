// ฉากภาพประกอบ "สองคลอง · หาดใหญ่" — SVG ล้วน ไม่มี hook (เรนเดอร์ได้ทั้ง Server/Client)
// -----------------------------------------------------------------------------
// ไกล → ใกล้: เขาคอหงส์ + พระพุทธมงคลมหาราช + กระเช้า → ตึกเมืองหาดใหญ่ → ทางรถไฟ (ชุมทางหาดใหญ่)
// → บ้าน 5 ชุมชนริมคลอง → กำแพงคลอง + ไม้วัดระดับน้ำ → ผิวน้ำ (ระดับจริงจากสถานี)
// บ้านและน้ำใช้มาตราส่วนเดียวกัน (domain/water/scene-geometry.ts) — น้ำสูงกว่าตลิ่งเท่าไร ในภาพก็ท่วมบ้านเท่านั้น
// สีใช้คลาส Token ทั้งหมด · ไม่มี <defs>/gradient (ตามข้อบังคับ SVG ของระบบ)
import { gaugeMarks, mslToSceneY, SCENE, wavePath } from "@/domain/water/scene-geometry";

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

/** บ้านยกใต้ถุนสูง (สอดคล้องกับโลโก้ระบบ — บ้านอยู่เหนือระดับน้ำ) */
function RaisedHouse({ x, w }: { x: number; w: number }) {
  const stilt = 1.6 * M;
  const body = 2.6 * M;
  const top = GROUND - stilt - body;
  return (
    <g>
      {[0.1, 0.5, 0.9].map((p) => (
        <rect key={p} x={x + w * p - 4} y={GROUND - stilt} width={8} height={stilt} className="fill-slate-600" />
      ))}
      <rect x={x} y={top} width={w} height={body} className="fill-white" />
      <rect x={x + w * 0.15} y={top + body * 0.28} width={w * 0.24} height={body * 0.34} className="fill-sky-200" />
      <rect x={x + w * 0.58} y={top + body * 0.2} width={w * 0.26} height={body * 0.8} className="fill-brand-700" />
      <path d={`M${x - 10} ${top} L${x + w / 2} ${top - 62} L${x + w + 10} ${top} Z`} className="fill-brand-600" />
      <rect x={x + w * 0.62} y={GROUND - stilt - 4} width={w * 0.34} height={6} className="fill-slate-600" />
    </g>
  );
}

/** บ้านชั้นเดียว (ประตูสูง 2 ม. — ใช้เป็นตัวเทียบความลึกน้ำ) */
function OneStorey({ x, w }: { x: number; w: number }) {
  const body = 3.2 * M;
  const top = GROUND - body;
  return (
    <g>
      <rect x={x} y={top} width={w} height={body} className="fill-mist" />
      <rect x={x + w * 0.12} y={GROUND - 2 * M} width={w * 0.3} height={2 * M} className="fill-ink-700" />
      <rect x={x + w * 0.56} y={top + body * 0.25} width={w * 0.32} height={body * 0.3} className="fill-sky-200" />
      <path d={`M${x - 12} ${top} L${x + w * 0.2} ${top - 50} L${x + w * 0.8} ${top - 50} L${x + w + 12} ${top} Z`} className="fill-ink-700" />
    </g>
  );
}

/** ตึกแถวสองชั้น */
function Shophouse({ x, w }: { x: number; w: number }) {
  const body = 6.6 * M;
  const top = GROUND - body;
  return (
    <g>
      <rect x={x} y={top} width={w} height={body} className="fill-white" />
      <rect x={x - 4} y={top - 12} width={w + 8} height={14} className="fill-slate-400" />
      <rect x={x} y={GROUND - 3.2 * M - 6} width={w} height={6} className="fill-slate-400" />
      {[0.14, 0.56].map((p) => (
        <rect key={p} x={x + w * p} y={top + 26} width={w * 0.3} height={60} className="fill-sky-200" />
      ))}
      <rect x={x + w * 0.1} y={GROUND - 2.4 * M} width={w * 0.8} height={2.4 * M} className="fill-slate-500" />
      {[1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={x + w * 0.1} y={GROUND - 2.4 * M + i * 18} width={w * 0.8} height={2} className="fill-slate-400" />
      ))}
    </g>
  );
}

/** บ้านไม้ชั้นเดียวยกพื้นเตี้ย */
function WoodHouse({ x, w }: { x: number; w: number }) {
  const lift = 0.6 * M;
  const body = 2.7 * M;
  const top = GROUND - lift - body;
  return (
    <g>
      <rect x={x + 6} y={GROUND - lift} width={w - 12} height={lift} className="fill-slate-600" />
      <rect x={x} y={top} width={w} height={body} className="fill-sun-100" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={x} y={top + i * (body / 7)} width={w} height={1.5} className="fill-sun-300" />
      ))}
      <rect x={x + w * 0.38} y={top + body * 0.22} width={w * 0.26} height={body * 0.78} className="fill-ink-700" />
      <path d={`M${x - 12} ${top} L${x + w / 2} ${top - 58} L${x + w + 12} ${top} Z`} className="fill-brand-700" />
    </g>
  );
}

const HOUSES = [
  { x: 930, w: 118, kind: RaisedHouse, labelY: GROUND - 4.2 * M - 96 },
  { x: 1074, w: 124, kind: OneStorey, labelY: GROUND - 3.2 * M - 84 },
  { x: 1222, w: 104, kind: Shophouse, labelY: GROUND - 6.6 * M - 46 },
  { x: 1350, w: 118, kind: WoodHouse, labelY: GROUND - 3.3 * M - 92 },
  { x: 1488, w: 104, kind: RaisedHouse, labelY: GROUND - 4.2 * M - 96 },
] as const;

function Label({ x, y, text, tone = "ink" }: { x: number; y: number; text: string; tone?: "ink" | "red" | "white" }) {
  const w = text.length * 12.5 + 26;
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
}: {
  /** ระดับน้ำที่กำลังแสดง (ม.รทก.) · null = ไม่มีข้อมูล */
  levelMsl: number | null;
  bankMsl: number;
  groundMsl: number | null;
  historyMark: SceneMark | null;
  communityNames: string[];
  animate: boolean;
}) {
  const waterY = mslToSceneY(levelMsl, bankMsl);
  const marks = gaugeMarks(bankMsl);
  const gaugeTop = mslToSceneY(bankMsl + 3.6, bankMsl);
  const bedMsl = groundMsl !== null && groundMsl < bankMsl ? groundMsl : bankMsl - 10;
  const over = levelMsl !== null ? levelMsl - bankMsl : null;
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
      {[120, 330, 560, 700].map((x, i) => <RubberTree key={x} x={x} h={150 + (i % 2) * 40} />)}
      {[240, 470, 790].map((x, i) => <Palm key={x} x={x} h={200 + i * 18} />)}
      {[1056, 1206, 1336, 1472, 1594].map((x, i) => (i % 2 ? <Palm key={x} x={x} h={230} /> : <RubberTree key={x} x={x} h={190} />))}

      {HOUSES.map(({ x, w, kind: House }) => <House key={x} x={x} w={w} />)}
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
          <Label x={GAUGE_X + 34 + (historyMark.label.length * 12.5 + 26) / 2 + 12} y={histY - 24} text={historyMark.label} tone="red" />
        </g>
      ) : null}

      {over !== null && over > 0 ? <Label x={1480} y={Math.max(SCENE.topY + 20, waterY - 34)} text={`ล้นตลิ่ง ${over.toFixed(2)} ม.`} tone="red" /> : null}
    </svg>
  );
}
