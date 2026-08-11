import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  ACTIVE_ROLES,
  LEGACY_ROLES,
  RESERVED_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
} from "@/lib/authz/role-labels";
import { listUsers } from "@/lib/admin/users";
import {
  ACCOUNT_STATUS_LABELS,
  canToggleActivation,
  type AccountStatus,
} from "@/domain/admin/account-status";
import { UserRoleEditor } from "@/components/admin/user-role-editor";
import { UserActivationToggle } from "@/components/admin/user-activation-toggle";
import { UserDeleteButton } from "@/components/admin/user-delete-button";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ผู้ใช้และบทบาท" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // RBAC ฝั่ง server — ไม่มี user.manage → /access-denied
  const ctx = await requirePermission(PERMISSIONS.USER_MANAGE);
  const users = await listUsers(ctx);
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <PageHero
        title="จัดการผู้ใช้งาน"
        tone="ink"
        description="กำหนดบทบาทให้ผู้ใช้ในระบบ — ทุกการเปลี่ยนแปลงถูกบันทึก Audit Log พร้อมค่าก่อน/หลัง"
        badge={
          <>
            <span className="live-dot" />
            ใช้งานอยู่ {activeCount} / {users.length} บัญชี
          </>
        }
      />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="รายชื่อผู้ใช้"
            tone="brand"
            aside={
              <span className="badge badge-neutral">
                {users.length.toLocaleString("th-TH")} บัญชี
              </span>
            }
          />
        </div>

        {users.length === 0 ? (
          <EmptyState
            role="field"
            mood="sleep"
            title="ยังไม่มีผู้ใช้ในระบบ"
            description="เมื่อมีผู้ยื่นคำขอลงทะเบียนและได้รับอนุมัติ รายชื่อจะปรากฏที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4">ผู้ใช้</th>
                  <th className="py-3 pr-4">สถานะบัญชี</th>
                  <th className="py-3 pr-4">บทบาท</th>
                  <th className="py-3 pr-4">เข้าใช้ล่าสุด</th>
                  <th className="py-3 pr-6 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {users.map((u) => {
                  const isSelf = u.id === ctx.userId;
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-brand-50/50">
                      <td className="py-3 pl-6 pr-4">
                        <p className="flex items-center gap-2 font-semibold text-slate-900">
                          {u.name}
                          {isSelf && <span className="badge badge-brand">คุณ</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <AccountStatusBadge status={u.accountStatus} />
                      </td>
                      <td className="py-3 pr-4">
                        {u.roles.length === 0 ? (
                          <span className="badge badge-warning">ยังไม่มีบทบาท</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span
                                key={r}
                                className={`badge ${
                                  r === "ADMIN" ? "badge-accent" : "badge-brand"
                                }`}
                              >
                                {ROLE_LABELS[r]}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs tabular-nums text-slate-500">
                        {u.lastLoginAt
                          ? u.lastLoginAt.toLocaleString("th-TH", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="py-3 pr-6">
                        <div className="flex items-center justify-end gap-2">
                        <UserRoleEditor
                          userId={u.id}
                          userName={u.name}
                          currentRoles={u.roles}
                          activeRoles={[...ACTIVE_ROLES]}
                          reservedRoles={[...RESERVED_ROLES]}
                          legacyRoles={[...LEGACY_ROLES]}
                          roleLabels={ROLE_LABELS}
                          roleHints={ROLE_HINTS}
                          isSelf={isSelf}
                        />
                        {canToggleActivation(u.accountStatus) && (
                          <UserActivationToggle
                            userId={u.id}
                            userName={u.name}
                            accountStatus={u.accountStatus}
                            isSelf={isSelf}
                          />
                        )}
                        <UserDeleteButton
                          userId={u.id}
                          userName={u.name}
                          hasManageableStatus={canToggleActivation(u.accountStatus)}
                          isSelf={isSelf}
                        />
                        </div>
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

/** ป้ายสถานะบัญชี — สีต้องสื่อความหมายตามกฎ design system
 *  รออนุมัติ = sun (รอดำเนินการ) · ปิดใช้งาน/ยกเลิก = slate (ไม่มี/ไม่ใช้งาน)
 *  ถูกปฏิเสธ = red (จบด้วยการปฏิเสธ) · ใช้งานอยู่ = mint (สำเร็จ)
 *  ห้ามใช้ป้ายเดียวกันกับ "รออนุมัติ" และ "ปิดใช้งาน" เพราะสั่งงานคนละแบบ
 */
function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const tone: Record<AccountStatus, string> = {
    ACTIVE: "badge-success",
    PENDING_APPROVAL: "badge-warning",
    REJECTED: "badge-danger",
    CANCELLED: "badge-neutral",
    DEACTIVATED: "badge-neutral",
  };
  return <span className={`badge ${tone[status]}`}>{ACCOUNT_STATUS_LABELS[status]}</span>;
}
