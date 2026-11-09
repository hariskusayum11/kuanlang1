import { describe, expect, it } from "vitest";
import { freshenReadings } from "../../lib/water/thaiwater";
import type { StationReading } from "../../domain/water/station-status";

const reading = (over: Partial<StationReading> = {}): StationReading => ({
  stationId: 2590,
  code: "X.174",
  name: "บ้านคลองหวะ",
  river: "คลองหวะ",
  lat: 6.98,
  lng: 100.48,
  levelMsl: 5.13,
  previousMsl: 5.14,
  bankMsl: 8.88,
  groundMsl: null,
  measuredAt: "2026-11-09 13:00",
  agency: "ชป.",
  ...over,
});

describe("freshenReadings — ใช้ค่ารายชั่วโมงจากกราฟเมื่อใหม่กว่ารายการล่าสุดของ ThaiWater", () => {
  it("กราฟมีชั่วโมงใหม่ → ใช้ค่านั้น และค่าก่อนหน้าคือชั่วโมงก่อนในกราฟ", () => {
    const [r] = freshenReadings([reading()], {
      "X.174": [
        { at: "2026-11-09 12:00", levelMsl: 5.14 },
        { at: "2026-11-09 13:00", levelMsl: 5.13 },
        { at: "2026-11-09 14:00", levelMsl: 5.12 },
      ],
    });
    expect(r).toMatchObject({ levelMsl: 5.12, previousMsl: 5.13, measuredAt: "2026-11-09 14:00", bankMsl: 8.88 });
  });

  it("กราฟไม่ใหม่กว่า / ไม่มีกราฟ → คงค่าเดิม", () => {
    const base = reading();
    expect(freshenReadings([base], { "X.174": [{ at: "2026-11-09 13:00", levelMsl: 9 }] })[0]).toBe(base);
    expect(freshenReadings([base], {})[0]).toBe(base);
  });

  it("รายการล่าสุดไม่มีเวลา แต่กราฟมีค่า → ใช้ค่าจากกราฟ", () => {
    const [r] = freshenReadings([reading({ measuredAt: null, levelMsl: null })], { "X.174": [{ at: "2026-11-09 14:00", levelMsl: 5.12 }] });
    expect(r).toMatchObject({ levelMsl: 5.12, previousMsl: null, measuredAt: "2026-11-09 14:00" });
  });
});
