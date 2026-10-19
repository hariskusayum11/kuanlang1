import { z } from "zod";
import { SELECTABLE_STATUSES, type PersonStatus } from "../../domain/vulnerable/status";

// ใช้ร่วมกันทั้งฝั่ง Client (ฟอร์ม) และ Server (Server Action) — ห้ามเชื่อ payload จาก client
// กฎวันที่ (ไม่อยู่ในอนาคต/ย้อนหลังไม่เกิน 5 ปี) ตรวจซ้ำที่ server ด้วย parseEventDate
// เพราะ "วันนี้" ของเครื่องผู้ใช้เชื่อถือไม่ได้

export const statusChangeSchema = z
  .object({
    personId: z.string().cuid(),
    target: z
      .string()
      .refine((v): v is PersonStatus => (SELECTABLE_STATUSES as readonly string[]).includes(v), "สถานะไม่ถูกต้อง"),
    eventDate: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target !== "ACTIVE" && !value.eventDate) {
      ctx.addIssue({ code: "custom", path: ["eventDate"], message: "ระบุวันที่เกิดเหตุการณ์" });
    }
    if (value.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate)) {
      ctx.addIssue({ code: "custom", path: ["eventDate"], message: "รูปแบบวันที่ไม่ถูกต้อง" });
    }
  });

export type StatusChangeInput = z.infer<typeof statusChangeSchema> & { target: PersonStatus };
