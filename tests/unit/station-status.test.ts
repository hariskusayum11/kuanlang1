import { describe, it, expect } from "vitest";
import { freeboard, peakOf, r1SimulatedIntensity, waterStatus, waterTrend } from "../../domain/water/station-status";

// สถานะน้ำจากสถานีวัด (ต้นแบบ /lab/song-khlong)

describe("waterStatus", () => {
  it("แบ่งตามระยะห่างจากตลิ่ง", () => {
    expect(waterStatus({ levelMsl: 1.0, bankMsl: 7.15 })).toBe("NORMAL"); // X.44 ตัวอย่างจริง ห่าง 6.15 ม.
    expect(waterStatus({ levelMsl: 4.5, bankMsl: 7.15 })).toBe("WATCH");
    expect(waterStatus({ levelMsl: 6.0, bankMsl: 7.15 })).toBe("WARNING");
    expect(waterStatus({ levelMsl: 7.15, bankMsl: 7.15 })).toBe("OVERFLOW");
    expect(waterStatus({ levelMsl: null, bankMsl: 7.15 })).toBe("UNKNOWN");
  });
  it("ระยะจากตลิ่งติดลบเมื่อล้น", () => {
    expect(freeboard({ levelMsl: 8, bankMsl: 7 })).toBe(-1);
  });
});

describe("waterTrend", () => {
  it("ขึ้น ลง ทรงตัว", () => {
    expect(waterTrend({ levelMsl: 1.2, previousMsl: 1.0 })).toBe("RISING");
    expect(waterTrend({ levelMsl: 0.29, previousMsl: 0.31 })).toBe("STEADY");
    expect(waterTrend({ levelMsl: 0.8, previousMsl: 1.0 })).toBe("FALLING");
    expect(waterTrend({ levelMsl: 1, previousMsl: null })).toBe("UNKNOWN");
  });
});

describe("r1SimulatedIntensity", () => {
  it("คลอง ร.1 ไหลแรงขึ้นเมื่อคลองอู่ตะเภาสูง", () => {
    expect(r1SimulatedIntensity("NORMAL")).toBeLessThan(r1SimulatedIntensity("WATCH"));
    expect(r1SimulatedIntensity("WARNING")).toBe(1);
  });
});

describe("parseThaiWater", () => {
  it("คัดสถานีตามรหัส เรียงตามลำดับที่ขอ และข้ามข้อมูลไม่มีพิกัด", async () => {
    const { parseThaiWater } = await import("../../lib/water/thaiwater");
    const rec = (code: string, msl: string, lat: number | null = 7) => ({
      waterlevel_datetime: "2026-11-02 12:00",
      waterlevel_msl: msl,
      waterlevel_msl_previous: "1.00",
      river_name: "คลองอู่ตะเภา",
      station: { id: 2591, tele_station_oldcode: code, tele_station_name: { th: code }, tele_station_lat: lat, tele_station_long: 100.4, min_bank: 7.15, ground_level: "-2.2" },
    });
    const out = parseThaiWater({ waterlevel_data: { data: [rec("X.44", "1.10"), rec("ZZZ", "9"), rec("X.90", "2.99"), rec("X.173A", "1", null)] } }, ["X.173A", "X.90", "X.44"]);
    expect(out.map((s) => s.code)).toEqual(["X.90", "X.44"]);
    expect(out[1]).toMatchObject({ stationId: 2591, levelMsl: 1.1, previousMsl: 1, bankMsl: 7.15, groundMsl: -2.2 });
    expect(parseThaiWater({ nope: true }, ["X.44"])).toEqual([]);
  });
});

describe("ข้อมูลย้อนหลัง", () => {
  it("parseGraph ข้ามชั่วโมงที่ไม่มีค่า", async () => {
    const { parseGraph } = await import("../../lib/water/thaiwater");
    const out = parseGraph({ data: { graph_data: [{ datetime: "2025-11-25 09:00", value: null }, { datetime: "2025-11-25 10:00", value: 9.97 }, { datetime: "2025-11-25 11:00", value: "9.9" }] } });
    expect(out).toEqual([{ at: "2025-11-25 10:00", levelMsl: 9.97 }, { at: "2025-11-25 11:00", levelMsl: 9.9 }]);
    expect(parseGraph(null)).toEqual([]);
  });
  it("peakOf หาจุดสูงสุด", () => {
    expect(peakOf([{ at: "a", levelMsl: 1 }, { at: "b", levelMsl: 9.97 }, { at: "c", levelMsl: 3 }])?.at).toBe("b");
    expect(peakOf([])).toBeNull();
  });
  it("bangkokDate ใช้เวลาไทย", async () => {
    const { bangkokDate } = await import("../../lib/water/thaiwater");
    expect(bangkokDate(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02"); // 01:30 น. เวลาไทย
  });
});
