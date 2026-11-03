import { describe, it, expect } from "vitest";
import { dayPhase, rainLevel, weatherLabel } from "../../domain/water/sky";

// ท้องฟ้าของภาพส่วนหัว /lab/song-khlong

describe("dayPhase", () => {
  it("แบ่งช่วงเวลาตามเวลาไทย", () => {
    expect(dayPhase(5, 0)).toBe("night");
    expect(dayPhase(5, 30)).toBe("dawn");
    expect(dayPhase(7, 0)).toBe("day");
    expect(dayPhase(17, 29)).toBe("day");
    expect(dayPhase(17, 30)).toBe("dusk");
    expect(dayPhase(19, 0)).toBe("night");
    expect(dayPhase(0, 0)).toBe("night");
  });
});

describe("rainLevel", () => {
  it("ตามเกณฑ์ มม./ชม.", () => {
    expect(rainLevel(0)).toBe("none");
    expect(rainLevel(0.05)).toBe("none");
    expect(rainLevel(1.2)).toBe("light");
    expect(rainLevel(5)).toBe("moderate");
    expect(rainLevel(12)).toBe("heavy");
  });
  it("ค่าเพี้ยน/ไม่มีข้อมูล = ไม่ตก", () => {
    expect(rainLevel(null)).toBe("none");
    expect(rainLevel(Number.NaN)).toBe("none");
    expect(rainLevel(-1)).toBe("none");
  });
});

describe("weatherLabel", () => {
  it("รหัส WMO → คำไทย", () => {
    expect(weatherLabel(0)).toBe("ท้องฟ้าแจ่มใส");
    expect(weatherLabel(55)).toBe("ฝนปรอย");
    expect(weatherLabel(63)).toBe("ฝนตก");
    expect(weatherLabel(95)).toBe("พายุฝนฟ้าคะนอง");
    expect(weatherLabel(null)).toBe("ไม่ทราบสภาพอากาศ");
  });
});

describe("parseOpenMeteo", () => {
  it("แปลงฝนช่วง 15 นาทีเป็น มม./ชม. และข้ามข้อมูลไม่ครบ", async () => {
    const { parseOpenMeteo } = await import("../../lib/water/weather");
    expect(
      parseOpenMeteo({
        current: { time: "2026-11-03T11:15", interval: 900, precipitation: 0.3, cloud_cover: 93, weather_code: 55, temperature_2m: 28.4, relative_humidity_2m: 81, is_day: 1 },
      }),
    ).toMatchObject({ time: "2026-11-03T11:15", rainMmPerHour: 1.2, cloudCover: 93, weatherCode: 55, temperature: 28.4, humidity: 81, feelsLike: null, isDay: true });
    expect(parseOpenMeteo({ current: { time: "x", precipitation: null } })).toBeNull();
    expect(parseOpenMeteo(null)).toBeNull();
  });
});

describe("parseOpenMeteoHourly", () => {
  it("แปลงเวลาให้ตรงรูปแบบข้อมูลระดับน้ำ และข้ามชั่วโมงที่ไม่มีค่า", async () => {
    const { parseOpenMeteoHourly } = await import("../../lib/water/weather");
    const out = parseOpenMeteoHourly({
      hourly: { time: ["2025-11-20T04:00", "2025-11-20T05:00", "2025-11-20T06:00"], precipitation: [45.5, null, 3], cloud_cover: [100, 100, null] },
    });
    expect(out).toEqual([
      { at: "2025-11-20 04:00", rainMmPerHour: 45.5, cloudCover: 100 },
      { at: "2025-11-20 06:00", rainMmPerHour: 3, cloudCover: 0 },
    ]);
    expect(parseOpenMeteoHourly({})).toEqual([]);
  });
});

