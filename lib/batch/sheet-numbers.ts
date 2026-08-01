// Pure functions — แปลง "ข้อความเลขใบ" ที่เจ้าหน้าที่กรอกตอนรับปึก → รายการเลขใบ
// รองรับ 2 รูปแบบผสมกันได้ในช่องเดียว (คั่นด้วย , เว้นวรรค หรือขึ้นบรรทัดใหม่):
//   - ช่วงเลข:  "101-150"  (ตัวเลขล้วนทั้งสองฝั่ง, นับรวมปลายทาง, คงศูนย์นำหน้าตามฝั่งซ้าย)
//   - เลขเดี่ยว: "137", "A-22" (ตัวอักษร/ตัวเลข/ขีด)
// unit test ได้ตรง ไม่แตะ DB

/** เพดานจำนวนใบต่อปึก — กันพิมพ์ช่วงผิด (เช่น 1-50000) แล้วสร้าง row มหาศาล */
export const MAX_SHEETS_PER_BATCH = 1000;

export type ParseSheetNumbersResult =
  | { ok: true; numbers: string[] }
  | {
      ok: false;
      reason: "EMPTY" | "BAD_TOKEN" | "BAD_RANGE" | "DUPLICATE" | "TOO_MANY";
      /** token/เลขที่เป็นปัญหา (สำหรับแสดงให้ผู้ใช้แก้ถูกจุด) */
      offending?: string;
    };

const RANGE_RE = /^(\d{1,6})-(\d{1,6})$/;
// เลขเดี่ยว: ตัวอักษร/ตัวเลข/ขีด ยาว 1-32 (ตรงกับกติกา sheet code ของหน้า entry)
const SINGLE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

/** normalize เลขใบเดี่ยว (กติกาเดียวกับตอนรับปึก) — รูปแบบไม่ถูกต้อง → null */
export function normalizeSheetNo(input: string): string | null {
  const value = input.trim().toUpperCase();
  return SINGLE_RE.test(value) ? value : null;
}

/**
 * แปลงข้อความเป็นรายการเลขใบ (normalize เป็นตัวพิมพ์ใหญ่ ตัดช่องว่าง)
 * เลขซ้ำ = error ทันที (สะท้อนความผิดปกติของกระดาษจริง ไม่เงียบทิ้ง)
 */
export function parseSheetNumbers(input: string): ParseSheetNumbersResult {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, reason: "EMPTY" };

  const numbers: string[] = [];
  const seen = new Set<string>();

  const push = (value: string): ParseSheetNumbersResult | null => {
    if (seen.has(value)) return { ok: false, reason: "DUPLICATE", offending: value };
    seen.add(value);
    numbers.push(value);
    if (numbers.length > MAX_SHEETS_PER_BATCH) {
      return { ok: false, reason: "TOO_MANY" };
    }
    return null;
  };

  for (const token of tokens) {
    const range = RANGE_RE.exec(token);
    if (range) {
      const [, rawStart, rawEnd] = range;
      const start = Number(rawStart);
      const end = Number(rawEnd);
      if (end < start) return { ok: false, reason: "BAD_RANGE", offending: token };
      if (end - start + 1 > MAX_SHEETS_PER_BATCH) {
        return { ok: false, reason: "TOO_MANY", offending: token };
      }
      // คงศูนย์นำหน้าตามความยาวฝั่งซ้าย เช่น 001-050 → 001..050
      const width = rawStart.length;
      for (let n = start; n <= end; n += 1) {
        const err = push(String(n).padStart(width, "0"));
        if (err) return err;
      }
      continue;
    }
    if (SINGLE_RE.test(token)) {
      const err = push(token);
      if (err) return err;
      continue;
    }
    return { ok: false, reason: "BAD_TOKEN", offending: token };
  }

  return { ok: true, numbers };
}

/** ข้อความ error ภาษาไทยสำหรับแสดงในฟอร์ม (ใช้ทั้ง client preview และ server) */
export function parseErrorMessage(
  result: Extract<ParseSheetNumbersResult, { ok: false }>,
): string {
  switch (result.reason) {
    case "EMPTY":
      return "กรุณากรอกเลขใบอย่างน้อย 1 รายการ";
    case "BAD_TOKEN":
      return `รูปแบบเลขไม่ถูกต้อง: "${result.offending}"`;
    case "BAD_RANGE":
      return `ช่วงเลขไม่ถูกต้อง (เลขท้ายต้องไม่น้อยกว่าเลขต้น): "${result.offending}"`;
    case "DUPLICATE":
      return `เลขซ้ำ: "${result.offending}" — ตรวจกระดาษปึกนี้อีกครั้ง`;
    case "TOO_MANY":
      return `เกินเพดาน ${MAX_SHEETS_PER_BATCH.toLocaleString("th-TH")} ใบต่อปึก — แบ่งเป็นหลายปึก`;
  }
}
