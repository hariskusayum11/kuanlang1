"use client";

// ส่วนหัวแบบ "นำด้วยธงชุมชน" (ต้นแบบ v2) — ใช้สิ่งที่ระบบนี้มีเอง: ธงของชุมชน · รูปตัดขวางคลองจริงจากกรมชลประทาน
// · ระยะถึงเกณฑ์ธงถัดไป · เส้นทางน้ำต้นน้ำ → ควนลัง · เรื่องเล่าน้ำท่วม พ.ย. 68 (ข้อมูลรายชั่วโมงจริง)
// แบบเดิม (ภาพเมือง + ไม้วัด) ยังเปิดดูได้ที่ ?hero=v1 เพื่อเทียบ
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { CrossSectionChart, VERTICAL_EXAGGERATION } from "@/components/lab/cross-section-chart";
import { RiverPath } from "@/components/lab/river-path";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";
import { COMMUNITY_FLAG_SOURCE, type EstimatedFlag } from "@/domain/water/community-flags";
import { X44_CROSS_SECTION } from "@/domain/water/cross-section";
import { freeboard, peakOf, type HistoryPoint, type StationReading } from "@/domain/water/station-status";
import type { CommunityFlagStatus } from "@/lib/water/community-flag";

type Mode = "live" | "recent" | "flood";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmt = (n: number, d = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
/** "2025-11-25 10:00" → { time: "10:00", date: "25 พ.ย. 68" } */
function stamp(at: string | null) {
  if (!at) return { time: "—", date: "" };
  const [d, t] = at.split(" ");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  return { time: t ?? "", date: `${day} ${MONTHS[(m ?? 1) - 1] ?? ""} ${String(((y ?? 0) + 543) % 100).padStart(2, "0")}` };
}

// สีธงตามความหมายของระบบ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · อุทกภัย = red · ไม่ทราบ = slate
const FLAG_TEXT: Record<EstimatedFlag, string> = {
  GREEN: "text-emerald-700",
  YELLOW: "text-sun-800",
  RED: "text-red-600",
  UNKNOWN: "text-slate-500",
};
const FLAG_PANEL: Record<EstimatedFlag, string> = {
  GREEN: "bg-emerald-50 ring-emerald-200",
  YELLOW: "bg-sun-50 ring-sun-300",
  RED: "bg-red-50 ring-red-200",
  UNKNOWN: "bg-white ring-slate-200",
};
const FLAG_ACTION: Record<EstimatedFlag, string> = {
  GREEN: "สถานการณ์ปกติ · ยังไม่ต้องอพยพ",
  YELLOW: "เฝ้าระวัง · อพยพผู้ป่วยติดเตียงและผู้ฟอกไตก่อน",
  RED: "เกิดอุทกภัย · อพยพกลุ่มเปราะบางและกลุ่มเสี่ยง",
  UNKNOWN: "ไม่มีข้อมูลระดับน้ำตอนนี้ — ดูธงที่ประกาศจากกลุ่มโดยตรง",
};

export function CommunityHero({
  stations,
  recent,
  flood,
  flagStatus,
  lagHours,
  communityCount,
  feedError,
}: {
  stations: StationReading[];
  recent: HistoryPoint[];
  flood: HistoryPoint[];
  flagStatus: CommunityFlagStatus;
  lagHours: Record<string, number | null>;
  communityCount: number;
  feedError: string | null;
}) {
  const main = stations.at(-1) ?? null; // หาดใหญ่ใน — ตำแหน่งเดียวกับรูปตัดขวาง
  const { flag, closest } = flagStatus;
  const latest = Object.values(flagStatus.measuredAt).filter((v): v is string => !!v).sort().at(-1) ?? null;

  const [mode, setMode] = useState<Mode>("live");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const series = mode === "flood" ? flood : mode === "recent" ? recent : [];
  const point = mode === "live" ? null : (series[Math.min(index, series.length - 1)] ?? null);
  const viewedLevel = point ? point.levelMsl : (main?.levelMsl ?? null);
  const viewedStamp = point ? stamp(point.at) : stamp(main?.measuredAt ?? null);
  const fb = main && viewedLevel !== null && main.bankMsl !== null ? main.bankMsl - viewedLevel : main ? freeboard(main) : null;

  // หมุดเหตุการณ์ของน้ำท่วม พ.ย. 68: ชั่วโมงแรกที่ล้นตลิ่ง และยอดสูงสุด
  const floodPeak = useMemo(() => peakOf(flood), [flood]);
  const events = useMemo(() => {
    if (!main?.bankMsl) return [];
    const over = flood.findIndex((p) => p.levelMsl > main.bankMsl!);
    const peakAt = floodPeak ? flood.indexOf(floodPeak) : -1;
    return [
      over >= 0 ? { index: over, label: `เริ่มล้นตลิ่ง ${stamp(flood[over]!.at).date} ${stamp(flood[over]!.at).time}` } : null,
      peakAt >= 0 ? { index: peakAt, label: `สูงสุด ${stamp(floodPeak!.at).date} ${stamp(floodPeak!.at).time}` } : null,
    ].filter((e): e is { index: number; label: string } => e !== null);
  }, [flood, floodPeak, main?.bankMsl]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= series.length - 1) {
          setPlaying(false);
          setFinished(true);
          return i;
        }
        return i + 1;
      });
    }, mode === "flood" ? 40 : 90);
    return () => window.clearInterval(id);
  }, [playing, series.length, mode]);

  // เล่นจบแล้วกลับค่าปัจจุบันเอง — ไม่ให้ตัวเลขค้างเป็นค่าในอดีต
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => {
      setMode("live");
      setFinished(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [finished]);

  const choose = (m: Mode) => {
    setMode(m);
    setPlaying(false);
    setFinished(false);
    if (m === "flood") {
      const peakAt = floodPeak ? flood.indexOf(floodPeak) : 0;
      setIndex(reduced ? Math.max(0, peakAt) : 0);
      if (!reduced) setPlaying(true);
    } else if (m === "recent") {
      setIndex(Math.max(0, recent.length - 1));
    }
  };

  const historyMark =
    floodPeak && main?.bankMsl != null
      ? { levelMsl: floodPeak.levelMsl, label: `น้ำท่วม พ.ย. 68 · สูงกว่าตลิ่ง ${fmt(floodPeak.levelMsl - main.bankMsl)} ม.` }
      : null;

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-100 via-canvas to-canvas">
      <div className="relative mx-auto max-w-[1500px] px-4 pb-12 pt-5 md:px-10 md:pt-8">
        {/* แถบเมนูแคปซูล */}
        <div className="flex items-center gap-2 rounded-full bg-white/80 py-2 pl-3 pr-2 text-ink-900 shadow-sm ring-1 ring-white backdrop-blur-md md:pl-4">
          <LogoMark size={30} className="text-brand-600" />
          <span className="whitespace-nowrap text-sm font-bold">
            SKL-FRIS<span className="hidden sm:inline"> · สองคลองควนลัง</span>
          </span>
          <span className="badge badge-neutral ml-1 hidden sm:inline-flex">ต้นแบบ</span>
          <nav className="ml-auto flex items-center gap-2 md:gap-4">
            <a href="#emergency-title" className="hidden text-sm font-semibold text-brand-700 hover:underline lg:inline">เบอร์ฉุกเฉิน</a>
            <a href="#flags" className="hidden text-sm font-semibold text-brand-700 hover:underline lg:inline">เกณฑ์ธง</a>
            <a href="#map" className="hidden text-sm font-semibold text-brand-700 hover:underline lg:inline">แผนที่</a>
            <Link href="/register" className="btn btn-primary btn-sm whitespace-nowrap">สมัครใช้งาน</Link>
            <Link href="/login" className="btn btn-secondary btn-sm whitespace-nowrap">เข้าสู่ระบบ</Link>
          </nav>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
          {/* ---- ธงชุมชน ---- */}
          <div className="lg:col-span-5">
            <p className="eyebrow text-sm text-brand-700">ธงเตือนภัยชุมชนสองคลอง–ควนลัง</p>
            <div className="mt-4 flex items-center gap-4">
              <Flag level={flag} className="h-20 w-20 md:h-24 md:w-24" />
              <div>
                <p className="text-xs font-semibold text-slate-500">ธงโดยประมาณจากระดับน้ำตอนนี้</p>
                <h1 className={`text-5xl font-black leading-[1.2] md:text-6xl ${FLAG_TEXT[flag]}`}>{ESTIMATED_FLAG_LABEL[flag]}</h1>
              </div>
            </div>
            <p className="mt-3 text-xl font-bold text-ink-900">{FLAG_ACTION[flag]}</p>

            <div className={`mt-6 rounded-3xl p-5 ring-1 ${FLAG_PANEL[flag]}`}>
              {closest ? (
                <>
                  <p className="text-sm font-semibold text-slate-600">ระดับน้ำต้องสูงขึ้นอีก</p>
                  <p className="text-5xl font-black tabular-nums text-ink-900">
                    {fmt(closest.meters)} <span className="text-2xl">ม.</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    น้ำที่<b>{closest.bridge}</b>จึงจะถึงเกณฑ์ยก{closest.next === "YELLOW" ? "ธงเหลือง" : "ธงแดง"} — จุดที่ใกล้เกณฑ์ที่สุดตอนนี้
                  </p>
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-700">
                  {flag === "RED" ? "ระดับน้ำถึงเกณฑ์ธงแดงแล้ว — ทำตามประกาศของชุมชนและหน่วยงาน" : feedError ?? "ยังคำนวณไม่ได้ เพราะไม่มีข้อมูลระดับน้ำจากสะพาน"}
                </p>
              )}
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              {latest ? `วัดล่าสุด ${stamp(latest).time} น. · ` : ""}ไม่ใช่ธงที่ประกาศ — คำนวณจากเกณฑ์ของกลุ่มสองคลองควนลัง ·{" "}
              <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
                ดูธงที่ประกาศจริง ↗
              </a>
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href="tel:1784" className="btn btn-primary btn-lg">โทรสายด่วน ปภ. 1784</a>
              <a href="#flags" className="btn btn-secondary btn-lg">เกณฑ์ธงรายสะพาน ↓</a>
            </div>
          </div>

          {/* ---- ภาพตัดขวางคลองจริง ---- */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl bg-white p-4 shadow-xl ring-1 ring-slate-200 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-ink-900">คลองอู่ตะเภา ที่หาดใหญ่ใน</h2>
                  <p className="text-xs text-slate-500">ภาพตัดขวางจริงจากการสำรวจของกรมชลประทาน ม.ค. 2569 · ระดับน้ำจากสถานีวัดน้ำหาดใหญ่ใน</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{mode === "live" ? "ตอนนี้" : `${viewedStamp.date} ${viewedStamp.time} น.`}</p>
                  <p className={`text-lg font-black ${fb !== null && fb <= 0 ? "text-red-600" : "text-ink-900"}`}>
                    {fb === null ? "ไม่มีข้อมูล" : fb > 0 ? `ต่ำกว่าตลิ่ง ${fmt(fb)} ม.` : `ล้นตลิ่ง ${fmt(-fb)} ม.`}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <CrossSectionChart points={X44_CROSS_SECTION.points} levelMsl={viewedLevel} bankMsl={main?.bankMsl ?? null} historyMark={historyMark} />
              </div>

              {/* ย้อนดู — อยู่ในการ์ด ไม่ลอยท้ายจอ */}
              {recent.length || flood.length ? (
                <div className="mt-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ["live", "ตอนนี้", true],
                        ["recent", "3 วันล่าสุด", recent.length > 0],
                        ["flood", "น้ำท่วม พ.ย. 68", flood.length > 0],
                      ] as const
                    ).filter(([, , ok]) => ok).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => choose(m)}
                        aria-pressed={mode === m}
                        className={`btn btn-sm ${mode === m ? (m === "flood" ? "btn-danger" : "btn-primary") : "btn-ghost"}`}
                      >
                        {label}
                      </button>
                    ))}
                    {mode !== "live" && series.length ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFinished(false);
                          if (playing) return setPlaying(false);
                          if (index >= series.length - 1) setIndex(0);
                          setPlaying(true);
                        }}
                        className="btn btn-secondary btn-sm ml-auto"
                        aria-label={playing ? "หยุด" : "เล่น"}
                      >
                        {playing ? "❚❚ หยุด" : "▶ เล่น"}
                      </button>
                    ) : null}
                  </div>
                  {mode !== "live" && series.length ? (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={series.length - 1}
                        value={Math.min(index, series.length - 1)}
                        onChange={(e) => {
                          setPlaying(false);
                          setFinished(false);
                          setIndex(Number(e.target.value));
                        }}
                        className="mt-3 w-full accent-brand-600"
                        aria-label="เลือกเวลาที่ต้องการดูระดับน้ำ"
                      />
                      {mode === "flood" && events.length ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {events.map((e) => (
                            <button
                              key={e.label}
                              type="button"
                              onClick={() => {
                                setPlaying(false);
                                setFinished(false);
                                setIndex(e.index);
                              }}
                              className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                            >
                              ⚑ {e.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">กด “น้ำท่วม พ.ย. 68” เพื่อดูน้ำขึ้นจริงทีละชั่วโมงบนรูปคลองนี้</p>
                  )}
                </div>
              ) : null}
              <p className="mt-3 text-[11px] text-slate-400">
                แนวตั้งขยายราว {VERTICAL_EXAGGERATION} เท่าให้เห็นความลึก · บ้านริมตลิ่งเป็นภาพประกอบขนาดตามจริง
              </p>
            </div>
          </div>
        </div>

        <RiverPath stations={stations} bridges={flagStatus.bridges} lagHours={lagHours} communityCount={communityCount} />
      </div>
    </section>
  );
}
