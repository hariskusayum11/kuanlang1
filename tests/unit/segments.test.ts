import { describe, expect, it } from "vitest";
import { permissionForSegment, resolveSegment } from "../../lib/report/segments";
import { PERMISSIONS } from "../../lib/authz/permissions";

describe("resolveSegment — กลุ่มแบบคงที่", () => {
  it("ครัวเรือนทั้งหมด = household + general", () => {
    const seg = resolveSegment("households");
    expect(seg?.kind).toBe("household");
    expect(seg?.sensitivity).toBe("general");
    expect(seg?.householdWhere).toBeDefined();
  });

  it("กลุ่มเปราะบางทั้งหมด = person + health", () => {
    const seg = resolveSegment("vulnerable-people");
    expect(seg?.kind).toBe("person");
    expect(seg?.sensitivity).toBe("health");
  });

  it("สุขภาพจิต ต้องเป็น health (กันหลุดไป general แล้วเปิดให้ OFFICER เห็น)", () => {
    expect(resolveSegment("mental-health")?.sensitivity).toBe("health");
  });

  it("ครัวเรือนที่มีกลุ่มเปราะบาง เป็น health", () => {
    expect(resolveSegment("vulnerable-households")?.sensitivity).toBe("health");
  });

  it("triage แต่ละระดับ = person + health + มี flag triage", () => {
    for (const [id, code] of [
      ["triage:P1", "P1"],
      ["triage:P2", "P2"],
      ["triage:P3", "P3"],
      ["triage:UNASSESSED", "UNASSESSED"],
    ] as const) {
      const seg = resolveSegment(id);
      expect(seg?.kind).toBe("person");
      expect(seg?.sensitivity).toBe("health");
      expect(seg?.triage).toBe(code);
    }
  });
});

describe("resolveSegment — กลุ่มแบบพิมพ์ตามชนิด (typed)", () => {
  it("assistance:<id> = household general + ดึงรายละเอียดความช่วยเหลือ (ข้อ 6)", () => {
    const seg = resolveSegment("assistance:need-1");
    expect(seg?.kind).toBe("household");
    expect(seg?.sensitivity).toBe("general");
    expect(seg?.detail).toEqual({ relation: "assistance", typeValue: "need-1" });
  });

  it("vehicle:<VehicleType ที่ถูกต้อง> ผ่าน · ค่าปลอมคืน null (กัน enum พัง)", () => {
    expect(resolveSegment("vehicle:CAR")?.detail).toEqual({ relation: "vehicle", typeValue: "CAR" });
    expect(resolveSegment("vehicle:BOAT")).not.toBeNull();
    expect(resolveSegment("vehicle:SPACESHIP")).toBeNull();
  });

  it("vuln:<id> = person health + ดึงรายละเอียดความเปราะบาง", () => {
    const seg = resolveSegment("vuln:type-9");
    expect(seg?.kind).toBe("person");
    expect(seg?.sensitivity).toBe("health");
    expect(seg?.detail).toEqual({ relation: "vulnerability", typeValue: "type-9" });
  });

  it("alert:/skill: = household general ไม่มี detail", () => {
    expect(resolveSegment("alert:ch-1")?.sensitivity).toBe("general");
    expect(resolveSegment("skill:sk-1")?.detail).toBeUndefined();
  });

  it("id ปลอม/ผิดรูป ต้องคืน null (กัน client ยิง id มั่ว)", () => {
    for (const bad of ["", "bogus", "unknown:x", "weird:", ":x", "vehicle:", "assistance:"]) {
      expect(resolveSegment(bad)).toBeNull();
    }
  });
});

describe("permissionForSegment — แยกตามความอ่อนไหว (Owner Decision เฟส 1)", () => {
  it("health → MEDICAL_REPORT_EXPORT (ADMIN/ผู้บริหาร)", () => {
    const seg = resolveSegment("triage:P1")!;
    expect(permissionForSegment(seg)).toBe(PERMISSIONS.MEDICAL_REPORT_EXPORT);
  });

  it("general → REPORT_SEGMENT_EXPORT (ADMIN/OFFICER/EXECUTIVE)", () => {
    const seg = resolveSegment("flooded")!;
    expect(permissionForSegment(seg)).toBe(PERMISSIONS.REPORT_SEGMENT_EXPORT);
  });

  it("กลุ่มสุขภาพทั่วไปทุกตัวต้องไม่หลุดไปใช้สิทธิ์ทั่วไป", () => {
    for (const id of ["vulnerable-people", "vulnerable-households", "mental-health", "vuln:x", "triage:P2"]) {
      expect(permissionForSegment(resolveSegment(id)!)).toBe(PERMISSIONS.MEDICAL_REPORT_EXPORT);
    }
  });
});
