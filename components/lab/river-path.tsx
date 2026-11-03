// เส้นทางน้ำต้นน้ำ → ควนลัง — Server/Client ได้ (ไม่มี hook)
// แสดงแต่ละจุดวัดตามลำดับการไหล พร้อมระยะถึงเกณฑ์ธงของชุมชน และเวลาที่ยอดน้ำเดินทางจากเหตุการณ์จริง
import type { BridgeFlagEstimate, EstimatedFlag } from "@/domain/water/community-flags";
import { freeboard, type StationReading } from "@/domain/water/station-status";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";

const fmt = (n: number, d = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const placeName = (n: string) => n.replace(/^บ้าน/, "");

function flagLine(b: BridgeFlagEstimate | undefined): string {
  if (!b || b.levelMsl === null || b.yellowMsl === null || b.redMsl === null) return "ไม่มีข้อมูลระดับน้ำ";
  if (b.flag === "GREEN") return `ห่างเกณฑ์ธงเหลือง ${fmt(b.yellowMsl - b.levelMsl)} ม.`;
  if (b.flag === "YELLOW") return `ห่างเกณฑ์ธงแดง ${fmt(b.redMsl - b.levelMsl)} ม.`;
  return "ถึงเกณฑ์ธงแดงแล้ว";
}

function Node({ title, sub, flag, line }: { title: string; sub: string; flag: EstimatedFlag | null; line: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5 rounded-2xl bg-white/90 p-3 ring-1 ring-slate-200">
      {flag ? <Flag level={flag} className="h-8 w-8" /> : <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-100" />}
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
        <p className="mt-1 text-xs font-semibold text-slate-700">{line}</p>
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string | null }) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-center gap-2 px-1 py-1 text-brand-500 md:w-28 md:flex-col md:gap-0">
      <span aria-hidden className="rotate-90 text-xl leading-none md:rotate-0">→</span>
      {label ? <span className="text-center text-[11px] font-semibold leading-tight text-slate-500 md:mt-1">{label}</span> : null}
    </div>
  );
}

export function RiverPath({
  stations,
  bridges,
  lagHours,
  communityCount,
}: {
  /** สถานีบนคลองอู่ตะเภา เรียงต้นน้ำ → ควนลัง */
  stations: StationReading[];
  bridges: BridgeFlagEstimate[];
  /** เวลาห่างของยอดน้ำ (ชม.) ตามคู่ "ต้นน้ำ>ปลายน้ำ" — null = ข้อมูลไม่พอ ไม่แสดง */
  lagHours: Record<string, number | null>;
  communityCount: number;
}) {
  const bridge = (code: string) => bridges.find((b) => b.criterion.stationCode === code);
  const main = stations.at(-1);
  const wha = bridge("X.174");
  const lagLabel = (a: string, b: string) => {
    const h = lagHours[`${a}>${b}`];
    return h ? `ปี 68 ยอดน้ำห่าง ~${Math.round(h)} ชม.` : null;
  };

  return (
    <section aria-label="เส้นทางน้ำจากต้นน้ำถึงควนลัง" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-black text-ink-900">น้ำจากต้นน้ำมาถึงชุมชน</h2>
        <p className="text-xs text-slate-500">ธง = ธงโดยประมาณตามเกณฑ์ของสะพานนั้น · เวลาจากเหตุการณ์น้ำท่วม พ.ย. 2568</p>
      </div>
      <div className="mt-3 flex flex-col items-stretch gap-1 md:flex-row md:items-center">
        {stations.slice(0, -1).map((s, i) => {
          const b = bridge(s.code);
          const next = stations[i + 1];
          return (
            <div key={s.code} className="contents">
              <Node title={`สะพาน${placeName(s.name)}`} sub="คลองอู่ตะเภา" flag={b?.flag ?? null} line={flagLine(b)} />
              <Arrow label={next ? lagLabel(s.code, next.code) : null} />
            </div>
          );
        })}
        {main ? (
          <>
            <Node
              title={`จุดวัดน้ำ${placeName(main.name)}`}
              sub="ใกล้ควนลังที่สุด"
              flag={null}
              line={(() => {
                const fb = freeboard(main);
                return fb === null ? "ไม่ทราบระดับตลิ่ง" : fb > 0 ? `ต่ำกว่าตลิ่ง ${fmt(fb)} ม.` : `ล้นตลิ่ง ${fmt(-fb)} ม.`;
              })()}
            />
            <Arrow label="ผันเข้าคลอง ร.1" />
          </>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start gap-2.5 rounded-2xl bg-ink-900 p-3 text-white">
          <span aria-hidden className="mt-0.5 text-lg">⌂</span>
          <div>
            <p className="text-sm font-bold">{communityCount} ชุมชนควนลัง</p>
            <p className="text-[11px] text-slate-300">ปลายทางของน้ำ</p>
          </div>
        </div>
      </div>
      {wha ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Flag level={wha.flag} className="h-5 w-5" />
          <b>คลองหวะ</b> (สะพานบ้านคลองหวะ) · {ESTIMATED_FLAG_LABEL[wha.flag]} · {flagLine(wha)} — อีกเส้นทางที่น้ำเข้าตัวเมืองและท่าเคียน
        </p>
      ) : null}
    </section>
  );
}
