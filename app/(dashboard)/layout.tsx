import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PasswordChangeGate } from "@/components/layout/password-change-gate";
import { prisma } from "@/lib/prisma";
import { getAuthorizationContext } from "@/lib/authz/context";
import { visibleNavItems } from "@/lib/navigation";
import { countWaitingVerification } from "@/lib/verification/queue";
import { countPendingRegistrationRequests } from "@/lib/registration/core";

// Protected layout — ตรวจ session + isActive + "มีเมนูอย่างน้อยหนึ่ง" ฝั่ง Server ทุก request
// สิทธิ์รายหน้า (dashboard.view / survey.entry ฯลฯ) บังคับที่แต่ละ page เอง
// (เปลี่ยนจากบังคับ dashboard.view ทั้ง group — เพราะ DATA_ENTRY ไม่มี dashboard.view
//  แต่ต้องเข้า /surveys ได้ตาม docs/10)
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  const [waitingVerification, pendingRegistrations, account] = await Promise.all([
    countWaitingVerification(ctx),
    countPendingRegistrationRequests(ctx),
    // ธงบังคับเปลี่ยนรหัส — อ่านสดทุก request เพราะต้องมีผลทันทีที่ ADMIN ตั้งรหัสชั่วคราวให้
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { mustChangePassword: true },
    }),
  ]);

  const navItems = visibleNavItems(ctx.permissions, { scoped: !ctx.isGlobalScope }).map(
    ({ group, label, href, implemented, activeHrefs, iconHref }) => ({
      group,
      label,
      href,
      implemented,
      activeHrefs,
      iconHref,
      notificationCount: href === "/verification" || activeHrefs?.includes("/verification")
        ? waitingVerification || undefined
        : href === "/admin/registrations" || activeHrefs?.includes("/admin/registrations")
          ? pendingRegistrations || undefined
          : undefined,
    }),
  );
  if (navItems.length === 0) redirect("/access-denied");

  return (
    <div className="flex min-h-screen">
      <AppSidebar items={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader items={navItems} userName={ctx.name} userEmail={ctx.email} />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">
          {/* รหัสชั่วคราวที่ผู้อื่นรู้ค่า ห้ามใช้เปิดข้อมูลอ่อนไหวได้ — กั้นทุกหน้าไว้ก่อน
              บังคับฝั่ง server เท่านั้น ไม่พึ่งการซ่อนปุ่มใน UI */}
          {account?.mustChangePassword ? <PasswordChangeGate /> : children}
        </main>
      </div>
    </div>
  );
}
