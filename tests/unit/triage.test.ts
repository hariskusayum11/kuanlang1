import { describe, expect, it } from "vitest";
import { effectiveTriage, highestTriage, triageLabel } from "../../domain/triage";

describe("triage", () => {
  it("เลือกเกณฑ์ที่เร่งด่วนที่สุดเมื่อมีหลายประเภท", () => {
    expect(highestTriage(["P3", "P2", "P1"])).toBe("P1");
    expect(highestTriage(["P3", "P2"])).toBe("P2");
    expect(highestTriage(["P3"])).toBe("P3");
    expect(highestTriage([])).toBeNull();
  });

  it("ข้อมูลเก่าที่ยังไม่มีค่าคำนวณใช้ basePriority ได้ทันที", () => {
    expect(effectiveTriage(null, ["P2", "P3"])).toBe("P2");
    expect(effectiveTriage("P1", ["P2"])).toBe("P1");
  });

  it("ข้อความสำหรับผู้ใช้เป็นภาษาไทยและไม่แสดงรหัสภายใน", () => {
    expect(triageLabel("P1")).toBe("วิกฤต");
    expect(triageLabel("P2")).toBe("เร่งด่วน");
    expect(triageLabel("P3")).toBe("เฝ้าระวัง");
    expect(triageLabel(null)).toBe("ยังไม่ประเมิน");
  });
});
