import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth-session";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import { isEmailEnabled } from "@/lib/config/email";
import { LoginForm } from "@/components/auth/login-form";
import { Mascot } from "@/components/brand/mascot";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage() {
  // Login แล้ว (และยัง active) → ไม่ต้องเห็นหน้า Login อีก
  const user = await getActiveSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden band-ink px-4 py-6">
      {/* พื้นหลัง — แสงเขียวน้ำทะเลจากด้านบน (สีแบรนด์) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(65% 55% at 50% 0%, rgba(37,99,235,0.5), transparent 72%)",
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

      {/* จอกว้าง = สองคอลัมน์ (แบรนด์ซ้าย ฟอร์มขวา) เพื่อให้ฟอร์มอยู่ในจอโดยไม่ต้องเลื่อน
          จอแคบ = เรียงลงมาตามเดิม แต่ลดขนาดมาสคอต/ระยะห่างลง */}
      <div className="relative w-full max-w-5xl animate-rise">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div className="text-center lg:text-left">
            {/* อยู่ในคอลัมน์เดียวกับแบรนด์ จะได้เลื่อนลงมาพร้อมกันเมื่อจัดกึ่งกลางแนวตั้ง
                (แยกเป็นคนละ <Link> เพราะซ้อน <a> ใน <a> ไม่ได้) */}
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/20 hover:text-white lg:mb-7"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              กลับหน้าหลัก
            </Link>

            <Link href="/" className="block">
              <Mascot
                role="field"
                mood="wink"
                motion="float"
                size={84}
                decorative
                className="mx-auto lg:mx-0 lg:hidden"
              />
              <Mascot
                role="field"
                mood="wink"
                motion="float"
                size={132}
                decorative
                className="hidden lg:block"
              />
              <h1 className="mt-2 text-[26px] font-bold tracking-tight text-white lg:mt-5 lg:text-4xl">
                {APP_NAME}
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/60 lg:mx-0 lg:max-w-sm lg:text-base">
                {APP_DESCRIPTION_TH}
              </p>
              <p className="mt-4 hidden text-xs text-white/40 lg:block">
                สำหรับเจ้าหน้าที่และผู้ที่ได้รับสิทธิ์เท่านั้น
              </p>
            </Link>
          </div>

          <div className="mx-auto w-full max-w-[420px] rounded-3xl bg-white p-7 shadow-lg sm:p-8 lg:mx-0">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบ</h2>
              <p className="mt-1 text-sm text-slate-500">
                กรอกอีเมลและรหัสผ่านของเจ้าหน้าที่
              </p>
            </div>
            <LoginForm emailEnabled={isEmailEnabled()} />
            <p className="mt-5 text-center text-sm text-slate-500">
              ยังไม่มีบัญชี?{" "}
              <a href="/register" className="font-semibold text-brand-600 hover:underline">
                ลงทะเบียนใช้งาน
              </a>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/50 lg:hidden">
          สำหรับเจ้าหน้าที่และผู้ที่ได้รับสิทธิ์เท่านั้น
        </p>
      </div>
    </main>
  );
}
