import Link from "next/link";
import { requirePermission } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getRiskList, type RiskRow } from "@/lib/risk/list";
import type { RiskLevel } from "@/domain/risk";
import { PageHero, SectionTitle, EmptyState } from "@/components/layout/page-hero";

export const metadata = { title: "ความเสี่ยงน้ำท่วม" };
export const dynamic = "force-dynamic";

// จัดลำดับความเสี่ยงครัวเรือน (VERIFIED ทุกหลัง) — คำนวณสด ไม่เขียนลง DB
// ใช้กฎเวอร์ชันที่ใช้งานอยู่ (docs/40) — แอดมินแก้กฎที่ /priority-rules แล้วอัปเดตทันที
export default async function RiskPage() {
  const ctx = await requirePermission(PERMISSIONS.HOUSEHOLD_VIEW);
  const result = await getRiskList(ctx);
  const canOpen = hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
  const { counts } = result;
  const mappablePct = Math.round((result.mappableWeight / result.systemWeight) * 100);

  return (
    <div className="w-full space-y-7 animate-fade-in">
      <PageHero
        title="ความเสี่ยงน้ำท่วม"
        tone="brand"
        description="จัดลำดับครัวเรือนที่ตรวจแล้ว (VERIFIED) ตามความเสี่ยง — คำนวณสดจากข้อมูลจริง เพื่อดูว่าควรช่วยเหลือบ้านไหนก่อน"
        badge={
          <>
            <span className="live-dot" />
            สูงมาก {counts.CRITICAL.toLocaleString("th-TH")} · สูง {counts.HIGH.toLocaleString("th-TH")}
          </>
        }
      />

      {/* แบนเนอร์เตือน — กฎยังไม่รับรอง (docs/40) */}
      {result.config.draft ? (
        <div className="flex items-start gap-3 rounded-xl border border-sun-400 bg-sun-100 px-4 py-3">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sun-400 font-black text-ink-900">
            !
          </span>
          <p className="text-sm leading-relaxed text-ink-900">
            <b>ตัวเลขทดลอง (กฎเวอร์ชัน {result.config.versionNo || "ตั้งต้น"} · v{result.config.weightVersion}) — ยังไม่ได้รับการรับรอง</b>{" "}
            น้ำหนักและเกณฑ์การจัดระดับยังรอเจ้าของระบบรับรอง ·{" "}
            <Link href="/priority-rules" className="font-semibold underline underline-offset-2">ดูกฎทั้งหมด</Link> ·
            ระบบคำนวณสดทุกครั้งที่เปิดหน้า <b>ไม่ได้บันทึกคะแนนลงฐานข้อมูล</b> · ปัจจุบัน map ได้ {mappablePct}% ของน้ำหนัก
            (ปัจจัยพาหนะ/ทรัพยากร/ช่องทางดิจิทัล/ระยะทาง GIS ยังไม่พร้อม จึงยังไม่ถูกนับ)
          </p>
        </div>
      ) : (
        <p className="px-1 text-sm text-slate-600">
          คำนวณด้วยกฎเวอร์ชัน {result.config.versionNo} (รับรองแล้ว) ·{" "}
          <Link href="/priority-rules" className="font-semibold text-brand-700 underline underline-offset-2">ดูกฎทั้งหมด</Link>
        </p>
      )}

      {/* สรุปตามระดับ */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="สูงมาก" value={counts.CRITICAL} tone="danger" />
        <StatCard label="สูง" value={counts.HIGH} tone="high" />
        <StatCard label="ปานกลาง" value={counts.MEDIUM} tone="medium" />
        <StatCard label="ต่ำ" value={counts.LOW} tone="low" />
        <StatCard label="ข้อมูลไม่พอประเมิน" value={counts.INSUFFICIENT} tone="neutral" />
      </div>

      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle
            title="ลำดับการช่วยเหลือ"
            tone="brand"
            aside={
              result.rows.length > 0 ? (
                <span className="badge badge-neutral tabular-nums">
                  {result.rows.length.toLocaleString("th-TH")} ครัวเรือน
                </span>
              ) : undefined
            }
          />
        </div>

        {result.rows.length === 0 ? (
          <EmptyState
            mood="sleep"
            tone="brand"
            title="ยังไม่มีครัวเรือนที่ตรวจแล้ว"
            description="เมื่อ Verifier ยืนยันข้อมูลเป็น VERIFIED ระบบจะคำนวณและจัดลำดับความเสี่ยงที่นี่"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pl-6 pr-3 text-right">#</th>
                  <th className="py-2.5 pr-4">ใบ / ชุมชน</th>
                  <th className="py-2.5 pr-4">ระดับ</th>
                  <th className="py-2.5 pr-4">คะแนน</th>
                  <th className="py-2.5 pr-6">ความมั่นใจ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {result.rows.map((r, i) => (
                  <RiskTableRow key={r.householdId} row={r} rank={i + 1} canOpen={canOpen} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        หมายเหตุ: ใช้ <b>คะแนนสัมบูรณ์</b> (คะแนนดิบ ÷ น้ำหนักรวมทั้งระบบ) ในการจัดระดับ
        เพื่อให้บ้านที่ข้อมูลไม่ครบไม่ถูกดันเป็นความเสี่ยงสูงลวง ·
        ครัวเรือนที่มีผู้ป่วยติดเตียง/ฟอกไตจะถูกยกเป็น &quot;สูง&quot; ขั้นต่ำเสมอ ·
        &quot;ความมั่นใจ&quot; ต่ำหมายถึงข้อมูลยังไม่ครบ ควรลงไปเก็บเพิ่ม
      </p>
    </div>
  );
}

const LEVEL_META: Record<
  RiskLevel,
  { label: string; badge: string; bar: string }
> = {
  CRITICAL: { label: "สูงมาก", badge: "badge-danger", bar: "bg-red-500" },
  HIGH: { label: "สูง", badge: "badge-accent", bar: "bg-alert-500" },
  MEDIUM: { label: "ปานกลาง", badge: "badge-warning", bar: "bg-sun-400" },
  LOW: { label: "ต่ำ", badge: "badge-success", bar: "bg-emerald-500" },
};

function RiskTableRow({
  row,
  rank,
  canOpen,
}: {
  row: RiskRow;
  rank: number;
  canOpen: boolean;
}) {
  const meta = row.level ? LEVEL_META[row.level] : null;
  const pct = Math.max(0, Math.min(100, row.absoluteScore));
  const confPct = Math.round(row.confidence * 100);
  const confLow = row.confidence < 0.6;

  return (
    <tr className="transition-colors hover:bg-brand-50/50">
      <td className="py-3 pl-6 pr-3 text-right font-bold tabular-nums text-slate-400">{rank}</td>
      <td className="py-3 pr-4">
        {canOpen ? (
          <Link href={`/verification/${row.householdId}`} className="font-bold text-brand-700 hover:underline">
            {row.sheetNo}
          </Link>
        ) : (
          <span className="font-bold text-slate-800">{row.sheetNo}</span>
        )}
        <div className="text-xs text-slate-400">
          ชุมชน{row.communityTh} · รู้ {row.factorsUsed}/{row.factorsTotal} ปัจจัย
        </div>
      </td>
      <td className="py-3 pr-4">
        {meta ? (
          <span className="inline-flex items-center gap-1.5">
            <span className={`badge ${meta.badge}`}>{meta.label}</span>
            {row.appliedHardRules.length > 0 && (
              <span className="badge badge-neutral text-[10px]">กฎบังคับ</span>
            )}
          </span>
        ) : (
          <span className="badge badge-neutral">ข้อมูลไม่พอ</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
            <span
              className={`block h-full rounded-full ${meta ? meta.bar : "bg-slate-300"}`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <span className="tabular-nums text-slate-600">{row.absoluteScore.toFixed(1)}</span>
        </div>
      </td>
      <td className="py-3 pr-6">
        <span className={`tabular-nums font-semibold ${confLow ? "text-slate-400" : "text-slate-700"}`}>
          {confPct}%
        </span>
        {confLow && <span className="ml-1 text-[11px] text-slate-400">· เก็บเพิ่ม</span>}
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "high" | "medium" | "low" | "neutral";
}) {
  const cls =
    tone === "danger"
      ? "text-red-600"
      : tone === "high"
        ? "text-alert-600"
        : tone === "medium"
          ? "text-sun-700"
          : tone === "low"
            ? "text-emerald-700"
            : "text-slate-500";
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-[32px] font-bold leading-none tabular-nums ${cls}`}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}
