import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getKeyring } from "@/lib/crypto/keys";
import { listCommunityVolunteers } from "@/lib/community-volunteers/core";
import { householdSheetHref } from "@/lib/household/sheet-link";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "อาสาสมัครในชุมชน" };
export const dynamic = "force-dynamic";

/**
 * รายชื่ออาสาสมัครในชุมชน (docs/43) — ใช้เรียกคนช่วยตอนเกิดภัย กดโทรได้ทันที
 * ข้อมูลจากแบบสอบถามที่ตรวจแล้ว · หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้
 */
export default async function CommunityVolunteersPage({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const ctx = await requirePermission(PERMISSIONS.VOLUNTEER_LIST_VIEW);
  const sp = await searchParams;
  const skill = sp.skill?.trim() || undefined;
  const result = await listCommunityVolunteers(ctx, getKeyring(), { skill });
  if (!result) return null;
  const exportHref = `/community-volunteers/export${skill ? `?skill=${encodeURIComponent(skill)}` : ""}`;
  const total = result.rows.length;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <PageHero
        title="อาสาสมัครในชุมชน"
        tone="brand"
        description="บ้านที่แจ้งว่าสนใจเป็นอาสาสมัครในแบบสอบถาม (ใบที่ตรวจแล้ว) — ชื่อและเบอร์เป็นของผู้ให้ข้อมูลของบ้านนั้น กดเบอร์เพื่อโทรได้ทันที"
        badge={<>{total.toLocaleString("th-TH")} คน</>}
        actions={
          result.rows.length > 0 ? (
            <a href={exportHref} download className="btn btn-accent btn-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              ดาวน์โหลด Excel
            </a>
          ) : undefined
        }
      />

      {result.skills.length > 0 ? (
        <nav className="flex flex-wrap gap-2" aria-label="กรองตามทักษะ">
          <Link href="/community-volunteers" className={`chip chip-md ${skill ? "chip-neutral" : "chip-brand"}`}>
            ทุกทักษะ
          </Link>
          {result.skills.map((s) => (
            <Link
              key={s.code}
              href={`/community-volunteers?skill=${encodeURIComponent(s.code)}`}
              className={`chip chip-md ${skill === s.code ? "chip-brand" : "chip-neutral"}`}
              aria-current={skill === s.code ? "true" : undefined}
            >
              {s.label} <span className="tabular-nums opacity-70">{s.count.toLocaleString("th-TH")}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="รายชื่อ" tone="mint" />
        </div>
        {result.rows.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title={skill ? "ไม่มีอาสาสมัครที่มีทักษะนี้" : "ยังไม่มีอาสาสมัครจากใบที่ตรวจแล้ว"}
            description="เมื่อใบที่บ้านแจ้งความสนใจเป็นอาสาสมัครผ่านการตรวจแล้ว รายชื่อจะปรากฏที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pl-6 pr-4">ชื่อ</th>
                  <th className="py-2.5 pr-4">เบอร์โทร</th>
                  <th className="py-2.5 pr-4">ทักษะที่สนใจ</th>
                  <th className="py-2.5 pr-4">ที่อยู่ / ชุมชน</th>
                  <th className="py-2.5 pr-6 text-right">ใบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.rows.map((row) => {
                  const href = householdSheetHref(ctx.permissions, row.householdId);
                  return (
                    <tr key={row.householdId} className="hover:bg-brand-50/50">
                      <td className="py-2.5 pl-6 pr-4 font-semibold text-slate-800">{row.name}</td>
                      <td className="py-2.5 pr-4">
                        {row.phone ? (
                          <a href={`tel:${row.phone.replace(/[^\d+]/g, "")}`} className="font-semibold tabular-nums text-brand-700 hover:underline">
                            {row.phone}
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {row.skills.map((s) => (
                            <span key={s.code} className="badge badge-brand">{s.label}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {row.address || "—"}
                        <span className="block text-xs text-slate-400">{row.communityName}</span>
                      </td>
                      <td className="py-2.5 pr-6 text-right">
                        {href ? (
                          <Link href={href} className="font-mono text-xs font-bold text-brand-700 hover:underline">{row.sheetNo}</Link>
                        ) : (
                          <span className="font-mono text-xs text-slate-500">{row.sheetNo}</span>
                        )}
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
