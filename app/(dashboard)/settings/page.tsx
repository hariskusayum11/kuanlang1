import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getSystemPreferences } from "@/lib/settings/core";
import { saveSystemPreferencesAction } from "@/lib/settings/actions";
import { PageHero, SectionTitle } from "@/components/layout/page-hero";
import { UsageDashboardSection, UsageDashboardSkeleton } from "@/components/usage/usage-dashboard";
import { Suspense } from "react";

export const metadata = { title: "ตั้งค่าระบบ" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const ctx = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  const [settings, sp] = await Promise.all([getSystemPreferences(), searchParams]);
  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-fade-in">
      <PageHero
        title="ตั้งค่าระบบ"
        tone="ink"
        description="สถิติการใช้งาน 30 วันล่าสุด และค่ากลางที่มีผลกับแดชบอร์ดและแผนที่ การเปลี่ยนค่าทุกครั้งมี Audit Log"
        actions={<>
          <a href="#usage" className="btn btn-secondary btn-sm">สถิติการใช้งาน</a>
          <a href="#system-settings" className="btn btn-secondary btn-sm">ค่ากลางของระบบ</a>
        </>}
      />
      {sp.saved === "1" ? <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800" role="status">บันทึกตั้งค่าระบบแล้ว</div> : null}
      <div id="usage" className="scroll-mt-6 space-y-4">
        <SectionTitle title="สถิติการใช้งาน" tone="brand" />
        <Suspense fallback={<UsageDashboardSkeleton />}>
          <UsageDashboardSection ctx={ctx} />
        </Suspense>
      </div>
      <div id="system-settings" className="scroll-mt-6">
        <SectionTitle title="ค่ากลางของระบบ" tone="mint" />
      </div>
      <form action={saveSystemPreferencesAction} className="space-y-5">
        <section className="card p-6">
          <SectionTitle title="แดชบอร์ดและประกาศ" tone="brand" />
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="space-y-1 text-sm font-bold text-slate-700">สถานะเริ่มต้นของแดชบอร์ด
              <select name="dashboardDefaultStatus" defaultValue={settings.dashboardDefaultStatus} className="field">
                <option value="VERIFIED">ตรวจแล้ว</option><option value="PENDING">ยังไม่ผ่านตรวจ</option><option value="ALL">ทุกสถานะ</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">ประกาศบนแดชบอร์ด
              <textarea name="notice" defaultValue={settings.notice} maxLength={500} rows={3} className="field" placeholder="เว้นว่างเมื่อไม่มีประกาศ" />
              <span className="block text-xs font-normal text-slate-400">สูงสุด 500 ตัวอักษร</span>
            </label>
          </div>
        </section>
        <section className="card p-6">
          <SectionTitle title="ตำแหน่งเริ่มต้นของแผนที่" tone="mint" />
          <p className="mt-1 text-xs text-slate-500">ใช้เมื่อยังไม่มีจุดข้อมูลให้แผนที่จัดกรอบอัตโนมัติ</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <NumberField name="mapDefaultLat" label="ละติจูด" value={settings.mapDefaultLat} min={-90} max={90} step="0.0000001" />
            <NumberField name="mapDefaultLng" label="ลองจิจูด" value={settings.mapDefaultLng} min={-180} max={180} step="0.0000001" />
            <NumberField name="mapDefaultZoom" label="ระดับซูม" value={settings.mapDefaultZoom} min={5} max={19} step="1" />
          </div>
        </section>
        <div className="flex justify-end"><button type="submit" className="btn btn-primary btn-md">บันทึกตั้งค่าระบบ</button></div>
      </form>
      <section className="rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-5 text-xs leading-6 text-slate-500">
        Session ไม่ใช้งาน 30 นาที, Login 10 ครั้ง/นาที และสมัคร 10 ครั้ง/ชั่วโมง เป็นนโยบายความปลอดภัยระดับเซิร์ฟเวอร์ จึงแสดงเป็นข้อมูลและไม่เปิดให้เปลี่ยนจากหน้าเว็บ
      </section>
    </div>
  );
}

function NumberField({ name, label, value, min, max, step }: { name: string; label: string; value: number; min: number; max: number; step: string }) {
  return <label className="space-y-1 text-sm font-bold text-slate-700">{label}<input type="number" name={name} defaultValue={value} min={min} max={max} step={step} required className="field" /></label>;
}
