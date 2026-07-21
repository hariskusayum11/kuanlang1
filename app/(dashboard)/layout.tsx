import { redirect } from "next/navigation";
import { getActiveSessionUser } from "@/lib/auth-session";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

// Protected layout — ตรวจ session + isActive ฝั่ง Server ทุก request
// (ไม่พึ่ง client-side redirect · inactive user ถูกปฏิเสธที่นี่แม้มี session ค้าง)
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getActiveSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title="ภาพรวม" userName={user.name} userEmail={user.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
