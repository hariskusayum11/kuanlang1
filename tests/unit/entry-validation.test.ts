import { describe, expect, it } from "vitest";
import {
  asRecord,
  collectMissing,
  isAnswered,
  isRowStarted,
  missingCountByStep,
  type CollectMissingArgs,
  type VulnerableRowLike,
} from "../../lib/entry/validation";
import type { EntryStep } from "../../lib/entry/steps";

const VULN_TYPES = [
  { id: "v-eld", label: "ผู้สูงอายุ", requiresDetail: false },
  { id: "v-preg", label: "หญิงตั้งครรภ์", requiresDetail: true },
  { id: "v-post", label: "มารดาหลังคลอด", requiresDetail: true },
];

const ASSIST_TYPES = [
  { id: "a-veh", label: "ต้องใช้รถ/เรือช่วยอพยพ", requiresCount: true, requiresDetail: false },
  { id: "a-med", label: "ต้องการยาสำรอง", requiresCount: false, requiresDetail: true },
  { id: "a-other", label: "อื่นๆ", requiresCount: false, requiresDetail: true },
];

function emptyRow(over: Partial<VulnerableRowLike> = {}): VulnerableRowLike {
  return {
    prefix: "",
    prefixOther: "",
    firstName: "",
    lastName: "",
    age: "",
    phone: "",
    vulnerabilities: [],
    details: {},
    ...over,
  };
}

const FIELD_STEP: EntryStep = {
  id: "loc",
  paperSection: "ส่วนที่ 1",
  title: "ที่อยู่",
  kind: "fields",
  fields: [
    { name: "houseNo", label: "เลขที่", type: "text", required: true },
    { name: "soi", label: "ซอย", type: "text" },
  ],
};

const GRID_STEP: EntryStep = {
  id: "vg",
  paperSection: "ส่วนที่ 2",
  title: "กลุ่มเปราะบาง",
  kind: "vulnerable-grid",
  fields: [],
};

const ASSIST_STEP: EntryStep = {
  id: "assist",
  paperSection: "ส่วนที่ 2 ข้อ 3",
  title: "ความต้องการ",
  kind: "fields",
  fields: [
    {
      name: "assistanceNeeds",
      label: "ความต้องการ",
      type: "assistance-needs",
      masterKey: "assistanceNeedTypes",
      extraKeys: ["assistanceNeedCounts", "assistanceNeedDetails"],
    },
  ],
};

function run(over: Partial<CollectMissingArgs> = {}) {
  return collectMissing({
    steps: [FIELD_STEP],
    answers: {},
    marks: {},
    vulnerableRows: [],
    vulnerabilityTypes: VULN_TYPES,
    assistanceTypes: ASSIST_TYPES,
    codeOf: () => undefined,
    ...over,
  });
}

describe("isAnswered", () => {
  it("ค่าว่าง/ช่องว่างล้วน/อาร์เรย์ว่าง = ยังไม่ตอบ", () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered({})).toBe(false);
  });

  it("boolean false ถือว่าตอบแล้ว — 'ไม่มี' คือคำตอบ ไม่ใช่ช่องว่าง", () => {
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(0)).toBe(true);
  });
});

describe("ทุกช่องต้องถูกตอบ (กันข้อมูลตกหล่นจากกระดาษ)", () => {
  it("ฟอร์มเปล่า = ขาดทุกช่องที่มองเห็น ไม่ใช่เฉพาะช่องบังคับ", () => {
    const missing = run();
    expect(missing.map((m) => m.key)).toEqual(["houseNo", "soi"]);
  });

  it("กรอกค่าแล้ว = ไม่ขาด", () => {
    expect(run({ answers: { houseNo: "12/3", soi: "5" } })).toHaveLength(0);
  });

  it("มาร์ก F2 (อ่านไม่ออก) ถือว่าตอบแล้ว — ห้ามบังคับให้เดา", () => {
    const missing = run({ marks: { houseNo: "ILLEGIBLE", soi: "ILLEGIBLE" } });
    expect(missing).toHaveLength(0);
  });

  it("มาร์ก F3 (ว่างในกระดาษ) ถือว่าตอบแล้ว", () => {
    const missing = run({
      marks: { houseNo: "BLANK_IN_PAPER", soi: "BLANK_IN_PAPER" },
    });
    expect(missing).toHaveLength(0);
  });

  it("ช่องที่ไม่บังคับก็ยังต้องยืนยันด้วย F2/F3 — เว้นว่างเฉย ๆ ไม่ผ่าน", () => {
    const missing = run({ answers: { houseNo: "12/3" } });
    expect(missing.map((m) => m.key)).toEqual(["soi"]);
  });

  it("ผสมกันได้: บางช่องกรอก บางช่องมาร์ก", () => {
    const missing = run({
      answers: { houseNo: "12/3" },
      marks: { soi: "BLANK_IN_PAPER" },
    });
    expect(missing).toHaveLength(0);
  });
});

