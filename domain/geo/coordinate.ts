// Coordinate Parsing — Pure Functions (tests/unit/coordinate.test.ts)
// ---------------------------------------------------------------------------
// กระดาษกำหนดให้ผู้สำรวจเขียนพิกัดแบบองศาทศนิยม คั่นด้วยจุลภาค เช่น
//     7.820213, 99.943592
//
// หลักการ (QM-04):
//   - `coordinateRawText` คือ **ต้นฉบับ** — เก็บตามตัวอักษรที่เขียนมาเสมอ ห้ามแก้/จัดรูปแบบให้
//   - lat/lng เป็นค่า **derived** — จะเขียนลง DB ต่อเมื่อ parse ได้อย่างมั่นใจเท่านั้น
//   - อ่านไม่ออก/รูปแบบแปลก → ไม่เดา ปล่อยให้ Verifier ตัดสินจากค่าดิบ
//
// ห้าม hardcode ขอบเขตจังหวัด (CLAUDE.md) — ตรวจแค่ระดับ "อยู่ในประเทศไทยไหม"
// เพื่อจับพิมพ์ผิด/สลับแกน โดยไม่ผูกระบบไว้กับสงขลาหรือหาดใหญ่

/** กรอบพิกัดประเทศไทยแบบหลวม ๆ — ใช้จับค่าที่ผิดชัดเจนเท่านั้น */
export const THAILAND_BOUNDS = {
  minLat: 5.5,
  maxLat: 20.6,
  minLng: 97.3,
  maxLng: 105.7,
} as const;

export type CoordinateParseResult =
  /** อ่านได้และอยู่ในกรอบประเทศไทย — ใช้เขียนลง lat/lng ได้ */
  | { kind: "OK"; lat: number; lng: number }
  /** อ่านเป็นตัวเลขได้ แต่หลุดกรอบประเทศไทย — ไม่เขียนลง lat/lng */
  | { kind: "OUT_OF_RANGE"; lat: number; lng: number }
  /** น่าจะสลับแกน (ใส่ลองจิจูดก่อนละติจูด) — ไม่สลับให้เอง ต้องให้คนตัดสิน */
  | { kind: "SWAPPED_SUSPECT"; lat: number; lng: number }
  /** ไม่มีข้อความ */
  | { kind: "EMPTY" }
  /** อ่านเป็นคู่พิกัดไม่ได้ (เช่น DMS, เขียนเป็นคำ, ตัวเลขไม่ครบคู่) */
  | { kind: "UNPARSEABLE" };

/** ค่าอยู่ในช่วงละติจูด/ลองจิจูดของไทยหรือไม่ */
function inLatBand(v: number): boolean {
  return v >= THAILAND_BOUNDS.minLat && v <= THAILAND_BOUNDS.maxLat;
}
function inLngBand(v: number): boolean {
  return v >= THAILAND_BOUNDS.minLng && v <= THAILAND_BOUNDS.maxLng;
}

/**
 * ดึงคู่ตัวเลขทศนิยมจากข้อความที่ผู้คีย์พิมพ์
 * ยอมรับตัวคั่นหลายแบบเพื่อให้คีย์ง่าย: "7.82, 99.94" / "7.82 99.94" / "N7.82 E99.94"
 * แต่ไม่ยอมรับจุลภาคเป็นจุดทศนิยม ("7,82") เพราะกำกวมกับตัวคั่น — ปล่อยให้ Verifier ตัดสิน
 */
export function parseCoordinateText(raw: string | null | undefined): CoordinateParseResult {
  if (raw == null) return { kind: "EMPTY" };
  const text = raw.trim();
  if (text === "") return { kind: "EMPTY" };

  // ตัดอักษรทิศ/สัญลักษณ์องศาออก แต่คงเครื่องหมายลบและจุดทศนิยมไว้
  const cleaned = text
    .replace(/[NnEeSsWw]/g, " ")
    .replace(/[°º"'‘’“”]/g, " ");

  // ถ้ามีรูปแบบองศา-ลิปดา-ฟิลิปดา (เช่น 7 49 12.8) จะได้ตัวเลขเกิน 2 ตัว → ไม่เดา
  const nums = cleaned.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (nums.length !== 2) return { kind: "UNPARSEABLE" };

  const first = Number(nums[0]);
  const second = Number(nums[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return { kind: "UNPARSEABLE" };

  // ลำดับตามกระดาษคือ "ละติจูด, ลองจิจูด"
  if (inLatBand(first) && inLngBand(second)) {
    return { kind: "OK", lat: first, lng: second };
  }

  // สลับแกน: ตัวแรกอยู่ในช่วงลองจิจูด และตัวหลังอยู่ในช่วงละติจูด
  if (inLngBand(first) && inLatBand(second)) {
    return { kind: "SWAPPED_SUSPECT", lat: second, lng: first };
  }

  return { kind: "OUT_OF_RANGE", lat: first, lng: second };
}

/** ใช้ค่านี้เขียนลงคอลัมน์ latitude/longitude ได้ไหม — เฉพาะกรณีมั่นใจเท่านั้น */
export function coordinateForStorage(
  result: CoordinateParseResult,
): { lat: number; lng: number } | null {
  return result.kind === "OK" ? { lat: result.lat, lng: result.lng } : null;
}

/** ข้อความอธิบายผลให้ผู้คีย์เห็นทันทีขณะพิมพ์ */
export function describeCoordinate(result: CoordinateParseResult): {
  tone: "ok" | "warn" | "muted";
  text: string;
} {
  switch (result.kind) {
    case "OK":
      return {
        tone: "ok",
        text: `อ่านได้: ละติจูด ${result.lat} · ลองจิจูด ${result.lng}`,
      };
    case "SWAPPED_SUSPECT":
      return {
        tone: "warn",
        text: `ตัวเลขดูสลับกัน (น่าจะเป็น ละติจูด ${result.lat} · ลองจิจูด ${result.lng}) — คีย์ตามกระดาษไว้ก่อน ผู้ตรวจจะยืนยันอีกครั้ง`,
      };
    case "OUT_OF_RANGE":
      return {
        tone: "warn",
        text: `ค่าอยู่นอกพื้นที่ประเทศไทย (${result.lat}, ${result.lng}) — ทานกับกระดาษอีกครั้ง ถ้าเขียนมาแบบนี้จริงให้คีย์ตามนั้น`,
      };
    case "UNPARSEABLE":
      return {
        tone: "warn",
        text: "ยังอ่านเป็นคู่พิกัดไม่ได้ — รูปแบบบนกระดาษคือ 7.820213, 99.943592 · ถ้าเขียนมาแบบอื่นให้คีย์ตามตัวอักษร",
      };
    case "EMPTY":
      return {
        tone: "muted",
        text: "รูปแบบบนกระดาษ: 7.820213, 99.943592 — ถ้ากระดาษไม่ได้เขียนกด F3 / เขียนแต่อ่านไม่ออกกด F2",
      };
  }
}
