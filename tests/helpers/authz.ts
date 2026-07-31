import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import type { AuthorizationContext } from "../../lib/authz/types";

/**
 * โหลด Authorization Context ของ fixture ที่ต้องเป็นบัญชี active เสมอ
 *
 * `loadAuthorizationForUser` คืน null เมื่อบัญชีถูกปิด (Owner Decision #R6-C)
 * ในเทสต์ที่ fixture ตั้งใจให้ active อยู่แล้ว การได้ null แปลว่า fixture ผิด
 * จึงโยน error ทันทีแทนที่จะปล่อยให้เทสต์ล้มด้วยข้อความที่ไม่บอกสาเหตุ
 *
 * เทสต์ที่ต้องการยืนยันพฤติกรรมของบัญชีที่ถูกปิด ให้เรียก
 * `loadAuthorizationForUser` ตรง ๆ แล้วตรวจว่าได้ null
 */
export async function loadContextOrThrow(user: {
  id: string;
  name: string;
  email: string;
}): Promise<AuthorizationContext> {
  const ctx = await loadAuthorizationForUser(user);
  if (!ctx) {
    throw new Error(
      `fixture ไม่ควรเป็นบัญชีที่ถูกปิด — loadAuthorizationForUser คืน null (${user.email})`,
    );
  }
  return ctx;
}
