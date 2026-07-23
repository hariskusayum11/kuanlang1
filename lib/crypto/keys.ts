// โหลด encryption keys จาก environment (server-only)
// ---------------------------------------------------------------------------
// DATA_ENCRYPTION_KEY  — base64 ของ 32 bytes สำหรับ AES-256-GCM (เวอร์ชัน v1)
// SEARCH_HASH_KEY      — base64 ของ 32 bytes สำหรับ HMAC blind index (คนละ key เสมอ)
//
// สร้างค่า: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// ⚠️ Key หาย = ข้อมูลที่เข้ารหัสทั้งหมดกู้ไม่ได้ถาวร — ดูขั้นตอนสำรอง key ใน
//    docs/28-encryption-key-management.md (ต้องมีสำเนา offline อย่างน้อย 2 ชุด)
//
// แยกจาก encryption.ts เพื่อให้ pure functions ทดสอบได้โดยไม่ยุ่ง env

import { EncryptionError, type Keyring } from "./encryption";

function loadKey(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) {
    throw new EncryptionError(
      `ไม่ได้ตั้งค่า ${envName} — สร้างด้วย: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new EncryptionError(`${envName} ต้องเป็น base64 ของข้อมูล 32 bytes`);
  }
  return key;
}

let cachedKeyring: Keyring | null = null;
let cachedIndexKey: Buffer | null = null;

/** Keyring สำหรับเข้า/ถอดรหัส — ปัจจุบันมี v1 เวอร์ชันเดียว (เพิ่มเมื่อ rotate) */
export function getKeyring(): Keyring {
  if (!cachedKeyring) {
    cachedKeyring = Object.freeze({ v1: loadKey("DATA_ENCRYPTION_KEY") });
  }
  return cachedKeyring;
}

/** เวอร์ชัน key ที่ใช้เข้ารหัสข้อมูลใหม่ */
export const CURRENT_KEY_VERSION = "v1";

/** Key สำหรับ blind index (HMAC) — แยกจาก encryption key เสมอ */
export function getSearchHashKey(): Buffer {
  if (!cachedIndexKey) {
    cachedIndexKey = loadKey("SEARCH_HASH_KEY");
  }
  return cachedIndexKey;
}
