import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata = { title: "ส่งอีเมลยืนยันอีกครั้ง" };

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <AuthPageShell title="ยืนยันอีเมล" description="ยังไม่ได้รับอีเมลหรืออีเมลหมดอายุ สามารถส่งลิงก์ยืนยันใหม่ได้ที่นี่">
      <VerifyEmailForm initialEmail={email ?? ""} />
    </AuthPageShell>
  );
}
