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

  it("สิทธิ์แก้ด่วนเป็นของ ADMIN เท่านั้น", () => {
    expect(ROLE_PERMISSIONS[UserRoleEnum.ADMIN]).toContain(PERMISSIONS.REPORT_QUICK_EDIT);
    for (const role of [UserRoleEnum.EXECUTIVE, UserRoleEnum.OFFICER, UserRoleEnum.DATA_ENTRY]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.REPORT_QUICK_EDIT);
    }
  });
});
