import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "ตั้งรหัสผ่านใหม่" };

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthPageShell title="ตั้งรหัสผ่านใหม่" description="กำหนดรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร">
      <ResetPasswordForm token={token} invalid={Boolean(error)} />
    </AuthPageShell>
  );
}
