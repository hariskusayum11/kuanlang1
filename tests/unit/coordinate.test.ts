import { describe, expect, it } from "vitest";
import {
  composeCoordinateText,
  coordinateForStorage,
  describeCoordinate,
  parseCoordinateText,
} from "../../domain/geo/coordinate";

describe("รูปแบบตามที่กระดาษกำหนด", () => {
  it("อ่าน '7.820213, 99.943592' ได้ตรงตามลำดับ ละติจูด, ลองจิจูด", () => {
    expect(parseCoordinateText("7.820213, 99.943592")).toEqual({
      kind: "OK",
      lat: 7.820213,
      lng: 99.943592,
    });
  });

  it("ไม่มีช่องว่างหลังจุลภาคก็อ่านได้", () => {
    expect(parseCoordinateText("7.820213,99.943592")).toMatchObject({ kind: "OK" });
  });

  it("คั่นด้วยช่องว่างอย่างเดียวก็อ่านได้", () => {
    expect(parseCoordinateText("7.820213 99.943592")).toMatchObject({ kind: "OK" });
  });

  it("มีช่องว่างหน้า/หลังไม่กระทบ", () => {
    expect(parseCoordinateText("  7.820213, 99.943592  ")).toMatchObject({ kind: "OK" });
  });

  it("มีอักษรทิศ N/E ปนมาก็อ่านได้", () => {
    expect(parseCoordinateText("N7.820213, E99.943592")).toEqual({
      kind: "OK",
      lat: 7.820213,
      lng: 99.943592,
    });
  });

  it("มีสัญลักษณ์องศาปนมาก็อ่านได้", () => {
    expect(parseCoordinateText("7.820213° , 99.943592°")).toMatchObject({ kind: "OK" });
  });
});

describe("กรณีที่ต้องไม่เดา", () => {
  it("ว่าง = EMPTY (ให้ไปใช้ F3 แทน)", () => {
    expect(parseCoordinateText("")).toEqual({ kind: "EMPTY" });
    expect(parseCoordinateText("   ")).toEqual({ kind: "EMPTY" });
    expect(parseCoordinateText(null)).toEqual({ kind: "EMPTY" });
    expect(parseCoordinateText(undefined)).toEqual({ kind: "EMPTY" });
  });

  it("เขียนเป็นคำ = UNPARSEABLE", () => {
    expect(parseCoordinateText("ไม่ได้จด")).toEqual({ kind: "UNPARSEABLE" });
  });

  it("มีตัวเลขตัวเดียว = UNPARSEABLE", () => {
    expect(parseCoordinateText("7.820213")).toEqual({ kind: "UNPARSEABLE" });
  });

  it("รูปแบบองศา-ลิปดา-ฟิลิปดา = UNPARSEABLE (ไม่แปลงให้เอง)", () => {
    expect(parseCoordinateText(`7°49'12.8"N 99°56'36.9"E`)).toEqual({
      kind: "UNPARSEABLE",
    });
  });

  it("ใช้จุลภาคเป็นจุดทศนิยม ('7,82 99,94') = UNPARSEABLE เพราะกำกวมกับตัวคั่น", () => {
    expect(parseCoordinateText("7,820213, 99,943592")).toEqual({ kind: "UNPARSEABLE" });
  });
});

