import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { EmailDisabledNotice } from "@/components/auth/email-disabled-notice";
import { isEmailEnabled } from "@/lib/config/email";

export const metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  // ปิดระบบอีเมล = ส่งลิงก์ตั้งรหัสใหม่ไม่ได้ ต้องบอกทางออกที่ใช้ได้จริง
  // ไม่ใช่ปล่อยให้ผู้ใช้กรอกฟอร์มที่ไม่มีอะไรเกิดขึ้น
  const emailEnabled = isEmailEnabled();

  return (
    <AuthPageShell
      title="ลืมรหัสผ่าน"
      description={
        emailEnabled
          ? "กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ"
          : "ขณะนี้ต้องขอรหัสผ่านชั่วคราวจากผู้ดูแลระบบ"
      }
    >
      {emailEnabled ? <ForgotPasswordForm /> : <EmailDisabledNotice action="reset" />}
    </AuthPageShell>
  );
}
