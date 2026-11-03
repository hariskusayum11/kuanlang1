"use client";

// วิดเจ็ตอากาศหาดใหญ่ (หน้าต้นแบบ /lab/song-khlong) — แคปซูลสรุป กดแล้วเปิดการ์ดรายละเอียด
// ข้อมูล: Open-Meteo (แบบจำลองพยากรณ์อากาศ + Air Quality) สำหรับพื้นที่หาดใหญ่ — ไม่ใช่เครื่องวัดในชุมชน
import { useEffect, useRef, useState } from "react";
import { WeatherIcon } from "@/components/water/weather-icon";
import { AQI_LABEL, aqiLevel, DAILY_RAIN_LABEL, dailyRain, rainSoon, weatherLabel, type AqiLevel, type DailyRain } from "@/domain/water/sky";
import type { DailyForecast, WeatherNow } from "@/lib/water/weather";

const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// AQI: ดี = มิ้นต์ · ปานกลาง = sun (คำเตือน) · มีผลต่อสุขภาพขึ้นไป = red · ไม่ทราบ = slate
const AQI_TEXT: Record<AqiLevel, string> = {
  good: "text-emerald-600",
  moderate: "text-sun-700",
  sensitive: "text-red-600",
  unhealthy: "text-red-600",
  veryUnhealthy: "text-red-700",
  unknown: "text-slate-500",
};
const DAILY_CHIP: Record<DailyRain, string> = {
  none: "bg-white text-slate-600 ring-slate-200",
  light: "bg-white text-brand-700 ring-brand-200",
  moderate: "bg-brand-50 text-brand-800 ring-brand-300",
  heavy: "bg-sun-100 text-sun-800 ring-sun-300",
  veryHeavy: "bg-sun-300 text-ink-900 ring-sun-500",
};

/** เวลาไทยตอนนี้ (อัปเดตทุก 30 วินาที) — เริ่มเป็น null เพื่อให้ server/client ตรงกัน */
function useBangkokNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const month = Number(get("month")) - 1;
  return { time: `${get("hour")}:${get("minute")}`, dow, day: Number(get("day")), month, yearBe: Number(get("year")) + 543 };
}

