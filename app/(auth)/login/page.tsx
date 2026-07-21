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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-xl font-bold text-white">
              SF
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {APP_DESCRIPTION_TH}
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          สำหรับเจ้าหน้าที่และผู้ที่ได้รับสิทธิ์เท่านั้น
        </p>
      </div>
    </main>
  );
}
