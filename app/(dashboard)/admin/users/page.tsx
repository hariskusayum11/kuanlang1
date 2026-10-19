import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  ACTIVE_ROLES,
  LEGACY_ROLES,
  RESERVED_ROLES,
  ROLE_DISPLAY_ORDER,
  ROLE_HINTS,
  ROLE_LABELS,
} from "@/lib/authz/role-labels";
import { listUsers } from "@/lib/admin/users";
import {
  ACCOUNT_STATUS_LABELS,
  canRecover,
  canToggleActivation,
  type AccountStatus,
} from "@/domain/admin/account-status";
import { UserRoleEditor } from "@/components/admin/user-role-editor";
import { UserActivationToggle } from "@/components/admin/user-activation-toggle";
import { UserRecoverButton } from "@/components/admin/user-recover-button";
import { UserDeleteButton } from "@/components/admin/user-delete-button";
import { UserPasswordResetButton } from "@/components/admin/user-password-reset-button";
import { ProtectedAccountToggle } from "@/components/admin/protected-account-toggle";
import { UserCommunityEditor } from "@/components/admin/user-community-editor";
import {
  filterAndSortUsers,
  parseUserListFilter,
  USER_SORT_LABELS,
  type UserListFilter,
} from "@/domain/admin/user-list-filter";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/authz/access";
import { canResetOthersPassword } from "@/domain/admin/protected-account";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ผู้ใช้และบทบาท" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // RBAC ฝั่ง server — ไม่มี user.manage → /access-denied
  const ctx = await requirePermission(PERMISSIONS.USER_MANAGE);
  const filter = parseUserListFilter(await searchParams, [...ROLE_DISPLAY_ORDER]);
  const [allUsers, communityOptions] = await Promise.all([
    listUsers(ctx),
    // ตัวเลือกชุมชนสำหรับหัวหน้าชุมชน (docs/34)
    prisma.community.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, nameTh: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const activeCount = allUsers.filter((u) => u.isActive).length;
  // ตัวกรองทำงานฝั่ง server จาก URL (Owner Decision 2026-10-19) — จำนวนผู้ใช้ไม่มาก กรองในหน่วยความจำได้
  const users = filterAndSortUsers(allUsers, filter);
  const filtered = users.length !== allUsers.length;
  // การเข้าถึง credential ของผู้อื่นเป็นสิทธิ์แยกจาก user.manage — ซ่อนปุ่มถ้าไม่มี
  // (การซ่อนเป็นเพียงความสะดวก ด่านจริงตรวจซ้ำใน resetUserPassword ฝั่ง server)
  // ตั้งรหัสผ่านให้ผู้อื่นต้องเป็นบัญชีคุ้มครองด้วย ไม่ใช่แค่มี permission
  // (ซ่อนปุ่มเป็นเพียงความสะดวก ด่านจริงตรวจซ้ำใน resetUserPassword ฝั่ง server)
  const canResetPassword = canResetOthersPassword({
    hasPasswordResetPermission: hasPermission(ctx, PERMISSIONS.USER_PASSWORD_RESET),
    actorIsProtected: ctx.isProtectedAccount,
  });
  // แถวที่ผู้ดูคนนี้แตะไม่ได้: เป็นบัญชีคุ้มครอง และผู้ดูไม่ใช่บัญชีคุ้มครอง
  // (บัญชีของตัวเองไม่นับ — กฎ SELF_* จัดการแยกและยังต้องถอดธงตัวเองได้)
  const locked = (u: { id: string; isProtectedAccount: boolean }) =>
    u.isProtectedAccount && !ctx.isProtectedAccount && u.id !== ctx.userId;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <PageHero
        title="จัดการผู้ใช้งาน"
        tone="ink"
        description="กำหนดบทบาทให้ผู้ใช้ในระบบ — ทุกการเปลี่ยนแปลงถูกบันทึก Audit Log พร้อมค่าก่อน/หลัง"
        badge={
          <>
            <span className="live-dot" />
            ใช้งานอยู่ {activeCount} / {allUsers.length} บัญชี
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
                {filtered
                  ? `แสดง ${users.length.toLocaleString("th-TH")} จาก ${allUsers.length.toLocaleString("th-TH")} บัญชี`
                  : `${users.length.toLocaleString("th-TH")} บัญชี`}
              </span>
            }
          />
        </div>

        <UserFilterBar filter={filter} filtered={filtered} />

        {users.length === 0 && filtered ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            ไม่พบผู้ใช้ที่ตรงกับตัวกรอง —{" "}
            <a href="/admin/users" className="font-semibold text-brand-700 underline underline-offset-2">ล้างตัวกรอง</a>
          </p>
        ) : users.length === 0 ? (
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
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                          {u.name}
                          {isSelf && <span className="badge badge-brand">คุณ</span>}
                          {u.isProtectedAccount && (
                            <span
                              className="badge badge-neutral"
                              title="ผู้ดูแลระบบคนอื่นลบ ปิด ถอดบทบาท หรือตั้งรหัสผ่านให้บัญชีนี้ไม่ได้"
                            >
                              บัญชีคุ้มครอง
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        <p className="text-[11px] text-slate-400">
                          สมัครเมื่อ {u.createdAt.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}
                        </p>
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
                        <div className="flex flex-wrap items-center justify-end gap-2">
                        {locked(u) ? (
                          // บัญชีคุ้มครองที่ผู้ดูนี้แตะไม่ได้ — ไม่แสดงปุ่มที่กดแล้วถูกปฏิเสธแน่นอน
                          // (ด่านจริงอยู่ฝั่ง server ทุกตัว การซ่อนเป็นเพียงความสะดวก)
                          <span className="text-[11px] font-medium text-slate-400">
                            บัญชีคุ้มครอง — แก้ไขไม่ได้
                          </span>
                        ) : (
                        <>
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
                        {u.roles.includes("COMMUNITY_LEADER") && (
                          <UserCommunityEditor
                            userId={u.id}
                            userName={u.name}
                            currentCommunityIds={u.communityIds}
                            communityOptions={communityOptions}
                            isSelf={isSelf}
                          />
                        )}
                        {canResetPassword && u.accountStatus === "ACTIVE" && (
                          <UserPasswordResetButton
                            userId={u.id}
                            userName={u.name}
                            isSelf={isSelf}
                          />
                        )}
                        {canToggleActivation(u.accountStatus) && (
                          <UserActivationToggle
                            userId={u.id}
                            userName={u.name}
                            accountStatus={u.accountStatus}
                            isSelf={isSelf}
                          />
                        )}
                        {canRecover(u.accountStatus) && (
                          <UserRecoverButton userId={u.id} userName={u.name} />
                        )}
                        <UserDeleteButton
                          userId={u.id}
                          userName={u.name}
                          isSelf={isSelf}
                        />
                        </>
                        )}
                        {/* ตั้ง/ถอดการคุ้มครอง — เฉพาะบัญชีคุ้มครองเท่านั้นที่ทำได้
                            จึงแสดงแยกจากกลุ่มข้างบน และแสดงแม้แถวนั้นจะถูกล็อก */}
                        {ctx.isProtectedAccount && !isSelf && (
                          <ProtectedAccountToggle
                            userId={u.id}
                            userName={u.name}
                            isProtectedAccount={u.isProtectedAccount}
                          />
                        )}
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

/**
 * แถบค้นหา/กรอง/เรียง — ฟอร์ม GET ธรรมดา ทำงานได้แม้ไม่มี JavaScript และแชร์ลิงก์ผลกรองได้
 * ค่าทั้งหมดถูกตรวจซ้ำที่ server (parseUserListFilter) ค่าแปลกปลอมกลับเป็นค่าเริ่มต้น
 */
function UserFilterBar({ filter, filtered }: { filter: UserListFilter; filtered: boolean }) {
  const statuses = ["ACTIVE", "PENDING_APPROVAL", "DEACTIVATED", "REJECTED", "CANCELLED"] as const;
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 border-b-2 border-slate-100 px-6 py-4">
      <label className="min-w-[14rem] flex-1">
        <span className="label">ค้นหา</span>
        <input className="field" type="search" name="q" defaultValue={filter.q} placeholder="ชื่อหรืออีเมล" />
      </label>
      <label>
        <span className="label">บทบาท</span>
        <select className="field" name="role" defaultValue={filter.role ?? ""}>
          <option value="">ทุกบทบาท</option>
          {ROLE_DISPLAY_ORDER.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">สถานะบัญชี</span>
        <select className="field" name="status" defaultValue={filter.status ?? ""}>
          <option value="">ทุกสถานะ</option>
          {statuses.map((status) => (
            <option key={status} value={status}>{ACCOUNT_STATUS_LABELS[status]}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">เรียงตาม</span>
        <select className="field" name="sort" defaultValue={filter.sort}>
          {Object.entries(USER_SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary btn-md">กรอง</button>
      {filtered ? (
        <a href="/admin/users" className="btn btn-ghost btn-md">ล้างตัวกรอง</a>
      ) : null}
    </form>
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
