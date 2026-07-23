// Field-level encryption — AES-256-GCM (Owner Decision R5, อนุมัติ 2026-07-23)
// ---------------------------------------------------------------------------
// ใช้เข้ารหัสข้อมูลอ่อนไหว "ก่อนเขียน DB" เสมอ: EntryAttempt.payload,
// ฟิลด์ 🔒 บน Household/VulnerablePerson (ชื่อ/เบอร์/ข้อมูลสุขภาพ)
// → DB dump/backup ไม่เปิดเผยข้อมูลบุคคล
//
// รูปแบบ ciphertext:  v1:<iv b64>:<ciphertext b64>:<authTag b64>
// - ฝัง key version ไว้ข้างหน้า → หมุน key / ย้ายไป Cloud KMS ภายหลังได้
//   โดย re-encrypt ทีละ record ไม่ต้องรื้อ schema
// - GCM ให้ authentication ในตัว: ciphertext ถูกแก้/สลับ record → decrypt ล้มเหลวทันที
//
// Pure functions ทั้งหมด (รับ key เป็นพารามิเตอร์) — unit test ได้โดยไม่แตะ env/DB

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // มาตรฐาน GCM
const KEY_BYTES = 32; // AES-256

/** key หลายเวอร์ชันสำหรับ rotation — decrypt เลือกตาม prefix ของ ciphertext */
export type Keyring = Readonly<Record<string, Buffer>>;

export class EncryptionError extends Error {}

/** เข้ารหัสข้อความ → "v?:iv:ct:tag" (base64) — iv สุ่มใหม่ทุกครั้ง */
export function encryptText(
  plaintext: string,
  keyring: Keyring,
  version = "v1",
): string {
  const key = keyring[version];
  if (!key || key.length !== KEY_BYTES) {
    throw new EncryptionError(`ไม่พบ encryption key เวอร์ชัน ${version} หรือขนาดไม่ใช่ 32 bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/** ถอดรหัส "v?:iv:ct:tag" — โยน EncryptionError เมื่อรูปแบบผิด/ถูกดัดแปลง/key ไม่ตรง */
export function decryptText(encoded: string, keyring: Keyring): string {
  const parts = encoded.split(":");
  if (parts.length !== 4) {
    throw new EncryptionError("รูปแบบ ciphertext ไม่ถูกต้อง");
  }
  const [version, ivB64, ctB64, tagB64] = parts;
  const key = keyring[version];
  if (!key || key.length !== KEY_BYTES) {
    throw new EncryptionError(`ไม่พบ encryption key เวอร์ชัน ${version}`);
  }
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]);
    return pt.toString("utf8");
  } catch {
    // ไม่สะท้อนรายละเอียด crypto ออกไป — กัน oracle
    throw new EncryptionError("ถอดรหัสไม่สำเร็จ (ข้อมูลถูกแก้ไขหรือ key ไม่ถูกต้อง)");
  }
}

/** เข้ารหัส object เป็นก้อนเดียว (เช่น EntryAttempt.payload ทั้งฟอร์ม) */
export function encryptJson(
  value: unknown,
  keyring: Keyring,
  version = "v1",
): string {
  return encryptText(JSON.stringify(value), keyring, version);
}

export function decryptJson<T = unknown>(encoded: string, keyring: Keyring): T {
  return JSON.parse(decryptText(encoded, keyring)) as T;
}

/** ตรวจว่า string เป็น ciphertext ของเราหรือไม่ (ใช้กันเขียน plaintext ซ้ำ/ตรวจ migration) */
export function isEncrypted(value: string): boolean {
  return /^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]*:[A-Za-z0-9+/=]+$/.test(value);
}

// ---------------------------------------------------------------------------
// Blind Index — ค้นหา/จับซ้ำบนข้อมูลที่เข้ารหัสแล้ว (เริ่มที่เบอร์โทร)
// เก็บ HMAC-SHA256(normalized value) ด้วย key แยกต่างหาก — ค่า index เทียบเท่ากันได้
// แต่ย้อนกลับเป็นเบอร์จริงไม่ได้ และคนไม่มี key สร้าง index มาไล่เทียบเองไม่ได้
// ---------------------------------------------------------------------------

/** normalize เบอร์โทรไทยก่อนทำ index: ตัด -, เว้นวรรค, วงเล็บ และแปลง +66 → 0 */
export function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-().]/g, "");
  if (p.startsWith("+66")) p = `0${p.slice(3)}`;
  else if (p.startsWith("66") && p.length >= 10) p = `0${p.slice(2)}`;
  return p;
}

/** HMAC index ของเบอร์โทร (hex 64 ตัว) — เบอร์เดียวกันได้ index เดียวกันเสมอ */
export function phoneBlindIndex(phone: string, indexKey: Buffer): string {
  if (indexKey.length !== KEY_BYTES) {
    throw new EncryptionError("SEARCH_HASH_KEY ต้องมีขนาด 32 bytes");
  }
  return createHmac("sha256", indexKey)
    .update(normalizePhone(phone), "utf8")
    .digest("hex");
}
