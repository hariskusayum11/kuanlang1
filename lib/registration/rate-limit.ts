// Rate limiter สำหรับ "การยื่นคำขอลงทะเบียน" (server action — ไม่ผ่าน /api/auth
// จึงพึ่ง rate limit ของ Better Auth ไม่ได้ ต้องคุมเองที่ชั้นนี้)
// in-memory ต่อ instance — เพียงพอช่วงเริ่มระบบ เช่นเดียวกับ rate limit ใน lib/auth.ts

export const REGISTRATION_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 ชั่วโมง
  max: 5, // 5 คำขอ/ชม. ต่อ IP — สอดคล้อง /sign-up/email rule ใน lib/auth.ts
} as const;

interface Bucket {
  windowStartedAt: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/**
 * ตรวจและนับโควตาการยื่นคำขอของ key (เช่น IP) — คืน true เมื่อยังยื่นได้
 * Pure ต่อพารามิเตอร์ now เพื่อให้ unit test ได้โดยไม่ต้องรอเวลาจริง
 */
export function consumeRegistrationQuota(
  key: string,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartedAt >= REGISTRATION_RATE_LIMIT.windowMs) {
    buckets.set(key, { windowStartedAt: now, count: 1 });
    // โอกาสเดียวกันนี้ เก็บกวาด bucket เก่าที่หมดอายุ กัน Map โตไม่จำกัด
    for (const [k, b] of buckets) {
      if (now - b.windowStartedAt >= REGISTRATION_RATE_LIMIT.windowMs) buckets.delete(k);
    }
    return true;
  }
  if (bucket.count >= REGISTRATION_RATE_LIMIT.max) return false;
  bucket.count += 1;
  return true;
}

/** สำหรับ test เท่านั้น — ล้างสถานะทั้งหมด */
export function resetRegistrationQuota(): void {
  buckets.clear();
}
