import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getSurveyMap } from "@/lib/geo/survey-map";
import { SurveyMap } from "@/components/geo/survey-map";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "แผนที่การสำรวจ" };
export const dynamic = "force-dynamic";

// แผนที่ภาพรวมการสำรวจระดับชุมชน — เห็นว่าสำรวจไปพื้นที่ไหน มากน้อยแค่ไหน
// Privacy: aggregate ระดับชุมชน (ไม่มีพิกัดรายบ้าน) · RBAC household.view · Audit READ
export default async function SurveyMapPage() {
  const ctx = await requirePermission(PERMISSIONS.HOUSEHOLD_VIEW);
  const data = await getSurveyMap(ctx);
  const hasAny = data.points.length > 0;

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="แผนที่การสำรวจ"
        tone="brand"
        description="ภาพรวมว่าสำรวจไปพื้นที่ไหนแล้วบ้าง แยกตามชุมชน — หมุดใหญ่ = คีย์เข้ามามาก สีบอกสถานะเทียบเป้าหมาย"
        badge={
          <>
            <span className="live-dot" />
            คีย์แล้ว {data.totalKeyed.toLocaleString("th-TH")} · ตรวจแล้ว {data.totalVerified.toLocaleString("th-TH")}
          </>
        }
      />

      {/* คำอธิบายสี */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
        <LegendDot color="#14b8a6" label="ผ่านเป้า (>60%)" />
        <LegendDot color="#2563eb" label="มีการสำรวจแล้ว" />
        <LegendDot color="#94a3b8" label="ยังไม่สำรวจ" />
        <span className="inline-flex items-center gap-2 text-slate-500">
          <span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-slate-400" />
          ขอบเขตร่าง (ยังไม่รับรอง)
        </span>
      </div>

      <section className="card overflow-hidden p-0">
        {hasAny ? (
          <SurveyMap points={data.points} boundaries={data.boundaries} center={data.center} />
        ) : (
          <EmptyState
            mood="sleep"
            tone="brand"
            title="ยังไม่มีชุมชนให้แสดง"
            description="เมื่อมีชุมชนที่กำหนดตำแหน่งแล้ว แผนที่จะแสดงที่นี่"
          />
        )}
      </section>

      {/* ตารางประกอบ — เข้าถึงได้ด้วยคีย์บอร์ด/Screen reader และเห็นตัวเลขชัดแม้แผนที่โหลดไม่ขึ้น */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="สรุปรายชุมชน" tone="brand" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <th className="py-2.5 pl-6 pr-4">ชุมชน</th>
                <th className="py-2.5 pr-4 text-right">คีย์แล้ว</th>
                <th className="py-2.5 pr-4 text-right">ตรวจแล้ว</th>
                <th className="py-2.5 pr-4 text-right">Coverage</th>
                <th className="py-2.5 pr-6">ตำแหน่ง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.points.map((p) => (
                <tr key={p.communityId} className="transition-colors hover:bg-brand-50/50">
                  <td className="py-3 pl-6 pr-4">
                    <span className="font-semibold text-slate-800">{p.nameTh}</span>
                    <span className="ml-1 text-xs text-slate-400">{p.code}</span>
                  </td>
                  <td className="py-3 pr-4 text-right font-bold tabular-nums text-brand-700">
                    {p.keyed.toLocaleString("th-TH")}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">
                    {p.verified.toLocaleString("th-TH")}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {p.coveragePercent === null ? (
                      <span className="text-slate-400">ยังไม่ทราบ</span>
                    ) : (
                      <span className={p.meetsTarget ? "font-bold text-emerald-700" : "text-slate-600"}>
                        {p.coveragePercent.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-6">
                    {p.lat !== null && p.lng !== null ? (
                      <span className="badge badge-neutral text-[11px]">บนแผนที่</span>
                    ) : (
                      <span className="text-xs text-slate-400">ยังไม่กำหนด</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        หมายเหตุ: หมุดใช้ <b>จุดศูนย์กลางชุมชนโดยประมาณ</b> (ยังไม่ใช่ขอบเขตจริง) และเป็นข้อมูล
        <b>ระดับชุมชน</b> ไม่แสดงพิกัดรายบ้านเพื่อความเป็นส่วนตัว · &quot;คีย์แล้ว&quot; นับทุกใบที่คีย์เข้าระบบ
        ส่วน &quot;ตรวจแล้ว&quot; นับเฉพาะ VERIFIED · Coverage เทียบกับจำนวนครัวเรือนทั้งหมด (ถ้าทราบ)
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
