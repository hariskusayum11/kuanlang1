// เกณฑ์ธงเตือนภัยของกลุ่มสองคลองควนลัง — แสดงเป็นข้อมูลอ้างอิงพร้อมที่มา (ไม่คำนวณสีธงเอง)
// Server Component · ไม่มี hook
import {
  COMMUNITY_FLAG_SOURCE,
  COMMUNITY_FLAGS,
  FLAG_BRIDGE_CRITERIA,
  type FlagLevel,
} from "@/domain/water/community-flags";

// สีธงตามความหมายของระบบ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · อุทกภัย = red (วิกฤต)
const FLAG_FILL: Record<FlagLevel, string> = {
  GREEN: "fill-emerald-500",
  YELLOW: "fill-sun-400",
  RED: "fill-red-600",
  RED_SIREN: "fill-red-600",
};

function Flag({ level }: { level: FlagLevel }) {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
      <rect x={8} y={4} width={3} height={42} rx={1.5} className="fill-slate-400" />
      <circle cx={9.5} cy={4} r={3} className="fill-slate-300" />
      <path d="M11 7 C20 3 26 11 38 7 L38 26 C26 30 20 22 11 26 Z" className={FLAG_FILL[level]} />
      {level === "RED_SIREN" ? (
        <g>
          <path d="M36 34 a6 6 0 0 1 12 0 v6 h-12 Z" className="fill-alert-500" />
          <rect x={34} y={40} width={16} height={3} rx={1} className="fill-ink-800" />
        </g>
      ) : null}
    </svg>
  );
}

const belowDeck = (m: number) => (m === 0 ? "น้ำถึงสะพาน (จมสะพาน)" : `น้ำต่ำกว่าท้องสะพาน ${m} ม.`);

export function FlagCriteria() {
  return (
    <section id="flags" className="bg-mist px-4 py-14 md:px-10 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        <p className="eyebrow text-brand-700">ธงเตือนภัยชุมชน</p>
        <h2 className="mt-2 text-3xl font-black text-ink-900 md:text-4xl">ธงสีอะไร ต้องทำอะไร</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
          กลุ่มสองคลองควนลังใช้ธง 4 ระดับเป็นสัญญาณให้ทั้ง 5 ชุมชน — ธงจริงประกาศโดยทีมของกลุ่ม
          หลังดูระดับน้ำที่สะพานผ่านกล้อง CCTV
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_FLAGS.map((f) => (
            <div key={f.level} className="card flex gap-3 p-4">
              <Flag level={f.level} />
              <div>
                <p className="font-bold text-ink-900">{f.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{f.action}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-12 text-xl font-bold text-ink-900">เกณฑ์ยกธง (วัดจากผิวน้ำถึงท้องสะพาน)</h3>
        <div className="card-flush mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">สะพาน</th>
                <th className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sun-400" />ยกธงเหลือง</span>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-600" />ยกธงแดง</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {FLAG_BRIDGE_CRITERIA.map((c) => (
                <tr key={c.bridge}>
                  <td className="px-4 py-3 font-semibold text-ink-900">{c.bridge}</td>
                  <td className="px-4 py-3 text-slate-700">{belowDeck(c.yellowBelowDeckM)}</td>
                  <td className="px-4 py-3 text-slate-700">{belowDeck(c.redBelowDeckM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-mist mt-4 p-4 text-sm leading-6 text-slate-700">
          <p>
            <b>หน้านี้ยังไม่บอกสีธงปัจจุบัน</b> — เกณฑ์วัดจากท้องสะพาน แต่ข้อมูลสถานีวัดน้ำที่ใช้บนหน้านี้วัดเทียบระดับทะเลและตลิ่ง
            จึงยังเทียบกันไม่ได้จนกว่าจะได้ระดับท้องสะพานของทั้ง 3 จุด · เส้น “เฝ้าระวัง/เตือนภัย” ในภาพด้านบนเป็นเกณฑ์ฉบับร่างของต้นแบบ ไม่ใช่ธงของชุมชน
          </p>
          <p className="mt-2">
            เกณฑ์อาจปรับเปลี่ยนในแต่ละปี · ที่มา:{" "}
            <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
              แนวปฏิบัติระดับชุมชน {COMMUNITY_FLAG_SOURCE.publisher}
            </a>{" "}
            ({COMMUNITY_FLAG_SOURCE.license})
          </p>
        </div>

        <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-md mt-6">
          ดูธงที่ประกาศอยู่ตอนนี้ ↗
        </a>
      </div>
    </section>
  );
}
