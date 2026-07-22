// Lock helpers — Pure functions (unit-testable)
// กติกา: Lock ใบละ 10 นาที (schema comment: "Lock 10 นาที") — ต่ออายุได้ระหว่างคีย์

export const LOCK_DURATION_MS = 10 * 60 * 1000;

export function lockExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + LOCK_DURATION_MS);
}

/** ไม่มีเวลาหมดอายุ = ถือว่าหมดอายุ (ข้อมูล lock ไม่สมบูรณ์ ห้ามถือว่ายังถูกล็อก) */
export function isLockExpired(lockExpiresAt: Date | null, now: Date): boolean {
  if (!lockExpiresAt) return true;
  return lockExpiresAt.getTime() <= now.getTime();
}

export function lockRemainingMs(lockExpiresAt: Date | null, now: Date): number {
  if (!lockExpiresAt) return 0;
  return Math.max(0, lockExpiresAt.getTime() - now.getTime());
}
