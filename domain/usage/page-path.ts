// แปลง pathname ที่เบราว์เซอร์ส่งมา → "รูปแบบเส้นทาง" ที่ปลอดภัยต่อการนับ (docs/36)
//
// Owner Decision 2026-10-19: นับยอดเปิดหน้าแบบรวมเท่านั้น — ห้ามเก็บสิ่งที่ชี้ตัวบุคคล
// จึงใช้ whitelist ไม่ใช่ blacklist:
//   - เส้นทางที่รู้จัก → คืนรูปแบบ เช่น /verification/abc123 → /verification/[householdId]
//   - เส้นทางที่ไม่รู้จัก → OTHER_PAGE_PATH (ไม่เก็บข้อความดิบที่ client ส่งมาเด็ดขาด)
//   - API / ไฟล์ static / ไม่ใช่ path → null (ไม่นับ)
// ผลคือ table มีแถวได้ไม่เกิน (จำนวนหน้า + 1) × 2 ต่อวัน และไม่มีรหัสครัวเรือน/ใบ/query string หลุดเข้าไป
//
// ⚠️ เพิ่มหน้าใหม่ในแอป = เพิ่มแถวใน PAGE_ROUTES ด้วย มิฉะนั้นจะถูกนับรวมใน "หน้าอื่น ๆ"

export const OTHER_PAGE_PATH = "/_other";

/** ความยาวสูงสุดของ pathname ที่ยอมพิจารณา — ยาวกว่านี้ไม่ใช่การเปิดหน้าปกติ */
const MAX_RAW_PATH_LENGTH = 512;

export interface PageRoute {
  /** รูปแบบเส้นทางที่เก็บลงฐานข้อมูล (segment แบบ dynamic เขียนเป็น [ชื่อ]) */
  pattern: string;
  label: string;
}

export const PAGE_ROUTES: readonly PageRoute[] = [
  // ฝั่งประชาชน / ก่อนเข้าสู่ระบบ
  { pattern: "/", label: "หน้าแรกสาธารณะ" },
  { pattern: "/login", label: "เข้าสู่ระบบ" },
  { pattern: "/register", label: "สมัครใช้งาน" },
  { pattern: "/forgot-password", label: "ลืมรหัสผ่าน" },
  { pattern: "/reset-password", label: "ตั้งรหัสผ่านใหม่" },
  { pattern: "/verify-email", label: "ยืนยันอีเมล" },
  { pattern: "/email-verified", label: "ยืนยันอีเมลแล้ว" },
  { pattern: "/access-denied", label: "ไม่มีสิทธิ์เข้าถึง" },
  // หลังบ้าน
  { pattern: "/dashboard", label: "แดชบอร์ด" },
  { pattern: "/map", label: "แผนที่" },
  { pattern: "/communities", label: "ชุมชน" },
  { pattern: "/community-status", label: "สถานะกลุ่มเปราะบาง (หัวหน้าชุมชน)" },
  { pattern: "/households", label: "ครัวเรือน" },
  { pattern: "/surveys", label: "แบบสอบถามที่ฉันคีย์" },
  { pattern: "/surveys/entry/[sheetId]", label: "คีย์แบบสอบถาม" },
  { pattern: "/verification", label: "คิวตรวจสอบ" },
  { pattern: "/verification/[householdId]", label: "ตรวจสอบรายใบ" },
  { pattern: "/risk", label: "ความเสี่ยง" },
  { pattern: "/medical", label: "ข้อมูลสุขภาพ" },
  { pattern: "/reports", label: "รายงาน" },
  { pattern: "/keyer-performance", label: "ผลงานผู้คีย์" },
  { pattern: "/volunteer", label: "อาสาสมัคร" },
  { pattern: "/profile", label: "โปรไฟล์" },
  { pattern: "/admin", label: "ผู้ดูแลระบบ" },
  { pattern: "/admin/users", label: "จัดการผู้ใช้" },
  { pattern: "/admin/registrations", label: "คำขอสมัคร" },
  { pattern: "/admin/sheets", label: "จัดการแบบสอบถาม" },
  { pattern: "/settings", label: "ตั้งค่าระบบ" },
];

const LABELS = new Map(PAGE_ROUTES.map((route) => [route.pattern, route.label]));

const SPLIT_ROUTES = PAGE_ROUTES.map((route) => ({
  pattern: route.pattern,
  segments: route.pattern.split("/").filter(Boolean),
}));

/** segment ของ id ที่ระบบออก (cuid, เลขใบ SK-000123 ฯลฯ) — อักขระปลอดภัยเท่านั้น */
const DYNAMIC_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * pathname ดิบ → รูปแบบเส้นทาง · null = ไม่ต้องนับ
 * รับได้ทั้ง "/a/b?x=1#y" (ตัด query/fragment ทิ้ง) และ "/a/b/" (ตัด / ท้าย)
 */
export function normalisePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_RAW_PATH_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;

  const pathname = raw.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);

  // ภายในระบบ / ไม่ใช่การเปิดหน้า
  const first = segments[0] ?? "";
  if (first === "api" || first.startsWith("_next") || first === "favicon.ico") return null;
  // ไฟล์ static (มีนามสกุล) เช่น /robots.txt /logo.svg
  const last = segments[segments.length - 1] ?? "";
  if (/\.[A-Za-z0-9]{1,8}$/.test(last)) return null;

  for (const route of SPLIT_ROUTES) {
    if (route.segments.length !== segments.length) continue;
    const matches = route.segments.every((segment, index) =>
      segment.startsWith("[")
        ? DYNAMIC_SEGMENT.test(segments[index])
        : segment === segments[index],
    );
    if (matches) return route.pattern;
  }
  return OTHER_PAGE_PATH;
}

export function pagePathLabel(pattern: string): string {
  if (pattern === OTHER_PAGE_PATH) return "หน้าอื่น ๆ";
  return LABELS.get(pattern) ?? pattern;
}

/**
 * User Agent ที่น่าจะเป็นบอท/ตัวพรีวิวลิงก์ — ใช้คัดทิ้งก่อนนับ (ไม่เก็บ UA ลงฐานข้อมูล)
 * UA ว่างถือเป็นบอท เพราะเบราว์เซอร์จริงส่งมาเสมอ
 */
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|monitor/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true;
  return BOT_UA.test(userAgent);
}
