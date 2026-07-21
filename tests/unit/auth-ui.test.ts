import { describe, it, expect } from "vitest";
import { loginSchema } from "../../lib/validations/auth";
import { toStatCards, type DashboardCounts } from "../../lib/dashboard/stats";
import { safeErrorMessage, SAFE_ERROR_MESSAGES } from "../../lib/errors";

describe("Login validation (loginSchema)", () => {
  it("email ว่าง → ไม่ผ่าน", () => {
    const r = loginSchema.safeParse({ email: "", password: "x" });
    expect(r.success).toBe(false);
  });

  it("email ผิด format → ไม่ผ่าน", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(r.success).toBe(false);
  });

  it("password ว่าง → ไม่ผ่าน", () => {
    const r = loginSchema.safeParse({ email: "a@test.invalid", password: "" });
    expect(r.success).toBe(false);
  });

  it("email + password ถูกต้อง → ผ่าน (trim email)", () => {
    const r = loginSchema.safeParse({ email: "  a@test.invalid  ", password: "secret" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("a@test.invalid");
  });
});

describe("Dashboard stats mapping (toStatCards)", () => {
  const counts: DashboardCounts = {
    communities: 5,
    tambons: 2,
    moos: 5,
    households: 0,
    evacuationSites: 0,
  };

  it("map ครบ 5 การ์ด ตามลำดับ และค่าตรง", () => {
    const cards = toStatCards(counts);
    expect(cards.map((c) => c.key)).toEqual([
      "communities",
      "tambons",
      "moos",
      "households",
      "evacuationSites",
    ]);
    expect(cards.map((c) => c.value)).toEqual([5, 2, 5, 0, 0]);
  });

  it("โมดูลที่ยังไม่เปิด (ครัวเรือน/จุดอพยพ) ติดธง pending", () => {
    const cards = toStatCards(counts);
    expect(cards.find((c) => c.key === "households")?.pending).toBe(true);
    expect(cards.find((c) => c.key === "evacuationSites")?.pending).toBe(true);
    expect(cards.find((c) => c.key === "communities")?.pending).toBe(false);
  });
});

describe("Safe error message", () => {
  it("ไม่สะท้อนเนื้อหา error ภายใน (เช่น connection string) ออกไป", () => {
    const leaky = new Error("connect failed postgresql://user:secret@localhost:5432/db");
    const msg = safeErrorMessage(leaky);
    expect(msg).toBe(SAFE_ERROR_MESSAGES.generic);
    expect(msg).not.toContain("postgresql://");
    expect(msg).not.toContain("secret");
  });
});
