import Link from "next/link";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import { Mascot } from "@/components/brand/mascot";
import { LogoMark } from "@/components/brand/logo-mark";
import {
  getPublicStats,
  getPublicEmergencyContacts,
  getPublicMapData,
} from "@/lib/public/stats";
import { PublicMap } from "@/components/public/public-map";

// Public Home — เปิดได้โดยไม่ login (CLAUDE.md: Public Portal mobile-first)
// แสดงเฉพาะ aggregate + ข้อมูลราชการ — ไม่มี PII / พิกัดรายบ้าน / Sheet ID
// Render ตอน request (force-dynamic): ไม่ prerender ตอน build จึง build เป็น Docker image
// ได้โดยไม่ต้องต่อ DB · และตัวเลขสาธารณะสดเสมอ (query เป็น aggregate เล็ก ๆ เร็วพออยู่แล้ว)
// หมายเหตุ: ถ้าต้องการแคชเพื่อลดภาระ DB ตอน scale ค่อยเปลี่ยนกลับเป็น ISR (revalidate)
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  DISASTER: "ป้องกันและบรรเทาสาธารณภัย",
  POLICE: "ตำรวจ",
  MEDICAL: "การแพทย์ฉุกเฉิน",
  MUNICIPALITY: "เทศบาล",
};

/* sun/alert สงวนความหมายไว้ (คำเตือน / ต้องลงมือทำ) — ตัวเลขที่เป็นกลางใช้ brand หรือ ink */
type Tone = "brand" | "ink" | "alert" | "sun" | "mint";

const TONE_CHIP: Record<Tone, string> = {
  brand: "chip chip-brand",
  ink: "chip bg-ink-800/10 text-ink-900",
  alert: "chip chip-accent",
  sun: "chip chip-sun",
  mint: "chip chip-mint",
};
const TONE_VALUE: Record<Tone, string> = {
  brand: "text-brand-700",
  ink: "text-ink-900",
  alert: "text-alert-600",
  sun: "text-sun-800",
  mint: "text-emerald-700",
};
const TONE_DOT: Record<Tone, string> = {
  brand: "bg-brand-400",
  ink: "bg-ink-800",
  alert: "bg-alert-400",
  sun: "bg-sun-400",
  mint: "bg-emerald-400",
};

/* บทบาทที่ประชาชน/เจ้าหน้าที่สมัครเองได้ (ตรงกับ REQUESTABLE_ROLES — ผู้ดูแลระบบอนุมัติก่อน login) */
const JOIN_ROLES: { title: string; desc: string; icon: string }[] = [
  {
    title: "อาสาสมัคร / ชาวบ้าน",
    desc: "ดูภาพรวมพื้นที่ แผนที่ และข้อมูลเตรียมพร้อมตามสิทธิ์",
    icon: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 11h.01",
  },
  {
    title: "เจ้าหน้าที่คีย์ข้อมูล",
    desc: "กรอกและแก้ไขแบบสอบถามครัวเรือนที่ตนเองรับผิดชอบ",
    icon: "M4 7h16M4 12h16M4 17h10M18 15l2 2-4 4h-2v-2l4-4z",
  },
  {
    title: "ผู้บริหาร",
    desc: "ดู Dashboard รายงานสรุป และข้อมูลภาพรวมเพื่อการตัดสินใจ",
    icon: "M4 19V9m5 10V5m5 14v-7m5 7V8",
  },
];

const PREPARE_TIPS: { title: string; tone: Tone; icon: string; items: string[] }[] = [
  {
    title: "ก่อนน้ำมา",
    tone: "sun",
    icon: "M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18.4 5.6l-2.1 2.1M21 12h-3M7 21h10M12 9a5 5 0 015 5c0 1.5-.7 2.6-1.6 3.6-.6.7-.9 1.4-1 2.4h-4.8c-.1-1-.4-1.7-1-2.4C7.7 16.6 7 15.5 7 14a5 5 0 015-5z",
    items: [
      "เตรียมถุงยังชีพ อาหารแห้ง น้ำดื่ม ยาประจำตัว และไฟฉาย",
      "เก็บเอกสารสำคัญใส่ถุงกันน้ำ ชาร์จโทรศัพท์ให้เต็ม",
      "จดเบอร์ติดต่อฉุกเฉินและนัดหมายจุดรวมพลกับคนในบ้าน",
      "ยกของมีค่าและปลั๊กไฟขึ้นที่สูง ย้ายรถไปจุดปลอดภัย",
    ],
  },
  {
    title: "ระหว่างน้ำท่วม",
    tone: "brand",
    icon: "M3 15c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0M3 19c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0M12 3v6M9 6l3 3 3-3",
    items: [
      "ติดตามประกาศจากผู้นำชุมชนและเทศบาลอย่างใกล้ชิด",
      "ตัดไฟฟ้าในบ้านหากน้ำเริ่มเข้าถึงปลั๊กหรือเครื่องใช้ไฟฟ้า",
      "หลีกเลี่ยงการเดินหรือขับรถฝ่ากระแสน้ำ แม้ระดับดูไม่ลึก",
      "ผู้สูงอายุ เด็ก และผู้ป่วยติดเตียง ให้อพยพก่อนเป็นลำดับแรก",
    ],
  },
  {
    title: "หลังน้ำลด",
    tone: "mint",
    icon: "M4 21V9l8-5 8 5v12M9 21v-6h6v6M12 3v2",
    items: [
      "ตรวจระบบไฟฟ้าและแก๊สก่อนกลับเข้าบ้าน",
      "ระวังสัตว์มีพิษที่มากับน้ำ สวมรองเท้าบูทเมื่อลุยพื้นที่ชื้น",
      "ทำความสะอาดและผึ่งบ้านให้แห้งเพื่อกันเชื้อรา",
      "แจ้งความเสียหายต่อชุมชนหรือเทศบาลเพื่อขอรับความช่วยเหลือ",
    ],
  },
];

