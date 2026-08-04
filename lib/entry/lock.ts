// Lock helpers — Pure functions (unit-testable)
// กติกา: Lock ใบละ 45 นาที — ต่ออายุอัตโนมัติระหว่างคีย์ (heartbeat)
// เดิม 10 นาทีสั้นเกินไป: คอมพิวเตอร์หลับ/แท็บถูกพักทำให้ heartbeat พลาดไม่กี่ครั้งก็หมดอายุ
// แล้วเด้งกล่อง "หมดเวลา" กลางการคีย์ (Owner feedback #9) — ยืดเป็น 45 นาทีจึงมีสำรองมากพอ
// ยังคงกลไกกันผู้ใช้สองคนหยิบใบเดียวกันไว้ (CLAUDE.md) — เพียงผ่อนให้ไม่รบกวนคนที่กำลังคีย์จริง

export const LOCK_DURATION_MS = 45 * 60 * 1000;

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
