import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { hasPermission } from "@/lib/authz/access";
import { getAuthorizationContext } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";

export const metadata = {
  title: "ไม่มีสิทธิ์เข้าถึง | SKL-FRIS",
};

export default async function AccessDeniedPage() {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");

  const canGoHome = hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl">🚫</p>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          ไม่มีสิทธิ์เข้าถึงหน้านี้
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          บัญชีของคุณยังไม่ได้รับสิทธิ์สำหรับส่วนนี้ของระบบ
          หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {canGoHome && (
            <Link
              href="/dashboard"
              className="rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-800"
            >
              กลับหน้าภาพรวม
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
