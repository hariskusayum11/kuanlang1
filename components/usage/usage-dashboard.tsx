// ส่วน "สถิติการใช้งาน" บนหน้าตั้งค่าระบบ (docs/36) — Server Component
// โหลดข้อมูลเอง เพื่อห่อด้วย <Suspense> ได้: ฟอร์มตั้งค่าไม่ต้องรอ query สถิติ
// และถ้า query พัง ฟอร์มตั้งค่ายังใช้งานได้ (แสดงกล่อง error เฉพาะส่วนนี้)

import Link from "next/link";
import { SectionTitle } from "@/components/layout/page-hero";
import { loadUsageDashboard, type UsageDashboard } from "@/lib/usage/dashboard";
import type { AuthorizationContext } from "@/lib/authz/types";
import { percentOf } from "@/domain/usage/aggregate";
import { DailyBarChart, RankedBars, StatTile, longThaiDay, shortThaiDay } from "./usage-charts";

const n = (value: number) => value.toLocaleString("th-TH");

function pct(part: number, whole: number): string {
  const value = percentOf(part, whole);
  return value === null ? "ยังคำนวณไม่ได้" : `${value.toLocaleString("th-TH")}%`;
}

export async function UsageDashboardSection({ ctx }: { ctx: AuthorizationContext }) {
  let data: UsageDashboard;
  try {
    const result = await loadUsageDashboard(ctx);
    if (!result.ok) return null; // ไม่มีสิทธิ์ — หน้าเรียก requirePermission ไว้แล้ว จึงไม่ควรมาถึงจุดนี้
    data = result.data;
  } catch {
    console.error("[usage] โหลดสถิติการใช้งานไม่สำเร็จ");
    return (
      <section className="card border-red-200 bg-red-50/60 p-6" role="alert">
        <SectionTitle title="สถิติการใช้งาน" tone="brand" />
        <p className="mt-3 text-sm font-semibold text-red-700">โหลดสถิติการใช้งานไม่สำเร็จ</p>
        <p className="mt-1 text-xs text-red-600">ตั้งค่าระบบด้านล่างยังใช้งานได้ตามปกติ ลองรีเฟรชหน้าอีกครั้ง</p>
      </section>
    );
  }

  const { window, pageViews, logins, sensitive, registrations, sheets } = data;
  const period = `${shortThaiDay(window.startDay)} – ${longThaiDay(window.endDay)} (${window.days.length} วัน · เวลาไทย)`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-mist px-5 py-3 text-xs leading-6 text-slate-600">
        <span className="font-bold text-slate-800">ช่วงข้อมูล:</span> {period} · ยอดเปิดหน้าเก็บเป็นตัวเลขรวมรายวันเท่านั้น
        <span className="font-semibold"> ไม่มี IP ไม่มีข้อมูลเบราว์เซอร์ และไม่ระบุว่าใครเปิด</span>
      </div>

      {/* ── ผู้เข้าชม ─────────────────────────────────── */}
      <section className="card p-6" aria-labelledby="usage-pageviews">
        <SectionTitle id="usage-pageviews" title="การเปิดหน้าเว็บ" tone="brand" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="เปิดหน้าทั้งหมด" value={pageViews.summary.total} denominator={`ใน ${pageViews.summary.days} วัน · เฉลี่ย ${n(pageViews.summary.averagePerDay)} ครั้ง/วัน`} />
          <StatTile label="ประชาชน (ไม่ได้ Login)" value={pageViews.publicTotal} denominator={`${pct(pageViews.publicTotal, pageViews.summary.total)} ของ ${n(pageViews.summary.total)} ครั้ง`} />
          <StatTile label="เจ้าหน้าที่ (Login แล้ว)" value={pageViews.signedInTotal} denominator={`${pct(pageViews.signedInTotal, pageViews.summary.total)} ของ ${n(pageViews.summary.total)} ครั้ง`} />
          <StatTile
            label="วันที่เปิดมากที่สุด"
            value={pageViews.summary.peakDay ? n(pageViews.summary.peakCount) : "—"}
            denominator={pageViews.summary.peakDay ? `ครั้ง · ${longThaiDay(pageViews.summary.peakDay)}` : "ยังไม่มีการเปิดหน้าในช่วงนี้"}
            tone="ink"
          />
        </div>
        {pageViews.summary.total === 0 ? (
          <EmptyBlock text="ยังไม่มียอดเปิดหน้าในช่วงนี้ — ระบบเริ่มนับตั้งแต่ติดตั้งฟีเจอร์นี้ ข้อมูลก่อนหน้านั้นไม่มีอยู่" />
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div>
              <h4 className="mb-3 text-sm font-bold text-slate-700">ยอดเปิดหน้ารายวัน</h4>
              <DailyBarChart
                series={pageViews.series}
                caption="ยอดเปิดหน้ารายวัน แยกประชาชนกับเจ้าหน้าที่"
                unit="ครั้ง"
                defs={[
                  { key: "PUBLIC", label: "ประชาชน", tone: "brand-400" },
                  { key: "SIGNED_IN", label: "เจ้าหน้าที่", tone: "brand-600" },
                ]}
              />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-bold text-slate-700">หน้าที่เปิดมากที่สุด</h4>
              <RankedBars list={pageViews.topPages} tone="brand-500" unit="ครั้ง" empty="ยังไม่มีข้อมูล" />
            </div>
          </div>
        )}
      </section>

      {/* ── การเข้าสู่ระบบ ───────────────────────────── */}
      <section className="card p-6" aria-labelledby="usage-logins">
        <SectionTitle id="usage-logins" title="การเข้าสู่ระบบและผู้ใช้งาน" tone="brand" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="เข้าสู่ระบบ" value={logins.summary.total} denominator={`ครั้ง ใน ${logins.summary.days} วัน · ${n(logins.distinctUsers)} บัญชีไม่ซ้ำ`} />
          <StatTile label="ใช้งานใน 7 วัน" value={logins.activeLast7} denominator={`${pct(logins.activeLast7, logins.activeAccounts)} ของบัญชีที่เปิดใช้ ${n(logins.activeAccounts)} บัญชี`} tone="mint" />
          <StatTile label="ใช้งานใน 30 วัน" value={logins.activeLast30} denominator={`${pct(logins.activeLast30, logins.activeAccounts)} ของบัญชีที่เปิดใช้ ${n(logins.activeAccounts)} บัญชี`} tone="mint" />
          <StatTile label="ยังไม่เคยเข้าสู่ระบบ" value={logins.neverLoggedIn} denominator={`จากบัญชีที่เปิดใช้ ${n(logins.activeAccounts)} บัญชี`} tone="ink" />
        </div>
        {logins.summary.total === 0 ? (
          <EmptyBlock text="ไม่มีการเข้าสู่ระบบในช่วงนี้" />
        ) : (
          <div className="mt-6">
            <h4 className="mb-3 text-sm font-bold text-slate-700">จำนวนครั้งที่เข้าสู่ระบบรายวัน</h4>
            <DailyBarChart
              series={logins.series}
              caption="จำนวนครั้งที่เข้าสู่ระบบรายวัน"
              unit="ครั้ง"
              defs={[{ key: "LOGINS", label: "เข้าสู่ระบบ", tone: "brand-500" }]}
            />
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          นับจาก Audit Log ประเภท LOGIN และเวลาเข้าสู่ระบบล่าสุดของบัญชี (มีเฉพาะตั้งแต่ระบบเริ่มบันทึก)
        </p>
      </section>

      {/* ── ข้อมูลอ่อนไหว ───────────────────────────── */}
      <section className="card p-6" aria-labelledby="usage-sensitive">
        <SectionTitle id="usage-sensitive" title="การเปิดดูและส่งออกข้อมูลอ่อนไหว" tone="brand" />
        <p className="mt-1 text-xs text-slate-500">จาก Audit Log ประเภท READ และ EXPORT ใน {window.days.length} วัน — แสดงเป็นยอดรวมตามชนิดข้อมูล ไม่แสดงรายบุคคล</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-3 text-sm font-bold text-slate-700">เปิดดู <span className="font-normal text-slate-400">· {n(sensitive.reads.total)} ครั้ง</span></h4>
            <RankedBars list={sensitive.reads} tone="brand-500" unit="ครั้งที่เปิดดู" empty="ไม่มีการเปิดดูข้อมูลอ่อนไหวในช่วงนี้" />
          </div>
          <div>
            <h4 className="mb-3 text-sm font-bold text-slate-700">ส่งออกไฟล์ <span className="font-normal text-slate-400">· {n(sensitive.exports.total)} ครั้ง</span></h4>
            <RankedBars list={sensitive.exports} tone="brand-600" unit="ครั้งที่ส่งออก" empty="ไม่มีการส่งออกข้อมูลในช่วงนี้" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        {/* ── คำขอสมัคร ──────────────────────────────── */}
        <section className="card p-6" aria-labelledby="usage-registrations">
          <SectionTitle id="usage-registrations" title="คำขอสมัครใช้งาน" tone="sun" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="รออนุมัติ" value={registrations.pending} denominator={`จากคำขอทั้งหมด ${n(registrations.total)}`} tone="sun" />
            <StatTile label="อนุมัติแล้ว" value={registrations.approved} denominator={`${pct(registrations.approved, registrations.total)} ของคำขอทั้งหมด`} tone="mint" />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            ปฏิเสธ {n(registrations.rejected)} · ยกเลิก {n(registrations.cancelled)} · ทั้งหมด {n(registrations.total)} คำขอ (ทุกช่วงเวลา)
            <br />สมัครใหม่ใน {window.days.length} วัน: <span className="font-bold text-slate-700">{n(registrations.createdInWindow)}</span> คำขอ
          </p>
          {registrations.pending > 0 ? (
            <Link href="/admin/registrations" className="btn btn-secondary btn-sm mt-4">ไปที่คำขอสมัคร</Link>
          ) : null}
        </section>

        {/* ── การคีย์และตรวจ ─────────────────────────── */}
        <section className="card p-6" aria-labelledby="usage-sheets">
          <SectionTitle id="usage-sheets" title="แบบสอบถามที่คีย์และตรวจแล้ว" tone="mint" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="คีย์ใหม่" value={sheets.keyedInWindow} denominator={`ใบ ใน ${window.days.length} วัน · ทั้งระบบ ${n(sheets.keyedAllTime)} ใบ`} />
            <StatTile label="ตรวจแล้ว" value={sheets.verifiedInWindow} denominator={`ใบ ใน ${window.days.length} วัน · ทั้งระบบ ${n(sheets.verifiedAllTime)} จาก ${n(sheets.keyedAllTime)} ใบ (${pct(sheets.verifiedAllTime, sheets.keyedAllTime)})`} tone="mint" />
          </div>
          {sheets.keyedInWindow + sheets.verifiedInWindow === 0 ? (
            <EmptyBlock text="ไม่มีการคีย์หรือตรวจแบบสอบถามในช่วงนี้" />
          ) : (
            <div className="mt-5">
              <DailyBarChart
                series={sheets.series}
                caption="จำนวนแบบสอบถามที่คีย์และตรวจแล้วรายวัน"
                unit="ใบ"
                defs={[
                  { key: "KEYED", label: "คีย์", tone: "brand-500" },
                  { key: "VERIFIED", label: "ตรวจแล้ว", tone: "emerald-500" },
                ]}
              />
            </div>
          )}
          <p className="mt-3 text-[11px] leading-4 text-slate-400">
            นับเฉพาะใบที่ใช้งานได้ (ไม่ถูกลบ ไม่ใช่ใบซ้ำ) · "ตรวจแล้ว" นับตามวันที่ตรวจของใบที่ยังมีสถานะตรวจแล้วอยู่ —
            ใบที่ถูกแก้หลังตรวจจะกลับไปรอตรวจและไม่ถูกนับ
          </p>
        </section>
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">{text}</p>;
}

/** โครงระหว่างโหลด — ใช้ทั้งใน Suspense และ loading.tsx */
export function UsageDashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="กำลังโหลดสถิติการใช้งาน">
      <div className="skeleton h-10 rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-4 p-6">
          <div className="skeleton h-5 w-48 rounded-lg" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((j) => <div key={j} className="skeleton h-20 rounded-2xl" />)}
          </div>
          <div className="skeleton h-36 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
