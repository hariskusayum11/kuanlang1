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
import {
  EmergencyContactsSection,
  ExternalLinksSection,
  JoinNetworkSection,
  PrepareTipsSection,
  PublicFooter,
  PublicSectionTitle,
  PublicStatsSection,
} from "@/components/public/home-sections";
import { listPublicExternalLinks } from "@/lib/external-links/core";

// Public Home — เปิดได้โดยไม่ login (CLAUDE.md: Public Portal mobile-first)
// แสดงเฉพาะ aggregate + ข้อมูลราชการ — ไม่มี PII / พิกัดรายบ้าน / Sheet ID
// Render ตอน request (force-dynamic): ไม่ prerender ตอน build จึง build เป็น Docker image
// ได้โดยไม่ต้องต่อ DB · และตัวเลขสาธารณะสดเสมอ (query เป็น aggregate เล็ก ๆ เร็วพออยู่แล้ว)
// หมายเหตุ: ถ้าต้องการแคชเพื่อลดภาระ DB ตอน scale ค่อยเปลี่ยนกลับเป็น ISR (revalidate)
export const dynamic = "force-dynamic";

export default async function PublicHomePage() {
  const [stats, contacts, mapData, externalLinks] = await Promise.all([
    getPublicStats(),
    getPublicEmergencyContacts(),
    getPublicMapData(),
    listPublicExternalLinks(),
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
        <EmergencyContactsSection contacts={contacts} className="mt-8" />

        {/* ลิงก์ระบบภายนอก (docs/37) — ต่อจากเบอร์ฉุกเฉิน เพราะเป็นสิ่งที่ประชาชนใช้ตามสถานการณ์ */}
        <ExternalLinksSection links={externalLinks} className="mt-10" />

        {/* สถิติภาพรวม — aggregate เท่านั้น */}
        <PublicStatsSection stats={stats} className="mt-10" />

        {/* การเตรียมพร้อม — เนื้อหาความรู้ */}
        <PrepareTipsSection className="mt-10" />

        {/* ร่วมเป็นเครือข่าย — ทางเข้าสมัครใช้งานระบบ (มาสคอตอยู่ได้: หน้า Public) */}
        <JoinNetworkSection className="mt-10" />

        {/* แผนที่สาธารณะ — เส้นขอบ/หมุดชุมชน + จุดพักพิง (aggregate เท่านั้น ไม่มีรายบ้าน) */}
        <section aria-labelledby="map-title" className="mt-10">
          <PublicSectionTitle id="map-title" tone="mint" title="แผนที่ชุมชนและจุดพักพิง" />
          {hasMapPoints ? (
            <div className="card mt-4 overflow-hidden p-3">
              <PublicMap communities={mapData.communities} sites={mapData.sites} generatedAt={mapData.generatedAt} floodGrid={mapData.floodGrid} />
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

      <PublicFooter updatedAt={updatedAt} />
    </div>
  );
}