export function WeatherWidget({
  weather,
  daily,
  dark = false,
  placement = "down",
}: {
  weather: WeatherNow;
  daily: DailyForecast[];
  dark?: boolean;
  /** down = การ์ดเปิดลงชิดซ้าย · up = เปิดขึ้นชิดขวา (แคปซูลลอยมุมขวาล่าง) */
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = useBangkokNow();

  // ปิดเมื่อคลิกข้างนอกหรือกด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const probNow = weather.next[0]?.probability ?? null;
  const soon = rainSoon(weather.next.slice(1).length ? weather.next : []);
  const aqi = aqiLevel(weather.aqi);
  const fmt0 = (n: number | null, unit = "") => (n === null ? "—" : `${Math.round(n)}${unit}`);

  let advice: string;
  if (weather.rainMmPerHour >= 0.1) advice = `ฝนกำลังตกตอนนี้ (${weather.rainMmPerHour.toFixed(1)} มม./ชม.) — ออกจากบ้านพกร่มด้วย`;
  else if (soon && soon.hours === 0) advice = `ชั่วโมงนี้มีโอกาสฝนตก ${Math.round(soon.probability)}% — พกร่มไว้ด้วย`;
  else if (soon) advice = `อีกราว ${soon.hours} ชม. มีโอกาสฝนตก ${Math.round(soon.probability)}% — พกร่มไว้ด้วย`;
  else advice = "6 ชั่วโมงข้างหน้าโอกาสฝนตกต่ำ";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ดูรายละเอียดอากาศหาดใหญ่"
        className={`flex items-center gap-3 rounded-full py-1.5 pl-4 pr-3 text-left shadow-md ring-1 backdrop-blur-md transition ${
          dark ? "bg-white/10 text-white ring-white/25 hover:bg-white/20" : "bg-white/90 text-ink-900 ring-slate-200 hover:ring-brand-300"
        }`}
      >
        <span className="leading-tight">
          <b className="block text-base tabular-nums">{now?.time ?? "—"}</b>
          <span className={`block text-[11px] ${dark ? "text-slate-300" : "text-slate-500"}`}>
            {now ? `${DAYS[now.dow]} ${now.day} ${MONTHS_SHORT[now.month]}` : "หาดใหญ่"}
          </span>
        </span>
        <span className={`h-8 w-px ${dark ? "bg-white/25" : "bg-slate-200"}`} />
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">LIVE</span>
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="h-7 w-7" />
        <b className="text-xl tabular-nums">{fmt0(weather.temperature, "°")}</b>
        <span className={`text-xs ${dark ? "text-slate-200" : "text-slate-600"}`}>💧{fmt0(weather.humidity, "%")}</span>
        <span className={`text-xs ${dark ? "text-slate-200" : "text-slate-600"}`}>☂{fmt0(probNow, "%")}</span>
      </button>

      {open ? (
        <div
          className={`absolute z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-3xl ${
            placement === "up" ? "bottom-full right-0 mb-2 max-h-[calc(100dvh-13rem)]" : "left-0 top-full mt-2 md:max-h-[calc(100dvh-17rem)]"
          } bg-white p-4 text-ink-900 shadow-2xl ring-1 ring-slate-200`}
        >
          <p className="border-b border-slate-100 pb-2 text-sm">
            {now ? (
              <>
                วัน{DAYS[now.dow]}ที่ {now.day} {MONTHS[now.month]} {now.yearBe} · <b>{now.time} น.</b>
              </>
            ) : (
              "อากาศหาดใหญ่"
            )}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
            อากาศหาดใหญ่ตอนนี้
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              LIVE
            </span>
          </p>
          <div className="mt-1 flex items-center gap-3">
            <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="h-14 w-14" />
            <div>
              <p className="text-4xl font-black tabular-nums">{fmt0(weather.temperature, "°C")}</p>
              <p className="text-sm text-slate-600">{weatherLabel(weather.weatherCode)}</p>
            </div>
          </div>
          <p className={`mt-3 rounded-2xl px-3 py-2 text-sm font-bold ${soon || weather.rainMmPerHour >= 0.1 ? "bg-brand-50 text-brand-800" : "bg-slate-50 text-slate-600"}`}>{advice}</p>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {[
              ["รู้สึกเหมือน", fmt0(weather.feelsLike, "°"), ""],
              ["ความชื้น", fmt0(weather.humidity, "%"), ""],
              ["ลม (กม./ชม.)", fmt0(weather.windKmh), ""],
              ["โอกาสฝน", fmt0(probNow, "%"), ""],
              ["ฝนตอนนี้ (มม.)", weather.rainMmPerHour.toFixed(1), ""],
              ["AQI", fmt0(weather.aqi), AQI_LABEL[aqi]],
            ].map(([k, v, note]) => (
              <div key={k} className="rounded-2xl bg-mist px-3 py-2">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className={`text-lg font-black tabular-nums ${k === "AQI" ? AQI_TEXT[aqi] : ""}`}>{v}</dd>
                {note ? <dd className={`text-[11px] font-semibold ${AQI_TEXT[aqi]}`}>{note}</dd> : null}
              </div>
            ))}
          </dl>
          {weather.pm25 !== null ? <p className="mt-1.5 text-[11px] text-slate-500">PM2.5 {weather.pm25.toFixed(1)} µg/m³ · AQI มาตรฐานสหรัฐฯ · Open-Meteo Air Quality</p> : null}

          {weather.next.length > 1 ? (
            <>
              <p className="mt-3 text-xs font-bold text-slate-700">ชั่วโมงถัดไป (โอกาสฝน)</p>
              <ol className="mt-1.5 grid grid-cols-6 gap-1 text-center">
                {weather.next.slice(1, 7).map((h) => (
                  <li key={h.at} className="text-xs">
                    <p className="text-slate-500">{h.at.slice(11, 16)}</p>
                    <WeatherIcon code={h.weatherCode} isDay={h.isDay} className="mx-auto h-7 w-7" />
                    <p className="font-bold tabular-nums">{fmt0(h.temperature, "°")}</p>
                    <p className={`tabular-nums ${h.probability !== null && h.probability >= 50 ? "font-bold text-brand-700" : "text-slate-500"}`}>{fmt0(h.probability, "%")}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {daily.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-700">พยากรณ์ฝน:</span>
              {daily.slice(0, 3).map((d, i) => {
                const lvl = dailyRain(d.rainMm);
                const [, m, day] = d.date.split("-").map(Number);
                return (
                  <span key={d.date} className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${DAILY_CHIP[lvl]}`} title={DAILY_RAIN_LABEL[lvl]}>
                    {i === 0 ? "วันนี้" : i === 1 ? "พรุ่งนี้" : `${day} ${MONTHS_SHORT[(m ?? 1) - 1]}`} {d.rainMm.toFixed(0)} มม.
                    {d.probability !== null ? <span className="font-normal opacity-80"> {Math.round(d.probability)}%</span> : null}
                  </span>
                );
              })}
            </div>
          ) : null}

          {weather.sunrise || weather.sunset ? (
            <p className="mt-3 text-sm text-slate-700">
              ☀ พระอาทิตย์ขึ้น {weather.sunrise ?? "—"} · ☾ ตก {weather.sunset ?? "—"}
            </p>
          ) : null}
          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-500">
            ข้อมูลพยากรณ์: Open-Meteo (CC BY 4.0) · อัปเดต {weather.time.slice(11, 16)} น. · เป็นค่าจากแบบจำลองสำหรับพื้นที่หาดใหญ่
            ไม่ใช่เครื่องวัดในชุมชน · พยากรณ์มีความไม่แน่นอน ไม่ใช่ประกาศของกรมอุตุนิยมวิทยา
          </p>
        </div>
      ) : null}
    </div>
  );
}
