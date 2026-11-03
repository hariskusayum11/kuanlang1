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
    expect(parseOpenMeteo({ current: { time: "2026-11-03T11:15", interval: 900, precipitation: 0.3, cloud_cover: 93, weather_code: 55 } })).toEqual({
      time: "2026-11-03T11:15",
      rainMmPerHour: 1.2,
      cloudCover: 93,
      weatherCode: 55,
    });
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
