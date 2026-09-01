import { describe, expect, it } from "vitest";
import { calculateFloodDepthCm, floodDepthMeters } from "../../domain/flood/depth";

describe("flood depth", () => {
  it("รวมช่องเมตรและเซนติเมตรตามแบบสอบถาม", () => {
    expect(calculateFloodDepthCm(1, 75)).toBe(175);
    expect(calculateFloodDepthCm(2, 0)).toBe(200);
    expect(calculateFloodDepthCm(null, 50)).toBe(50);
    expect(calculateFloodDepthCm(null, null)).toBeNull();
  });

  it("แสดงผลเซนติเมตรเป็นเมตร", () => {
    expect(floodDepthMeters(200)).toBe(2);
    expect(floodDepthMeters(175)).toBe(1.75);
    expect(floodDepthMeters(null)).toBeNull();
  });
});
