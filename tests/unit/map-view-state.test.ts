import { describe, expect, it } from "vitest";
import {
  countActiveLayers,
  DEFAULT_HOUSEHOLD_LAYERS,
  mapViewHref,
  parseMapViewState,
  serializeMapViewState,
  type MapViewState,
} from "../../lib/geo/map-view-state";

const SITE_TYPES = ["SCHOOL", "TEMPLE_OR_MOSQUE", "COMMUNITY_CENTER", "OTHER"] as const;

describe("map view state (URL query)", () => {
  it("ไม่มีพารามิเตอร์ = ค่าเริ่มต้น: ถนน · จุดบ้าน 3 กลุ่ม · ฮีตแมปปิด · จุดสำคัญทุกประเภท", () => {
    const state = parseMapViewState({}, SITE_TYPES);
    expect(state.base).toBe("street");
    expect(state.layers).toEqual([...DEFAULT_HOUSEHOLD_LAYERS]);
    expect(state.layers).not.toContain("heat");
    expect(state.siteTypes).toEqual([...SITE_TYPES]);
    expect(serializeMapViewState(state, SITE_TYPES)).toBe("");
    expect(mapViewHref(state, SITE_TYPES)).toBe("/map");
  });

  it("แยก 'ไม่มีพารามิเตอร์' (ค่าเริ่มต้น) ออกจาก 'none' (ปิดทั้งกลุ่ม)", () => {
    const state = parseMapViewState({ layers: "none", sites: "none" }, SITE_TYPES);
    expect(state.layers).toEqual([]);
    expect(state.siteTypes).toEqual([]);
    expect(serializeMapViewState(state, SITE_TYPES)).toBe("layers=none&sites=none");
    // ค่าว่างจาก URL เช่น ?layers= ก็ถือว่าปิดทั้งกลุ่มเช่นกัน
    expect(parseMapViewState({ layers: "" }, SITE_TYPES).layers).toEqual([]);
  });

  it("ส่งลิงก์ต่อแล้วได้มุมมองเดิม (parse ∘ serialize คงที่)", () => {
    const original: MapViewState = {
      communityId: "cm123abc",
      tambonId: "tb_9",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      base: "satellite",
      layers: ["heat", "vulnerable"],
      skill: "RESCUE",
      siteTypes: ["OTHER", "SCHOOL"],
      boundaries: false,
      help: true,
      red: true,
    };
    const query = serializeMapViewState(original, SITE_TYPES);
    const reparsed = parseMapViewState(Object.fromEntries(new URLSearchParams(query)), SITE_TYPES);
    expect(reparsed).toEqual({ ...original, layers: ["vulnerable", "heat"], siteTypes: ["SCHOOL", "OTHER"] });
    expect(serializeMapViewState(reparsed, SITE_TYPES)).toBe(query);
  });

  it("ทิ้งค่าที่ไม่รู้จักหรือรูปแบบแปลกปลอม", () => {
    const state = parseMapViewState(
      {
        community: "<script>",
        tambon: "a b",
        from: "01/02/2569",
        base: "terrain",
        layers: "vulnerable,unknown",
        skill: "x;drop",
        sites: "SCHOOL,PALACE",
      },
      SITE_TYPES,
    );
    expect(state).toEqual({
      communityId: undefined,
      tambonId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      base: "street",
      layers: ["vulnerable"],
      skill: undefined,
      siteTypes: ["SCHOOL"],
      boundaries: true,
      help: false,
      red: false,
    });
  });

  it("รับพารามิเตอร์ซ้ำ (array) โดยใช้ค่าแรก", () => {
    expect(parseMapViewState({ community: ["c1", "c2"] }, SITE_TYPES).communityId).toBe("c1");
  });

  it("นับชั้นที่เปิด: เส้นขอบชุมชน 1 + ครัวเรือน 4 ชั้น + จุดสำคัญตามประเภท ไม่นับแผนที่พื้นฐาน", () => {
    expect(countActiveLayers(parseMapViewState({}, SITE_TYPES), SITE_TYPES)).toEqual({ active: 8, total: 9 });
    expect(countActiveLayers({ layers: [], siteTypes: [], boundaries: false }, SITE_TYPES)).toEqual({ active: 0, total: 9 });
    expect(countActiveLayers({ layers: ["heat"], siteTypes: ["SCHOOL", "GONE"], boundaries: false }, SITE_TYPES)).toEqual({ active: 2, total: 9 });
  });

  it("เส้นขอบชุมชน: เปิดเป็นค่าเริ่มต้น (ไม่เขียนลง URL) · ปิดเขียนเป็น boundary=off", () => {
    expect(parseMapViewState({}, SITE_TYPES).boundaries).toBe(true);
    const off = parseMapViewState({ boundary: "off" }, SITE_TYPES);
    expect(off.boundaries).toBe(false);
    expect(serializeMapViewState(off, SITE_TYPES)).toBe("boundary=off");
    // รูปแบบอื่นที่สื่อว่าปิดก็รับ แต่เขียนกลับเป็น off รูปเดียว · ค่าแปลกปลอม = ค่าเริ่มต้น (เปิด)
    expect(parseMapViewState({ boundary: "none" }, SITE_TYPES).boundaries).toBe(false);
    expect(parseMapViewState({ boundary: "OFF" }, SITE_TYPES).boundaries).toBe(false);
    expect(parseMapViewState({ boundary: "<x>" }, SITE_TYPES).boundaries).toBe(true);
  });

  it("ลำดับการช่วยเหลือ: ปิดเป็นค่าเริ่มต้น · เปิดเขียนเป็น help=on รูปเดียว (docs/40)", () => {
    expect(parseMapViewState({}, SITE_TYPES).help).toBe(false);
    const on = parseMapViewState({ help: "1" }, SITE_TYPES);
    expect(on.help).toBe(true);
    expect(serializeMapViewState(on, SITE_TYPES)).toBe("help=on");
    expect(parseMapViewState({ help: "<x>" }, SITE_TYPES).help).toBe(false);
  });

  it("กลุ่มสีแดง: red=on เริ่มที่ชั้นกลุ่มเปราะบางอย่างเดียว และลิงก์สั้นคงรูป (docs/42)", () => {
    expect(parseMapViewState({}, SITE_TYPES).red).toBe(false);
    const red = parseMapViewState({ red: "on" }, SITE_TYPES);
    expect(red.red).toBe(true);
    expect(red.layers).toEqual(["vulnerable"]);
    expect(serializeMapViewState(red, SITE_TYPES)).toBe("red=on");
    // ระบุ layers เองได้ — เขียนกลับเมื่อไม่ใช่ค่าเริ่มต้นของโหมดนี้
    const withHeat = parseMapViewState({ red: "on", layers: "vulnerable,heat" }, SITE_TYPES);
    expect(serializeMapViewState(withHeat, SITE_TYPES)).toBe("red=on&layers=vulnerable,heat");
  });
});
