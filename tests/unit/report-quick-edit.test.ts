import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { PERMISSIONS } from "../../lib/authz/permissions";
import { ROLE_PERMISSIONS } from "../../lib/authz/role-permissions";
import { parseReportQuickEditInput } from "../../lib/report/quick-edit";

describe("report quick edit — validation และสิทธิ์", () => {
  it("รับเฉพาะระดับความเร่งด่วนที่ระบบรู้จัก", () => {
    expect(parseReportQuickEditInput({ kind: "triage", recordId: "person-1", value: "P2" })).toEqual({
      kind: "triage",
      recordId: "person-1",
      value: "P2",
    });
    expect(parseReportQuickEditInput({ kind: "triage", recordId: "person-1", value: "P4" })).toBeNull();
  });

  it("บ้านพักพิงรับ true / false / null เท่านั้น", () => {
    expect(parseReportQuickEditInput({ kind: "host-house", recordId: "home-1", value: null })).toEqual({
      kind: "host-house",
      recordId: "home-1",
      value: null,
    });
    expect(parseReportQuickEditInput({ kind: "host-house", recordId: "home-1", value: "true" })).toBeNull();
  });

  it("ชุดยังชีพรับ true / false / null เท่านั้น", () => {
    expect(parseReportQuickEditInput({ kind: "survival-kit", recordId: "home-1", value: false })).toEqual({
      kind: "survival-kit",
      recordId: "home-1",
      value: false,
    });
    expect(parseReportQuickEditInput({ kind: "survival-kit", recordId: "home-1", value: "false" })).toBeNull();
  });

  it("ตรวจข้อมูลแก้ความช่วยเหลือแบบเข้มงวด", () => {
    expect(parseReportQuickEditInput({
      kind: "assistance",
      recordId: "home-1",
      needId: "need-1",
      active: true,
      typeId: "type-1",
      personCount: 2,
      detail: " ต้องใช้รถเข็น ",
    })).toEqual({
      kind: "assistance",
      recordId: "home-1",
      needId: "need-1",
      active: true,
      typeId: "type-1",
      personCount: 2,
      detail: "ต้องใช้รถเข็น",
    });
    expect(parseReportQuickEditInput({ kind: "assistance", recordId: "home-1", needId: "need-1", active: true, personCount: 1, detail: "" })).toBeNull();
    expect(parseReportQuickEditInput({ kind: "assistance", recordId: "home-1", needId: "need-1", active: true, typeId: "type-1", personCount: -1, detail: "" })).toBeNull();
  });

  it("สนใจอาสาสมัครต้องมีอย่างน้อยหนึ่งทักษะ และตัด id ซ้ำ", () => {
    expect(parseReportQuickEditInput({
      kind: "volunteer",
      recordId: "home-1",
      state: "INTERESTED",
      skillIds: ["skill-1", "skill-1", "skill-2"],
    })).toEqual({
      kind: "volunteer",
      recordId: "home-1",
      state: "INTERESTED",
      skillIds: ["skill-1", "skill-2"],
    });
    expect(parseReportQuickEditInput({ kind: "volunteer", recordId: "home-1", state: "INTERESTED", skillIds: [] })).toBeNull();
  });

  it("ระดับน้ำ: เว้นว่างได้ (= ไม่ระบุ) และรับเฉพาะจำนวนเต็มในช่วงตามกระดาษ", () => {
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: 1, cm: 50 })).toEqual({
      kind: "flood-depth",
      recordId: "home-1",
      meters: 1,
      cm: 50,
    });
    // เว้นว่างทั้งคู่ = ล้างค่าเป็นไม่ระบุ
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: null, cm: null })).toEqual({
      kind: "flood-depth",
      recordId: "home-1",
      meters: null,
      cm: null,
    });
    // เกินช่วงของช่องบนกระดาษ (เมตร 0-10 · ซม. 0-99) และค่าที่ไม่ใช่จำนวนเต็ม ต้องถูกปฏิเสธ
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: 11, cm: 0 })).toBeNull();
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: 0, cm: 100 })).toBeNull();
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: -1, cm: 0 })).toBeNull();
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: 1.5, cm: 0 })).toBeNull();
    expect(parseReportQuickEditInput({ kind: "flood-depth", recordId: "home-1", meters: "1", cm: 0 })).toBeNull();
  });

  it("สิทธิ์แก้ด่วนเป็นของ ADMIN เท่านั้น", () => {
    expect(ROLE_PERMISSIONS[UserRoleEnum.ADMIN]).toContain(PERMISSIONS.REPORT_QUICK_EDIT);
    for (const role of [UserRoleEnum.EXECUTIVE, UserRoleEnum.OFFICER, UserRoleEnum.DATA_ENTRY]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.REPORT_QUICK_EDIT);
    }
  });
});
