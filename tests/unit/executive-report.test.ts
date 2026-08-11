import { describe, expect, it } from "vitest";
import {
  buildExecutiveCsv,
  parseExecutiveReportFilters,
  type ExecutiveReport,
} from "../../lib/report/executive-summary";

const report: ExecutiveReport = {
  summary: {
    households: 2,
    people: 7,
    vulnerableHouseholds: 1,
    vulnerablePeople: 2,
    assistancePeople: 5,
  },
  triage: { P1: 1, P2: 0, P3: 1, UNASSESSED: 0 },
  assistance: [{ key: "food", label: "อาหาร, น้ำดื่ม", count: 2, people: 5 }],
  flood: {
    floodedHouseholds: 1,
    averageDepthCm: 45.4,
    maximumDepthCm: 80,
    averageDurationDays: 3.2,
    withoutSurvivalKit: 1,
    withoutResources: 1,
  },
  preparedness: {
    vehicles: [{ key: "BOAT", label: "เรือ", count: 1 }],
    alertChannels: [{ key: "LINE", label: "ไลน์", count: 2 }],
    smartphoneHouseholds: 2,
    qrReadyHouseholds: 1,
  },
  participation: {
    volunteerHouseholds: 1,
    volunteerSkills: [{ key: "RESCUE", label: "กู้ภัย", count: 1 }],
    potentialHostHouses: 1,
    mentalHealthSupport: 0,
    povertyProgramInterest: 1,
  },
  quality: { missingCoordinates: 1, incomplete: 0, illegible: 0 },
  options: { communities: [], tambons: [] },
};

describe("executive report", () => {
  it("ใช้เฉพาะข้อมูลตรวจแล้วเป็นค่าเริ่มต้น", () => {
    expect(parseExecutiveReportFilters({}).status).toBe("VERIFIED");
    expect(parseExecutiveReportFilters({ status: "PENDING" }).status).toBe("PENDING");
    expect(parseExecutiveReportFilters({ status: "INVALID" }).status).toBe("VERIFIED");
  });

  it("ส่งออกข้อมูลสรุปทุกหมวดและ escape CSV ได้", () => {
    const csv = buildExecutiveCsv(report);
    expect(csv).toContain("หมวด,รายการ,จำนวน,หน่วย");
    expect(csv).toContain('"อาหาร, น้ำดื่ม — จำนวนครัวเรือน"');
    expect(csv).toContain("P1 วิกฤต");
    expect(csv).toContain("ไม่มีพิกัด");
    expect(csv).not.toContain("คนกรอก");
  });
});
