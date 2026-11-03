// ธงเตือนภัยของกลุ่มสองคลองควนลัง + ธงโดยประมาณจากระดับน้ำจริง
// Server Component · ไม่มี hook · ธงโดยประมาณ ≠ ธงที่ประกาศ (บอกชัดทุกจุดที่แสดง)
import {
  BRIDGE_REFERENCES,
  COMMUNITY_FLAG_SOURCE,
  COMMUNITY_FLAGS,
  type BridgeFlagEstimate,
  type EstimatedFlag,
  type FlagThreshold,
} from "@/domain/water/community-flags";
import { ESTIMATE_TEXT, ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";

const ESTIMATE_RING: Record<EstimatedFlag, string> = {
  GREEN: "ring-emerald-300 bg-emerald-50",
  YELLOW: "ring-sun-300 bg-sun-50",
  RED: "ring-red-300 bg-red-50",
  UNKNOWN: "ring-slate-200 bg-white",
};

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rule = (t: FlagThreshold) => ("deck" in t ? "จมสะพาน" : `ต่ำกว่าท้องสะพาน ${t.belowSoffitM} ม.`);

function distanceText(b: BridgeFlagEstimate): string {
  if (b.levelMsl === null || b.yellowMsl === null || b.redMsl === null) return "ไม่มีข้อมูลระดับน้ำ";
  if (b.flag === "GREEN") return `ต่ำกว่าเกณฑ์ธงเหลือง ${fmt(b.yellowMsl - b.levelMsl)} ม.`;
  if (b.flag === "YELLOW") return `ต่ำกว่าเกณฑ์ธงแดง ${fmt(b.redMsl - b.levelMsl)} ม.`;
  return `สูงกว่าเกณฑ์ธงแดง ${fmt(b.levelMsl - b.redMsl)} ม.`;
}

export function FlagCriteria({
  bridges,
  flag,
  measuredAt,
  showEstimate = true,
}: {
  bridges: BridgeFlagEstimate[];
  flag: EstimatedFlag;
  /** เวลาวัดล่าสุดของแต่ละสถานี (เวลาไทย) ตามรหัสสถานี */
  measuredAt: Record<string, string | null>;
  /** แสดงกล่องธงโดยประมาณ — ปิดเมื่อส่วนหัวของหน้าแสดงธงเด่นอยู่แล้ว */
  showEstimate?: boolean;
}) {
  return (
    <section id="flags" className="bg-mist px-4 py-14 md:px-10 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        <p className="eyebrow text-brand-700">ธงเตือนภัยชุมชน</p>
        <h2 className="mt-2 text-3xl font-black text-ink-900 md:text-4xl">ธงสีอะไร ต้องทำอะไร</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
          กลุ่มสองคลองควนลังใช้ธง 4 ระดับเป็นสัญญาณให้ทั้ง 5 ชุมชน — ธงจริงประกาศโดยทีมของกลุ่ม
          หลังดูระดับน้ำที่สะพานผ่านกล้อง CCTV
        </p>

        {/* ธงโดยประมาณ — ซ่อนเมื่อส่วนหัวแสดงธงอยู่แล้ว (ส่วนหัวแบบนำด้วยธง) */}
        {showEstimate ? (
          <div className={`mt-8 flex flex-col gap-4 rounded-3xl p-5 ring-2 md:flex-row md:items-center md:p-6 ${ESTIMATE_RING[flag]}`}>
            <Flag level={flag} className="h-20 w-20" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-600">ธงโดยประมาณจากระดับน้ำตอนนี้</p>
              <p className="text-3xl font-black text-ink-900">{ESTIMATED_FLAG_LABEL[flag]}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{ESTIMATE_TEXT[flag]}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                ⚠️ ไม่ใช่ธงที่ประกาศ — คำนวณจากเกณฑ์ของกลุ่มกับระดับน้ำสถานีกรมชลประทาน โดยใช้ระดับคอสะพานล่างจากรูปตัดขวางปี 2569 แทนท้องสะพาน
                (ยังไม่มีค่าท้องสะพานทางการ) · ธงแดงมีไซเรนไม่มีเกณฑ์เป็นตัวเลขจึงไม่ประเมิน
              </p>
            </div>
            <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-md self-start md:self-center">
              ดูธงที่ประกาศจริง ↗
            </a>
          </div>
        ) : null}

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

        <h3 className="mt-12 text-xl font-bold text-ink-900">เกณฑ์ยกธงรายสะพาน เทียบระดับน้ำตอนนี้</h3>
        <div className="card-flush mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">สะพาน</th>
                <th className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sun-400" />ยกธงเหลือง</span>
                </th>
                <th className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-600" />ยกธงแดง</span>
                </th>
                <th className="px-4 py-3 font-semibold">ระดับน้ำตอนนี้</th>
                <th className="px-4 py-3 font-semibold">ธงโดยประมาณ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bridges.map((b) => {
                const code = b.criterion.stationCode;
                const at = measuredAt[code];
                return (
                  <tr key={code}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{b.criterion.bridge}</p>
                      <a href={BRIDGE_REFERENCES[code]?.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 underline">
                        ระดับสะพาน: กรมชลประทาน (สถานี {code})
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {rule(b.criterion.yellow)}
                      {b.yellowMsl !== null ? <span className="block text-xs text-slate-500">≈ {fmt(b.yellowMsl)} ม.รทก.</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {rule(b.criterion.red)}
                      {b.redMsl !== null ? <span className="block text-xs text-slate-500">≈ {fmt(b.redMsl)} ม.รทก.</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {b.levelMsl !== null ? <b className="text-ink-900">{fmt(b.levelMsl)} ม.รทก.</b> : <span className="text-slate-400">—</span>}
                      <span className="block text-xs text-slate-500">{distanceText(b)}</span>
                      {at ? <span className="block text-xs text-slate-400">วัดเมื่อ {at.split(" ")[1] ?? at} น.</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                        <Flag level={b.flag} className="h-6 w-6" />
                        {ESTIMATED_FLAG_LABEL[b.flag]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card-mist mt-4 p-4 text-sm leading-6 text-slate-700">
          <p>
            เกณฑ์ยกธงของกลุ่มวัดจาก “ระยะผิวน้ำถึงท้องสะพาน” · ตัวเลข ม.รทก. ในตารางแปลงด้วยระดับคอสะพานจากรูปตัดขวางลำน้ำประจำปี 2569 ของกรมชลประทาน
            ซึ่งอาจต่างจากท้องสะพานจริงได้ · เส้น “เฝ้าระวัง/เตือนภัย” บนภาพด้านบนเป็นเกณฑ์ฉบับร่างของต้นแบบ ไม่ใช่ธงของชุมชน
          </p>
          <p className="mt-2">
            เกณฑ์อาจปรับเปลี่ยนในแต่ละปี · ที่มา:{" "}
            <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
              แนวปฏิบัติระดับชุมชน {COMMUNITY_FLAG_SOURCE.publisher}
            </a>{" "}
            ({COMMUNITY_FLAG_SOURCE.license})
          </p>
        </div>
      </div>
    </section>
  );
}