describe("พยากรณ์ฝนรายวัน", () => {
  it("dailyRain ตามเกณฑ์กรมอุตุนิยมวิทยา", async () => {
    const { dailyRain } = await import("../../domain/water/sky");
    expect(dailyRain(0)).toBe("none");
    expect(dailyRain(8.5)).toBe("light");
    expect(dailyRain(19.4)).toBe("moderate");
    expect(dailyRain(60)).toBe("heavy");
    expect(dailyRain(180)).toBe("veryHeavy");
    expect(dailyRain(null)).toBe("none");
  });
  it("parseOpenMeteoDaily", async () => {
    const { parseOpenMeteoDaily } = await import("../../lib/water/weather");
    expect(
      parseOpenMeteoDaily({ daily: { time: ["2026-11-04", "2026-11-05"], precipitation_sum: [12.1, null], precipitation_probability_max: [100, 95], weather_code: [95, 95] } }),
    ).toEqual([{ date: "2026-11-04", rainMm: 12.1, probability: 100, weatherCode: 95 }]);
    expect(parseOpenMeteoDaily({})).toEqual([]);
  });
});

describe("rainSoon / aqiLevel", () => {
  it("ชั่วโมงแรกที่โอกาสฝนถึงเกณฑ์ภายใน 6 ชม.", async () => {
    const { rainSoon } = await import("../../domain/water/sky");
    const p = (xs: Array<number | null>) => xs.map((probability) => ({ probability }));
    expect(rainSoon(p([20, 37, 60, 73]))).toEqual({ hours: 2, probability: 60 });
    expect(rainSoon(p([80]))).toEqual({ hours: 0, probability: 80 });
    expect(rainSoon(p([10, 20, 30, 40, 45, 49, 30, 90]))).toBeNull(); // ชั่วโมงที่ 7 เกินช่วง
    expect(rainSoon(p([null, null]))).toBeNull();
  });
  it("US AQI → ระดับ", async () => {
    const { aqiLevel } = await import("../../domain/water/sky");
    expect(aqiLevel(38)).toBe("good");
    expect(aqiLevel(75)).toBe("moderate");
    expect(aqiLevel(120)).toBe("sensitive");
    expect(aqiLevel(180)).toBe("unhealthy");
    expect(aqiLevel(250)).toBe("veryUnhealthy");
    expect(aqiLevel(null)).toBe("unknown");
  });
});

describe("parseRainStations", () => {
  it("คัดตามรัศมี เรียงใกล้→ไกล และเก็บหน่วยงาน", async () => {
    const { parseRainStations } = await import("../../lib/water/rain-stations");
    const rec = (code: string, lat: number | null, lng: number, r24: number | string) => ({
      rain_24h: r24,
      rain_1h: 0,
      rainfall_datetime: "2026-11-03 12:00",
      agency: { agency_name: { th: "กรมชลประทาน" } },
      station: { tele_station_oldcode: code, tele_station_name: { th: code }, tele_station_lat: lat, tele_station_long: lng },
    });
    const out = parseRainStations(
      { data: [rec("FAR", 8, 100.46, 1), rec("B", 6.98, 100.463, "2.5"), rec("A", 7.0007, 100.4562, 1), rec("NOPOS", null, 100.4, 1)] },
      { lat: 7.0, lng: 100.46 },
      12,
    );
    expect(out.map((s) => s.code)).toEqual(["A", "B"]);
    expect(out[1]).toMatchObject({ rain24h: 2.5, agency: "กรมชลประทาน" });
    expect(parseRainStations(null, { lat: 7, lng: 100 }, 10)).toEqual([]);
  });
});

describe("parseOutlook", () => {
  it("เริ่มที่ชั่วโมงของค่าปัจจุบัน และเก็บ 7 ชั่วโมง", async () => {
    const { parseOutlook } = await import("../../lib/water/weather");
    const time = Array.from({ length: 12 }, (_, i) => `2026-11-03T${String(10 + i).padStart(2, "0")}:00`);
    const out = parseOutlook(
      { hourly: { time, temperature_2m: time.map((_, i) => 30 - i), precipitation_probability: time.map((_, i) => i * 10), weather_code: time.map(() => 3), is_day: time.map((_, i) => (i < 8 ? 1 : 0)) } },
      "2026-11-03T13:15",
    );
    expect(out).toHaveLength(7);
    expect(out[0]).toEqual({ at: "2026-11-03 13:00", temperature: 27, probability: 30, weatherCode: 3, isDay: true });
    expect(out[6]?.isDay).toBe(false);
    expect(parseOutlook({}, "x")).toEqual([]);
  });
});
