import { afterEach, describe, expect, it } from "vitest";
import { isEmailEnabled } from "../../lib/config/email";

const ORIGINAL = process.env.EMAIL_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_ENABLED;
  else process.env.EMAIL_ENABLED = ORIGINAL;
});

describe("ธงเปิด/ปิดระบบอีเมล", () => {
  it("ไม่ตั้งค่า = เปิด — การปิดต้องประกาศชัดเจนเสมอ ไม่ใช่ผลจากการลืมตั้ง env", () => {
    delete process.env.EMAIL_ENABLED;
    expect(isEmailEnabled()).toBe(true);
  });

  it("ปิดได้ด้วย false / 0 / off และไม่สนตัวพิมพ์เล็กใหญ่หรือช่องว่าง", () => {
    for (const value of ["false", "FALSE", " False ", "0", "off", "OFF"]) {
      process.env.EMAIL_ENABLED = value;
      expect(isEmailEnabled(), `ค่า ${JSON.stringify(value)} ต้องถือว่าปิด`).toBe(false);
    }
  });

  it("ค่าอื่นถือว่าเปิด — ค่าที่พิมพ์ผิดต้องไม่ทำให้ระบบเงียบไปเฉย ๆ", () => {
    for (const value of ["true", "1", "yes", "", "ปิด"]) {
      process.env.EMAIL_ENABLED = value;
      expect(isEmailEnabled(), `ค่า ${JSON.stringify(value)} ต้องถือว่าเปิด`).toBe(true);
    }
  });

  it("อ่าน env ใหม่ทุกครั้งที่เรียก (ไม่ cache ตอน import)", () => {
    process.env.EMAIL_ENABLED = "false";
    expect(isEmailEnabled()).toBe(false);
    process.env.EMAIL_ENABLED = "true";
    expect(isEmailEnabled()).toBe(true);
  });
});
