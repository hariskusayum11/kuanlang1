import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  listRegistrationRequests,
  type RegistrationRequestRow,
} from "@/lib/registration/core";
import { REQUESTABLE_ROLE_LABELS } from "@/lib/registration/validation";
import { RegistrationDecideButtons } from "@/components/admin/registration-queue";
import { RegistrationDecidedActions } from "@/components/admin/registration-decided-actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "คำขอลงทะเบียน" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "รอตรวจ", cls: "badge-warning" },
  APPROVED: { label: "อนุมัติแล้ว", cls: "badge-success" },
  REJECTED: { label: "ปฏิเสธ", cls: "badge-danger" },
  CANCELLED: { label: "ยกเลิก", cls: "badge-neutral" },
};

function roleLabel(role: string): string {
  return (
    REQUESTABLE_ROLE_LABELS[role as keyof typeof REQUESTABLE_ROLE_LABELS] ?? role
  );
}

const DATE_FMT = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function RegistrationsPage() {
  // RBAC ฝั่ง server — เฉพาะผู้มีสิทธิ์จัดการคำขอ (ADMIN)
  const ctx = await requirePermission(PERMISSIONS.REGISTRATION_MANAGE);
  const data = await listRegistrationRequests(ctx);
  const pending = data?.pending ?? [];
  const decided = data?.decided ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <PageHero
        title="จัดการผู้ใช้งาน"
        tone="ink"
        description="ตรวจสอบและอนุมัติผู้ขอใช้งานระบบ — บัญชีจะเข้าสู่ระบบได้เมื่ออนุมัติแล้วเท่านั้น"
        badge={
          <>
            <span className="live-dot" />
            รอตรวจ {pending.length.toLocaleString("th-TH")} รายการ
          </>
        }
      />

      <AdminTabs />

      {/* คิวรอตรวจ */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รอตรวจ"
            tone="sun"
            aside={
              <span className="badge badge-warning tabular-nums">
                {pending.length.toLocaleString("th-TH")} รายการ
              </span>
            }
          />
        </div>
        {pending.length === 0 ? (
          <EmptyState
            mood="happy"
            tone="mint"
            title="ไม่มีคำขอรอตรวจ"
            description="เมื่อมีผู้ลงทะเบียนใหม่จากหน้าสมัคร คำขอจะปรากฏที่นี่ให้อนุมัติหรือปฏิเสธ"
          />
        ) : (
          <div className="divide-y-2 divide-slate-50">
            {pending.map((r) => (
              <PendingRow key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      {/* ประวัติการตัดสินล่าสุด */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="ตัดสินล่าสุด" tone="brand" />
        </div>
        {decided.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            ยังไม่มีคำขอที่ตัดสินแล้ว
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ผู้ขอ</th>
                  <th className="py-3 pr-4">บทบาท</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4">โดย</th>
                  <th className="py-3 pr-4">เมื่อ</th>
                  <th className="py-3 pr-6 text-right">การทำงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {decided.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? {
                    label: r.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-brand-50/50">
                      <td className="py-3 pl-6 pr-4">
                        <div className="font-semibold text-slate-800">{r.user.name}</div>
                        <div className="text-xs text-slate-500">{r.user.email}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {roleLabel(r.requestedRole)}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {r.community?.nameTh ?? "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        {r.rejectReason && (
                          <div className="mt-1 max-w-[220px] text-xs text-slate-500">
                            {r.rejectReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {r.decidedBy?.name ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs tabular-nums text-slate-500">
                        {r.decidedAt ? DATE_FMT.format(r.decidedAt) : "—"}
                      </td>
                      <td className="py-3 pr-6 text-right">
                        <RegistrationDecidedActions
                          requestId={r.id}
                          status={r.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PendingRow({ request: r }: { request: RegistrationRequestRow }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-4 transition-colors hover:bg-sun-50/50 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-md chip-sun shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
              <circle cx="12" cy="8" r="3.6" />
              <path d="M5 20v-1c0-3 3.1-5 7-5s7 2 7 5v1" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-bold text-slate-900">{r.user.name}</span>
          <span className="badge badge-brand">{roleLabel(r.requestedRole)}</span>
          {r.community && (
            <span className="badge badge-neutral">{r.community.nameTh}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{r.user.email}</span>
          {r.user.phone && <span>โทร {r.user.phone}</span>}
          {r.organization && <span>สังกัด {r.organization}</span>}
          <span className="tabular-nums">ยื่นเมื่อ {DATE_FMT.format(r.createdAt)}</span>
        </div>
        {r.note && (
          <p className="max-w-xl text-xs leading-relaxed text-slate-600">
            &ldquo;{r.note}&rdquo;
          </p>
        )}
      </div>
      <div className="shrink-0">
        <RegistrationDecideButtons requestId={r.id} />
      </div>
    </div>
  );
}
