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
