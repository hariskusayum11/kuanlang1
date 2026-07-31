import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { hasPermission } from "@/lib/authz/access";
import { getAuthorizationContext } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { defaultLandingPath } from "@/lib/navigation";
import { Mascot } from "@/components/brand/mascot";

export const metadata = {
  title: "ไม่มีสิทธิ์เข้าถึง | SKL-FRIS",
};

export default async function AccessDeniedPage() {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");

  const canGoHome = hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW);
  const landing = defaultLandingPath(ctx.permissions);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <div className="animate-drop-in">
          <Mascot role="notify" mood="alert" tone="sun" motion="float" size={104} decorative className="mx-auto" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          บัญชีของคุณยังไม่ได้รับสิทธิ์สำหรับส่วนนี้ของระบบ
          หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          {canGoHome ? (
            <Link href="/dashboard" className="btn btn-primary btn-lg">
              กลับหน้าภาพรวม
            </Link>
          ) : landing ? (
            <Link href={landing} className="btn btn-primary btn-lg">
              ไปหน้าเริ่มต้น
            </Link>
          ) : null}
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
