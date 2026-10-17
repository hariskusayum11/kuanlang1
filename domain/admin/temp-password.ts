// รหัสผ่านชั่วคราวที่ ADMIN ตั้งให้ผู้ใช้ (Owner Decision 2026-10-17)
// Pure Function ล้วน — รับความสุ่มเข้ามาเป็นพารามิเตอร์ จึงทดสอบผลลัพธ์ได้แน่นอน
// ผู้เรียกเป็นฝ่ายหาไบต์สุ่มจาก crypto (lib/admin/user-password.ts)

/**
 * ตัวอักษรที่ใช้ได้ — ตัด 0 O o 1 l I ออกทั้งหมด
 * เหตุผล: รหัสนี้ถูก "อ่านให้ฟังทางโทรศัพท์" หรือพิมพ์ต่อในไลน์
 * ตัวที่หน้าตาเหมือนกันทำให้ผู้ใช้ล็อกอินไม่ได้แล้วโทรกลับมาอีกรอบ
 */
export const TEMP_PASSWORD_ALPHABET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 3 กลุ่ม กลุ่มละ 4 ตัว คั่นด้วย "-" → ยาว 14 ตัว (เกินขั้นต่ำ 8 ของ passwordChangeSchema) */
export const TEMP_PASSWORD_GROUPS = 3;
export const TEMP_PASSWORD_GROUP_SIZE = 4;

/** จำนวนตัวอักษรจริง (ไม่นับขีดคั่น) */
export const TEMP_PASSWORD_CHARS = TEMP_PASSWORD_GROUPS * TEMP_PASSWORD_GROUP_SIZE;

/**
 * ไบต์สุ่มขั้นต่ำที่ควรส่งเข้ามา — เผื่อการทิ้งไบต์จาก rejection sampling
 * (ความน่าจะเป็นที่ 48 ไบต์จะไม่พอสำหรับ 12 ตัวอักษร ต่ำมากจนไม่เกิดในทางปฏิบัติ)
 */
export const TEMP_PASSWORD_RANDOM_BYTES = 48;

/**
 * แปลงไบต์สุ่มเป็นรหัสผ่านชั่วคราว เช่น `k7Rm-v4Qx-9tPb`
 *
 * ใช้ rejection sampling (ทิ้งไบต์ที่ทำให้เกิด modulo bias) แทนการ `% length` ตรง ๆ
 * เพราะ 256 หารด้วย 56 ไม่ลงตัว ตัวอักษรช่วงต้นจะถูกสุ่มเจอบ่อยกว่าช่วงท้าย
 *
 * @throws เมื่อไบต์ที่ให้มาไม่พอ — ผู้เรียกต้องส่งอย่างน้อย TEMP_PASSWORD_RANDOM_BYTES
 */
export function buildTempPassword(bytes: Uint8Array): string {
  const alphabetSize = TEMP_PASSWORD_ALPHABET.length;
  // ขอบเขตสูงสุดที่หารด้วยขนาดตัวอักษรลงตัว — ไบต์ที่เกินนี้ต้องทิ้ง
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;

  const picked: string[] = [];
  for (let i = 0; i < bytes.length && picked.length < TEMP_PASSWORD_CHARS; i += 1) {
    const byte = bytes[i]!;
    if (byte >= limit) continue; // ทิ้งเพื่อไม่ให้เกิด bias
    picked.push(TEMP_PASSWORD_ALPHABET[byte % alphabetSize]!);
  }

  if (picked.length < TEMP_PASSWORD_CHARS) {
    throw new Error("ไบต์สุ่มไม่พอสำหรับสร้างรหัสผ่านชั่วคราว");
  }

  const groups: string[] = [];
  for (let g = 0; g < TEMP_PASSWORD_GROUPS; g += 1) {
    const start = g * TEMP_PASSWORD_GROUP_SIZE;
    groups.push(picked.slice(start, start + TEMP_PASSWORD_GROUP_SIZE).join(""));
  }
  return groups.join("-");
}
