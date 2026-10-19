import { z } from "zod";

// ลิงก์ระบบภายนอกบนหน้าสาธารณะ (docs/37) — ใช้ร่วมกันทั้ง client (ฟอร์ม) และ server

export const EXTERNAL_LINK_CATEGORIES = ["RAIN", "WATER", "SATELLITE", "RESPONSE", "OTHER"] as const;
export type ExternalLinkCategory = (typeof EXTERNAL_LINK_CATEGORIES)[number];

export const EXTERNAL_LINK_CATEGORY_LABELS: Record<ExternalLinkCategory, string> = {
  RAIN: "ฝนและพายุ",
  WATER: "ระดับน้ำ",
  SATELLITE: "ภาพดาวเทียมน้ำท่วม",
  RESPONSE: "หน่วยงานช่วยเหลือ",
  OTHER: "อื่น ๆ",
};

/**
 * ต้องเป็น https และไม่มีช่องว่าง — กันลิงก์ javascript:/data:/http: บนหน้าสาธารณะ
 * ฐานข้อมูลมี CHECK ck_external_link_https ซ้ำอีกชั้น
 */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500, "ลิงก์ยาวเกินไป")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !/\s/.test(value) && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, "ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https://");

export const externalLinkInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().trim().min(1, "ระบุชื่อระบบ").max(80, "ชื่อยาวเกิน 80 ตัวอักษร"),
  description: z.string().trim().max(200, "คำอธิบายยาวเกิน 200 ตัวอักษร").optional(),
  url: httpsUrlSchema,
  category: z.enum(EXTERNAL_LINK_CATEGORIES, { message: "เลือกหมวด" }),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

export type ExternalLinkInput = z.infer<typeof externalLinkInputSchema>;

/** ชื่อโดเมนสำหรับแสดงใต้การ์ด — ให้ประชาชนเห็นว่าจะไปเว็บไหนก่อนกด */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
