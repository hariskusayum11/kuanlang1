import Link from "next/link";
import type { LeaderActivityFeed } from "@/lib/leader-activity/core";
import type { LeaderActivityKind } from "@/domain/vulnerable/leader-activity";

const KIND_BADGE: Record<LeaderActivityKind, { label: string; className: string }> = {
  status: { label: "สถานะคน", className: "badge-warning" },
  person: { label: "แจ้งเพิ่ม", className: "badge-brand" },
  community: { label: "ข้อมูลชุมชน", className: "badge-neutral" },
  site: { label: "จุดสำคัญ", className: "badge-success" },
};

const when = (at: Date) =>
  at.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * ความเคลื่อนไหวจากหัวหน้าชุมชน (docs/43 ข้อ 11) — แอดมินเห็นบนหน้าแรก
 * ไม่มีชื่อประชาชน (Audit Log ไม่มี PII) · กดรหัสใบเพื่อเปิดตรวจ
 */
export function LeaderActivityCard({ feed, sheetHref }: { feed: LeaderActivityFeed; sheetHref: (householdId: string) => string | null }) {
  return (
    <section className="card overflow-hidden" aria-labelledby="leader-activity-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-100 bg-slate-50/70 px-5 py-4">
        <div>
          <h2 id="leader-activity-title" className="font-bold text-slate-900">ความเคลื่อนไหวจากหัวหน้าชุมชน</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {feed.days} วันล่าสุด · ทั้งหมด {feed.total.toLocaleString("th-TH")} รายการ
            {feed.total > feed.items.length ? ` (แสดง ${feed.items.length} รายการล่าสุด)` : ""}
          </p>
        </div>
        <Link href="/community-status" className="text-sm font-semibold text-brand-700 hover:underline">
          เปิดหน้าสถานะกลุ่มเปราะบาง
        </Link>
      </div>
      {feed.items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-400">ยังไม่มีการบันทึกจากหัวหน้าชุมชนในช่วงนี้</p>
      ) : (
        <ul className="divide-y-2 divide-slate-50">
          {feed.items.map((item) => {
            const badge = KIND_BADGE[item.kind];
            const href = item.householdId ? sheetHref(item.householdId) : null;
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-slate-800">
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    {item.text}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.userName} · {when(item.at)}
                  </p>
                </div>
                {href ? (
                  <Link href={href} className="btn btn-ghost btn-sm">ดูใบ</Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
