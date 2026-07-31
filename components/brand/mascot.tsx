/**
 * มาสคอตของ SKL-FRIS — ตัวละคร "คนอาสา" ชุดเดียว เปลี่ยนความหมายด้วยอุปกรณ์ที่ถือ
 *
 * อุปกรณ์ผูกกับ Role ใน RBAC โดยตรง — เพิ่มบทบาทใหม่ = วาดอุปกรณ์ชิ้นเดียว
 * ไม่ต้องวาดตัวละครใหม่ และแบรนด์มี "หน้า" เดียวที่คนจำได้
 *   notify = โทรโข่ง · field = คลิปบอร์ด · verify = แว่นขยาย
 *   rescue = เสื้อชูชีพ · entry = คีย์บอร์ด
 *
 * (Owner Decision 2026-07-25: ไม่ใช้มาสคอตสัตว์ — เคยลองหยดน้ำและนกเขาแล้วไม่ผ่าน
 *  หยดน้ำเพราะเป็นตัวภัยเอง ส่วนนกเขาเพราะไม่เข้ากับระบบ)
 *
 * ข้อบังคับทางเทคนิค (อย่าแก้โดยไม่อ่าน):
 *  - ห้ามใช้ <defs>/gradient — id จะชนกันเมื่อมีมาสคอตหลายตัวในหน้าเดียว
 *    ความมีมิติทำด้วยการซ้อนรูปทรงทึบ (เงาล่าง + ไฮไลต์บนซ้าย) แทน
 *  - ห้ามใช้ hook — ต้องเรนเดอร์ได้ทั้ง Server และ Client Component
 *  - โมชั่นมาจาก globals.css และถูกปิดอัตโนมัติใต้ prefers-reduced-motion
 *  - decorative=true เมื่อเป็นของประดับ (จะใส่ aria-hidden ไม่ให้ screen reader อ่านซ้ำ)
 */
import type { ReactNode } from "react";

export type MascotMood = "happy" | "wink" | "alert" | "sleep";
export type MascotTone = "brand" | "alert" | "sun" | "mint";
export type MascotMotion = "float" | "drop-in" | "wiggle" | "none";
export type MascotRole = "notify" | "field" | "verify" | "rescue" | "entry";

type Palette = { base: string; light: string; deep: string };

/* ตรงกับ @theme ใน globals.css (Civic Alert) */
const TONE: Record<MascotTone, Palette> = {
  brand: { base: "#2563eb", light: "#93b4fd", deep: "#1b2065" },
  alert: { base: "#e07038", light: "#f5c0a6", deep: "#7e3b1c" },
  sun: { base: "#edc93b", light: "#fcf2cc", deep: "#856912" },
  mint: { base: "#14b8a6", light: "#90ebdd", deep: "#0a5c56" },
};

/* สีประจำบทบาท — ผูกกับความหมายของ token สี ไม่ให้ขัดกันเอง */
const ROLE_TONE: Record<MascotRole, MascotTone> = {
  notify: "sun",
  field: "brand",
  verify: "mint",
  rescue: "alert",
  entry: "brand",
};

const ROLE_LABEL: Record<MascotRole, string> = {
  notify: "เจ้าหน้าที่แจ้งเตือนภัย",
  field: "เจ้าหน้าที่ลงพื้นที่สำรวจ",
  verify: "ผู้ตรวจสอบข้อมูล",
  rescue: "อาสาสมัครกู้ภัย",
  entry: "เจ้าหน้าที่คีย์ข้อมูล",
};

const MOTION: Record<MascotMotion, string> = {
  float: "animate-float",
  "drop-in": "animate-drop-in",
  wiggle: "animate-wiggle",
  none: "",
};

const INK = "#0b1437";
const SKIN = "#f4f7ff";
const SKIN_SHADE = "#c9d4e8";
const ALERT = "#e07038";
const ALERT_DEEP = "#a34d24";
const SUN = "#edc93b";
const PAPER = "#f4f7ff";
/** สีชุดปฏิบัติงาน — เทาอมน้ำเงินระดับกลาง อ่านออกทั้งบนพื้นขาวและพื้นกรมท่า */
const UNIFORM = "#4b5871";

