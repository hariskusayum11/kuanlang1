import { describe, expect, it } from "vitest";
import {
  assemblePersonName,
  buildVulnerableWorkbook,
  formatAge,
  formatCoord,
  formatDiseases,
  safeSheetName,
  statusLabel,
  type VulnerableExportRow,
} from "../../lib/report/vulnerable-export";

describe("assemblePersonName", () => {
  it("รวมคำนำหน้า+ชื่อ+นามสกุล", () => {
    expect(assemblePersonName("นาย", "สมชาย", "ใจดี", "HAS_VALUE")).toBe("นายสมชาย ใจดี");
  });
  it("ว่างทั้งหมด → ป้ายตามสถานะช่อง", () => {
    expect(assemblePersonName("", "", "", "BLANK_IN_PAPER")).toBe("(เว้นว่างในกระดาษ)");
    expect(assemblePersonName("", "", "", "ILLEGIBLE")).toBe("(อ่านไม่ออก)");
    expect(assemblePersonName("", "", "", "HAS_VALUE")).toBe("(ไม่มีชื่อ)");
  });
});

describe("formatDiseases", () => {
  it("แนบรายละเอียดในวงเล็บ + คั่นด้วย ;", () => {
    expect(
      formatDiseases([
        { nameTh: "ผู้ป่วยติดเตียง", detail: null },
        { nameTh: "โรคเรื้อรัง", detail: "ความดันสูง" },
      ]),
    ).toBe("ผู้ป่วยติดเตียง; โรคเรื้อรัง (ความดันสูง)");
  });
  it("ไม่มีเลย → ว่าง", () => {
    expect(formatDiseases([])).toBe("");
  });

  it("ไม่ปล่อย ciphertext ลงไฟล์รายงาน", () => {
    const text = formatDiseases([
      { nameTh: "อื่น ๆ", detail: "v1:x11Olx7F4ibPj5vW:tgejnu0wOhli9pc=:Y6gKUjtx3X6tFcsnOARiow==" },
    ]);
    expect(text).toBe("อื่น ๆ (ไม่สามารถแสดงรายละเอียดได้)");
    expect(text).not.toContain("v1:");
  });
});

describe("formatCoord", () => {
  it("มี lat/lng → ใช้เลข", () => {
    expect(formatCoord("6.98", "100.46", "อะไรก็ตาม")).toBe("6.98, 100.46");
  });
  it("ไม่มี lat/lng → ข้อความดิบ", () => {
    expect(formatCoord(null, null, "N6 E100")).toBe("N6 E100");
    expect(formatCoord(null, null, null)).toBe("");
  });
});

describe("formatAge", () => {
  it("ปีเมื่อ > 0, ไม่งั้นเดือน, ไม่งั้นว่าง", () => {
    expect(formatAge(55, null)).toBe("55 ปี");
    expect(formatAge(0, 8)).toBe("8 เดือน");
    expect(formatAge(null, null)).toBe("");
  });
});

describe("statusLabel", () => {
  it("แปลงสถานะเป็นไทย, ไม่รู้จัก → คืนค่าเดิม", () => {
    expect(statusLabel("VERIFIED")).toBe("ตรวจสอบแล้ว");
    expect(statusLabel("ENTERED_1")).toBe("คีย์แล้ว (รอตรวจ)");
    expect(statusLabel("WEIRD")).toBe("WEIRD");
  });
});

describe("safeSheetName", () => {
  it("ตัดอักขระต้องห้าม จำกัด 31 ตัว และกันซ้ำ", () => {
    const used = new Set<string>();
    expect(safeSheetName("ชุมชน/ท่าเคียน", used)).toBe("ชุมชน ท่าเคียน");
    expect(safeSheetName("ชุมชน/ท่าเคียน", used)).toBe("ชุมชน ท่าเคียน_2");
    expect(safeSheetName("x".repeat(40), used).length).toBeLessThanOrEqual(31);
  });
});

describe("buildVulnerableWorkbook", () => {
  const rows: VulnerableExportRow[] = [
    { community: "ชุมชนหน้าควน", communityCode: "NK01", seq: 1, fullName: "นายทดสอบ ทดสอบ", ageText: "55 ปี", diseases: "ผู้สูงอายุ", triage: "", coord: "7.1, 99.5", houseNo: "33", mooNo: "1", soi: "", road: "", tambon: "ควนลัง", sheetNo: "SK-000289", status: "ENTERED_1" },
    { community: "ชุมชนท่าเคียน", communityCode: "TK01", seq: 1, fullName: "นายยา ดี", ageText: "20 ปี", diseases: "ผู้ป่วยติดเตียง", triage: "", coord: "6.9, 100.4", houseNo: "20", mooNo: "2", soi: "", road: "", tambon: "ควนลัง", sheetNo: "SHEET-1", status: "VERIFIED" },
  ];

  it("สร้าง buffer + ชีตทั้งหมด + แยกชุมชนเรียงตามชื่อ", async () => {
    const buf = await buildVulnerableWorkbook(rows);
    expect(buf.length).toBeGreaterThan(0);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["ทั้งหมด", "ชุมชนท่าเคียน", "ชุมชนหน้าควน"]);
  });
});
