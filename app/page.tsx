import Link from "next/link";
import { APP_NAME, APP_DESCRIPTION_TH } from "@/lib/app-config";
import {
  getPublicStats,
  getPublicEmergencyContacts,
} from "@/lib/public/stats";

// Public Home — เปิดได้โดยไม่ login (CLAUDE.md: Public Portal mobile-first)
// แสดงเฉพาะ aggregate + ข้อมูลราชการ — ไม่มี PII / พิกัดรายบ้าน / Sheet ID
// ISR 5 นาที: โหลดเร็วแม้เครือข่ายช้า และไม่ยิง DB ทุก request
export const revalidate = 300;

const CATEGORY_LABEL: Record<string, string> = {
  DISASTER: "ป้องกันและบรรเทาสาธารณภัย",
  POLICE: "ตำรวจ",
  MEDICAL: "การแพทย์ฉุกเฉิน",
  MUNICIPALITY: "เทศบาล",
};

const PREPARE_TIPS = [
  {
    title: "ก่อนน้ำมา",
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
  const [stats, contacts] = await Promise.all([
    getPublicStats(),
    getPublicEmergencyContacts(),
  ]);

  const updatedAt = stats.generatedAt.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header สาธารณะ — เรียบ เข้าถึงง่าย */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              SF
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight text-slate-900">
                {APP_NAME}
              </p>
              <p className="hidden text-[11px] text-slate-500 sm:block">
                เครือข่ายสองคลอง–ควนลัง
              </p>
            </div>
          </div>
          <Link href="/login" className="btn btn-secondary btn-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <path d="M15 3h4a1 1 0 011 1v16a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            เจ้าหน้าที่เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 md:px-6">
        {/* Hero — สถานะพื้นที่ */}
        <section className="animate-slide-up py-10 text-center md:py-14">
          <span className="badge badge-brand mx-auto animate-pop">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            อยู่ระหว่างการสำรวจข้อมูลครัวเรือน
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-2xl font-bold leading-snug text-slate-900 md:text-3xl">
            ข้อมูลชุมชน พร้อมรับมืออุทกภัย
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600 md:text-base">
            {APP_DESCRIPTION_TH} — รวบรวมข้อมูลครัวเรือน กลุ่มเปราะบาง
            และทรัพยากรชุมชน เพื่อวางแผนช่วยเหลือเมื่อเกิดน้ำท่วม
          </p>
        </section>

        {/* เบอร์ฉุกเฉิน — สำคัญสุดสำหรับประชาชน จึงอยู่บนสุด */}
        <section aria-labelledby="emergency-title" className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-slate-100 bg-red-50/60 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h2 id="emergency-title" className="text-[15px] font-semibold text-slate-900">
                เบอร์ติดต่อฉุกเฉิน
              </h2>
              <p className="text-xs text-slate-500">กดที่หมายเลขเพื่อโทรได้ทันที</p>
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
                    className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {c.nameTh}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                        {c.isNationwide ? " · ทั่วประเทศ" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 font-mono text-sm font-bold text-red-700">
                      {c.phone}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* สถิติภาพรวม — aggregate เท่านั้น */}
        <section aria-labelledby="stats-title" className="mt-8">
          <h2 id="stats-title" className="text-[15px] font-semibold text-slate-900">
            ภาพรวมพื้นที่
          </h2>
          <div className="stagger mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <PublicStat label="ชุมชนในเครือข่าย" value={stats.communities} />
            <PublicStat label="ตำบลที่ครอบคลุม" value={stats.tambons} />
            <PublicStat
              label="ครัวเรือนที่ยืนยันข้อมูลแล้ว"
              value={stats.verifiedHouseholds}
              zeroNote="เริ่มการสำรวจเร็ว ๆ นี้"
            />
            <PublicStat
              label="จุดพักพิง/จุดช่วยเหลือ"
              value={stats.evacuationSites}
              zeroNote="อยู่ระหว่างรวบรวมข้อมูล"
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            ตัวเลขเป็นข้อมูลภาพรวมระดับพื้นที่ — ไม่มีการเปิดเผยข้อมูลรายครัวเรือนหรือบุคคล
          </p>
        </section>

        {/* การเตรียมพร้อม — เนื้อหาความรู้ */}
        <section aria-labelledby="prepare-title" className="mt-8">
          <h2 id="prepare-title" className="text-[15px] font-semibold text-slate-900">
            เตรียมพร้อมรับมือน้ำท่วม
          </h2>
          <div className="stagger mt-3 grid gap-4 md:grid-cols-3">
            {PREPARE_TIPS.map((tip) => (
              <article key={tip.title} className="card card-interactive p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <path d={tip.icon} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">{tip.title}</h3>
                </div>
                <ul className="mt-3 space-y-2">
                  {tip.items.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* แผนที่ — ยังไม่เปิดใช้ (ไม่แสดงข้อมูลจำลอง) */}
        <section className="card mt-8 flex flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
              <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-[15px] font-semibold text-slate-800">
            แผนที่จุดพักพิงและพื้นที่เสี่ยง
          </h2>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            จะเปิดให้ใช้งานเมื่อการสำรวจและการตรวจสอบข้อมูลพื้นที่แล้วเสร็จ —
            แผนที่สาธารณะจะแสดงเฉพาะข้อมูลภาพรวมและจุดสาธารณะ ไม่มีตำแหน่งรายบ้าน
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-center md:px-6">
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

function PublicStat({
  label,
  value,
  zeroNote,
}: {
  label: string;
  value: number;
  zeroNote?: string;
}) {
  const isZero = value === 0;
  return (
    <div className="card p-4">
      <p className="text-xs font-medium leading-snug text-slate-500">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold tabular-nums ${
          isZero && zeroNote ? "text-slate-300" : "text-slate-900"
        }`}
      >
        {value.toLocaleString("th-TH")}
      </p>
      {isZero && zeroNote && (
        <p className="mt-0.5 text-[11px] text-slate-500">{zeroNote}</p>
      )}
    </div>
  );
}
