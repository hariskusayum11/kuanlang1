// ส่วนเนื้อหาหน้าหลัก "แบบใหม่" สำหรับหน้าต้นแบบ /lab/song-khlong — Server Component ล้วน
// -----------------------------------------------------------------------------
// เนื้อหาเดียวกับหน้าแรกปัจจุบัน (ดึงข้อความจาก components/public/home-sections.tsx ที่เดียว)
// แต่จัดหน้าตาให้เข้ากับส่วนหัวภาพน้ำ: หัวข้อใหญ่ eyebrow + font-black · พื้นโล่ง · ไม่ใช้การ์ดไอคอนใหญ่ซ้อนกัน
// หน้าแรกจริง (/) ยังใช้แบบเดิม — ยังไม่สลับจนกว่าเจ้าของระบบอนุมัติ
// ข้อมูลสาธารณะเท่านั้น: aggregate + ข้อมูลราชการ — ไม่มี PII / พิกัดรายบ้าน
import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/mascot";
import { CATEGORY_LABEL, JOIN_ROLES, PREPARE_TIPS, type Tone } from "@/components/public/home-sections";
import type { PublicEmergencyContact, PublicStats } from "@/lib/public/stats";
import type { ExternalLinkRow } from "@/lib/external-links/core";
import { linkHost } from "@/lib/external-links/validation";

/** หัวข้อส่วนแบบเดียวกับส่วนธงเตือนภัย — ใช้ทุกส่วนในหน้าเพื่อให้เป็นระบบเดียวกัน */
export function TrialSectionHeader({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: ReactNode }) {
  return (
    <header>
      <p className="eyebrow text-brand-700">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-black text-ink-900 md:text-4xl">
        {title}
      </h2>
      {lead ? <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{lead}</p> : null}
    </header>
  );
}

