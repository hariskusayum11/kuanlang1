"use client";

// ส่วนหัวหน้า "สองคลอง" — ภาพน้ำจริงเทียบบ้านริมคลอง (ดูง่าย เห็นน้ำ) โดยใช้ของระบบนี้เป็นตัวนำ:
// ธงเตือนภัยของชุมชน · เลือกดูจุดวัดได้ (ค่าเริ่มต้น = สะพานที่ใกล้เกณฑ์ธงที่สุด) · เส้นธงเหลือง/แดงบนกำแพง
// · ลูกศรวัดระยะจากผิวน้ำถึงเส้นธงถัดไป · การ์ดย้อนดูพร้อมหมุดเหตุการณ์
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { HadYaiScene, type SceneLine, type SceneMark } from "@/components/lab/hadyai-scene";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";
import { COMMUNITY_FLAG_SOURCE, type BridgeFlagEstimate, type EstimatedFlag } from "@/domain/water/community-flags";
import { freeboard, peakOf, waterTrend, type HistoryPoint, type StationReading, type WaterTrend } from "@/domain/water/station-status";
import type { CommunityFlagStatus } from "@/lib/water/community-flag";
import type { DailyForecast, HourlyWeather, WeatherNow } from "@/lib/water/weather";
import { WeatherWidget } from "@/components/lab/weather-widget";
import { dayPhase, rainLevel, type DayPhase, type RainLevel } from "@/domain/water/sky";

