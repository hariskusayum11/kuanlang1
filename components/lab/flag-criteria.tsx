// ธงเตือนภัยของกลุ่มสองคลองควนลัง + ธงโดยประมาณจากระดับน้ำจริง (หน้าแรก)
// Server Component · ไม่มี hook · ธงโดยประมาณ ≠ ธงที่ประกาศ (บอกชัดทุกจุดที่แสดง)
// ระดับธงและเกณฑ์มาจากฐานข้อมูล (แก้ได้ที่ /flag-criteria โดย ADMIN — docs/44)
import type { BridgeFlagEstimate } from "@/domain/water/community-flags";
import type { CommunityFlagStatus } from "@/lib/water/community-flag";
import { FLAG_BG, Flag, flagLabel } from "@/components/water/community-flag";

const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function distanceText(b: BridgeFlagEstimate): string {
  if (b.levelMsl === null || b.lines.length === 0) return "ไม่มีข้อมูลระดับน้ำ";
  if (b.next) return `ต่ำกว่าเกณฑ์${b.next.line.level.label} ${fmt(b.next.meters)} ม.`;
  const top = b.lines.at(-1)!;
  return `สูงกว่าเกณฑ์${top.level.label} ${fmt(b.levelMsl - top.msl)} ม.`;
}

export function FlagCriteria({ status }: { status: CommunityFlagStatus }) {
  const { levels, bridges, measuredAt, source } = status;
  // คอลัมน์เกณฑ์ = ระดับที่มีสะพานใดใช้อย่างน้อยหนึ่งแห่ง (ระดับปกติไม่มีเกณฑ์)
  const columns = levels.slice(1).filter((l) => bridges.some((b) => b.bridge.thresholds[l.key]));
  return (
    <section id="flags" className="bg-mist px-4 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-[1200px]">
        <p className="eyebrow text-brand-700">ธงเตือนภัยชุมชน</p>
        <h2 className="mt-2 text-3xl font-black text-ink-900 md:text-4xl">ธงสีอะไร ต้องทำอะไร</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
          กลุ่มสองคลองควนลังใช้ธง {levels.length} ระดับเป็นสัญญาณให้ทั้ง 5 ชุมชน — ธงจริงประกาศโดยทีมของกลุ่ม
          หลังดูระดับน้ำที่สะพานผ่านกล้อง CCTV
        </p>

        <div className={`mt-6 grid gap-3 sm:grid-cols-2 ${levels.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {levels.map((f) => (
            <div key={f.key} className="card flex gap-3 p-4">
              <Flag level={f} />
              <div>
                <p className="font-bold text-ink-900">
                  {f.label}
                  {f.title ? <span className="font-normal text-slate-500"> · {f.title}</span> : null}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{f.action}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-8 text-xl font-bold text-ink-900">เกณฑ์ยกธงรายสะพาน เทียบระดับน้ำตอนนี้</h3>
        <div className="card-flush mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-white text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">สะพาน</th>
                {columns.map((l) => (
                  <th key={l.key} className="px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${FLAG_BG[l.color]}`} />ยก{l.label}</span>
                  </th>
                ))}
                <th className="px-4 py-3 font-semibold">ระดับน้ำตอนนี้</th>
                <th className="px-4 py-3 font-semibold">ธงโดยประมาณ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {bridges.map((b) => {
                const code = b.bridge.stationCode;
                const at = measuredAt[code];
                return (
                  <tr key={code}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{b.bridge.bridge}</p>
                      <p className="text-xs text-slate-500">{b.bridge.canal} · สถานี {code}</p>
                      {b.bridge.soffitMsl !== null ? (
                        <p className="text-xs text-slate-500">
                          ท้องสะพาน {fmt(b.bridge.soffitMsl)} ม.รทก.
                          {b.bridge.sourceUrl ? (
                            <> · <a href={b.bridge.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">ที่มา</a></>
                          ) : null}
                        </p>
                      ) : null}
                    </td>
                    {columns.map((l) => {
                      const line = b.lines.find((x) => x.level.key === l.key);
                      return (
                        <td key={l.key} className="px-4 py-3 text-slate-700">
                          {line ? (
                            <>
                              {line.rule}
                              <span className="block text-xs text-slate-500">≈ {fmt(line.msl)} ม.รทก.</span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-slate-700">
                      {b.levelMsl !== null ? <b className="text-ink-900">{fmt(b.levelMsl)} ม.รทก.</b> : <span className="text-slate-400">—</span>}
                      <span className="block text-xs text-slate-500">{distanceText(b)}</span>
                      {at ? <span className="block text-xs text-slate-400">วัดเมื่อ {at.split(" ")[1] ?? at} น.</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                        <Flag level={b.flag} className="h-6 w-6" />
                        {flagLabel(b.flag)}
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
            เกณฑ์ยกธงของกลุ่มวัดจาก “ระยะผิวน้ำถึงท้องสะพาน” · ตัวเลข ม.รทก. ในตารางคำนวณจากระดับท้องสะพานที่บันทึกในระบบ
            ซึ่งอาจต่างจากท้องสะพานจริงได้ · ธงในตารางเป็นการประเมินของระบบ ไม่ใช่ธงที่ประกาศ
          </p>
          <p className="mt-2">
            {source.note ? `${source.note} · ` : ""}ที่มา:{" "}
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
              แนวปฏิบัติระดับชุมชน {source.publisher}
            </a>{" "}
            ({source.license}){status.versionNo > 0 ? ` · เกณฑ์ฉบับที่ ${status.versionNo}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
