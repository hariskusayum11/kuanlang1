import { z } from "zod";

// ยืนยันบ้านพักพิง (docs/38) — ใช้ร่วมกันทั้ง client และ server
// ไม่เก็บชื่อ/เบอร์เจ้าของบ้านซ้ำในตารางจุดอพยพ (ข้อมูลติดต่ออยู่ในแบบสอบถามที่เข้ารหัสแล้ว)

const facility = z.boolean().default(false);

export const shelterFields = z.object({
  /** ชื่อที่แสดง — ห้ามใส่ชื่อเจ้าของบ้าน (แสดงบนหน้าสาธารณะได้ถ้ายินยอม) */
  name: z.string().trim().min(1, "ระบุชื่อจุดพักพิง").max(80, "ชื่อยาวเกิน 80 ตัวอักษร"),
  capacity: z.coerce.number().int("ระบุเป็นจำนวนคน").min(1, "รับได้อย่างน้อย 1 คน").max(500, "เกิน 500 คน — ตรวจตัวเลขอีกครั้ง"),
  hasToilet: facility,
  hasKitchen: facility,
  hasPowerBackup: facility,
  isAccessibleForDisabled: facility,
  /** เจ้าของยินยอมให้แสดงตำแหน่งบนแผนที่สาธารณะ — แยกจากการยินยอมเป็นจุดพักพิง (Owner Decision 2026-10-19) */
  isPublic: z.boolean(),
});

export const verifyShelterSchema = shelterFields.extend({
  householdId: z.string().min(1).max(64),
  /** ยืนยันว่าติดต่อเจ้าของบ้านแล้วจริง — กันกดยืนยันจากข้อมูลแบบสอบถามอย่างเดียว */
  ownerContacted: z.literal(true, { message: "ต้องติดต่อเจ้าของบ้านก่อนยืนยัน" }),
});

export const updateShelterSchema = shelterFields.extend({
  siteId: z.string().min(1).max(64),
});

export type VerifyShelterInput = z.infer<typeof verifyShelterSchema>;
export type UpdateShelterInput = z.infer<typeof updateShelterSchema>;

/** ชื่อเริ่มต้นแบบไม่ระบุตัวเจ้าของ */
export function defaultShelterName(communityName: string, houseNo: string | null): string {
  const community = communityName.replace(/^ชุมชน/, "").trim();
  return houseNo ? `บ้านพักพิง ${community} (${houseNo})` : `บ้านพักพิง ${community}`;
}
