"use client";

// ส่วนหัวหน้า "สองคลอง" — ภาพน้ำจริงเทียบบ้านริมคลอง (ดูง่าย เห็นน้ำ) แต่ใช้สิ่งที่เป็นของระบบนี้เป็นตัวนำ:
// ธงเตือนภัยของชุมชน · ประโยคบอกสะพานที่ใกล้เกณฑ์ธง · ลูกศรวัดระยะผิวน้ำถึงตลิ่งในภาพ · การ์ดย้อนดูพร้อมหมุดเหตุการณ์
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { HadYaiScene, type SceneMark } from "@/components/lab/hadyai-scene";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";
import { COMMUNITY_FLAG_SOURCE, type EstimatedFlag } from "@/domain/water/community-flags";
import { freeboard, peakOf, waterTrend, type HistoryPoint, type StationReading, type WaterTrend } from "@/domain/water/station-status";
import type { CommunityFlagStatus } from "@/lib/water/community-flag";

type Mode = "live" | "recent" | "flood";

// สีธงตามความหมายของระบบ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · อุทกภัย = red · ไม่ทราบ = slate
const FLAG_TEXT: Record<EstimatedFlag, string> = {
  GREEN: "text-emerald-600",
  YELLOW: "text-sun-700",
  RED: "text-red-600",
  UNKNOWN: "text-slate-500",
};
const FLAG_ACTION: Record<EstimatedFlag, string> = {
  GREEN: "สถานการณ์ปกติ · ยังไม่ต้องอพยพ",
  YELLOW: "เฝ้าระวัง · อพยพผู้ป่วยติดเตียงและผู้ฟอกไตก่อน",
  RED: "เกิดอุทกภัย · อพยพกลุ่มเปราะบางและกลุ่มเสี่ยง",
  UNKNOWN: "ไม่มีข้อมูลระดับน้ำจากสะพานตอนนี้",
};
const TREND_PHRASE: Record<WaterTrend, string> = {
  RISING: "กำลังขึ้น",
  FALLING: "กำลังลด",
  STEADY: "ทรงตัว",
  UNKNOWN: "",
};
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const placeName = (n: string) => n.replace(/^บ้าน/, "");
const fmt = (n: number, d = 2) => n.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

/** "2025-11-25 10:00" → { time: "10:00", date: "25 พ.ย. 68" } (ปี พ.ศ. 2 หลัก) */
function thaiStamp(at: string | null) {
  if (!at) return { time: "—", date: "" };
  const [d, t] = at.split(" ");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  return { time: t ?? "", date: `${day} ${MONTHS[(m ?? 1) - 1] ?? ""} ${String(((y ?? 0) + 543) % 100).padStart(2, "0")}` };
}

