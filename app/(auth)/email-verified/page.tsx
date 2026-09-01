import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

export const metadata = { title: "ผลการยืนยันอีเมล" };

export default async function EmailVerifiedPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const failed = Boolean(error);
  return (
    <AuthPageShell
      title={failed ? "ยืนยันอีเมลไม่สำเร็จ" : "ยืนยันอีเมลสำเร็จ"}
      description={failed ? "ลิงก์อาจหมดอายุหรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่" : "อีเมลของคุณได้รับการยืนยันแล้ว กรุณารอผู้ดูแลระบบอนุมัติบัญชี"}
    >
      <div className="space-y-4">
        {failed ? (
          <Link href="/verify-email" className="btn btn-primary btn-lg w-full">ขอลิงก์ยืนยันใหม่</Link>
        ) : (
          <Link href="/login" className="btn btn-primary btn-lg w-full">ไปหน้าเข้าสู่ระบบ</Link>
        )}
      </div>
    </AuthPageShell>
  );
}
