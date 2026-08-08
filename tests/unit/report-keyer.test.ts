import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { PERMISSIONS } from "../../lib/authz/permissions";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  buildKeyerCsv,
  canViewReports,
  mergeKeyerCounts,
  sumKeyerRows,
  type KeyerRow,
} from "../../lib/report/keyer-productivity";

function ctx(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: "u1",
    name: "เจ้าหน้าที่",
    email: "a@b.c",
    roles: [UserRoleEnum.COORDINATOR],
    permissions: [PERMISSIONS.REPORT_VIEW],
    isGlobalScope: true,
    communityIds: [],
    ...overrides,
  };
}

describe("canViewReports", () => {
  it("มี report.view → true, ไม่มี → false", () => {
    expect(canViewReports(ctx())).toBe(true);
    expect(canViewReports(ctx({ permissions: [PERMISSIONS.SURVEY_ENTRY] }))).toBe(false);
  });
});

describe("mergeKeyerCounts", () => {
  const names = new Map([
    ["k1", "สมชาย"],
    ["k2", "สมหญิง"],
  ]);

  it("join ยอดรวม + ยอด verified ด้วย enteredById และคิด pending = total − verified", () => {
    const rows = mergeKeyerCounts(
      [
        { enteredById: "k1", count: 10 },
        { enteredById: "k2", count: 4 },
      ],
      [{ enteredById: "k1", count: 6 }],
      names,
    );
    const k1 = rows.find((r) => r.enteredById === "k1")!;
    const k2 = rows.find((r) => r.enteredById === "k2")!;
    expect(k1).toMatchObject({ name: "สมชาย", total: 10, verified: 6, pending: 4 });
    // ไม่มีใบ verified เลย → verified 0, pending = total
    expect(k2).toMatchObject({ name: "สมหญิง", total: 4, verified: 0, pending: 4 });
  });

  it("เรียงจากกรอกมากไปน้อย", () => {
    const rows = mergeKeyerCounts(
      [
        { enteredById: "k2", count: 4 },
        { enteredById: "k1", count: 10 },
      ],
      [],
      names,
    );
    expect(rows.map((r) => r.enteredById)).toEqual(["k1", "k2"]);
  });

  it("ไม่พบชื่อ → ป้ายกำกับแทน (ไม่ทำให้ล้ม)", () => {
    const rows = mergeKeyerCounts([{ enteredById: "kX", count: 1 }], [], new Map());
    expect(rows[0].name).toBe("(ไม่พบชื่อ)");
  });
});

describe("sumKeyerRows", () => {
  it("รวมทุกคอลัมน์", () => {
    const rows: KeyerRow[] = [
      { enteredById: "k1", name: "A", total: 10, verified: 6, pending: 4, sheets: [] },
      { enteredById: "k2", name: "B", total: 4, verified: 0, pending: 4, sheets: [] },
    ];
    expect(sumKeyerRows(rows)).toEqual({ total: 14, verified: 6, pending: 8 });
  });

  it("ว่าง → ศูนย์ทั้งหมด", () => {
    expect(sumKeyerRows([])).toEqual({ total: 0, verified: 0, pending: 0 });
  });
});

describe("buildKeyerCsv", () => {
  const rows: KeyerRow[] = [
    { enteredById: "k1", name: "สมชาย", total: 10, verified: 6, pending: 4, sheets: [] },
    { enteredById: "k2", name: "สมหญิง", total: 4, verified: 0, pending: 4, sheets: [] },
  ];

  it("หัวตาราง 4 คอลัมน์ (คนกรอก/กรอกทั้งหมด/ตรวจผ่าน/ยังไม่ผ่าน)", () => {
    const header = buildKeyerCsv([]).split("\r\n")[0];
    expect(header).toBe("คนกรอก,กรอกทั้งหมด,ตรวจผ่านแล้ว,ยังไม่ผ่านตรวจ");
  });

  it("มีแถวรวมท้ายตาราง", () => {
    const lines = buildKeyerCsv(rows).split("\r\n");
    expect(lines[lines.length - 1]).toBe("รวม,14,6,8");
  });

  it("escape ชื่อที่มี comma ตาม RFC 4180", () => {
    const tricky: KeyerRow[] = [
      { enteredById: "k3", name: "สมชาย, จูเนียร์", total: 1, verified: 1, pending: 0, sheets: [] },
    ];
    expect(buildKeyerCsv(tricky).split("\r\n")[1]).toContain('"สมชาย, จูเนียร์"');
  });
});
