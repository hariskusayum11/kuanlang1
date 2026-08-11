import { describe, it, expect } from "vitest";
import { loginSchema } from "../../lib/validations/auth";
import {
  derivePendingCount,
  toStatCards,
  type DashboardCounts,
} from "../../lib/dashboard/stats";
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
    keyed: 40,
    verified: 18,
    pending: 22,
    keyers: 3,
  };

  it("map ครบ 5 การ์ด ตามลำดับ flow งาน และค่าตรง", () => {
    const cards = toStatCards(counts);
    expect(cards.map((c) => c.key)).toEqual([
      "communities",
      "keyed",
      "verified",
      "pending",
      "keyers",
    ]);
    expect(cards.map((c) => c.value)).toEqual([5, 40, 18, 22, 3]);
  });

  it("ยังไม่ผ่านตรวจใช้สูตรคีย์แล้ว − ตรวจแล้ว รวมใบที่กำลังเปิดแก้", () => {
    expect(derivePendingCount(262, 1)).toBe(261);
    expect(derivePendingCount(1, 2)).toBe(0);
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