describe("การจับความผิดปกติ", () => {
  it("สลับแกน (ลองจิจูดมาก่อน) ถูกจับได้ และคืนค่าที่ 'น่าจะถูก' โดยไม่สลับให้ในฐานข้อมูล", () => {
    const r = parseCoordinateText("100.474, 7.008");
    expect(r).toEqual({ kind: "SWAPPED_SUSPECT", lat: 7.008, lng: 100.474 });
    expect(coordinateForStorage(r)).toBeNull();
  });

  it("ค่านอกประเทศไทย = OUT_OF_RANGE และไม่ถูกเก็บลง lat/lng", () => {
    const r = parseCoordinateText("48.858, 2.294");
    expect(r.kind).toBe("OUT_OF_RANGE");
    expect(coordinateForStorage(r)).toBeNull();
  });

  it("พิกัดปลายสุดของไทยยังนับว่าอยู่ในกรอบ", () => {
    expect(parseCoordinateText("20.4, 100.1").kind).toBe("OK"); // เหนือสุด
    expect(parseCoordinateText("6.0, 101.1").kind).toBe("OK"); // ใต้สุด
  });

  it("ค่าติดลบ (คนละซีกโลก) ไม่ถูกมองว่าใช้ได้", () => {
    expect(parseCoordinateText("-7.820213, -99.943592").kind).toBe("OUT_OF_RANGE");
  });
});

describe("coordinateForStorage", () => {
  it("เก็บลง lat/lng เฉพาะกรณี OK เท่านั้น", () => {
    expect(coordinateForStorage(parseCoordinateText("7.820213, 99.943592"))).toEqual({
      lat: 7.820213,
      lng: 99.943592,
    });
    expect(coordinateForStorage({ kind: "EMPTY" })).toBeNull();
    expect(coordinateForStorage({ kind: "UNPARSEABLE" })).toBeNull();
  });
});

describe("describeCoordinate", () => {
  it("OK ให้ข้อความยืนยันค่าที่อ่านได้", () => {
    const d = describeCoordinate(parseCoordinateText("7.820213, 99.943592"));
    expect(d.tone).toBe("ok");
    expect(d.text).toContain("7.820213");
    expect(d.text).toContain("99.943592");
  });

  it("กรณีผิดปกติเป็นคำเตือน ไม่ใช่การบล็อก", () => {
    expect(describeCoordinate(parseCoordinateText("100.474, 7.008")).tone).toBe("warn");
    expect(describeCoordinate(parseCoordinateText("ไม่ได้จด")).tone).toBe("warn");
  });

  it("ว่างให้บอกรูปแบบที่ถูกต้องและทางเลือก F2/F3", () => {
    const d = describeCoordinate({ kind: "EMPTY" });
    expect(d.tone).toBe("muted");
    expect(d.text).toContain("F3");
  });
});

describe("composeCoordinateText (พิกัดแยกสองช่อง → คู่เดียว)", () => {
  it("ครบสองช่อง → 'lat, lng' และ parse ต่อได้เป็น OK", () => {
    const raw = composeCoordinateText("7.820213", "99.943592");
    expect(raw).toBe("7.820213, 99.943592");
    expect(parseCoordinateText(raw)).toMatchObject({ kind: "OK" });
  });

  it("ตัดช่องว่างหัวท้ายของแต่ละช่องก่อนรวม", () => {
    expect(composeCoordinateText("  7.82 ", " 99.94  ")).toBe("7.82, 99.94");
  });

  it("ทั้งคู่ว่าง → สตริงว่าง (parse = EMPTY)", () => {
    expect(composeCoordinateText("", "")).toBe("");
    expect(composeCoordinateText(null, undefined)).toBe("");
  });

  it("กรอกช่องเดียว → คืนเฉพาะช่องนั้น (parse = UNPARSEABLE ตามจริงว่ายังไม่ครบคู่)", () => {
    expect(composeCoordinateText("7.82", "")).toBe("7.82");
    expect(composeCoordinateText("", "99.94")).toBe("99.94");
    expect(parseCoordinateText(composeCoordinateText("7.82", ""))).toMatchObject({
      kind: "UNPARSEABLE",
    });
  });

  it("สลับแกน (ใส่ลองจิจูดในช่องละติจูด) ยังถูกจับได้เหมือนช่องเดียว", () => {
    // ช่องละติจูด = 99.94 (ค่าลองจิจูด), ช่องลองจิจูด = 7.82 (ค่าละติจูด)
    expect(parseCoordinateText(composeCoordinateText("99.943592", "7.820213"))).toMatchObject({
      kind: "SWAPPED_SUSPECT",
    });
  });
});
