import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { listStatusPeople } from "@/lib/vulnerable-status/core";
import { bangkokToday, MAX_EVENT_YEARS_BACK } from "@/domain/vulnerable/status";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";
import { StatusList } from "@/components/community-status/status-list";

export const metadata = { title: "สถานะกลุ่มเปราะบาง" };
export const dynamic = "force-dynamic";

/**
 * หน้าของหัวหน้าชุมชน (Owner Decision 2026-10-19 · docs/34)
 *
 * บันทึก "เหตุการณ์หลังการสำรวจ" — เสียชีวิต / ย้ายออก / ไม่เข้าเกณฑ์แล้ว / คืนสถานะ
 * ไม่ใช่การแก้ข้อมูลกระดาษ จึงไม่ทำให้ใบกลับไปรอตรวจ และตัวเลขทุกหน้าเปลี่ยนทันที
 *
 * หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้ (ข้อยกเว้นของ #R7-B เฉพาะหน้านี้) · ADMIN เห็นทุกชุมชน
 * หลังบ้าน → ไม่มีมาสคอตในแถบหัวเรื่องตามกฎ F
 */
export default async function CommunityStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const ctx = await requirePermission(PERMISSIONS.VULNERABLE_STATUS_UPDATE);
  const params = await searchParams;
  const data = await listStatusPeople(ctx, params.community);
  if (!data) redirect("/access-denied");

  const inactiveCount = data.rows.filter((r) => r.status !== "ACTIVE").length;
  const today = bangkokToday();
  const oldest = `${Number(today.slice(0, 4)) - MAX_EVENT_YEARS_BACK}${today.slice(4)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <PageHero
        title="สถานะกลุ่มเปราะบาง"
        tone="ink"
        description="บันทึกเมื่อมีผู้เสียชีวิต ย้ายออก หรือไม่เข้าเกณฑ์แล้ว — ระบบจะเลิกนับผู้นั้นในรายงาน แผนที่ และลำดับการช่วยเหลือทันที โดยไม่แก้ข้อมูลแบบสอบถามเดิม"
        badge={
          data.scope.kind === "ALL"
            ? <>ผู้ดูแลระบบ · ทุกชุมชน</>
            : <>ดูแล {data.communities.length} ชุมชน</>
        }
      />

      {data.communities.length === 0 ? (
        <section className="card">
          <EmptyState
            role="notify"
            mood="sleep"
            title="ยังไม่ได้กำหนดชุมชนที่คุณดูแล"
            description="ติดต่อผู้ดูแลระบบเพื่อกำหนดชุมชนให้บัญชีของคุณ แล้วรายชื่อจะปรากฏที่นี่"
          />
        </section>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
            <SectionTitle
              title="รายชื่อกลุ่มเปราะบาง"
              tone="brand"
              aside={
                <span className="badge badge-neutral">
                  {data.rows.length.toLocaleString("th-TH")} คน
                  {inactiveCount > 0 && ` · เสียชีวิต/ย้ายออก/พ้นเกณฑ์ ${inactiveCount.toLocaleString("th-TH")}`}
                </span>
              }
            />
          </div>
          <StatusList
            rows={data.rows}
            communities={data.communities}
            selectedCommunityId={data.selectedCommunityId}
            today={today}
            oldestDate={oldest}
          />
          {data.truncated && (
            <p className="border-t-2 border-slate-100 px-6 py-3 text-xs text-sun-800">
              แสดงสูงสุด 3,000 รายการ — เลือกชุมชนด้านบนเพื่อดูรายชื่อให้ครบ
            </p>
          )}
        </section>
      )}
    </div>
  );
}
