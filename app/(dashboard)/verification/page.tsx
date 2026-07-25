import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getVerificationOverview } from "@/lib/verification/queue";

export const metadata = { title: "การตรวจสอบข้อมูล" };
export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  // RBAC ฝั่ง server — ไม่มี verification.view → /access-denied
  const ctx = await requirePermission(PERMISSIONS.VERIFICATION_VIEW);
  const overview = await getVerificationOverview(ctx);

  const total = overview.waiting + overview.verified;
  const percent = total > 0 ? Math.round((overview.verified / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-900">การตรวจสอบข้อมูล</h2>
        <p className="mt-1 text-sm text-slate-500">
          ตรวจความถูกต้องของใบที่คีย์แล้วเทียบกับกระดาษ แล้วยืนยันเป็นข้อมูลที่ตรวจสอบแล้ว
        </p>
      </div>

      {/* ตัวเลข aggregate + denominator (Coverage การตรวจสอบ) */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="รอตรวจสอบ" value={overview.waiting} tone="warning" />
        <StatCard label="ยืนยันแล้ว" value={overview.verified} tone="success" />
        <div className="card p-5 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">ความคืบหน้าการตรวจ</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {percent}
            <span className="text-base font-medium text-slate-400">%</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] tabular-nums text-slate-400">
            {overview.verified.toLocaleString("th-TH")} /{" "}
            {total.toLocaleString("th-TH")} ใบในขอบเขตของคุณ
          </p>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">คิวรอตรวจสอบ</h3>
          {overview.queue.length > 0 && (
            <span className="text-xs tabular-nums text-slate-500">
              {overview.queue.length.toLocaleString("th-TH")} รายการ
              {overview.waiting > overview.queue.length &&
                ` (แสดง ${overview.queue.length} แรก)`}
            </span>
          )}
        </div>

        {overview.queue.length === 0 ? (
          <EmptyQueue allowed={overview.allowed} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="py-3 pl-6 pr-4">ใบ</th>
                  <th className="py-3 pr-4">ชุมชน</th>
                  <th className="py-3 pr-4">ปึก</th>
                  <th className="py-3 pr-4 text-center">กลุ่มเปราะบาง</th>
                  <th className="py-3 pr-4 text-center">อ่านไม่ออก/ว่าง</th>
                  <th className="py-3 pr-4">สถานะ</th>
                  <th className="py-3 pr-6 text-right">การทำงาน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {overview.queue.map((q) => (
                  <tr key={q.householdId} className="transition-colors hover:bg-slate-50/60">
                    <td className="py-3 pl-6 pr-4 font-mono text-xs font-medium text-slate-700">
                      {q.sheetNo}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{q.communityName}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500">{q.batchCode}</td>
                    <td className="py-3 pr-4 text-center tabular-nums text-slate-600">
                      {q.vulnerableCount > 0 ? `${q.vulnerableCount} คน` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-center tabular-nums">
                      {q.illegibleCount + q.blankCount > 0 ? (
                        <span className="text-slate-600">
                          {q.illegibleCount > 0 && (
                            <span className="text-amber-600">{q.illegibleCount}</span>
                          )}
                          {q.illegibleCount > 0 && q.blankCount > 0 && " / "}
                          {q.blankCount > 0 && (
                            <span className="text-slate-500">{q.blankCount}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {q.hasDuplicateFlag ? (
                        <span className="badge badge-warning">⚠ สงสัยซ้ำ</span>
                      ) : (
                        <span className="badge badge-brand">รอตรวจ</span>
                      )}
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <Link
                        href={`/verification/${q.householdId}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {q.enteredByMe ? "ดู" : "ตรวจสอบ"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "success";
}) {
  const toneCls =
    tone === "warning" ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}

function EmptyQueue({ allowed }: { allowed: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7">
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">
        {allowed ? "ไม่มีใบที่รอตรวจสอบ" : "ไม่มีขอบเขตชุมชนที่คุณเข้าถึงได้"}
      </p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">
        {allowed
          ? "เมื่อเจ้าหน้าที่คีย์แบบสอบถามเข้าระบบ ใบที่รอตรวจจะปรากฏที่นี่"
          : "กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนที่คุณรับผิดชอบ"}
      </p>
    </div>
  );
}
