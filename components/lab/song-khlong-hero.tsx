"use client";

import { useEffect, useMemo, useState } from "react";
import { LogoMark } from "@/components/brand/logo-mark";
import { HadYaiScene, type SceneMark } from "@/components/lab/hadyai-scene";
import { ESTIMATED_FLAG_LABEL, Flag } from "@/components/water/community-flag";
import type { EstimatedFlag } from "@/domain/water/community-flags";
import {
  freeboard,
  levelPercent,
  peakOf,
  WATER_STATUS_LABEL,
  WATER_TREND_LABEL,
  waterStatus,
  waterTrend,
  type HistoryPoint,
  type StationReading,
  type WaterStatus,
} from "@/domain/water/station-status";

type Mode = "live" | "recent" | "flood";

// สีคำแนวโน้มตามสถานะ: ปกติ = มิ้นต์ · เฝ้าระวัง = sun · เตือนภัย = alert · ล้นตลิ่ง = red · ไม่มีข้อมูล = slate
const STATUS_TEXT: Record<WaterStatus, string> = {
  NORMAL: "text-emerald-600 decoration-emerald-500",
  WATCH: "text-sun-700 decoration-sun-500",
  WARNING: "text-alert-600 decoration-alert-500",
  OVERFLOW: "text-red-600 decoration-red-500",
  UNKNOWN: "text-slate-500 decoration-slate-400",
};
const STATUS_DOT: Record<WaterStatus, string> = {
  NORMAL: "bg-emerald-500",
  WATCH: "bg-sun-400",
  WARNING: "bg-alert-500",
  OVERFLOW: "bg-red-600",
  UNKNOWN: "bg-slate-400",
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

function summary(stations: StationReading[]): string {
  const n = stations.length;
  const count = (s: WaterStatus) => stations.filter((x) => waterStatus(x) === s).length;
  const parts = [
    [count("OVERFLOW"), "จุดล้นตลิ่ง"],
    [count("WARNING"), "จุดเตือนภัย"],
    [count("WATCH"), "จุดเฝ้าระวัง"],
  ].filter(([c]) => (c as number) > 0).map(([c, t]) => `${c} ${t}`);
  return parts.length
    ? `${parts.join(" และ ")} จากทั้งหมด ${n} จุดบนคลองอู่ตะเภา`
    : `จุดวัดน้ำบนคลองอู่ตะเภาทั้ง ${n} จุด ยังอยู่ในระดับปกติ`;
}

export function SongKhlongHero({
  stations,
  recent,
  flood,
  communityNames,
  feedError,
  estimatedFlag,
}: {
  stations: StationReading[];
  /** ระดับน้ำรายชั่วโมง 3 วันล่าสุดของจุดวัดหลัก */
  recent: HistoryPoint[];
  /** ระดับน้ำรายชั่วโมงช่วงน้ำท่วมใหญ่ พ.ย. 2568 */
  flood: HistoryPoint[];
  communityNames: string[];
  feedError: string | null;
  /** ธงโดยประมาณจากเกณฑ์ของกลุ่มสองคลองควนลัง (ไม่ใช่ธงที่ประกาศ) */
  estimatedFlag: EstimatedFlag;
}) {
  const main = stations.at(-1) ?? null; // ใกล้ควนลังที่สุด
  const status: WaterStatus = main ? waterStatus(main) : "UNKNOWN";
  const trend = main ? waterTrend(main) : "UNKNOWN";
  const fb = main ? freeboard(main) : null;
  const liveStamp = thaiStamp(main?.measuredAt ?? null);
  const floodPeak = useMemo(() => peakOf(flood), [flood]);
  const recentPeak = useMemo(() => peakOf(recent), [recent]);

  const [mode, setMode] = useState<Mode>("live");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  // เล่นจบแล้วกลับไปค่าปัจจุบันเอง — ไม่ให้ตัวเลขใหญ่ค้างเป็นค่าในอดีตจนคนเข้าใจผิด
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
  const viewedStamp = point ? thaiStamp(point.at) : liveStamp;

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

  const percent = main ? levelPercent({ levelMsl: viewedLevel, bankMsl: main.bankMsl, groundMsl: main.groundMsl }) : null;
  const viewedWhen = mode === "live" ? "ปัจจุบัน" : `${viewedStamp.date} ${viewedStamp.time} น.`;
  // ตัวเลขใหญ่ — ข้อมูลเป็นพระเอก · มีตัวหาร (ความลึกถึงตลิ่ง) และที่มากำกับเสมอ · ไม่ทราบ = "ยังไม่ทราบ" ไม่ใช่ 0%
  const stat = main ? (
    <div className="text-right [text-shadow:0_0_12px_rgb(255_255_255/0.9),0_0_2px_rgb(255_255_255)]">
      <p className="text-sm font-bold text-ink-900 md:text-xl">ระดับน้ำเทียบความลึกถึงตลิ่ง</p>
      <p className={`text-6xl font-black leading-none tracking-tight md:text-[8.5rem] ${percent !== null && percent > 100 ? "text-red-600" : "text-ink-900"}`}>
        {percent === null ? "ยังไม่ทราบ" : `${Math.round(percent)}%`}
      </p>
      <p className="mt-1 text-xs font-semibold text-ink-800 md:text-base">
        {viewedLevel !== null && main.bankMsl !== null && viewedLevel > main.bankMsl ? (
          <b className="text-red-600">ล้นตลิ่ง {fmt(viewedLevel - main.bankMsl)} ม. · </b>
        ) : null}
        จุดวัดน้ำ{placeName(main.name)} · {viewedWhen}
      </p>
    </div>
  ) : null;
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

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-100 via-canvas to-mist md:min-h-dvh">
      {/* ฉาก: มือถืออยู่ใต้ข้อความ · จอกว้างเป็นพื้นหลังเต็มจอ */}
      <div className="absolute inset-0 hidden md:block" >
        {main && main.bankMsl !== null ? (
          <HadYaiScene
            levelMsl={viewedLevel}
            bankMsl={main.bankMsl}
            groundMsl={main.groundMsl}
            historyMark={historyMark}
            communityNames={communityNames}
            animate={!reduced}
            flag={estimatedFlag}
          />
        ) : null}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-canvas via-canvas/80 to-transparent" />
        <div className="absolute bottom-28 right-10 z-10">{stat}</div>
      </div>

      <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col px-4 pb-6 pt-5 md:min-h-dvh md:px-10 md:pb-36 md:pt-8">
        <div className="flex items-center gap-2 text-ink-900">
          <LogoMark size={30} className="text-brand-600" />
          <span className="text-sm font-bold">SKL-FRIS · สองคลองควนลัง</span>
          <span className="badge badge-neutral ml-1">ต้นแบบ</span>
          <a href="#flags" className="ml-auto text-sm font-semibold text-brand-700 hover:underline">ธงเตือนภัย ↓</a>
          <a href="#map" className="ml-4 text-sm font-semibold text-brand-700 hover:underline">แผนที่ ↓</a>
        </div>

        <div className="mt-8 max-w-[40rem] md:mt-[9vh]">
          <p className="eyebrow text-brand-700">คลองอู่ตะเภา · หาดใหญ่</p>
          <h1 className="mt-3 text-[2.6rem] font-black leading-[1.12] tracking-tight text-ink-900 md:text-7xl">
            {main ? (
              <>
                เมื่อ {liveStamp.time} น.
                <br />
                น้ำ<span className={`underline decoration-wavy decoration-[3px] underline-offset-[14px] ${STATUS_TEXT[status]}`}>
                  {trend === "UNKNOWN" ? WATER_STATUS_LABEL[status] : WATER_TREND_LABEL[trend].replace(/^น้ำ/, "กำลัง")}
                </span>
              </>
            ) : (
              "ยังไม่มีข้อมูลระดับน้ำ"
            )}
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-700 md:text-xl">
            {main ? (
              <>
                {summary(stations)}
                <br />
                ที่<b>{placeName(main.name)}</b> ใกล้ควนลังที่สุด{" "}
                {fb === null ? "ยังไม่ทราบระดับตลิ่ง" : fb > 0 ? <>ต่ำกว่าตลิ่ง <b>{fmt(fb)} ม.</b></> : <b className="text-red-600">ล้นตลิ่ง {fmt(-fb)} ม.</b>}
              </>
            ) : (
              feedError ?? "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้ ลองใหม่อีกครั้งภายหลัง"
            )}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#map" className="btn btn-primary btn-lg">
              เปิดแผนที่สองคลอง ↓
            </a>
            <a href="tel:1784" className="btn btn-secondary btn-lg">
              โทรสายด่วน ปภ. 1784
            </a>
          </div>

          <a href="#flags" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white/85 py-1.5 pl-2 pr-4 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300">
            <Flag level={estimatedFlag} className="h-8 w-8" />
            <span>
              ธงโดยประมาณ: <b className="text-ink-900">{ESTIMATED_FLAG_LABEL[estimatedFlag]}</b>
              <span className="block text-xs text-slate-500">คำนวณจากเกณฑ์ชุมชน ไม่ใช่ธงที่ประกาศ · ดูรายละเอียด ↓</span>
            </span>
          </a>
          {stations.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {stations.map((s) => {
                const st = waterStatus(s);
                const f = freeboard(s);
                return (
                  <span key={s.code} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[st]}`} />
                    <b className="text-ink-900">{placeName(s.name)}</b> {WATER_STATUS_LABEL[st]}
                    {f !== null ? <span className="text-slate-500">· {f > 0 ? `ต่ำกว่าตลิ่ง ${fmt(f, 1)} ม.` : `ล้น ${fmt(-f, 1)} ม.`}</span> : null}
                  </span>
                );
              })}
            </div>
          ) : null}
          <p className="mt-4 hidden text-[11px] leading-5 text-slate-500 md:block">
            ระดับน้ำ: คลังข้อมูลน้ำแห่งชาติ (สสน./กรมชลประทาน) · ภาพบ้านและน้ำใช้มาตราส่วนเดียวกัน · เกณฑ์เฝ้าระวัง/เตือนภัยเป็นฉบับร่าง
          </p>
          {recentPeak ? (
            <p className="mt-3 text-sm text-slate-500">
              สูงสุดในช่วง 3 วันที่ผ่านมา {fmt(recentPeak.levelMsl)} ม.รทก. เมื่อ {thaiStamp(recentPeak.at).date} {thaiStamp(recentPeak.at).time} น.
            </p>
          ) : null}
        </div>
      </div>

      {/* ฉากบนมือถือ */}
      {main && main.bankMsl !== null ? (
        <div className="relative h-[52dvh] md:hidden">
          <HadYaiScene
            levelMsl={viewedLevel}
            bankMsl={main.bankMsl}
            groundMsl={main.groundMsl}
            historyMark={historyMark}
            communityNames={communityNames}
            animate={!reduced}
            flag={estimatedFlag}
          />
          {/* จอแคบเห็นแค่ครึ่งขวาของฉาก (เสาธงอยู่ขอบ) — แสดงธงเป็นป้ายมุมซ้ายบนแทน */}
          <a href="#flags" className="absolute left-3 top-3 flex items-center gap-2 rounded-2xl bg-white/90 py-1.5 pl-1.5 pr-3 shadow ring-1 ring-slate-200">
            <Flag level={estimatedFlag} className="h-11 w-11" />
            <span className="leading-tight">
              <b className="block text-base text-ink-900">{ESTIMATED_FLAG_LABEL[estimatedFlag]}</b>
              <span className="text-[11px] text-slate-500">โดยประมาณ</span>
            </span>
          </a>
          <div className="absolute bottom-3 right-3">{stat}</div>
        </div>
      ) : null}

      {/* แถบย้อนดูข้อมูล */}
      {main && (recent.length || flood.length) ? (
        <div className="relative z-10 px-4 pb-5 md:absolute md:inset-x-0 md:bottom-4 md:px-0">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[2rem] bg-white/85 p-2.5 shadow-xl ring-1 ring-slate-200 backdrop-blur-md md:flex-row md:items-center md:gap-4 md:pl-5">
            <div className="flex items-center gap-3 md:w-48 md:shrink-0">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-mist text-lg text-brand-700">⟲</span>
              <div className="leading-tight">
                <p className="text-xs text-slate-500">ย้อนดูข้อมูล</p>
                <p className="text-base font-bold text-ink-900">
                  {mode === "live" ? "ปัจจุบัน" : `${viewedStamp.date} · ${viewedStamp.time}`}
                </p>
                {mode !== "live" && viewedLevel !== null ? <p className="text-xs text-slate-600">{fmt(viewedLevel)} ม.รทก.</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
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
            </div>
            {mode !== "live" && series.length ? (
              <div className="flex flex-1 items-center gap-3">
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
                  className="w-full accent-brand-600"
                  aria-label="เลือกเวลาที่ต้องการดูระดับน้ำ"
                />
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
              <p className="flex-1 text-sm text-slate-500">เลือก “น้ำท่วม พ.ย. 68” เพื่อดูน้ำขึ้นจริงทีละชั่วโมงเทียบกับบ้านริมคลอง</p>
            )}
          </div>
        </div>
      ) : null}
      <p className="px-4 pb-4 text-[11px] leading-5 text-slate-500 md:hidden">
        ระดับน้ำ: คลังข้อมูลน้ำแห่งชาติ (สสน./กรมชลประทาน) · ภาพบ้านและน้ำใช้มาตราส่วนเดียวกัน · เกณฑ์เฝ้าระวัง/เตือนภัยเป็นฉบับร่าง
      </p>
    </section>
  );
}
