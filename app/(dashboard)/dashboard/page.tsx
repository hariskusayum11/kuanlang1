import { redirect } from "next/navigation";
import { toStatCards } from "@/lib/dashboard/stats";
import { fetchScopedDashboardCounts } from "@/lib/dashboard/get-dashboard-stats";
import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { defaultLandingPath } from "@/lib/navigation";
import { APPLIED_MIGRATION_COUNT } from "@/lib/app-config";

export const metadata = { title: "ภาพรวม" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getAuthorizationContext();
  if (!ctx) redirect("/login");
  // ไม่มี dashboard.view (เช่น DATA_ENTRY) → ส่งไปหน้าแรกตามสิทธิ์ของตน
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)) {
    redirect(defaultLandingPath(ctx.permissions) ?? "/access-denied");
  }

  const counts = await fetchScopedDashboardCounts({
    isGlobalScope: ctx.isGlobalScope,
    communityIds: ctx.communityIds,
  });
  const cards = toStatCards(counts);

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-in">
      {/* หัวเรื่อง + ขอบเขต */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ภาพรวมระบบ</h2>
          <p className="mt-1 text-sm text-slate-500">
            สรุปข้อมูลหลักของพื้นที่ที่คุณรับผิดชอบ
          </p>
        </div>
        <span
          className={`badge ${ctx.isGlobalScope ? "badge-brand" : "badge-neutral"}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
          {ctx.isGlobalScope
            ? "ทั้งระบบ"
            : `${ctx.communityIds.length} ชุมชนในสิทธิ์ของคุณ`}
        </span>
      </div>

      {/* สถิติหลัก */}
      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => {
            const muted = card.pending && card.value === 0;
            return (
              <div
                key={card.key}
                className="group card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  {card.pending && (
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" title="โมดูลอยู่ระหว่างพัฒนา" />
                  )}
                </div>
                <p
                  className={`mt-2 text-[32px] font-bold leading-none tabular-nums ${
                    muted ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  {card.value.toLocaleString("th-TH")}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  {card.pending ? "อยู่ระหว่างพัฒนา" : "ข้อมูลพื้นฐานพื้นที่"}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ระบบแบบสอบถามและข้อมูลครัวเรือนอยู่ระหว่างการพัฒนา —
          ตัวเลขครัวเรือนและจุดอพยพจะแสดงเมื่อเริ่มบันทึกข้อมูลจริง
        </p>
      </section>

      {/* สถานะระบบ */}
      <section className="card p-6">
        <h2 className="mb-4 text-[15px] font-semibold text-slate-900">สถานะระบบ</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <StatusRow label="ฐานข้อมูล" value="พร้อมใช้งาน" tone="success" />
          <StatusRow label="Migration" value={`${APPLIED_MIGRATION_COUNT} ชุด`} tone="neutral" />
          <StatusRow label="Database constraints" value="ผ่าน" tone="success" />
          <StatusRow label="โมดูลสำรวจครัวเรือน" value="กำลังพัฒนา" tone="muted" />
        </dl>
      </section>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "neutral" | "muted";
}) {
  const dot =
    tone === "success" ? "bg-emerald-500" : tone === "muted" ? "bg-slate-300" : "bg-brand-400";
  const text =
    tone === "success" ? "text-emerald-700" : tone === "muted" ? "text-slate-500" : "text-slate-800";
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`flex items-center gap-2 font-medium ${text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {value}
      </dd>
    </div>
  );
}
