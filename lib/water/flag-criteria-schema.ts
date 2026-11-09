// Zod schema ของเกณฑ์ธงเตือนภัย — ใช้ทั้งตัวแก้ (client) และ server action / ตอนอ่านจากฐานข้อมูล
// โครงสร้างตรวจด้วย Zod · ความสมเหตุสมผล (เกณฑ์เรียงถูก ค่าสะพานครบ) ตรวจด้วย validateFlagCriteria
import { z } from "zod";
import { LEVEL_KEY_PATTERN, STATION_CODE_PATTERN } from "../../domain/water/community-flags";

const text = (max: number, label: string) => z.string().trim().max(max, `${label}ยาวเกิน ${max} ตัวอักษร`);
const msl = z.number().finite().min(-50, "ระดับต้องไม่ต่ำกว่า -50 ม.รทก.").max(200, "ระดับต้องไม่เกิน 200 ม.รทก.");

export const flagThresholdSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("belowSoffit"), meters: z.number().finite().min(0, "ระยะใต้ท้องสะพานต้องไม่ติดลบ").max(30, "ระยะใต้ท้องสะพานต้องไม่เกิน 30 ม.") }),
  z.object({ type: z.literal("deck") }),
  z.object({ type: z.literal("msl"), value: msl }),
]);

export const flagLevelSchema = z.object({
  key: z.string().regex(LEVEL_KEY_PATTERN, "รหัสระดับไม่ถูกต้อง"),
  label: text(40, "ชื่อธง").min(1, "ต้องใส่ชื่อธง"),
  title: text(80, "สถานการณ์"),
  headline: text(120, "ข้อความบนหน้าแรก"),
  action: text(300, "สิ่งที่ต้องทำ"),
  color: z.enum(["green", "yellow", "orange", "red"]),
  siren: z.boolean(),
});

export const flagBridgeSchema = z.object({
  stationCode: z.string().trim().regex(STATION_CODE_PATTERN, "รหัสสถานีไม่ถูกต้อง"),
  bridge: text(80, "ชื่อสะพาน").min(1, "ต้องใส่ชื่อสะพาน"),
  canal: text(80, "ลำน้ำ"),
  soffitMsl: msl.nullable(),
  deckMsl: msl.nullable(),
  sourceNote: text(200, "ที่มาของระดับสะพาน"),
  sourceUrl: z.string().trim().url("ลิงก์ที่มาต้องเป็น URL").max(500).nullable(),
  thresholds: z.record(z.string(), flagThresholdSchema),
});

export const flagCriteriaSchema = z.object({
  levels: z.array(flagLevelSchema).min(2, "ต้องมีอย่างน้อย 2 ระดับธง").max(8, "มีระดับธงได้ไม่เกิน 8 ระดับ"),
  bridges: z.array(flagBridgeSchema).min(1, "ต้องมีอย่างน้อย 1 สะพาน").max(12, "มีสะพานได้ไม่เกิน 12 แห่ง"),
  source: z.object({
    publisher: text(120, "ผู้กำหนดเกณฑ์"),
    url: z.string().trim().url("ลิงก์ที่มาต้องเป็น URL").max(500),
    license: text(60, "สัญญาอนุญาต"),
    note: text(300, "หมายเหตุ"),
  }),
});

/** คำขอบันทึกเวอร์ชันใหม่จากหน้าแก้เกณฑ์ */
export const flagCriteriaSaveSchema = z.object({
  baseVersionNo: z.number().int().min(0),
  reason: z.string().trim().min(3, "กรุณาใส่เหตุผลการแก้อย่างน้อย 3 ตัวอักษร").max(500, "เหตุผลยาวเกิน 500 ตัวอักษร"),
  config: flagCriteriaSchema,
});
