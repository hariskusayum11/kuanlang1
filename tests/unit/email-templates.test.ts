import { describe, expect, it } from "vitest";
import { passwordResetEmail, verificationEmail } from "../../lib/email/smtp";

describe("SMTP email templates", () => {
  it("อีเมลยืนยันมีลิงก์ อายุลิงก์ และ escape ชื่อก่อนใส่ HTML", () => {
    const message = verificationEmail("<ผู้สมัคร>", "https://example.test/verify?token=secret&x=1");
    expect(message.subject).toContain("ยืนยันอีเมล");
    expect(message.text).toContain("24 ชั่วโมง");
    expect(message.html).toContain("https://example.test/verify?token=secret&amp;x=1");
    expect(message.html).toContain("&lt;ผู้สมัคร&gt;");
    expect(message.html).not.toContain("สวัสดี <ผู้สมัคร>");
  });

  it("อีเมลรีเซ็ตรหัสผ่านระบุอายุ 30 นาที", () => {
    const message = passwordResetEmail("ผู้ใช้", "https://example.test/reset?token=secret");
    expect(message.subject).toContain("รหัสผ่านใหม่");
    expect(message.text).toContain("30 นาที");
    expect(message.html).toContain("ตั้งรหัสผ่านใหม่");
  });
});
