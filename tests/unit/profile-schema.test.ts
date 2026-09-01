import { describe, expect, it } from "vitest";
import { passwordChangeSchema, profileInfoSchema } from "../../lib/profile/schema";

describe("profileInfoSchema", () => {
  it("ผ่านเมื่อชื่อถูกต้อง + เบอร์ 10 หลัก", () => {
    const r = profileInfoSchema.safeParse({ name: "สมชาย ใจดี", phone: "0812345678" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe("0812345678");
  });

  it("เบอร์ว่าง → undefined (ล้างเบอร์ได้)", () => {
    const r = profileInfoSchema.safeParse({ name: "สมชาย", phone: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeUndefined();
  });

  it("ตัดช่องว่างหัวท้ายของชื่อ", () => {
    const r = profileInfoSchema.safeParse({ name: "  สมหญิง  ", phone: "" });
    expect(r.success && r.data.name).toBe("สมหญิง");
  });

  it("ชื่อว่าง → ไม่ผ่าน", () => {
    expect(profileInfoSchema.safeParse({ name: "   ", phone: "" }).success).toBe(false);
  });

  it("เบอร์ไม่ใช่ 10 หลัก → ไม่ผ่าน", () => {
    expect(profileInfoSchema.safeParse({ name: "ก", phone: "081" }).success).toBe(false);
    expect(profileInfoSchema.safeParse({ name: "ก", phone: "08123456789" }).success).toBe(false);
    expect(profileInfoSchema.safeParse({ name: "ก", phone: "08a2345678" }).success).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  const base = { currentPassword: "oldpass123", newPassword: "newpass123", confirmPassword: "newpass123" };

  it("ผ่านเมื่อครบเงื่อนไข", () => {
    expect(passwordChangeSchema.safeParse(base).success).toBe(true);
  });

  it("รหัสใหม่ < 8 ตัว → ไม่ผ่าน", () => {
    const r = passwordChangeSchema.safeParse({ ...base, newPassword: "short", confirmPassword: "short" });
    expect(r.success).toBe(false);
  });

  it("ยืนยันไม่ตรง → ไม่ผ่าน", () => {
    const r = passwordChangeSchema.safeParse({ ...base, confirmPassword: "different1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toContain("confirmPassword");
  });

  it("รหัสใหม่ซ้ำรหัสเดิม → ไม่ผ่าน", () => {
    const r = passwordChangeSchema.safeParse({
      currentPassword: "samepass123",
      newPassword: "samepass123",
      confirmPassword: "samepass123",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toContain("newPassword");
  });

  it("รหัสปัจจุบันว่าง → ไม่ผ่าน", () => {
    const r = passwordChangeSchema.safeParse({ ...base, currentPassword: "" });
    expect(r.success).toBe(false);
  });
});
