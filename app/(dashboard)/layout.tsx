import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { hasPermission } from "@/lib/authz/access";
import { getAuthorizationContext } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { visibleNavItems } from "@/lib/navigation";

// Protected layout — ตรวจ session + isActive + permission ฝั่ง Server ทุก request
// (ไม่พึ่ง client-side redirect · inactive user ถูกปฏิเสธที่นี่แม้มี session ค้าง)
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    redirect("/access-denied");
  }

  const navItems = visibleNavItems(ctx.permissions).map(
    ({ label, href, implemented }) => ({ label, href, implemented }),
  );

  return (
    <div className="flex min-h-screen">
      <AppSidebar items={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title="ภาพรวม" userName={ctx.name} userEmail={ctx.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