describe("ตารางกลุ่มเปราะบาง", () => {
  it("แถวว่างเปล่าไม่นับว่าขาด", () => {
    const missing = run({ steps: [GRID_STEP], vulnerableRows: [emptyRow()] });
    expect(missing).toHaveLength(0);
  });

  it("เริ่มกรอกแล้วต้องมีทั้งชื่อและนามสกุล", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [emptyRow({ age: "70" })],
    });
    expect(missing.map((m) => m.key)).toEqual(["vg-0-firstName", "vg-0-lastName"]);
  });

  it("มีชื่อแต่ไม่มีนามสกุล = ยังขาด", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [emptyRow({ firstName: "สมชาย" })],
    });
    expect(missing.map((m) => m.key)).toEqual(["vg-0-lastName"]);
  });

  it("ติ๊กหญิงตั้งครรภ์แล้วไม่กรอกรายละเอียด = ส่งไม่ได้", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [
        emptyRow({ firstName: "ก", lastName: "ข", vulnerabilities: ["v-preg"] }),
      ],
    });
    expect(missing.map((m) => m.key)).toEqual(["vg-0-detail-v-preg"]);
  });

  it("ติ๊กมารดาหลังคลอดแล้วกรอกรายละเอียดแล้ว = ผ่าน", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [
        emptyRow({
          firstName: "ก",
          lastName: "ข",
          vulnerabilities: ["v-post"],
          details: { "v-post": "3 เดือน" },
        }),
      ],
    });
    expect(missing).toHaveLength(0);
  });

  it("ประเภทที่ไม่ต้องระบุรายละเอียดไม่ถูกบังคับ", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [
        emptyRow({ firstName: "ก", lastName: "ข", vulnerabilities: ["v-eld"] }),
      ],
    });
    expect(missing).toHaveLength(0);
  });

  it("นับแยกรายคน — คนที่ 2 ขาดก็ต้องรายงาน", () => {
    const missing = run({
      steps: [GRID_STEP],
      vulnerableRows: [
        emptyRow({ firstName: "ก", lastName: "ข" }),
        emptyRow({ firstName: "ค", lastName: "", vulnerabilities: ["v-preg"] }),
      ],
    });
    expect(missing.map((m) => m.key)).toEqual([
      "vg-1-lastName",
      "vg-1-detail-v-preg",
    ]);
  });
});

describe("ความต้องการช่วยเหลือ", () => {
  it("ไม่ติ๊กอะไรเลยและไม่มาร์ก = ขาด (ต้องยืนยันว่ากระดาษไม่ได้เขียน)", () => {
    const missing = run({ steps: [ASSIST_STEP] });
    expect(missing.map((m) => m.key)).toEqual(["assistanceNeeds"]);
  });

  it("ไม่ติ๊กแต่มาร์ก F3 = ผ่าน", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      marks: { assistanceNeeds: "BLANK_IN_PAPER" },
    });
    expect(missing).toHaveLength(0);
  });

  it("ติ๊กข้อที่ต้องระบุจำนวน แต่ไม่กรอกจำนวน = ขาด", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      answers: { assistanceNeeds: ["a-veh"] },
    });
    expect(missing.map((m) => m.key)).toEqual(["an-count-a-veh"]);
  });

  it("กรอกจำนวนแล้ว = ผ่าน", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      answers: { assistanceNeeds: ["a-veh"], assistanceNeedCounts: { "a-veh": "3" } },
    });
    expect(missing).toHaveLength(0);
  });

  it("ติ๊ก 'อื่นๆ' แล้วไม่ระบุรายละเอียด = ขาด", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      answers: { assistanceNeeds: ["a-other"] },
    });
    expect(missing.map((m) => m.key)).toEqual(["an-detail-a-other"]);
  });

  it("ข้อที่ต้องการทั้งจำนวนและรายละเอียดถูกนับแยกกัน", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      answers: { assistanceNeeds: ["a-veh", "a-med"] },
    });
    expect(missing.map((m) => m.key)).toEqual(["an-count-a-veh", "an-detail-a-med"]);
  });

  it("ค่าที่เป็นช่องว่างล้วนไม่นับว่ากรอกแล้ว", () => {
    const missing = run({
      steps: [ASSIST_STEP],
      answers: { assistanceNeeds: ["a-veh"], assistanceNeedCounts: { "a-veh": "  " } },
    });
    expect(missing.map((m) => m.key)).toEqual(["an-count-a-veh"]);
  });
});

describe("missingCountByStep", () => {
  it("นับจำนวนที่ขาดแยกตาม step", () => {
    const missing = run({
      steps: [FIELD_STEP, GRID_STEP],
      vulnerableRows: [emptyRow({ age: "70" })],
    });
    expect(missingCountByStep(missing)).toEqual({ loc: 2, vg: 2 });
  });

  it("ไม่มีอะไรขาด = อ็อบเจกต์ว่าง", () => {
    expect(missingCountByStep([])).toEqual({});
  });
});

describe("helper", () => {
  it("isRowStarted จับได้ว่าแถวเริ่มกรอกจากช่องใดก็ได้", () => {
    expect(isRowStarted(emptyRow())).toBe(false);
    expect(isRowStarted(emptyRow({ phone: "081" }))).toBe(true);
    expect(isRowStarted(emptyRow({ vulnerabilities: ["v-eld"] }))).toBe(true);
  });

  it("asRecord กรองเฉพาะค่าที่เป็น string และกันค่าที่ไม่ใช่อ็อบเจกต์", () => {
    expect(asRecord({ a: "1", b: 2, c: null })).toEqual({ a: "1" });
    expect(asRecord(["x"])).toEqual({});
    expect(asRecord(null)).toEqual({});
  });
});