export default async function PublicHomePage() {
  const [stats, contacts, mapData] = await Promise.all([
    getPublicStats(),
    getPublicEmergencyContacts(),
    getPublicMapData(),
  ]);
  const hasMapPoints = mapData.communities.length + mapData.sites.length > 0;
  const boundaryCount = mapData.communities.filter((c) => c.boundary).length;
  const boundaryDraft = mapData.communities.some((c) => c.boundary && !c.boundaryApproved);

  const updatedAt = stats.generatedAt.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header สาธารณะ — เรียบ เข้าถึงง่าย */}
      <header className="sticky top-0 z-20 border-b-2 border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={34} className="text-brand-600" />
            <div>
              <p className="text-[15px] font-bold leading-tight text-slate-900">
                {APP_NAME}
              </p>
              <p className="hidden text-[11px] font-medium text-brand-600 sm:block">
                เครือข่ายสองคลอง–ควนลัง
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/register" className="btn btn-primary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              สมัครใช้งาน
            </Link>
            <Link href="/login" className="btn btn-secondary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                <path d="M15 3h4a1 1 0 011 1v16a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">เข้าสู่ระบบ</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 md:px-6">
        {/* Hero — แถบแบรนด์สีเข้ม + มาสคอตหยดน้ำ */}
        <section className="animate-slide-up relative mt-5 overflow-hidden rounded-3xl band-brand px-6 pb-16 pt-8 md:px-10 md:pb-20 md:pt-12">
          <div className="relative z-10 flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:gap-10 md:text-left">
            <div className="min-w-0 flex-1">
              <span className="badge animate-pop bg-white/20 text-white">
                <span className="live-dot" />
                อยู่ระหว่างการสำรวจข้อมูลครัวเรือน
              </span>
              <h1 className="mt-4 text-3xl font-bold leading-snug text-white md:text-[40px]">
                ข้อมูลชุมชน
                <br className="hidden md:block" /> พร้อมรับมืออุทกภัย
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-50 md:text-base">
                {APP_DESCRIPTION_TH} — รวบรวมข้อมูลครัวเรือน กลุ่มเปราะบาง
                และทรัพยากรชุมชน เพื่อวางแผนช่วยเหลือเมื่อเกิดน้ำท่วม
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                <a href="#emergency-title" className="btn btn-accent btn-lg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" strokeLinejoin="round" />
                  </svg>
                  เบอร์ฉุกเฉิน
                </a>
                <a
                  href="#prepare-title"
                  className="btn btn-lg border-2 border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  วิธีเตรียมตัว
                </a>
              </div>
            </div>
            <div className="animate-drop-in shrink-0">
              <Mascot role="notify" mood="wink" motion="float" size={152} decorative className="drop-shadow-lg" />
            </div>
          </div>

          {/* คลื่นน้ำเชื่อมเข้ากับพื้นหน้า */}
          <svg
            viewBox="0 0 1200 90"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-12 w-full md:h-16"
          >
            <path
              d="M0 52c120-30 220 22 340 22s200-46 320-46 220 40 330 40 130-18 210-30v52H0z"
              fill="#f3f6fc"
            />
            <path
              d="M0 62c120-30 220 22 340 22s200-46 320-46 220 40 330 40 130-18 210-30v42H0z"
              fill="#f3f6fc"
              opacity="0.55"
            />
          </svg>
        </section>

        {/* เบอร์ฉุกเฉิน — สำคัญสุดสำหรับประชาชน จึงอยู่บนสุด (แดง = วิกฤตจริง) */}
        <section aria-labelledby="emergency-title" className="card mt-8 overflow-hidden">
          <div className="flex items-center gap-3 border-b-2 border-red-100 bg-red-50 px-5 py-4">
            <span className="chip chip-md bg-red-100 text-red-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h2 id="emergency-title" className="text-base font-bold text-slate-900">
                เบอร์ติดต่อฉุกเฉิน
              </h2>
              <p className="text-xs font-medium text-slate-500">กดที่หมายเลขเพื่อโทรได้ทันที</p>
            </div>
          </div>
          {contacts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              รายการเบอร์ติดต่อฉุกเฉินของพื้นที่อยู่ระหว่างจัดเตรียมโดยหน่วยงานที่รับผิดชอบ
            </p>
          ) : (
            <ul className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.id} className="bg-white">
                  <a
                    href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-red-50/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {c.nameTh}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                        {c.isNationwide ? " · ทั่วประเทศ" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-xl bg-red-600 px-3.5 py-2 font-mono text-sm font-bold text-white shadow-[0_3px_0_0_#991b1b]">
                      {c.phone}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* สถิติภาพรวม — aggregate เท่านั้น */}
        <section aria-labelledby="stats-title" className="mt-10">
          <SectionTitle id="stats-title" tone="brand" title="ภาพรวมพื้นที่" />
          <div className="stagger mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <PublicStat
              label="ชุมชนในเครือข่าย"
              value={stats.communities}
              tone="brand"
              icon="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5"
            />
            <PublicStat
              label="ตำบลที่ครอบคลุม"
              value={stats.tambons}
              tone="ink"
              icon="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"
            />
            <PublicStat
              label="ครัวเรือนที่ยืนยันข้อมูลแล้ว"
              value={stats.verifiedHouseholds}
              tone="mint"
              icon="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4"
              zeroNote="เริ่มการสำรวจเร็ว ๆ นี้"
            />
            <PublicStat
              label="จุดพักพิง/จุดช่วยเหลือ"
              value={stats.evacuationSites}
              tone="alert"
              icon="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 11h.01"
              zeroNote="อยู่ระหว่างรวบรวมข้อมูล"
            />
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            ตัวเลขเป็นข้อมูลภาพรวมระดับพื้นที่ — ไม่มีการเปิดเผยข้อมูลรายครัวเรือนหรือบุคคล
          </p>
        </section>

        {/* การเตรียมพร้อม — เนื้อหาความรู้ */}
        <section aria-labelledby="prepare-title" className="mt-10">
          <SectionTitle id="prepare-title" tone="alert" title="เตรียมพร้อมรับมือน้ำท่วม" />
          <div className="stagger mt-4 grid gap-4 md:grid-cols-3">
            {PREPARE_TIPS.map((tip) => (
              <article key={tip.title} className="card card-interactive p-5">
                <div className="flex items-center gap-3">
                  <span className={`${TONE_CHIP[tip.tone]} chip-md`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                      <path d={tip.icon} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h3 className="text-[15px] font-bold text-slate-900">{tip.title}</h3>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {tip.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tip.tone]}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ร่วมเป็นเครือข่าย — ทางเข้าสมัครใช้งานระบบ (มาสคอตอยู่ได้: หน้า Public) */}
        <section
          aria-labelledby="join-title"
          className="animate-slide-up relative mt-10 overflow-hidden rounded-3xl band-brand px-6 py-8 md:px-10 md:py-10"
        >
          <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center md:gap-10">
            <div className="min-w-0 flex-1">
              <span className="badge bg-white/20 text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                เปิดรับสมาชิกเครือข่าย
              </span>
              <h2 id="join-title" className="mt-3 text-2xl font-bold leading-snug text-white md:text-3xl">
                ร่วมเป็นส่วนหนึ่งของเครือข่ายสองคลอง–ควนลัง
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-50">
                สมัครขอเข้าใช้งานระบบตามบทบาทของคุณ เมื่อผู้ดูแลระบบอนุมัติแล้ว
                จึงเข้าใช้งานได้ — ช่วยกันเก็บและดูแลข้อมูลเพื่อเตรียมพร้อมรับมืออุทกภัย
              </p>

              <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {JOIN_ROLES.map((r) => (
                  <li key={r.title} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                        <path d={r.icon} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <p className="mt-2.5 text-sm font-bold text-white">{r.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-brand-100">{r.desc}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/register" className="btn btn-accent btn-lg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
                    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  สมัครใช้งานระบบ
                </Link>
                <Link
                  href="/login"
                  className="btn btn-lg border-2 border-white/40 bg-white/10 text-white hover:bg-white/20"
                >
                  มีบัญชีอยู่แล้ว เข้าสู่ระบบ
                </Link>
              </div>
            </div>
            <div className="animate-drop-in hidden shrink-0 md:block">
              <Mascot role="rescue" mood="happy" motion="float" size={132} decorative className="drop-shadow-lg" />
            </div>
          </div>
        </section>

        {/* แผนที่สาธารณะ — เส้นขอบ/หมุดชุมชน + จุดพักพิง (aggregate เท่านั้น ไม่มีรายบ้าน) */}
        <section aria-labelledby="map-title" className="mt-10">
          <SectionTitle id="map-title" tone="mint" title="แผนที่ชุมชนและจุดพักพิง" />
          {hasMapPoints ? (
            <div className="card mt-4 overflow-hidden p-3">
              <PublicMap communities={mapData.communities} sites={mapData.sites} generatedAt={mapData.generatedAt} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-3 text-xs font-medium text-slate-600">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow" />
                  ชุมชน · {mapData.communities.length.toLocaleString("th-TH")} แห่ง
                </span>
                {boundaryCount ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-5 rounded-sm border-2 border-dashed border-brand-600 bg-brand-500/10" />
                    เส้นขอบชุมชน{boundaryDraft ? " (ร่าง — อยู่ระหว่างตรวจสอบ)" : ""}
                  </span>
                ) : null}
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white bg-alert-500 shadow" />
                  จุดพักพิง / จุดอพยพ · {mapData.sites.length.toLocaleString("th-TH")} จุด
                </span>
              </div>
              <p className="px-2 pb-1 text-[11px] leading-relaxed text-slate-400">
                แผนที่แสดงเฉพาะข้อมูลภาพรวมและจุดสาธารณะ — ไม่มีตำแหน่งบ้านหรือข้อมูลรายบุคคล
              </p>
            </div>
          ) : (
            <div className="card-mist mt-4 flex flex-col items-center gap-3 px-5 py-10 text-center">
              <Mascot role="field" mood="sleep" tone="sun" motion="float" size={84} decorative />
              <h3 className="text-base font-bold text-slate-800">
                กำลังรวบรวมข้อมูลจุดพักพิงและพื้นที่เสี่ยง
              </h3>
              <p className="max-w-md text-xs leading-relaxed text-slate-600">
                แผนที่สาธารณะจะแสดงขอบเขตชุมชนและจุดอพยพเมื่อข้อมูลพร้อม —
                จะแสดงเฉพาะข้อมูลภาพรวม ไม่มีตำแหน่งรายบ้าน
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t-2 border-slate-200/70 bg-white">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-center md:px-6">
          <LogoMark size={38} className="mx-auto text-brand-600" />
          <p className="text-xs text-slate-500">
            ข้อมูลอัปเดตล่าสุด {updatedAt} · จัดทำโดยเครือข่ายสองคลอง–ควนลัง
            ร่วมกับมหาวิทยาลัยทักษิณ
          </p>
          <p className="text-[11px] leading-relaxed text-slate-400">
            ข้อมูลบนหน้านี้เป็นภาพรวมระดับพื้นที่เพื่อการเตรียมพร้อมรับมือภัยพิบัติ
            ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ — โปรดติดตามประกาศจากหน่วยงานราชการประกอบ
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ id, title, tone }: { id: string; title: string; tone: Tone }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-bold text-slate-900">
      <span className={`h-6 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {title}
    </h2>
  );
}

const TONE_ACCENT: Record<Tone, string> = {
  brand: "bg-brand-500",
  ink: "bg-ink-800",
  alert: "bg-alert-500",
  sun: "bg-sun-400",
  mint: "bg-emerald-400",
};

function PublicStat({
  label,
  value,
  tone,
  icon,
  zeroNote,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: string;
  zeroNote?: string;
}) {
  const isZero = value === 0;
  return (
    <div className="card card-interactive relative overflow-hidden p-5">
      {/* แถบสีบนสุดตามโทน — ทำให้การ์ดเด่นและอ่านหมวดได้เร็ว */}
      <span className={`absolute inset-x-0 top-0 h-1.5 ${TONE_ACCENT[tone]}`} aria-hidden="true" />
      <span className={`${TONE_CHIP[tone]} chip-lg`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
          <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p
        className={`mt-4 text-[38px] font-bold leading-none tabular-nums ${
          isZero && zeroNote ? "text-slate-300" : TONE_VALUE[tone]
        }`}
      >
        {value.toLocaleString("th-TH")}
      </p>
      <p className="mt-2 text-[13px] font-semibold leading-snug text-slate-600">{label}</p>
      {isZero && zeroNote && (
        <p className="mt-1 text-[11px] text-slate-400">{zeroNote}</p>
      )}
    </div>
  );
}
