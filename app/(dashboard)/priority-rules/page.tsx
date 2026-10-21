import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getRulesPageData } from "@/lib/rules/core";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { RuleEditor } from "@/components/rules/rule-editor";
import {
  HelpOrderRules,
  RiskRuleDetails,
  RuleHistoryList,
  ruleEditorProps,
  ruleNames,
  TriageRuleCards,
  TriageRuleNote,
  versionText,
} from "@/components/rules/rule-sections";

export const metadata = { title: "กฎการจัดลำดับ" };
export const dynamic = "force-dynamic";

/**
 * กฎการจัดลำดับฉบับเต็ม (Owner Decision 2026-10-19 · docs/40)
 * ตั้งแต่ 2026-10-21 เกณฑ์แสดงบนหน้าที่ใช้จริง (/medical /risk) แล้ว — หน้านี้ไม่มีเมนูใน Sidebar
 * แต่ยังเปิดได้จากลิงก์ "ฉบับเต็ม" (ประวัติทุกเวอร์ชัน) · แก้ได้เฉพาะ ADMIN (ตรวจฝั่ง server)
 */
export default async function PriorityRulesPage() {
  const ctx = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const data = await getRulesPageData(ctx);
  if (!data) redirect("/access-denied");
  const { active, types, history, canManage } = data;
  const risk = active.risk;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 animate-fade-in">
      <PageHero
        title="กฎการจัดลำดับ"
        tone="brand"
        description="ระบบใช้กฎชุดนี้ตัดสินว่าใครควรได้รับความช่วยเหลือก่อน — ความเร่งด่วนรายบุคคล และความเสี่ยงน้ำท่วมของครัวเรือน ทุกการแก้ไขเป็นเวอร์ชันใหม่และบันทึกว่าใครแก้ เมื่อไร เพราะอะไร"
        badge={<>{versionText(data)} · {active.isDraft ? "ร่าง ยังไม่รับรอง" : "รับรองแล้ว"}</>}
      />

      {active.isDraft ? (
        <div className="flex items-start gap-3 rounded-xl border border-sun-400 bg-sun-100 px-4 py-3" role="note">
          <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sun-400 font-black text-ink-900" aria-hidden="true">!</span>
          <p className="text-sm leading-relaxed text-ink-900">
            <b>กฎชุดนี้ยังเป็นร่าง</b> — น้ำหนัก เกณฑ์ และการจัดกลุ่มความเร่งด่วนยังรอเจ้าของระบบรับรอง
            ตัวเลขในหน้า <Link href="/risk" className="font-semibold underline underline-offset-2">ความเสี่ยง</Link> และ
            ลำดับการช่วยเหลือบน <Link href="/map" className="font-semibold underline underline-offset-2">แผนที่</Link> จึงเป็นตัวเลขทดลอง
          </p>
        </div>
      ) : null}

      {/* 1. ความเร่งด่วนรายบุคคล */}
      <section className="card space-y-4 p-6">
        <SectionTitle title="1. ความเร่งด่วนรายบุคคล (กลุ่มเปราะบาง)" tone="alert" />
        <TriageRuleNote />
        <TriageRuleCards types={types} />
      </section>

      {/* 2. ความเสี่ยงครัวเรือน */}
      <section className="card space-y-5 p-6">
        <SectionTitle
          title="2. ความเสี่ยงน้ำท่วมของครัวเรือน"
          tone="brand"
          aside={<span className="badge badge-neutral">สูตรรุ่น {risk.formulaVersion} · น้ำหนักรุ่น {risk.weightVersion}</span>}
        />
        <RiskRuleDetails risk={risk} />
      </section>

      {/* 3. ลำดับบนแผนที่ */}
      <section className="card space-y-3 p-6">
        <SectionTitle title="3. ลำดับการช่วยเหลือบนแผนที่" tone="mint" />
        <HelpOrderRules />
      </section>

      {canManage ? (
        <RuleEditor {...ruleEditorProps(data)} />
      ) : (
        <p className="px-1 text-xs text-slate-500">การแก้กฎทำได้เฉพาะผู้ดูแลระบบ และทุกการแก้จะปรากฏในประวัติด้านล่าง</p>
      )}

      {/* ประวัติ */}
      <section className="card overflow-hidden">
        <div className="border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
          <SectionTitle title="ประวัติการแก้กฎ" tone="brand" aside={<span className="badge badge-neutral tabular-nums">{history.length} เวอร์ชัน</span>} />
        </div>
        <RuleHistoryList history={history} activeVersionNo={active.versionNo} names={ruleNames(risk, types)} />
      </section>
    </div>
  );
}
