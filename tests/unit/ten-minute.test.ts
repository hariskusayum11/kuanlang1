import { describe, expect, it } from "vitest";
import { stampMinutes, summarizeTenMinute, tenMinuteChangeText } from "../../domain/water/ten-minute";

// ค่าทุก 10 นาทีของ SLA002 คลองหอยโข่ง เทียบสถานีกรมชลประทาน X.90 บางศาลา (จุดเดียวกัน)
const tenMin = (start: string, levels: number[]) => {
  const t0 = stampMinutes(start)!;
  return levels.map((levelMsl, i) => {
    const d = new Date((t0 + i * 10) * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return { at: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`, levelMsl };
  });
};
const base = { code: "SLA002", name: "คลองหอยโข่ง", pairedWith: "X.90" };

describe("stampMinutes", () => {
  it("แปลงเวลาไทยแบบข้อความเป็นนาที · รูปแบบผิด = null", () => {
    expect(stampMinutes("2026-11-09 14:40")! - stampMinutes("2026-11-09 14:00")!).toBe(40);
    expect(stampMinutes("2026-11-10 00:00")! - stampMinutes("2026-11-09 23:50")!).toBe(10);
    expect(stampMinutes("ไม่ใช่เวลา")).toBeNull();
  });
});

describe("summarizeTenMinute", () => {
  it("บอกค่าล่าสุดและการเปลี่ยนแปลงใน 30 นาที", () => {
    const points = tenMin("2026-11-09 13:50", [2.4, 2.41, 2.45, 2.5, 2.52]); // 13:50 … 14:30
    const s = summarizeTenMinute({ ...base, points, pairedPoints: [], now: "2026-11-09 14:35" })!;
    expect(s).toMatchObject({ latestAt: "2026-11-09 14:30", levelMsl: 2.52, trend: "RISING", stale: false, offsetM: null });
    expect(s.changeM).toBeCloseTo(0.11, 5); // 14:30 − 14:00
  });

  it("เปลี่ยนไม่เกิน 2 ซม. = ทรงตัว · ลดลง = น้ำลง", () => {
    const steady = summarizeTenMinute({ ...base, points: tenMin("2026-11-09 14:00", [2.43, 2.43, 2.42, 2.42]), pairedPoints: [], now: "2026-11-09 14:30" })!;
    expect(steady.trend).toBe("STEADY");
    const falling = summarizeTenMinute({ ...base, points: tenMin("2026-11-09 14:00", [2.6, 2.55, 2.5, 2.45]), pairedPoints: [], now: "2026-11-09 14:30" })!;
    expect(falling).toMatchObject({ trend: "FALLING", changeM: -0.15 });
  });

  it("ข้อมูลขาดช่วง = ไม่บอกการเปลี่ยนแปลง (ไม่เดา)", () => {
    const points = [{ at: "2026-11-09 12:00", levelMsl: 2.0 }, { at: "2026-11-09 14:30", levelMsl: 2.5 }];
    const s = summarizeTenMinute({ ...base, points, pairedPoints: [], now: "2026-11-09 14:35" })!;
    expect(s).toMatchObject({ changeM: null, trend: "UNKNOWN" });
  });

  it("ส่วนต่างกับสถานีคู่ = มัธยฐาน ณ เวลาเดียวกัน · ต้องมีอย่างน้อย 6 จุด", () => {
    const points = tenMin("2026-11-09 08:00", Array.from({ length: 40 }, (_, i) => 2.6 - i * 0.005));
    const hourly = (n: number) => Array.from({ length: n }, (_, h) => ({ at: `2026-11-09 ${String(8 + h).padStart(2, "0")}:00`, levelMsl: points[h * 6]!.levelMsl + 0.15 }));
    expect(summarizeTenMinute({ ...base, points, pairedPoints: hourly(6), now: "2026-11-09 14:30" })!.offsetM).toBe(-0.15);
    expect(summarizeTenMinute({ ...base, points, pairedPoints: hourly(5), now: "2026-11-09 14:30" })!.offsetM).toBeNull();
  });

  it("ค่าล่าสุดเก่ากว่า 60 นาที = ค่าเก่า · ไม่มีข้อมูล = null", () => {
    const points = tenMin("2026-11-09 12:00", [2.4, 2.4, 2.4, 2.4]);
    expect(summarizeTenMinute({ ...base, points, pairedPoints: [], now: "2026-11-09 14:00" })!.stale).toBe(true);
    expect(summarizeTenMinute({ ...base, points: [], pairedPoints: [], now: "2026-11-09 14:00" })).toBeNull();
    expect(summarizeTenMinute({ ...base, points: [{ at: "x", levelMsl: 1 }, { at: "2026-11-09 14:00", levelMsl: Number.NaN }], pairedPoints: [], now: "2026-11-09 14:00" })).toBeNull();
  });
});

describe("tenMinuteChangeText", () => {
  it("ข้อความการขึ้นลงเป็นเซนติเมตร", () => {
    expect(tenMinuteChangeText({ changeM: 0.11, trend: "RISING", windowMinutes: 30 })).toBe("30 นาทีล่าสุด น้ำขึ้น 11 ซม.");
    expect(tenMinuteChangeText({ changeM: -0.15, trend: "FALLING", windowMinutes: 30 })).toBe("30 นาทีล่าสุด น้ำลง 15 ซม.");
    expect(tenMinuteChangeText({ changeM: -0.01, trend: "STEADY", windowMinutes: 30 })).toBe("30 นาทีล่าสุด ทรงตัว (−1 ซม.)");
    expect(tenMinuteChangeText({ changeM: 0, trend: "STEADY", windowMinutes: 30 })).toBe("30 นาทีล่าสุด ทรงตัว");
    expect(tenMinuteChangeText({ changeM: null, trend: "UNKNOWN", windowMinutes: 30 })).toMatch(/ขาด/);
  });
});
