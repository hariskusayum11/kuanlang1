import { describe, it, expect } from "vitest";
import { mslToSceneY, SCENE, wavePath } from "../../domain/water/scene-geometry";

// ฉากน้ำหน้า /lab/song-khlong — ระดับน้ำต้องวางถูกที่เมื่อเทียบตลิ่งและบ้าน

describe("mslToSceneY", () => {
  it("ระดับตลิ่งอยู่ที่ขอบกำแพง", () => {
    expect(mslToSceneY(7.15, 7.15)).toBe(SCENE.bankY);
  });
  it("น้ำท่วมใหญ่ พ.ย. 68 (9.97 ม.) อยู่สูงกว่าตลิ่ง 2.82 ม. ตามมาตราส่วนจริง", () => {
    expect(mslToSceneY(9.97, 7.15)).toBeCloseTo(SCENE.bankY - 2.82 * SCENE.pxPerM, 5);
  });
  it("น้ำต่ำกว่าตลิ่งอยู่ใต้ขอบกำแพง", () => {
    expect(mslToSceneY(1.19, 7.15)).toBeGreaterThan(SCENE.bankY);
  });
  it("ค่าเพี้ยนวาดที่ก้นภาพ ไม่ใช่ล้นจอ", () => {
    expect(mslToSceneY(null, 7.15)).toBe(SCENE.height);
    expect(mslToSceneY(Number.NaN, 7.15)).toBe(SCENE.height);
    expect(mslToSceneY(Number.POSITIVE_INFINITY, 7.15)).toBe(SCENE.height);
  });
  it("ไม่เกินขอบบนของฉาก", () => {
    expect(mslToSceneY(100, 7.15)).toBe(SCENE.topY);
  });
});

describe("wavePath", () => {
  it("ปิดรูปและยาว 2 เท่าความกว้าง", () => {
    const d = wavePath(10, 200, 500);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain(`L${SCENE.width * 2} 500`);
  });
});
