// Pure functions — รูปแบบรหัสแบบสอบถาม (Owner Decision 2026-08-03)
//
// รูปแบบ: SK-<เลข 6 หลัก>  เช่น SK-000123
// "SK" = สงขลา · เลขเดินหน้าอย่างเดียวจาก SEQUENCE ของฐานข้อมูล ไม่รีเซ็ตตามปี
//
// เจตนาสำคัญ: **ห้ามฝังชุมชนลงในรหัส** — ชุมชนของใบแก้ไขภายหลังได้ (ผู้ตรวจอาจพบว่า
// บ้านหลังนี้อยู่คนละชุมชนกับที่ผู้คีย์เลือก) แต่รหัสถูกเขียนลงกระดาษด้วยปากกาไปแล้ว
// ถ้าฝังชุมชนไว้ รหัสจะขัดกับข้อมูลโดยแก้ไม่ได้ รหัสจึงทำหน้าที่ "ชี้ใบ" อย่างเดียว

/** ตัวนำหน้ารหัส — สงขลา */
export const SHEET_NO_PREFIX = "SK";

/** จำนวนหลักของเลขรัน — 999,999 ใบ */
export const SHEET_NO_DIGITS = 6;

/** เลขสูงสุดที่ออกได้ ตรงกับ MAXVALUE ของ sheet_no_seq */
export const SHEET_NO_MAX = 999_999;

/** รูปแบบรหัสที่ถูกต้อง ใช้ตรวจ input ที่ผู้ใช้พิมพ์เข้ามา */
export const SHEET_NO_PATTERN = /^SK-\d{6}$/;

/**
 * แปลงเลขรันเป็นรหัสเต็ม — `1` → `"SK-000001"`
 * โยน error เมื่อเลขอยู่นอกช่วงที่ออกได้ (กันรหัสผิดรูปหลุดลงฐานข้อมูล)
 */
export function formatSheetNo(running: number): string {
  if (!Number.isInteger(running) || running < 1 || running > SHEET_NO_MAX) {
    throw new RangeError(`เลขรันนอกช่วงที่ออกได้: ${running}`);
  }
  return `${SHEET_NO_PREFIX}-${String(running).padStart(SHEET_NO_DIGITS, "0")}`;
}

/**
 * normalize รหัสที่ผู้ใช้พิมพ์ (จากกระดาษ) — คืน null เมื่อรูปแบบไม่ถูกต้อง
 *
 * รองรับการพิมพ์ตามสภาพจริง: ตัวพิมพ์เล็ก เว้นวรรคหัวท้าย ลืมขีด
 * และพิมพ์เฉพาะตัวเลข (`123` → `SK-000123`) เพราะผู้คีย์มักอ่านแค่ตัวเลขจากกระดาษ
 */
export function normalizeSheetNo(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, "");
  if (SHEET_NO_PATTERN.test(raw)) return raw;

  // "SK000123" — ลืมขีด
  const noDash = raw.match(/^SK(\d{6})$/);
  if (noDash) return `${SHEET_NO_PREFIX}-${noDash[1]}`;

  // "123" หรือ "000123" — พิมพ์เฉพาะตัวเลข
  const digitsOnly = raw.match(/^(\d{1,6})$/);
  if (digitsOnly) {
    const n = Number(digitsOnly[1]);
    if (n >= 1 && n <= SHEET_NO_MAX) return formatSheetNo(n);
  }
  return null;
}
