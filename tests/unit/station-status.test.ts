import { describe, it, expect } from "vitest";
import { freeboard, gaugeFill, r1SimulatedIntensity, waterStatus, waterTrend } from "../../domain/water/station-status";

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

describe("gaugeFill", () => {
  it("สัดส่วนจากท้องน้ำถึงตลิ่ง", () => {
    expect(gaugeFill({ levelMsl: 1.0, bankMsl: 7.15, groundMsl: -2.204 })).toBeCloseTo(0.342, 2);
  });
  it("ระดับพื้นผิดปกติ (สูงกว่าตลิ่ง) ใช้ฐาน 10 ม. ใต้ตลิ่ง", () => {
    expect(gaugeFill({ levelMsl: 0.29, bankMsl: 5, groundMsl: 20.255 })).toBeCloseTo(0.529, 2);
  });
  it("ล้นตลิ่งแสดงได้ถึง 120%", () => {
    expect(gaugeFill({ levelMsl: 20, bankMsl: 7, groundMsl: 0 })).toBe(1.2);
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
      station: { tele_station_oldcode: code, tele_station_name: { th: code }, tele_station_lat: lat, tele_station_long: 100.4, min_bank: 7.15, ground_level: "-2.2" },
    });
    const out = parseThaiWater({ waterlevel_data: { data: [rec("X.44", "1.10"), rec("ZZZ", "9"), rec("X.90", "2.99"), rec("X.173A", "1", null)] } }, ["X.173A", "X.90", "X.44"]);
    expect(out.map((s) => s.code)).toEqual(["X.90", "X.44"]);
    expect(out[1]).toMatchObject({ levelMsl: 1.1, previousMsl: 1, bankMsl: 7.15, groundMsl: -2.2 });
    expect(parseThaiWater({ nope: true }, ["X.44"])).toEqual([]);
  });
});