type MascotProps = {
  role?: MascotRole;
  mood?: MascotMood;
  /** ทับสีประจำบทบาทเมื่อจำเป็น (เช่นวางบนพื้นสีเดียวกัน) */
  tone?: MascotTone;
  motion?: MascotMotion;
  size?: number;
  className?: string;
  /** true = เป็นของประดับ ไม่ต้องให้ screen reader อ่าน */
  decorative?: boolean;
};

export function Mascot({
  role = "notify",
  mood = "happy",
  tone,
  motion = "float",
  size = 80,
  className = "",
  decorative = false,
}: MascotProps) {
  const c = TONE[tone ?? ROLE_TONE[role]];
  const frame = { motion, size, className, decorative, label: ROLE_LABEL[role] };

  return (
    <Frame {...frame}>
      <Helper role={role} mood={mood} c={c} />
    </Frame>
  );
}

function Frame({
  motion,
  size,
  className,
  decorative,
  label,
  children,
}: {
  motion: MascotMotion;
  size: number;
  className: string;
  decorative: boolean;
  label: string;
  children: ReactNode;
}) {
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label };
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={(size * 140) / 120}
      className={`${MOTION[motion]} ${className}`}
      {...a11y}
    >
      {children}
    </svg>
  );
}

/* --------------------------------------------------------------- คนอาสา */

function Helper({
  role,
  mood,
  c,
}: {
  role: MascotRole;
  mood: MascotMood;
  c: Palette;
}) {
  return (
    <>
      <ellipse cx="60" cy="131" rx="31" ry="5" fill={INK} opacity="0.3" />

      {/* ขา + แขน — ใช้เทาอมน้ำเงินระดับกลาง (slate-600) ไม่ใช่สีเข้มของโทน
          เพราะต้องอ่านออกทั้งบนพื้นขาวและบนแถบกรมท่า (ถ้าใช้ c.deep จะกลืนพื้นเข้ม) */}
      <rect x="44" y="103" width="12" height="23" rx="6" fill={UNIFORM} />
      <rect x="64" y="103" width="12" height="23" rx="6" fill={UNIFORM} />
      <rect x="26" y="71" width="12" height="31" rx="6" fill={UNIFORM} />
      <rect x="82" y="71" width="12" height="31" rx="6" fill={UNIFORM} />

      {/* ลำตัว + เงา + ไฮไลต์ */}
      <rect x="36" y="61" width="48" height="51" rx="16" fill={c.base} />
      <path d="M36 96h48v0a16 16 0 0 1-16 16H52a16 16 0 0 1-16-16z" fill={c.deep} opacity="0.25" />
      <ellipse cx="48" cy="72" rx="8" ry="5" fill="#fff" opacity="0.22" transform="rotate(-20 48 72)" />

      {role === "rescue" && <Vest />}

      {/* หัว */}
      <circle cx="60" cy="41" r="24" fill={SKIN} />
      <path d="M36 44a24 24 0 0 0 48 0 24 24 0 0 1-48 0z" fill={SKIN_SHADE} opacity="0.55" />
      <path d="M36 41a24 24 0 0 1 48 0z" fill={c.base} />
      <rect x="27" y="37" width="27" height="7" rx="3.5" fill={c.deep} />
      <ellipse cx="50" cy="28" rx="7" ry="4" fill="#fff" opacity="0.3" transform="rotate(-20 50 28)" />

      <HelperFace mood={mood} />

      {role === "field" && <Clipboard />}
      {role === "verify" && <Magnifier />}
      {role === "entry" && <Keyboard />}
      {role === "notify" && <Megaphone alerting={mood === "alert"} />}
    </>
  );
}