/** เบอร์ฉุกเฉิน — แถบปุ่มโทรใต้ส่วนหัว (กดแล้วโทรทันที · แดง = วิกฤตจริง) */
export function EmergencyStrip({ contacts }: { contacts: PublicEmergencyContact[] }) {
  return (
    <section aria-labelledby="emergency-title" className="border-y border-slate-200 bg-white px-4 py-6 md:px-10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-center">
        <div className="shrink-0 lg:w-44">
          <h2 id="emergency-title" className="text-lg font-black text-ink-900">
            เบอร์ฉุกเฉิน
          </h2>
          <p className="text-xs text-slate-500">กดที่เบอร์เพื่อโทรได้ทันที</p>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-slate-500">รายการเบอร์ติดต่อฉุกเฉินของพื้นที่อยู่ระหว่างจัดเตรียมโดยหน่วยงานที่รับผิดชอบ</p>
        ) : (
          <ul className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {contacts.map((c) => (
              <li key={c.id}>
                <a
                  href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}
                  className="flex h-full flex-col rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-100 transition-colors hover:bg-red-100"
                >
                  <span className="font-mono text-2xl font-black leading-none text-red-600">{c.phone}</span>
                  <span className="mt-1.5 text-xs font-semibold leading-snug text-slate-700">{c.nameTh}</span>
                  <span className="text-[11px] text-slate-500">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** ตัวเลขภาพรวม 3 ตัว — แถวเดียวเหนือแผนที่ (ข้อมูลเป็นพระเอก · ไม่มีรายบ้าน) */
export function CommunityNumbers({ stats }: { stats: PublicStats }) {
  const items: Array<{ value: number; label: string; zero?: string }> = [
    { value: stats.communities, label: "ชุมชนในเครือข่าย" },
    { value: stats.verifiedHouseholds, label: "ครัวเรือนที่สำรวจและตรวจสอบแล้ว", zero: "เริ่มการสำรวจเร็ว ๆ นี้" },
    { value: stats.evacuationSites, label: "จุดพักพิง / จุดช่วยเหลือ", zero: "อยู่ระหว่างรวบรวมข้อมูล" },
  ];
  return (
    <dl className="mt-8 grid grid-cols-3 divide-x divide-slate-200 rounded-3xl bg-white py-5 ring-1 ring-slate-200">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col px-4 text-center md:px-8">
          <dt className="order-2 mt-1 text-xs font-semibold leading-snug text-slate-600 md:text-sm">{it.label}</dt>
          <dd className={`text-3xl font-black tabular-nums md:text-5xl ${it.value === 0 && it.zero ? "text-slate-300" : "text-ink-900"}`}>
            {it.value.toLocaleString("th-TH")}
          </dd>
          {it.value === 0 && it.zero ? <dd className="text-[11px] text-slate-400">{it.zero}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

const STEP_BORDER: Record<Tone, string> = {
  brand: "border-brand-500",
  ink: "border-ink-800",
  alert: "border-alert-500",
  sun: "border-sun-400",
  mint: "border-emerald-400",
};
const STEP_DOT: Record<Tone, string> = {
  brand: "bg-brand-400",
  ink: "bg-ink-800",
  alert: "bg-alert-400",
  sun: "bg-sun-400",
  mint: "bg-emerald-400",
};

/** เตรียมพร้อม — 3 ช่วงเวลาเรียงเป็นขั้น (ไม่ใช่การ์ดไอคอน) */
export function PrepareSteps() {
  return (
    <section aria-labelledby="prepare-title" className="bg-white px-4 py-16 md:px-10 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        <TrialSectionHeader
          id="prepare-title"
          eyebrow="เตรียมพร้อม"
          title="ก่อน ระหว่าง และหลังน้ำท่วม"
          lead="ทำตามลำดับนี้ พร้อมดูธงเตือนภัยของชุมชนประกอบ — ธงเหลืองให้อพยพผู้ป่วยติดเตียงและผู้ฟอกไตก่อน"
        />
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
          {PREPARE_TIPS.map((tip, i) => (
            <li key={tip.title} className={`border-t-4 pt-5 ${STEP_BORDER[tip.tone]}`}>
              <p className="text-sm font-black tabular-nums text-slate-400">0{i + 1}</p>
              <h3 className="mt-1 text-xl font-black text-ink-900">{tip.title}</h3>
              <ul className="mt-4 space-y-3">
                {tip.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                    <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${STEP_DOT[tip.tone]}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** ร่วมเป็นเครือข่าย + ลิงก์ติดตามสถานการณ์ — ปิดท้ายหน้าในส่วนเดียว */
export function JoinAndFollow({ links }: { links: ExternalLinkRow[] }) {
  return (
    <section aria-labelledby="join-title" className="bg-canvas px-4 py-16 md:px-10 md:py-20">
      <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white md:p-8">
          <p className="eyebrow text-sky-300">ร่วมเป็นเครือข่าย</p>
          <h2 id="join-title" className="mt-2 text-2xl font-black leading-snug md:text-3xl">
            ช่วยกันเก็บข้อมูลชุมชน
            <br />
            เพื่อรับมือน้ำท่วมครั้งหน้า
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            สมัครขอเข้าใช้งานตามบทบาทของคุณ ผู้ดูแลระบบอนุมัติแล้วจึงเข้าใช้งานได้
          </p>
          <ul className="mt-5 space-y-2.5">
            {JOIN_ROLES.map((r) => (
              <li key={r.title} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />
                <span>
                  <b className="text-white">{r.title}</b> <span className="text-slate-400">— {r.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-accent btn-md">
              สมัครใช้งานระบบ
            </Link>
            <Link href="/login" className="btn btn-md border-2 border-white/30 bg-white/10 text-white hover:bg-white/20">
              เข้าสู่ระบบ
            </Link>
          </div>
          <div className="pointer-events-none absolute -bottom-2 right-4 hidden md:block">
            <Mascot role="rescue" mood="happy" size={112} decorative />
          </div>
        </div>

        {links.length ? (
          <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 md:p-8">
            <p className="eyebrow text-brand-700">ติดตามต่อ</p>
            <h3 className="mt-2 text-xl font-black text-ink-900">ระบบติดตามฝนและน้ำของหน่วยงานอื่น</h3>
            <ul className="mt-4 divide-y divide-slate-100">
              {links.map((l) => (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-brand-700">{l.title}</span>
                      <span className="block text-xs text-slate-500">{linkHost(l.url)}</span>
                    </span>
                    <span aria-hidden className="shrink-0 text-slate-400 group-hover:text-brand-600">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** ที่มาของข้อมูลบนหน้านี้ — รวมไว้ที่เดียวแทนตัวหนังสือเล็กกระจายหลายจุด */
export function DataCredits() {
  return (
    <div className="bg-canvas px-4 pb-10 md:px-10">
      <p className="mx-auto max-w-[1200px] text-[11px] leading-5 text-slate-500">
        <b>ที่มาของข้อมูล</b> · ระดับน้ำ: คลังข้อมูลน้ำแห่งชาติ (สสน./กรมชลประทาน) · ระดับสะพาน: รูปตัดขวางลำน้ำปี 2569
        กรมชลประทาน · เกณฑ์ธง: กลุ่มสองคลองควนลัง / Hatyai City Climate (CC BY-SA 3.0) · เส้นคลอง © OpenStreetMap
        contributors · ภาพดาวเทียม Esri · ข้อมูลชุมชน: แบบสำรวจที่ตรวจแล้ว (ภาพรวมระดับพื้นที่) · ภาพบ้านและน้ำในส่วนหัวใช้มาตราส่วนเดียวกัน
        · เกณฑ์เฝ้าระวัง/เตือนภัยบนไม้วัดเป็นฉบับร่าง · รูปตัดขวางคลอง: กรมชลประทาน (สำรวจ ม.ค. 2569)
        · แนวคิดนำเสนอระดับน้ำให้คนทั่วไปอ่านง่าย ได้แรงบันดาลใจจาก{" "}
        <a href="https://flood.pop.in.th/" target="_blank" rel="noopener noreferrer" className="underline">POPNIX Flood</a>
      </p>
    </div>
  );
}
