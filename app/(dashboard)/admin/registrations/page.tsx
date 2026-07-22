import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  listRegistrationRequests,
  type RegistrationRequestRow,
} from "@/lib/registration/core";
import { REQUESTABLE_ROLE_LABELS } from "@/lib/registration/validation";
import { RegistrationDecideButtons } from "@/components/admin/registration-queue";

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
      <div>
        <h2 className="text-xl font-bold text-slate-900">คำขอลงทะเบียน</h2>
        <p className="mt-1 text-sm text-slate-500">
          ตรวจสอบและอนุมัติผู้ขอใช้งานระบบ — บัญชีจะเข้าสู่ระบบได้เมื่ออนุมัติแล้วเท่านั้น
        </p>
      </div>

      {/* คิวรอตรวจ */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">รอตรวจ</h3>
          <span className="badge badge-warning tabular-nums">
            {pending.length.toLocaleString("th-TH")} รายการ
          </span>
        </div>
        {pending.length === 0 ? (
          <EmptyPending />
        ) : (
          <div className="divide-y divide-slate-50">
            {pending.map((r) => (
              <PendingRow key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      {/* ประวัติการตัดสินล่าสุด */}
      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">
            ตัดสินล่าสุด
          </h3>
        </div>
        {decided.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            ยังไม่มีคำขอที่ตัดสินแล้ว
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-4">ผู้ขอ</th>
                  <th className="py-3 pr-4">บทบาท</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-4">โดย</th>
                  <th className="py-3 pr-6">เมื่อ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {decided.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? {
                    label: r.status,
                    cls: "badge-neutral",
                  };
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="py-3 pl-6 pr-4">
                        <div className="font-medium text-slate-800">{r.user.name}</div>
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
                      <td className="py-3 pr-6 text-xs tabular-nums text-slate-500">
                        {r.decidedAt ? DATE_FMT.format(r.decidedAt) : "—"}
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
    <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{r.user.name}</span>
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

function EmptyPending() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
          <path d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4M19 21v-1.5c0-1.5-.8-2.9-2.1-3.6" strokeLinecap="round" />
          <circle cx="9.5" cy="7.5" r="3.5" />
          <path d="M3 21v-1c0-2.76 2.91-5 6.5-5s6.5 2.24 6.5 5v1" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">ไม่มีคำขอรอตรวจ</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        เมื่อมีผู้ลงทะเบียนใหม่จากหน้าสมัคร คำขอจะปรากฏที่นี่ให้อนุมัติหรือปฏิเสธ
      </p>
    </div>
  );
}
