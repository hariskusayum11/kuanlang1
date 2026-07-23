import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  EncryptionError,
  decryptJson,
  decryptText,
  encryptJson,
  encryptText,
  isEncrypted,
  normalizePhone,
  phoneBlindIndex,
  type Keyring,
} from "../../lib/crypto/encryption";

const keyring: Keyring = Object.freeze({
  v1: randomBytes(32),
  v2: randomBytes(32),
});
const otherKeyring: Keyring = Object.freeze({ v1: randomBytes(32) });

describe("encryptText / decryptText — AES-256-GCM", () => {
  it("roundtrip ข้อความไทย + อักขระพิเศษ ได้ค่าเดิม", () => {
    const plaintext = "นางสาวทดสอบ ระบบ 081-234-5678 / บ้านเลขที่ 12/3 หมู่ 4 🏠";
    const encoded = encryptText(plaintext, keyring);
    expect(decryptText(encoded, keyring)).toBe(plaintext);
  });

  it("รูปแบบ ciphertext = v1:iv:ct:tag และ isEncrypted ตรวจจับได้", () => {
    const encoded = encryptText("ข้อมูลลับ", keyring);
    expect(encoded.startsWith("v1:")).toBe(true);
    expect(encoded.split(":")).toHaveLength(4);
    expect(isEncrypted(encoded)).toBe(true);
    expect(isEncrypted("ข้อมูลลับ")).toBe(false);
    expect(isEncrypted("081-234-5678")).toBe(false);
  });

  it("iv สุ่มใหม่ทุกครั้ง — plaintext เดียวกันได้ ciphertext ต่างกัน (กัน pattern leak)", () => {
    const a = encryptText("เหมือนกัน", keyring);
    const b = encryptText("เหมือนกัน", keyring);
    expect(a).not.toBe(b);
    expect(decryptText(a, keyring)).toBe(decryptText(b, keyring));
  });

  it("ciphertext ถูกดัดแปลง → EncryptionError (GCM auth)", () => {
    const encoded = encryptText("ห้ามแก้", keyring);
    const parts = encoded.split(":");
    const ct = Buffer.from(parts[2], "base64");
    if (ct.length > 0) ct[0] = ct[0] ^ 0xff;
    parts[2] = ct.toString("base64");
    expect(() => decryptText(parts.join(":"), keyring)).toThrow(EncryptionError);
  });

  it("key ไม่ตรง → EncryptionError, เวอร์ชันที่ไม่มีใน keyring → EncryptionError", () => {
    const encoded = encryptText("ลับ", keyring);
    expect(() => decryptText(encoded, otherKeyring)).toThrow(EncryptionError);
    expect(() => decryptText("v9:AA==:AA==:AA==", keyring)).toThrow(EncryptionError);
    expect(() => decryptText("ไม่ใช่รูปแบบ", keyring)).toThrow(EncryptionError);
  });

  it("รองรับหลายเวอร์ชัน key (rotation): เข้ารหัส v2 ถอดได้ตราบใดที่ v2 อยู่ใน keyring", () => {
    const encoded = encryptText("หมุน key", keyring, "v2");
    expect(encoded.startsWith("v2:")).toBe(true);
    expect(decryptText(encoded, keyring)).toBe("หมุน key");
  });

  it("encryptJson/decryptJson roundtrip โครงสร้างฟอร์มจริง", () => {
    const payload = {
      respondentName: "ทดสอบ",
      respondentPhone: "0812345678",
      hasVulnerable: true,
      vulnerable: [{ type: "BEDRIDDEN", note: "ติดเตียง 2 ปี" }],
      memberCount: 4,
      blank: null,
    };
    const encoded = encryptJson(payload, keyring);
    expect(decryptJson(encoded, keyring)).toEqual(payload);
  });
});

describe("normalizePhone + phoneBlindIndex — จับใบซ้ำบนข้อมูลเข้ารหัส", () => {
  const indexKey = randomBytes(32);

  it("normalize: ขีด/เว้นวรรค/วงเล็บ/+66 → รูปแบบเดียวกัน", () => {
    expect(normalizePhone("081-234-5678")).toBe("0812345678");
    expect(normalizePhone("081 234 5678")).toBe("0812345678");
    expect(normalizePhone("+66812345678")).toBe("0812345678");
    expect(normalizePhone("66812345678")).toBe("0812345678");
    expect(normalizePhone("(081) 234.5678")).toBe("0812345678");
  });

  it("เบอร์เดียวกันคนละรูปแบบ → index เดียวกัน; เบอร์ต่างกัน → index ต่างกัน", () => {
    const a = phoneBlindIndex("081-234-5678", indexKey);
    const b = phoneBlindIndex("+66 81 234 5678", indexKey);
    const c = phoneBlindIndex("081-234-5679", indexKey);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // hex sha256 — ไม่มีข้อมูลเบอร์หลุด
  });

  it("คนละ key → index คนละค่า (ไม่มี key สร้างตารางเทียบไม่ได้)", () => {
    const a = phoneBlindIndex("0812345678", indexKey);
    const b = phoneBlindIndex("0812345678", randomBytes(32));
    expect(a).not.toBe(b);
  });

  it("key ขนาดผิด → EncryptionError", () => {
    expect(() => phoneBlindIndex("0812345678", randomBytes(16))).toThrow(
      EncryptionError,
    );
  });
});
