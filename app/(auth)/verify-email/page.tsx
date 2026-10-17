import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { EmailDisabledNotice } from "@/components/auth/email-disabled-notice";
import { isEmailEnabled } from "@/lib/config/email";

export const metadata = { title: "ส่งอีเมลยืนยันอีกครั้ง" };

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // ปิดระบบอีเมล = ไม่มีลิงก์ยืนยันให้ส่ง และ ADMIN อนุมัติได้โดยไม่ต้องรอการยืนยัน
  const emailEnabled = isEmailEnabled();

  return (
    <AuthPageShell
      title="ยืนยันอีเมล"
      description={
        emailEnabled
          ? "ยังไม่ได้รับอีเมลหรืออีเมลหมดอายุ สามารถส่งลิงก์ยืนยันใหม่ได้ที่นี่"
          : "ขณะนี้ระบบยังส่งอีเมลไม่ได้ — ผู้ดูแลระบบจะตรวจสอบคำขอของคุณโดยตรง"
      }
    >
      {emailEnabled ? (
        <VerifyEmailForm initialEmail={email ?? ""} />
      ) : (
        <EmailDisabledNotice action="verify" />
      )}
    </AuthPageShell>
  );
}
