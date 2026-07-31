import type { ReactNode } from "react";
import {
  Mascot,
  type MascotMood,
  type MascotRole,
  type MascotTone,
} from "@/components/brand/mascot";

export type HeroTone = "brand" | "alert" | "sun" | "ink";

/* แถบสีสด (alert/sun) ใช้ตัวหนังสือน้ำเงินกรมท่าเพื่อคุม Contrast ให้ผ่าน WCAG AA
   ส่วนแถบเข้ม (brand/ink) ใช้ตัวหนังสือขาว */
const HERO_BG: Record<HeroTone, string> = {
  brand: "band-brand",
  alert: "band-alert",
  sun: "bg-sun-400",
  ink: "band-ink",
};
const HERO_SUB: Record<HeroTone, string> = {
  brand: "text-brand-50",
  alert: "text-ink-900/75",
  sun: "text-sun-900/75",
  ink: "text-brand-100",
};
const HERO_TITLE: Record<HeroTone, string> = {
  brand: "text-white",
  alert: "text-ink-900",
  sun: "text-sun-900",
  ink: "text-white",
};
const HERO_BADGE: Record<HeroTone, string> = {
  brand: "bg-white/20 text-white",
  alert: "bg-ink-900/12 text-ink-900",
  sun: "bg-sun-900/12 text-sun-900",
  ink: "bg-white/15 text-white",
};

type Props = {
  title: string;
  description?: ReactNode;
  tone?: HeroTone;
  badge?: ReactNode;
  actions?: ReactNode;
  /**
   * ตัวละครใน PageHero เป็น opt-in — ไม่ใส่ = ไม่มี (กฎ F)
   * หลังบ้านโดยปกติ "ไม่ใส่" เพราะเป็นเครื่องมือทำงาน Density สูง
   * ใส่เฉพาะหน้าฝั่งประชาชนหรือหน้าที่ต้องการน้ำเสียงเป็นมิตรจริง ๆ
   */
  mascotRole?: MascotRole;
  mascotMood?: MascotMood;
  mascotTone?: MascotTone;
  mascotSize?: number;
};

export function PageHero({
  title,
  description,
  tone = "brand",
  badge,
  actions,
  mascotRole,
  mascotMood = "happy",
  mascotTone,
  mascotSize = 84,
}: Props) {
  return (
    <div
      className={`animate-slide-up relative overflow-hidden rounded-3xl px-6 py-6 md:px-8 ${HERO_BG[tone]}`}
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className={`text-2xl font-bold ${HERO_TITLE[tone]}`}>{title}</h2>
          {description && (
            <p className={`mt-1 max-w-xl text-sm leading-relaxed ${HERO_SUB[tone]}`}>
              {description}
            </p>
          )}
          {badge && (
            <span className={`badge mt-3 ${HERO_BADGE[tone]}`}>{badge}</span>
          )}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {mascotRole && (
          <Mascot
            role={mascotRole}
            mood={mascotMood}
            tone={mascotTone}
            motion="float"
            size={mascotSize}
            decorative
            className="shrink-0 drop-shadow-lg"
          />
        )}
      </div>
    </div>
  );
}

const DOT: Record<"brand" | "alert" | "sun" | "mint", string> = {
  brand: "bg-brand-400",
  alert: "bg-alert-400",
  sun: "bg-sun-400",
  mint: "bg-emerald-400",
};

export function SectionTitle({
  title,
  tone = "brand",
  aside,
  id,
}: {
  title: string;
  tone?: keyof typeof DOT;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={id} className="flex items-center gap-2 text-base font-bold text-slate-900">
        <span className={`h-5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
        {title}
      </h3>
      {aside}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  role = "notify",
  mood = "sleep",
  tone,
  action,
}: {
  title: string;
  description?: ReactNode;
  role?: MascotRole;
  mood?: MascotMood;
  tone?: MascotTone;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Mascot role={role} mood={mood} tone={tone} motion="float" size={88} decorative />
      <p className="mt-4 text-[15px] font-bold text-slate-800">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
