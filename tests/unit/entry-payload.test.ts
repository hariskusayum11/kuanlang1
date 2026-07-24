import { describe, expect, it } from "vitest";
import { FieldStatusEnum } from "@prisma/client";
import {
  KNOWN_FIELD_NAMES,
  answerBoolean,
  answerCount,
  answerString,
  entryPayloadSchema,
  parseThaiDate,
  sanitizeEntryPayload,
} from "../../lib/entry/payload";
import { mapVulnerableRows } from "../../lib/entry/save";

describe("parseThaiDate — วันที่จากกระดาษ (พ.ศ./ค.ศ.)", () => {
  it("พ.ศ. → ค.ศ.: 15/03/2568 = 2025-03-15 (UTC)", () => {
    const d = parseThaiDate("15/03/2568");
    expect(d?.toISOString()).toBe("2025-03-15T00:00:00.000Z");
  });

  it("ค.ศ. ตรง ๆ ก็รับ: 01/12/2024", () => {
    expect(parseThaiDate("01/12/2024")?.toISOString()).toBe(
      "2024-12-01T00:00:00.000Z",
    );
  });

  it("วันที่ไม่จริง (31/02) / รูปแบบอื่น / ปีหลุดขอบ → null (ไม่เดา)", () => {
    expect(parseThaiDate("31/02/2568")).toBeNull();
    expect(parseThaiDate("ต้นปี 67")).toBeNull();
    expect(parseThaiDate("2024-12-01")).toBeNull();
    expect(parseThaiDate("15/03/9999")).toBeNull();
    expect(parseThaiDate("")).toBeNull();
  });
});

describe("sanitizeEntryPayload — whitelist ฟิลด์ที่รู้จักเท่านั้น", () => {
  it("ตัดคีย์แปลกปลอมออกจาก answers/marks (กัน payload ยัดข้อมูล)", () => {
    const payload = entryPayloadSchema.parse({
      answers: { houseNo: "12/3", evilField: "hack", memberCount: 4 },
      marks: { respondentPhone: "ILLEGIBLE", evilMark: "BLANK_IN_PAPER" },
    });
    const clean = sanitizeEntryPayload(payload);
    expect(clean.answers).toEqual({ houseNo: "12/3", memberCount: 4 });
    expect(clean.marks).toEqual({ respondentPhone: "ILLEGIBLE" });
  });

  it("KNOWN_FIELD_NAMES ครอบคลุมฟิลด์จริง และไม่มีฟิลด์ต้องห้าม", () => {
    expect(KNOWN_FIELD_NAMES.has("respondentPhone")).toBe(true);
    expect(KNOWN_FIELD_NAMES.has("hasVulnerable")).toBe(true);
    // measure-pair: ทั้งช่องหลักและช่องที่สองต้องอยู่ใน whitelist (ไม่งั้นถูกตัดตอน sanitize)
    expect(KNOWN_FIELD_NAMES.has("floodDepthMetersRaw")).toBe(true);
    expect(KNOWN_FIELD_NAMES.has("floodDepthCmRaw")).toBe(true);
    expect(KNOWN_FIELD_NAMES.has("lastFloodYear")).toBe(false); // QM-11
    expect(KNOWN_FIELD_NAMES.has("lineUserId")).toBe(false);
  });

  it("schema ปฏิเสธค่าเกินขอบเขต (ข้อความยาวเกิน/แถวเกิน 30)", () => {
    expect(
      entryPayloadSchema.safeParse({
        answers: { suggestion: "ก".repeat(2001) },
      }).success,
    ).toBe(false);
    expect(
      entryPayloadSchema.safeParse({
        vulnerableRows: Array.from({ length: 31 }, () => ({})),
      }).success,
    ).toBe(false);
  });
});

describe("answer helpers — อ่านค่าอย่างระวังชนิด", () => {
  const p = entryPayloadSchema.parse({
    answers: {
      houseNo: "  12/3  ",
      empty: "",
      memberCount: "4",
      badCount: "-2",
      hasVulnerable: false,
    },
  });

  it("answerString: trim + ค่าว่าง → null", () => {
    expect(answerString(p, "houseNo")).toBe("12/3");
    expect(answerString(p, "empty")).toBeNull();
    expect(answerString(p, "missing")).toBeNull();
  });

  it("answerCount: รับ string ตัวเลข, ปฏิเสธติดลบ/ทศนิยม", () => {
    expect(answerCount(p, "memberCount")).toBe(4);
    expect(answerCount(p, "badCount")).toBeNull();
  });

  it("answerBoolean: false จริง ≠ ไม่ได้ตอบ (null)", () => {
    expect(answerBoolean(p, "hasVulnerable")).toBe(false);
    expect(answerBoolean(p, "missing")).toBeNull();
  });
});

describe("mapVulnerableRows — ตารางกลุ่มเปราะบาง (สถานะรายช่อง BR-42/43)", () => {
  it("แถวว่างล้วนถูกตัดทิ้ง — seq เรียงตามแถวที่เหลือ", () => {
    const mapped = mapVulnerableRows([
      { prefix: "", prefixOther: "", firstName: "", lastName: "", age: "", phone: "", vulnerabilities: [], details: {} },
      { prefix: "", prefixOther: "", firstName: "ทดสอบ", lastName: "", age: "80", phone: "", vulnerabilities: [], details: {} },
      { prefix: "", prefixOther: "", firstName: "", lastName: "", age: "", phone: "081", vulnerabilities: [], details: {} },
    ]);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].seq).toBe(1);
    expect(mapped[1].seq).toBe(2);
  });

  it("ช่องว่าง = BLANK_IN_PAPER, มีค่า = HAS_VALUE, อายุเป็นไปไม่ได้ = ILLEGIBLE", () => {
    const [row] = mapVulnerableRows([
      { prefix: "", prefixOther: "", firstName: "มี", lastName: "", age: "999", phone: "", vulnerabilities: [], details: {} },
    ]);
    expect(row.nameStatus).toBe(FieldStatusEnum.HAS_VALUE);
    expect(row.age).toBeNull();
    expect(row.ageStatus).toBe(FieldStatusEnum.ILLEGIBLE);
    expect(row.phone).toBeNull();
    expect(row.phoneStatus).toBe(FieldStatusEnum.BLANK_IN_PAPER);
  });

  it("detail ผูกตาม vulnerabilityTypeId และ trim ค่าว่างเป็น null", () => {
    const [row] = mapVulnerableRows([
      {
        prefix: "px-other",
        prefixOther: "  พระ  ",
        firstName: "สา",
        lastName: "",
        age: "72",
        phone: "081-111-2222",
        vulnerabilities: ["vt1", "vt2"],
        details: { vt1: " ยาลิ่มเลือด ", vt2: "  " },
      },
    ]);
    expect(row.namePrefixId).toBe("px-other");
    expect(row.prefixOther).toBe("พระ"); // trim + เก็บค่าระบุคำนำหน้า
    expect(row.age).toBe(72);
    expect(row.vulnerabilities).toEqual([
      { typeId: "vt1", detail: "ยาลิ่มเลือด" },
      { typeId: "vt2", detail: null },
    ]);
  });
});
