import { redirect } from "next/navigation";
import { getAuthorizationContext } from "@/lib/authz/context";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/authz/role-labels";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { ProfileInfoForm } from "@/components/profile/profile-info-form";
import { PasswordChangeForm } from "@/components/profile/password-change-form";

export const metadata = { title: "โปรไฟล์ของฉัน" };
export const dynamic = "force-dynamic";

// เข้าได้ทุกบัญชีที่ล็อกอิน (ไม่ gate permission) — ทุก role ต้องแก้โปรไฟล์ตนเองได้ (TOR ข้อ 122–125)
export default async function ProfilePage() {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true, phone: true },
  });
  if (!user) redirect("/login");

  const roleText = ctx.roles.map((r) => ROLE_LABELS[r]).join(" · ") || "—";

  return (
    <div className="mx-auto max-w-3xl space-y-7 animate-fade-in">
      <PageHero
        title="โปรไฟล์ของฉัน"
        tone="ink"
        description="แก้ไขข้อมูลส่วนตัวและเปลี่ยนรหัสผ่านของบัญชีคุณ การเปลี่ยนแปลงทุกครั้งมี Audit Log"
      />

      <section className="card p-6">
        <SectionTitle title="ข้อมูลบัญชี" tone="brand" />
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-slate-400">อีเมล (ใช้เข้าสู่ระบบ)</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">บทบาท / สิทธิ์</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-800">{roleText}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-400">อีเมลและบทบาทเปลี่ยนได้โดยผู้ดูแลระบบเท่านั้น</p>
      </section>

      <section className="card p-6">
        <SectionTitle title="แก้ไขข้อมูลส่วนตัว" tone="mint" />
        <div className="mt-5">
          <ProfileInfoForm name={user.name} phone={user.phone ?? ""} />
        </div>
      </section>

      <section className="card p-6">
        <SectionTitle title="เปลี่ยนรหัสผ่าน" tone="sun" />
        <div className="mt-5">
          <PasswordChangeForm />
        </div>
      </section>
    </div>
  );
}
