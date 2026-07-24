import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth-session";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage() {
  // Login แล้ว (และยัง active) → ไม่ต้องเห็นหน้า Login อีก
  const user = await getActiveSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 px-4 py-10">
      {/* พื้นหลังนิ่ง — ไล่โทน navy ลึก ไม่ฟุ่มเฟือย */}
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

      <div className="relative w-full max-w-[400px] animate-rise">
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
            {APP_DESCRIPTION_TH}
          </p>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-lg sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">เข้าสู่ระบบ</h2>
            <p className="mt-1 text-sm text-slate-500">
              กรอกอีเมลและรหัสผ่านของเจ้าหน้าที่
            </p>
          </div>
          <LoginForm />
          <p className="mt-5 text-center text-sm text-slate-500">
            ยังไม่มีบัญชี?{" "}
            <a href="/register" className="font-medium text-brand-600 hover:underline">
              ลงทะเบียนใช้งาน
            </a>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          สำหรับเจ้าหน้าที่และผู้ที่ได้รับสิทธิ์เท่านั้น
        </p>
      </div>
    </main>
  );
}
