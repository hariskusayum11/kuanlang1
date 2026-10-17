import { describe, expect, it } from "vitest";
import {
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_CHARS,
  TEMP_PASSWORD_RANDOM_BYTES,
  buildTempPassword,
} from "../../domain/admin/temp-password";

/** ไบต์สุ่มจำลอง — วนค่าคงที่เพื่อให้ผลลัพธ์ทดสอบซ้ำได้ */
function bytesFrom(values: number[], length = TEMP_PASSWORD_RANDOM_BYTES): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = values[i % values.length]!;
  return out;
}

describe("รหัสผ่านชั่วคราวที่ ADMIN ตั้งให้", () => {
  it("ได้รูปแบบ 3 กลุ่ม กลุ่มละ 4 ตัว คั่นด้วยขีด", () => {
    const password = buildTempPassword(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(password).toMatch(/^[^-]{4}-[^-]{4}-[^-]{4}$/);
    expect(password.replace(/-/g, "")).toHaveLength(TEMP_PASSWORD_CHARS);
  });

  it("ใช้เฉพาะตัวอักษรในชุดที่กำหนด (ไม่มี 0 O o 1 l I)", () => {
    const password = buildTempPassword(bytesFrom([13, 47, 99, 200, 5, 180, 77, 31]));
    for (const ch of password.replace(/-/g, "")) {
      expect(TEMP_PASSWORD_ALPHABET).toContain(ch);
    }
    expect(password).not.toMatch(/[0Oo1lI]/);
  });

  it("ยาวพอสำหรับกติกาขั้นต่ำของระบบ (8 ตัว)", () => {
    const password = buildTempPassword(bytesFrom([20, 40, 60, 80, 100, 120, 140, 160]));
    expect(password.length).toBeGreaterThanOrEqual(8);
  });

  it("ทิ้งไบต์ที่ทำให้เกิด modulo bias — ไบต์ตั้งแต่ 224 ขึ้นไปต้องไม่ถูกใช้", () => {
    // 224 คือขอบเขต (floor(256/56)*56) ไบต์ที่เกินถูกข้าม จึงต้องอ่านไบต์ถัดไปแทน
    const bytes = new Uint8Array(TEMP_PASSWORD_RANDOM_BYTES);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 2 === 0 ? 255 : 7;
    const password = buildTempPassword(bytes);
    // ทุกตัวต้องมาจากไบต์ค่า 7 → ตัวอักษรเดียวกันทั้งหมด
    const unique = new Set(password.replace(/-/g, ""));
    expect(unique.size).toBe(1);
    expect([...unique][0]).toBe(TEMP_PASSWORD_ALPHABET[7]);
  });

  it("ไบต์ไม่พอ → โยน error แทนที่จะคืนรหัสสั้นกว่าที่ควร", () => {
    expect(() => buildTempPassword(new Uint8Array([1, 2, 3]))).toThrow();
    // ไบต์ที่ถูกทิ้งทั้งหมด (>= 224) ก็ถือว่าไม่พอเช่นกัน
    expect(() => buildTempPassword(new Uint8Array(32).fill(250))).toThrow();
  });

  it("ไบต์ต่างกัน → รหัสต่างกัน", () => {
    const a = buildTempPassword(bytesFrom([3, 9, 27, 81, 50, 120, 7, 33]));
    const b = buildTempPassword(bytesFrom([4, 10, 28, 82, 51, 121, 8, 34]));
    expect(a).not.toBe(b);
  });
});