type Mode = "live" | "recent" | "flood" | "forecast";
export interface StationHistory {
  recent: HistoryPoint[];
  flood: HistoryPoint[];
}

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
  RISING: "น้ำกำลังขึ้น",
  FALLING: "น้ำกำลังลด",
  STEADY: "น้ำทรงตัว",
  UNKNOWN: "",
};
// ความหนาแน่นของฝน: ขนาดลาย (เล็ก = ถี่) และความทึบ
const RAIN_LAYER: Record<RainLevel, string> = {
  none: "",
  light: "bg-[length:30px_72px] opacity-25",
  moderate: "bg-[length:20px_60px] opacity-40",
  heavy: "bg-[length:13px_50px] opacity-55",
};
// พื้นหลัง (ท้องฟ้าจริงของภาพ) ตามช่วงเวลา
const SKY_BG: Record<DayPhase, string> = {
  dawn: "from-sun-100 via-canvas to-mist",
  day: "from-brand-100 via-canvas to-mist",
  dusk: "from-sun-200 via-brand-100 to-mist",
  night: "from-ink-950 via-ink-900 to-ink-800",
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

/** เส้นถัดไปที่น้ำยังไม่ถึง (สะพานที่มีเกณฑ์ธง) — เกินแดงแล้วชี้เส้นแดง · ไม่มีเกณฑ์ = null (วัดถึงตลิ่ง) */
function nextTarget(b: BridgeFlagEstimate | undefined, level: number | null) {
  if (!b || b.yellowMsl === null || b.redMsl === null) return null;
  if (level !== null && level >= b.yellowMsl) return { levelMsl: b.redMsl, label: "เกณฑ์ธงแดง" };
  return { levelMsl: b.yellowMsl, label: "เกณฑ์ธงเหลือง" };
}

export function SongKhlongHero({
  stations,
  readings,
  histories,
  communityNames,
  feedError,
  flagStatus,
  lagHours,
  weather,
  rainHistory,
  forecast,
  forcePhase,
  forceRain,
}: {
  /** สถานีบนคลองอู่ตะเภา เรียงต้นน้ำ → ควนลัง (ตัวสุดท้าย = หาดใหญ่ใน) */
  stations: StationReading[];
  /** ทุกสถานี (รวมสะพานบ้านคลองหวะ) */
  readings: StationReading[];
  /** ระดับน้ำย้อนหลังรายชั่วโมงตามรหัสสถานี (3 วันล่าสุด + น้ำท่วม พ.ย. 68) */
  histories: Record<string, StationHistory>;
  communityNames: string[];
  feedError: string | null;
  /** ธงโดยประมาณจากเกณฑ์ของกลุ่มสองคลองควนลัง (ไม่ใช่ธงที่ประกาศ) */
  flagStatus: CommunityFlagStatus;
  /** เวลาที่ยอดน้ำเดินทางระหว่างสถานีติดกัน (ชม.) ตามคู่ "ต้นน้ำ>ปลายน้ำ" — null = ข้อมูลไม่พอ */
  lagHours: Record<string, number | null>;
  /** อากาศปัจจุบันที่หาดใหญ่ (Open-Meteo) — null = ไม่วาดฝน/เมฆ */
  weather: WeatherNow | null;
  /** ฝน/เมฆรายชั่วโมงย้อนหลัง (แบบจำลอง) — ใช้ตอนย้อนดู ให้ภาพตรงกับชั่วโมงนั้น */
  rainHistory: { recent: HourlyWeather[]; flood: HourlyWeather[] };
  /** พยากรณ์ฝน (Open-Meteo) — รายวันแสดงเป็นชิป · รายชั่วโมงใช้เล่นท้องฟ้าในโหมดพยากรณ์ */
  forecast: { daily: DailyForecast[]; hourly: HourlyWeather[] };
  /** บังคับช่วงเวลา/ฝน (พรีวิวผ่าน ?sky= และ ?rain=) */
  forcePhase?: DayPhase;
  forceRain?: RainLevel;
}) {
  const { flag, closest } = flagStatus;
  const main = stations.at(-1) ?? null; // หาดใหญ่ใน — ใกล้ควนลังที่สุด
  const latest = Object.values(flagStatus.measuredAt).filter((v): v is string => !!v).sort().at(-1) ?? main?.measuredAt ?? null;

  // ตัวเลือกภาพ: สะพานที่ใช้ตัดสินธง + จุดวัดหาดใหญ่ใน · เริ่มที่สะพานใกล้เกณฑ์ที่สุด
  const options = useMemo(() => {
    const codes = [...flagStatus.bridges.map((b) => b.criterion.stationCode), ...(main ? [main.code] : [])];
    return codes.flatMap((code) => {
      const r = readings.find((x) => x.code === code);
      return r && r.bankMsl !== null ? [{ reading: r, bridge: flagStatus.bridges.find((b) => b.criterion.stationCode === code) }] : [];
    });
  }, [flagStatus.bridges, readings, main]);
  const closestCode = flagStatus.bridges.find((b) => b.criterion.bridge === closest?.bridge)?.criterion.stationCode;
  const [selected, setSelected] = useState(closestCode ?? options[0]?.reading.code ?? "");
  const current = options.find((o) => o.reading.code === selected) ?? options[0] ?? null;
  const reading = current?.reading ?? null;
  const bridge = current?.bridge;
  const hist: StationHistory = (reading && histories[reading.code]) || { recent: [], flood: [] };

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
  const [clockPhase, setClockPhase] = useState<DayPhase>("day");
  useEffect(() => {
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
      setClockPhase(dayPhase(get("hour"), get("minute")));
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const forecastSeries = useMemo(
    () => (reading?.levelMsl != null ? forecast.hourly.map((h) => ({ at: h.at, levelMsl: reading.levelMsl! })) : []),
    [forecast.hourly, reading?.levelMsl],
  );
  const series = mode === "flood" ? hist.flood : mode === "recent" ? hist.recent : mode === "forecast" ? forecastSeries : [];
  const point = mode === "live" ? null : (series[Math.min(index, series.length - 1)] ?? null);
  const viewedLevel = point ? point.levelMsl : (reading?.levelMsl ?? null);
  const viewedStamp = point ? thaiStamp(point.at) : thaiStamp(reading?.measuredAt ?? null);
  const floodPeak = useMemo(() => peakOf(hist.flood), [hist.flood]);

  // ท้องฟ้า: ตอนนี้ = เวลา/อากาศปัจจุบัน · ย้อนดู = เวลาและฝนของชั่วโมงนั้น (ฝนจากแบบจำลองย้อนหลัง)
  const pastWeather = useMemo(() => {
    if (!point) return null;
    const list = mode === "flood" ? rainHistory.flood : mode === "forecast" ? forecast.hourly : rainHistory.recent;
    return list.find((w) => w.at === point.at) ?? null;
  }, [point, mode, rainHistory, forecast.hourly]);
  const pointPhase = point ? dayPhase(Number(point.at.slice(11, 13)), Number(point.at.slice(14, 16))) : null;
  const phase = forcePhase ?? pointPhase ?? clockPhase;
  const rain = forceRain ?? rainLevel(point ? (pastWeather?.rainMmPerHour ?? null) : (weather?.rainMmPerHour ?? null));
  const cloud = forceRain && forceRain !== "none" ? 90 : point ? (pastWeather?.cloudCover ?? 0) : (weather?.cloudCover ?? 0);
  const night = phase === "night";
  /** สีตัวอักษรตามพื้น — กลางคืนพื้นมืดจึงใช้สีอ่อน */
  const tone = (day: string, dark: string) => (night ? dark : day);

  // หมุดเหตุการณ์ของน้ำท่วม พ.ย. 68 — สะพาน: ถึงธงเหลือง/แดง · หาดใหญ่ใน: เริ่มล้นตลิ่ง · ทุกจุด: สูงสุด
  const events = useMemo(() => {
    if (mode === "forecast") {
      const peak = forecast.hourly.reduce<{ i: number; mm: number }>((b, h, i) => (h.rainMmPerHour > b.mm ? { i, mm: h.rainMmPerHour } : b), { i: -1, mm: 0 });
      if (peak.i < 0 || peak.mm < 0.1) return [];
      const st = thaiStamp(forecast.hourly[peak.i]!.at);
      return [{ index: peak.i, label: `ฝนหนักสุด ${st.date} ${st.time} (${peak.mm.toFixed(1)} มม./ชม.)` }];
    }
    if (!reading?.bankMsl) return [];
    const at = (i: number) => `${thaiStamp(hist.flood[i]!.at).date} ${thaiStamp(hist.flood[i]!.at).time}`;
    const first = (v: number) => hist.flood.findIndex((p) => p.levelMsl >= v);
    const marks: Array<{ index: number; label: string }> = [];
    if (bridge?.yellowMsl != null && bridge.redMsl != null) {
      const y = first(bridge.yellowMsl);
      const r = first(bridge.redMsl);
      if (y >= 0) marks.push({ index: y, label: `ถึงธงเหลือง ${at(y)}` });
      if (r >= 0) marks.push({ index: r, label: `ถึงธงแดง ${at(r)}` });
    } else {
      const over = hist.flood.findIndex((p) => p.levelMsl > reading.bankMsl!);
      if (over >= 0) marks.push({ index: over, label: `เริ่มล้นตลิ่ง ${at(over)}` });
    }
    const peakAt = floodPeak ? hist.flood.indexOf(floodPeak) : -1;
    if (peakAt >= 0) marks.push({ index: peakAt, label: `สูงสุด ${at(peakAt)}` });
    return marks;
  }, [hist.flood, floodPeak, reading?.bankMsl, bridge, mode, forecast.hourly]);

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
      const peakAt = floodPeak ? hist.flood.indexOf(floodPeak) : 0;
      setIndex(reduced ? Math.max(0, peakAt) : 0);
      if (!reduced) setPlaying(true);
    } else if (m === "recent") {
      setIndex(Math.max(0, hist.recent.length - 1));
    } else if (m === "forecast") {
      setIndex(0);
      if (!reduced) setPlaying(true);
    }
  };
  const jump = (i: number) => {
    setPlaying(false);
    setFinished(false);
    setIndex(i);
  };
  const pick = (code: string) => {
    setSelected(code);
    setMode("live");
    setPlaying(false);
    setFinished(false);
  };

  const placeLabel = bridge ? bridge.criterion.bridge : reading ? `จุดวัดน้ำ${placeName(reading.name)}` : "";
  const lines: SceneLine[] =
    bridge?.yellowMsl != null && bridge.redMsl != null
      ? [
          { levelMsl: bridge.yellowMsl, label: "ธงเหลือง", tone: "yellow" },
          { levelMsl: bridge.redMsl, label: "deck" in bridge.criterion.red ? "ธงแดง (จมสะพาน)" : "ธงแดง", tone: "red" },
        ]
      : [];
  const target = nextTarget(bridge, viewedLevel);
  const historyMark: SceneMark | null =
    floodPeak && reading?.bankMsl != null
      ? {
          levelMsl: floodPeak.levelMsl,
          // ระดับ ม.รทก. ไม่ใช่ความลึก — บอกเทียบตลิ่งของจุดวัดนี้
          label:
            floodPeak.levelMsl > reading.bankMsl
              ? `น้ำท่วม พ.ย. 68 · สูงกว่าตลิ่ง ${fmt(floodPeak.levelMsl - reading.bankMsl)} ม.`
              : `น้ำท่วม พ.ย. 68 · สูงสุด ${fmt(floodPeak.levelMsl)} ม.รทก.`,
        }
      : null;

  // บรรทัดสรุปของจุดที่เลือก
  const fb = reading ? freeboard(reading) : null;
  const trend = reading ? TREND_PHRASE[waterTrend(reading)] : "";
  const nextIdx = reading ? stations.findIndex((s) => s.code === reading.code) : -1;
  const next = nextIdx >= 0 ? stations[nextIdx + 1] : undefined;
  const lag = next && reading ? lagHours[`${reading.code}>${next.code}`] : null;

  const scene = (viewX: number) =>
    reading && reading.bankMsl !== null ? (
      <HadYaiScene
        viewX={viewX}
        phase={phase}
        rain={rain}
        cloud={cloud}
        levelMsl={viewedLevel}
        bankMsl={reading.bankMsl}
        groundMsl={reading.groundMsl}
        historyMark={historyMark}
        // ชื่อชุมชนบนบ้านแสดงเฉพาะภาพหาดใหญ่ใน (ใกล้ควนลัง) — ภาพสะพานอื่นไม่ให้อ่านว่าชุมชนท่วมเท่าระดับที่สะพาน
        communityNames={reading.code === main?.code ? communityNames : []}
        animate={!reduced}
        placeLabel={placeLabel}
        lines={lines}
        target={target}
      />
    ) : null;

  const hasReplay = Boolean(reading && (hist.recent.length || hist.flood.length || forecastSeries.length));

  return (
    <section className={`relative isolate overflow-hidden bg-gradient-to-b md:min-h-dvh ${SKY_BG[phase]} ${rain !== "none" && !night ? "saturate-[.8]" : ""}`}>
      {/* ฉาก: มือถืออยู่ใต้ข้อความ · จอกว้างเป็นพื้นหลังเต็มจอ */}
      <div className="absolute inset-0 hidden md:block">
        {/* ขนาดภาพ = min(สูงเต็มจอลบแถบย้อนดู 6rem, กว้างพอให้เห็น 1350 หน่วยจากขวา) ตามสัดส่วนกรอบ 1600×705 —
            ภาพจบเหนือแถบย้อนดู แถบจึงไม่บังเส้นขอบน้ำแม้น้ำต่ำ ·
            ใหญ่ที่สุดโดยไม่ครอปด้านบน และไม้วัด/เส้นธงไม่ไปอยู่ใต้คอลัมน์ข้อความ · ส่วนซ้ายที่ล้นจอถูกตัดโดย overflow-hidden · ขอบซ้ายของภาพโปร่งใสด้วย mask จึงกลืนกับพื้นไล่สีของส่วนหัวโดยไม่มีรอยต่อ */}
        {reading ? (
          <div className="absolute bottom-24 right-0 h-[min(calc(100dvh_-_6rem),52.2vw)] w-[min(calc((100dvh_-_6rem)*2.27),118.5vw)] [mask-image:linear-gradient(to_right,transparent,black_45%)]">{scene(0)}</div>
        ) : null}
      </div>

      <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col px-4 pb-6 pt-5 md:min-h-dvh md:px-10 md:pb-40 md:pt-8">
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

        {/* อากาศ: มือถืออยู่ใต้เมนู · จอกว้างลอยมุมขวาล่างเหนือแถบย้อนดู (ไม่มีแถบย้อนดู = อยู่ใต้เมนูทุกจอ) */}
        {weather ? (
          <div className={`mt-4 ${hasReplay ? "md:hidden" : ""}`}>
            <WeatherWidget weather={weather} daily={forecast.daily} dark={night} />
          </div>
        ) : null}

        <div className="mt-5 max-w-[36rem] md:mt-8">
          <p className={`eyebrow text-sm ${tone("text-brand-700", "text-sky-300")}`}>ควนลังตอนนี้ · ธงเตือนภัยชุมชน</p>
          <h1 className="mt-3 flex items-center gap-3 text-6xl font-black leading-[1.2] md:gap-5 md:text-8xl">
            <Flag level={flag} className="h-16 w-16 md:h-24 md:w-24" />
            <span className={FLAG_TEXT[flag]}>{ESTIMATED_FLAG_LABEL[flag]}</span>
          </h1>
          <p className={`mt-2 text-xl font-bold md:text-2xl ${tone("text-ink-900", "text-white")}`}>{FLAG_ACTION[flag]}</p>

          {/* เลือกจุดวัดที่ภาพแสดง — ธงประเมินจาก 3 สะพาน · หาดใหญ่ในใกล้ควนลังที่สุด */}
          {options.length ? (
            <div className="mt-5">
              <p className={`text-xs font-semibold ${tone("text-slate-500", "text-slate-300")}`}>ธงดูจากระดับน้ำที่ 3 สะพาน · กดเพื่อดูในภาพ</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="เลือกจุดวัดที่แสดงในภาพ">
                {options.map((o) => {
                  const on = o.reading.code === reading?.code;
                  return (
                    <button
                      key={o.reading.code}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => pick(o.reading.code)}
                      className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-semibold ring-1 transition ${
                        on
                          ? tone("bg-ink-900 text-white ring-ink-900", "bg-white text-ink-900 ring-white")
                          : tone("bg-white/85 text-ink-900 ring-slate-200 hover:ring-brand-300", "bg-white/15 text-white ring-white/30 hover:ring-white/60")
                      }`}
                    >
                      {o.bridge ? <Flag level={o.bridge.flag} className="h-5 w-5" /> : <span className="mx-1 h-2.5 w-2.5 rounded-full bg-brand-500" />}
                      {placeName(o.reading.name)}
                    </button>
                  );
                })}
              </div>
              {reading ? (
                <p className={`mt-2 text-sm leading-6 ${tone("text-slate-700", "text-slate-200")}`}>
                  <b className={tone("text-ink-900", "text-white")}>{placeLabel}</b>
                  {bridge ? <> · {bridge.criterion.canal}</> : <> · ใกล้ควนลังที่สุด</>}
                  {" — "}
                  {fb === null ? "ไม่ทราบระดับตลิ่ง" : fb > 0 ? <>ต่ำกว่าตลิ่ง {fmt(fb)} ม.</> : <b className="text-red-600">ล้นตลิ่ง {fmt(-fb)} ม.</b>}
                  {trend ? <> · {trend}</> : null}
                  {closestCode === reading.code ? <span className="ml-1 rounded-full bg-sun-100 px-2 py-0.5 text-xs font-bold text-sun-800">ใกล้เกณฑ์ธงที่สุด</span> : null}
                  {lag && next ? <span className={`block text-xs ${tone("text-slate-500", "text-slate-400")}`}>ปี 68 ยอดน้ำจากจุดนี้ถึง{placeName(next.name)} ~{Math.round(lag)} ชม.</span> : null}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-600">{feedError ?? "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้ ลองใหม่อีกครั้งภายหลัง"}</p>
          )}

          <p className={`mt-3 text-xs leading-5 ${tone("text-slate-500", "text-slate-400")}`}>
            {mode === "forecast" && pastWeather && !forceRain ? (
              <span className={`mb-1 block font-semibold ${tone("text-slate-700", "text-slate-200")}`}>
                พยากรณ์ฝน {viewedStamp.date} {viewedStamp.time} น.: {pastWeather.rainMmPerHour.toFixed(1)} มม./ชม. · เมฆ {Math.round(pastWeather.cloudCover)}%
                <span className="font-normal"> (ระดับน้ำในภาพเป็นค่าตอนนี้ — ยังไม่มีพยากรณ์ระดับน้ำ)</span>
              </span>
            ) : point && pastWeather && !forceRain ? (
              <span className={`mb-1 block font-semibold ${tone("text-slate-700", "text-slate-200")}`}>
                ฝนที่หาดใหญ่ {viewedStamp.date} {viewedStamp.time} น.: {pastWeather.rainMmPerHour.toFixed(1)} มม./ชม. · เมฆ {Math.round(pastWeather.cloudCover)}%
                <span className="font-normal"> (แบบจำลองย้อนหลัง อาจต่ำกว่าที่สถานีวัดได้จริง)</span>
              </span>
            ) : !point && forceRain ? (
              <span className={`mb-1 block font-semibold ${tone("text-slate-700", "text-slate-200")}`}>
                อากาศหาดใหญ่ (พรีวิว): ฝน{forceRain === "none" ? "ไม่ตก" : ""}
              </span>
            ) : null}
            {latest ? `วัดล่าสุด ${thaiStamp(latest).time} น. · ` : ""}ธงประเมินจากเกณฑ์ของกลุ่มสองคลองควนลัง ไม่ใช่ธงที่ประกาศ ·{" "}
            <a href={COMMUNITY_FLAG_SOURCE.url} target="_blank" rel="noopener noreferrer" className={`font-semibold underline ${tone("text-brand-700", "text-sky-300")}`}>
              ดูธงที่ประกาศจริง ↗
            </a>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a href="tel:1784" className="btn btn-primary btn-lg">โทรสายด่วน ปภ. 1784</a>
            <a href="#map" className="btn btn-secondary btn-lg">ดูแผนที่ชุมชน ↓</a>
          </div>

        </div>
      </div>

      {/* ฝน — ชั้นเหนือภาพแต่ใต้ข้อความ (z-5) และจางฝั่งข้อความบนจอกว้าง ไม่ให้ลายฝนรบกวนการอ่าน
          · ลายเม็ดฝนจาก currentColor · ความหนาแน่นตามระดับฝนจริง · ปิดการเคลื่อนไหวเมื่อผู้ใช้ลด motion */}
      {rain !== "none" ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[5] bg-[linear-gradient(105deg,transparent_46%,currentColor_46%,currentColor_52%,transparent_52%)] md:[mask-image:linear-gradient(to_right,transparent_30%,black_60%)] ${reduced ? "" : "animate-rain-fall"} ${
            night ? "text-sky-200" : "text-white"
          } ${RAIN_LAYER[rain]}`}
        />
      ) : null}

      {/* ฉากบนมือถือ — ใต้ข้อความ · กรอบเลื่อนมาฝั่งไม้วัด/บ้านให้ภาพใหญ่ */}
      {reading ? <div className="relative aspect-[820/705] w-full md:hidden">{scene(780)}</div> : null}

      {/* ย้อนดู — แถบยาวเต็มความกว้างใต้ภาพ พร้อมขีดหมุดเหตุการณ์บนแถบเลื่อน */}
      {hasReplay ? (
        <div className="relative z-10 px-4 pb-5 md:absolute md:inset-x-0 md:bottom-3 md:px-10">
          {/* แคปซูลอากาศลอยเหนือแถบ — ผูกกับขอบบนของแถบ จึงไม่ทับแม้แถบสูงขึ้น (เช่น มีแถวหมุดเหตุการณ์) */}
          {weather ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-3 hidden px-10 md:block">
              <div className="pointer-events-auto mx-auto flex max-w-[1500px] justify-end">
                <WeatherWidget weather={weather} daily={forecast.daily} dark={night} placement="up" />
              </div>
            </div>
          ) : null}
          <div
            className={`mx-auto flex max-w-[1500px] flex-col gap-3 rounded-[1.75rem] p-3 ring-1 transition-colors md:flex-row md:items-center md:gap-5 md:px-5 ${
              mode === "live" ? "bg-white/70 ring-slate-200 hover:bg-white/90 focus-within:bg-white/90" : "bg-white/90 shadow-lg ring-slate-200"
            }`}
          >
            <div className="shrink-0 leading-tight md:w-60">
              <p className="text-xs font-semibold text-slate-500">{mode === "forecast" ? "พยากรณ์ฝน · ระดับน้ำคงค่าตอนนี้" : `ย้อนดูระดับน้ำ · ${placeLabel}`}</p>
              <p className="whitespace-nowrap text-base font-black text-ink-900">{mode === "live" ? "ตอนนี้" : `${viewedStamp.date} · ${viewedStamp.time} น.`}</p>
              {mode !== "live" && viewedLevel !== null ? <p className="text-xs font-semibold text-slate-600">ระดับน้ำ {fmt(viewedLevel)} ม.รทก.</p> : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {(
                [
                  ["live", "ตอนนี้", true],
                  ["recent", "3 วันล่าสุด", hist.recent.length > 0],
                  ["flood", "น้ำท่วม พ.ย. 68", hist.flood.length > 0],
                  ["forecast", "พยากรณ์ฝน 3 วัน", forecastSeries.length > 0],
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
            </div>
            {mode !== "live" && series.length ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={series.length - 1}
                    value={Math.min(index, series.length - 1)}
                    onChange={(e) => jump(Number(e.target.value))}
                    className="w-full accent-brand-600"
                    aria-label="เลือกเวลาที่ต้องการดูระดับน้ำ"
                  />
                  {mode === "flood" || mode === "forecast"
                    ? events.map((e) => (
                        <button
                          key={e.label}
                          type="button"
                          title={e.label}
                          onClick={() => jump(e.index)}
                          className="absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white hover:bg-red-700"
                          style={{ left: `${(e.index / Math.max(1, series.length - 1)) * 100}%` }}
                        >
                          ⚑ {e.label.split(" ")[0]}
                        </button>
                      ))
                    : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFinished(false);
                    if (playing) return setPlaying(false);
                    if (index >= series.length - 1) setIndex(0);
                    setPlaying(true);
                  }}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow"
                  aria-label={playing ? "หยุด" : "เล่น"}
                >
                  {playing ? "❚❚" : "▶"}
                </button>
              </div>
            ) : (
              <p className="flex-1 text-sm text-slate-500">กด “น้ำท่วม พ.ย. 68” เพื่อดูน้ำขึ้นจริงทีละชั่วโมงเทียบกับเส้นธงและบ้านริมคลอง</p>
            )}
          </div>
          {(mode === "flood" || mode === "forecast") && events.length ? (
            <p className={`mx-auto mt-1.5 max-w-[1500px] px-2 text-[11px] font-semibold md:px-5 ${tone("text-red-700", "text-red-300")}`}>{events.map((e) => `⚑ ${e.label}`).join("   ·   ")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
