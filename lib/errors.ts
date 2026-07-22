// ข้อความ error ที่ปลอดภัยต่อผู้ใช้ — ห้ามหลุด stack trace / DATABASE_URL / รายละเอียดภายใน
export const SAFE_ERROR_MESSAGES = {
  generic: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง",
  database: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
  login: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  rateLimited: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
} as const;

/** แปลง error ใด ๆ เป็นข้อความกลางสำหรับแสดงผู้ใช้ — ไม่สะท้อนเนื้อหา error เดิมออกไป */
export function safeErrorMessage(_error: unknown): string {
  return SAFE_ERROR_MESSAGES.generic;
}