function Vest() {
  return (
    <>
      <path d="M41 63h15v45h-9a6 6 0 0 1-6-6z" fill={ALERT} />
      <path d="M64 63h15v39a6 6 0 0 1-6 6h-9z" fill={ALERT} />
      <path d="M41 96h15v12h-9a6 6 0 0 1-6-6z" fill={ALERT_DEEP} opacity="0.35" />
      <path d="M64 96h15v6a6 6 0 0 1-6 6h-9z" fill={ALERT_DEEP} opacity="0.35" />
      <rect x="56" y="73" width="8" height="6" rx="2" fill={SUN} />
      <rect x="56" y="89" width="8" height="6" rx="2" fill={SUN} />
    </>
  );
}

function Clipboard() {
  return (
    <>
      <rect x="8" y="74" width="24" height="30" rx="3" fill={PAPER} stroke={INK} strokeWidth="2.2" />
      <rect x="15" y="70" width="10" height="6" rx="2" fill={ALERT} />
      <path d="M13 84h14M13 90h14M13 96h9" stroke="#8896b4" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function Magnifier() {
  return (
    <>
      <line x1="16" y1="102" x2="24" y2="94" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="30" cy="86" r="12" fill="#bfd3fe" fillOpacity="0.5" stroke={INK} strokeWidth="3" />
      <path d="M24 82q6-4 11 1" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
    </>
  );
}

function Keyboard() {
  return (
    <>
      <rect x="12" y="88" width="34" height="16" rx="3" fill={PAPER} stroke={INK} strokeWidth="2.2" />
      <path d="M17 94h8M29 94h12M17 99h24" stroke="#8896b4" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

/** โทรโข่ง — ยกประกาศเตือนภัย · เส้นเสียงจะขึ้นเฉพาะ mood="alert" (กำลังเตือนจริง) */
function Megaphone({ alerting }: { alerting: boolean }) {
  return (
    <>
      {/* ด้ามจับ */}
      <rect x="30" y="92" width="6" height="12" rx="3" fill={INK} />
      {/* ตัวลำโพงทรงกรวย เปิดไปทางซ้ายบน */}
      <path d="M30 98 L40 93 L31 54 L11 62 Z" fill={ALERT} />
      <path d="M30 98 L40 93 L36 75 L27 79 Z" fill={ALERT_DEEP} opacity="0.35" />
      {/* ขอบปากลำโพง */}
      <path d="M31 54 L11 62" stroke={SUN} strokeWidth="4" strokeLinecap="round" />
      {alerting && (
        <>
          <path d="M15 44q-5 7 0 14" stroke={SUN} strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M9 39q-6 9 0 18" stroke={SUN} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.5" />
        </>
      )}
    </>
  );
}

function HelperFace({ mood }: { mood: MascotMood }) {
  const cheeks = (
    <>
      <ellipse cx="42" cy="52" rx="4.2" ry="2.8" fill={ALERT} opacity="0.4" />
      <ellipse cx="78" cy="52" rx="4.2" ry="2.8" fill={ALERT} opacity="0.4" />
    </>
  );

  if (mood === "sleep") {
    return (
      <>
        <path d="M45 46q6 5 12 0M63 46q6 5 12 0" stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="59" r="3.2" fill={INK} opacity="0.8" />
        {cheeks}
      </>
    );
  }

  if (mood === "alert") {
    return (
      <>
        <circle cx="51" cy="46" r="4.4" fill={INK} />
        <circle cx="69" cy="46" r="4.4" fill={INK} />
        <path d="M44 34l9 3M76 34l-9 3" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M54 58q6-4 12 0" stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      </>
    );
  }

  if (mood === "wink") {
    return (
      <>
        <circle cx="51" cy="46" r="3.8" fill={INK} />
        <path d="M63 46q6-5 12 0" stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <path d="M52 56q8 8 16 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        {cheeks}
      </>
    );
  }

  return (
    <>
      <circle cx="51" cy="46" r="3.8" fill={INK} />
      <circle cx="69" cy="46" r="3.8" fill={INK} />
      <path d="M52 56q8 8 16 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      {cheeks}
    </>
  );
}
