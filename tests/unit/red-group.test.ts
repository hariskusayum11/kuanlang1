import { describe, it, expect } from "vitest";
import {
  classifyRedPerson,
  parseBabyAgeMonths,
  parsePregnancyWeeks,
  redGroupNumbers,
  tallyRedGroups,
  type RedGroupHouseholdInput,
  type RedGroupPersonInput,
} from "../../domain/vulnerable/red-group";

// กลุ่มเปราะบางสีแดง (Owner Decision 2026-10-26 · docs/42)

const NOW = new Date("2026-10-26T03:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

const house = (patch: Partial<RedGroupHouseholdInput> = {}): RedGroupHouseholdInput => ({
  memberCount: 4,
  floorLevelVsRoad: "ABOVE_ROAD",
  needsMedicalEquipment: false,
  referenceDate: NOW,
  ...patch,
});

const person = (age: number | null, vulns: [string, string | null][], ageMonths: number | null = null): RedGroupPersonInput => ({
  age,
  ageMonths,
  vulnerabilities: vulns.map(([code, detail]) => ({ code, detail })),
});

describe("parsePregnancyWeeks", () => {
  it("อ่านตามหน่วยที่เขียน", () => {
    expect(parsePregnancyWeeks("32 สัปดาห์")).toBe(32);
    expect(parsePregnancyWeeks("๓๖ สัปดาห์")).toBe(36);
    expect(parsePregnancyWeeks("8 เดือน")).toBeCloseTo(34.76, 1);
    expect(parsePregnancyWeeks("7 เดือน 2 สัปดาห์")).toBeCloseTo(32.4, 1);
    expect(parsePregnancyWeeks("38w")).toBe(38);
  });
  it("ไม่มีหน่วย: ≤ 10 เป็นเดือน · 11–45 เป็นสัปดาห์", () => {
    expect(parsePregnancyWeeks("9")).toBeCloseTo(39.1, 1);
    expect(parsePregnancyWeeks("37")).toBe(37);
  });
  it("อ่านไม่ได้ → null (ไม่เดา)", () => {
    expect(parsePregnancyWeeks(null)).toBeNull();
    expect(parsePregnancyWeeks("ไม่ทราบ")).toBeNull();
    expect(parsePregnancyWeeks("120")).toBeNull();
    expect(parsePregnancyWeeks("0")).toBeNull();
  });
});

describe("parseBabyAgeMonths", () => {
  it("ไม่มีหน่วย = เดือน ตามป้ายช่องบนกระดาษ", () => {
    expect(parseBabyAgeMonths("2")).toBe(2);
    expect(parseBabyAgeMonths("2 เดือน")).toBe(2);
  });
  it("วัน/สัปดาห์แปลงเป็นเดือน", () => {
    expect(parseBabyAgeMonths("15 วัน")).toBeCloseTo(0.49, 2);
    expect(parseBabyAgeMonths("6 สัปดาห์")).toBeCloseTo(1.38, 2);
  });
  it("อ่านไม่ได้ → null", () => {
    expect(parseBabyAgeMonths("เพิ่งคลอด")).toBeNull();
  });
});

describe("classifyRedPerson", () => {
  it("ไม่เข้าเกณฑ์ → null", () => {
    expect(classifyRedPerson(person(70, [["ELDERLY_DEPENDENT", null]]), house(), NOW)).toBeNull();
    expect(classifyRedPerson(person(3, [["CHILD_UNDER_5", null]]), house(), NOW)).toBeNull();
  });

  it("กลุ่ม 1: ติดเตียงทุกคน · อายุ 60+ เข้ากลุ่ม 4 ด้วย", () => {
    expect(classifyRedPerson(person(45, [["BEDRIDDEN", null]]), house(), NOW)?.groups).toEqual(["BEDRIDDEN"]);
    const elderly = classifyRedPerson(person(82, [["BEDRIDDEN", null]]), house(), NOW);
    expect(elderly?.groups).toEqual(["BEDRIDDEN", "ELDERLY_BEDRIDDEN"]);
    expect(elderly?.needsCheck).toBe(false);
    expect(redGroupNumbers(elderly!.groups)).toBe("1, 4");
  });

  it("กลุ่ม 2: ฟอกไต", () => {
    expect(classifyRedPerson(person(55, [["DIALYSIS", null]]), house(), NOW)?.groups).toEqual(["DIALYSIS"]);
  });

  it("ค้นในช่องอื่นๆ: เข้ากลุ่มพร้อมธงควรยืนยัน", () => {
    const tube = classifyRedPerson(person(75, [["OTHER", "ใส่สายยางให้อาหาร"]]), house(), NOW);
    expect(tube?.groups).toEqual(["ELDERLY_BEDRIDDEN"]);
    expect(tube?.needsCheck).toBe(true);
    const bed = classifyRedPerson(person(68, [["OTHER", "นอนติดเตียงหลังเส้นเลือดในสมองแตก"]]), house(), NOW);
    expect(bed?.groups).toEqual(["BEDRIDDEN", "ELDERLY_BEDRIDDEN"]);
    expect(bed?.needsCheck).toBe(true);
    const kidney = classifyRedPerson(person(50, [["REGULAR_MEDICATION", "ฟอกไตสัปดาห์ละ 2 ครั้ง"]]), house(), NOW);
    expect(kidney?.groups).toEqual(["DIALYSIS"]);
    // สายยางแต่อายุไม่ถึง 60 → ไม่เข้ากลุ่ม 4 (ตามเกณฑ์ทีม)
    expect(classifyRedPerson(person(40, [["OTHER", "ใส่สายยาง"]]), house(), NOW)).toBeNull();
  });

  it("กลุ่ม 3: อายุครรภ์นับต่อจากวันสำรวจถึงวันนี้", () => {
    // 34 สัปดาห์ตอนสำรวจ + 3 สัปดาห์ = 37 → ใกล้คลอด
    const near = classifyRedPerson(person(28, [["PREGNANT", "34 สัปดาห์"]]), house({ referenceDate: daysAgo(21) }), NOW);
    expect(near?.groups).toEqual(["MATERNAL_NEWBORN"]);
    expect(near?.needsCheck).toBe(false);
    // 30 สัปดาห์ เมื่อวาน → ยังไม่ถึง 36
    expect(classifyRedPerson(person(28, [["PREGNANT", "30 สัปดาห์"]]), house({ referenceDate: daysAgo(1) }), NOW)).toBeNull();
    // 36 สัปดาห์ เมื่อ 10 สัปดาห์ก่อน → 46 → คลอดแล้ว ทารก ~6 สัปดาห์ → ยังอยู่ในกลุ่ม (ควรยืนยัน)
    const born = classifyRedPerson(person(28, [["PREGNANT", "36 สัปดาห์"]]), house({ referenceDate: daysAgo(70) }), NOW);
    expect(born?.groups).toEqual(["MATERNAL_NEWBORN"]);
    expect(born?.needsCheck).toBe(true);
    // 36 สัปดาห์ เมื่อ 30 สัปดาห์ก่อน → ทารกเกิน 3 เดือนแล้ว
    expect(classifyRedPerson(person(28, [["PREGNANT", "36 สัปดาห์"]]), house({ referenceDate: daysAgo(210) }), NOW)).toBeNull();
  });

  it("กลุ่ม 3: อ่านอายุครรภ์ไม่ได้ → ใส่ไว้ก่อนพร้อมธง", () => {
    const unknown = classifyRedPerson(person(30, [["PREGNANT", "ไม่ระบุ"]]), house({ referenceDate: daysAgo(30) }), NOW);
    expect(unknown?.groups).toEqual(["MATERNAL_NEWBORN"]);
    expect(unknown?.needsCheck).toBe(true);
  });

  it("กลุ่ม 3: มารดาหลังคลอด และทารกในตาราง ≤ 3 เดือน ณ วันนี้", () => {
    expect(classifyRedPerson(person(25, [["POSTPARTUM", "1"]]), house({ referenceDate: daysAgo(30) }), NOW)?.groups).toEqual(["MATERNAL_NEWBORN"]);
    expect(classifyRedPerson(person(25, [["POSTPARTUM", "2"]]), house({ referenceDate: daysAgo(60) }), NOW)).toBeNull();
    expect(classifyRedPerson(person(0, [["CHILD_UNDER_5", null]], 1), house({ referenceDate: daysAgo(20) }), NOW)?.groups).toEqual(["MATERNAL_NEWBORN"]);
    expect(classifyRedPerson(person(0, [["CHILD_UNDER_5", null]], 5), house(), NOW)).toBeNull();
  });

  it("ประกอบเงื่อนไขของบ้าน: อยู่คนเดียว พื้นต่ำ", () => {
    const result = classifyRedPerson(person(80, [["BEDRIDDEN", null]]), house({ memberCount: 1, floorLevelVsRoad: "BELOW_ROAD" }), NOW);
    expect(result?.notes).toContain("บ้านมีสมาชิก 1 คน (อยู่คนเดียว)");
    expect(result?.notes).toContain("พื้นบ้านต่ำกว่าถนน");
  });
});

describe("tallyRedGroups", () => {
  it("นับคน บ้าน และรายกลุ่ม (หนึ่งคนหลายกลุ่ม)", () => {
    const a = classifyRedPerson(person(80, [["BEDRIDDEN", null]]), house(), NOW)!;
    const b = classifyRedPerson(person(50, [["DIALYSIS", null]]), house(), NOW)!;
    const c = classifyRedPerson(person(75, [["OTHER", "สายยาง"]]), house(), NOW)!;
    const tally = tallyRedGroups([
      { householdId: "h1", classification: a },
      { householdId: "h1", classification: b },
      { householdId: "h2", classification: c },
    ]);
    expect(tally).toEqual({
      people: 3,
      households: 2,
      needsCheck: 1,
      byGroup: { BEDRIDDEN: 1, DIALYSIS: 1, MATERNAL_NEWBORN: 0, ELDERLY_BEDRIDDEN: 2 },
    });
  });
});