export function SongKhlongHero({
  stations,
  recent,
  flood,
  communityNames,
  feedError,
  flagStatus,
}: {
  stations: StationReading[];
  /** ระดับน้ำรายชั่วโมง 3 วันล่าสุดของจุดวัดหลัก */
  recent: HistoryPoint[];
  /** ระดับน้ำรายชั่วโมงช่วงน้ำท่วมใหญ่ พ.ย. 2568 */
  flood: HistoryPoint[];
  communityNames: string[];
  feedError: string | null;
  /** ธงโดยประมาณจากเกณฑ์ของกลุ่มสองคลองควนลัง (ไม่ใช่ธงที่ประกาศ) */
  flagStatus: CommunityFlagStatus;
}) {
  const main = stations.at(-1) ?? null; // หาดใหญ่ใน — ใกล้ควนลังที่สุด
  const { flag, closest } = flagStatus;
  const trend = main ? waterTrend(main) : "UNKNOWN";
  const fb = main ? freeboard(main) : null;
  const latest = Object.values(flagStatus.measuredAt).filter((v): v is string => !!v).sort().at(-1) ?? main?.measuredAt ?? null;
  const floodPeak = useMemo(() => peakOf(flood), [flood]);

  const [mode, setMode] = useState<Mode>("live");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  // เล่นจบแล้วกลับไปค่าปัจจุบันเอง — ไม่ให้ภาพค้างเป็นค่าในอดีตจนคนเข้าใจผิด
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => {
      setMode("live");
      setFinished(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [finished]);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const series = mode === "flood" ? flood : mode === "recent" ? recent : [];
  const point = mode === "live" ? null : (series[Math.min(index, series.length - 1)] ?? null);
  const viewedLevel = point ? point.levelMsl : (main?.levelMsl ?? null);
  const viewedStamp = point ? thaiStamp(point.at) : thaiStamp(main?.measuredAt ?? null);

  // หมุดเหตุการณ์ของน้ำท่วม พ.ย. 68: ชั่วโมงแรกที่ล้นตลิ่ง และยอดสูงสุด
  const events = useMemo(() => {
    const bank = main?.bankMsl;
    if (bank == null) return [];
    const over = flood.findIndex((p) => p.levelMsl > bank);
    const peakAt = floodPeak ? flood.indexOf(floodPeak) : -1;
    const at = (i: number) => `${thaiStamp(flood[i]!.at).date} ${thaiStamp(flood[i]!.at).time}`;
    return [
      over >= 0 ? { index: over, label: `เริ่มล้นตลิ่ง ${at(over)}` } : null,
      peakAt >= 0 ? { index: peakAt, label: `สูงสุด ${at(peakAt)}` } : null,
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

  const choose = (m: Mode) => {
    setMode(m);
    setPlaying(false);
    setFinished(false);
    if (m === "flood") {
      // เล่นน้ำขึ้นทันที · ผู้ที่ปิด motion ข้ามไปจุดสูงสุดเลย
      const peakAt = floodPeak ? flood.indexOf(floodPeak) : 0;
      setIndex(reduced ? Math.max(0, peakAt) : 0);
      if (!reduced) setPlaying(true);
    } else if (m === "recent") {
      setIndex(Math.max(0, recent.length - 1));
    }
  };
  const jump = (i: number) => {
    setPlaying(false);
    setFinished(false);
    setIndex(i);
  };

  const historyMark: SceneMark | null = floodPeak
    ? {
        levelMsl: floodPeak.levelMsl,
        // ระดับ ม.รทก. ไม่ใช่ความลึก — บอกเป็น "สูงกว่าตลิ่ง" ที่จุดวัด เพื่อไม่ให้อ่านว่าน้ำลึก 10 เมตร
        label:
          main?.bankMsl != null && floodPeak.levelMsl > main.bankMsl
            ? `น้ำท่วม พ.ย. 68 · สูงกว่าตลิ่ง ${fmt(floodPeak.levelMsl - main.bankMsl)} ม. (จุดวัดหาดใหญ่ใน)`
            : "น้ำท่วม พ.ย. 68 · สูงสุดที่จุดวัดหาดใหญ่ใน",
      }
    : null;

  const scene =
    main && main.bankMsl !== null ? (
      <HadYaiScene
        levelMsl={viewedLevel}
        bankMsl={main.bankMsl}
        groundMsl={main.groundMsl}
        historyMark={historyMark}
        communityNames={communityNames}
        animate={!reduced}
        flag={flag}
      />
    ) : null;

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-100 via-canvas to-mist md:min-h-dvh">
      {/* ฉาก: มือถืออยู่ใต้ข้อความ · จอกว้างเป็นพื้นหลังเต็มจอ */}
      <div className="absolute inset-0 hidden md:block">
        {/* กว้างไม่เกิน 16:9 ของความสูงจอ — จอกว้างแนวนอนจะไม่ครอปด้านบน (เสาธง/ป้ายชุมชนไม่หาย)
            จอแคบกว่า 16:9 ใช้เต็มความกว้างแล้วครอปด้านซ้าย (ฝั่งข้อความ) แทน · ขอบซ้ายของภาพโปร่งใสด้วย mask จึงกลืนกับพื้นไล่สีของส่วนหัวโดยไม่มีรอยต่อ */}
        {scene ? (
          <div className="absolute inset-y-0 right-0 w-[min(100%,177.78dvh)] [mask-image:linear-gradient(to_right,transparent,black_45%)]">{scene}</div>
        ) : null}
      </div>

      <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col px-4 pb-6 pt-5 md:min-h-dvh md:px-10 md:pb-10 md:pt-8">
        {/* แถบเมนูแบบแคปซูลพื้นโปร่ง — ภาพด้านหลังลอดใต้ได้โดยไม่ชนตัวหนังสือ */}
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

        <div className="mt-6 max-w-[38rem] md:mt-10">
          <p className="eyebrow text-sm text-brand-700">ควนลังตอนนี้ · ธงเตือนภัยชุมชน</p>
          <h1 className="mt-3 flex items-center gap-3 text-6xl font-black leading-[1.2] md:gap-5 md:text-8xl">
            <Flag level={flag} className="h-16 w-16 md:h-24 md:w-24" />
            <span className={FLAG_TEXT[flag]}>{ESTIMATED_FLAG_LABEL[flag]}</span>
          </h1>
          <p className="mt-2 text-xl font-bold text-ink-900 md:text-2xl">{FLAG_ACTION[flag]}</p>

          <p className="mt-5 text-base leading-7 text-slate-700 md:text-lg md:leading-8">
            {main ? (
              <>
                น้ำคลองอู่ตะเภา{TREND_PHRASE[trend] ? <b className="text-ink-900">{TREND_PHRASE[trend]}</b> : null} — ที่{placeName(main.name)}{" "}
                {fb === null ? "ยังไม่ทราบระดับตลิ่ง" : fb > 0 ? <>ต่ำกว่าตลิ่ง <b className="text-ink-900">{fmt(fb)} ม.</b></> : <b className="text-red-600">ล้นตลิ่ง {fmt(-fb)} ม.</b>}
                {closest ? (
                  <>
                    <br />
                    ใกล้เกณฑ์ธงที่สุดคือ<b className="text-ink-900">{closest.bridge}</b> อีก <b className="text-ink-900">{fmt(closest.meters)} ม.</b> ถึง
                    {closest.next === "YELLOW" ? "ธงเหลือง" : "ธงแดง"}
                  </>
                ) : null}
              </>
            ) : (
              feedError ?? "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้ ลองใหม่อีกครั้งภายหลัง"
            )}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {latest ? `วัดล่าสุด ${thaiStamp(latest).time} น. · ` : ""}ธงประเมินจากเกณฑ์ของกลุ่มสองคลองควนลัง ไม่ใช่ธงที่ประกาศ ·{" "}
            <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">
              ดูธงที่ประกาศจริง ↗
            </a>
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href="tel:1784" className="btn btn-primary btn-lg">โทรสายด่วน ปภ. 1784</a>
            <a href="#map" className="btn btn-secondary btn-lg">ดูแผนที่ชุมชน ↓</a>
          </div>

          {/* ย้อนดู — การ์ดในคอลัมน์ข้อความ พร้อมหมุดเหตุการณ์ */}
          {main && (recent.length || flood.length) ? (
            <div className="mt-6 rounded-3xl bg-white/85 p-4 shadow-sm ring-1 ring-slate-200 backdrop-blur-md">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-ink-900">ย้อนดูระดับน้ำในภาพ</p>
                <p className={`text-xs font-semibold ${mode === "live" ? "text-slate-500" : "text-brand-700"}`}>
                  {mode === "live" ? "กำลังแสดง: ตอนนี้" : `กำลังแสดง: ${viewedStamp.date} ${viewedStamp.time} น. · ${viewedLevel !== null ? fmt(viewedLevel) : "—"} ม.รทก.`}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
                    onChange={(e) => jump(Number(e.target.value))}
                    className="mt-3 w-full accent-brand-600"
                    aria-label="เลือกเวลาที่ต้องการดูระดับน้ำ"
                  />
                  {mode === "flood" && events.length ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {events.map((e) => (
                        <button
                          key={e.label}
                          type="button"
                          onClick={() => jump(e.index)}
                          className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                        >
                          ⚑ {e.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">กด “น้ำท่วม พ.ย. 68” เพื่อดูน้ำขึ้นจริงทีละชั่วโมงเทียบกับบ้านริมคลอง</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ฉากบนมือถือ — ใต้ข้อความ */}
      {scene ? <div className="relative h-[52dvh] md:hidden">{scene}</div> : null}
    </section>
  );
}
