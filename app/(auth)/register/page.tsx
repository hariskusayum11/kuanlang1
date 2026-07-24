import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth-session";
import { APP_NAME } from "@/lib/app-config";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "ลงทะเบียนใช้งาน" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Login แล้ว → ไม่ต้องสมัครอีก
  const user = await getActiveSessionUser();
  if (user) redirect("/dashboard");

  // รายชื่อชุมชน (ข้อมูลสาธารณะ — แสดงบน public home อยู่แล้ว)
  const communities = await prisma.community.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { nameTh: "asc" },
    select: { id: true, nameTh: true },
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 0%, rgba(52,89,180,0.28), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative w-full max-w-[480px] animate-rise">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          กลับหน้าหลัก
        </Link>
        <Link href="/" className="mb-8 block text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white shadow-lg transition-transform hover:scale-105">
            SF
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">{APP_NAME}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
            ลงทะเบียนขอใช้งานระบบ — เปิดใช้ได้เมื่อผู้ดูแลระบบอนุมัติ
          </p>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-lg sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">ลงทะเบียนใช้งาน</h2>
            <p className="mt-1 text-sm text-slate-500">
              สำหรับอาสาสมัคร ผู้สำรวจ และเจ้าหน้าที่คีย์ข้อมูลในโครงการ
            </p>
          </div>
          <RegisterForm communities={communities} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          ข้อมูลของคุณใช้เพื่อการตรวจสอบสิทธิ์เท่านั้น
        </p>
      </div>
    </main>
  );
}
