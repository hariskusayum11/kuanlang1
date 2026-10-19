// Server-only: เพิ่มยอดเปิดหน้าแบบรวมรายวัน (docs/36)
// เก็บเพียง (วันตามเวลาไทย, รูปแบบเส้นทาง, กลุ่มผู้ชม) → ยอด — ไม่มี IP / UA / userId
import { PageViewAudience } from "@prisma/client";
import { prisma } from "../prisma";
import { bangkokDayKey } from "../../domain/usage/aggregate";
import { normalisePagePath } from "../../domain/usage/page-path";

export type RecordPageViewResult = "RECORDED" | "SKIPPED" | "FAILED";

/**
 * นับ 1 ครั้ง — atomic ด้วย INSERT … ON CONFLICT DO UPDATE (ไม่ต้องอ่านก่อนเขียน
 * จึงไม่มี race ระหว่างหลาย request ที่เข้ามาพร้อมกัน)
 *
 * best-effort: ห้ามโยน error ออกไป เพราะการนับต้องไม่มีวันทำให้หน้าเว็บพัง
 * และไม่ log path ดิบหรือรายละเอียด error (อาจมีข้อมูลที่ไม่ควรอยู่ใน log)
 */
export async function recordPageView(
  rawPath: unknown,
  audience: PageViewAudience,
  now: Date = new Date(),
): Promise<RecordPageViewResult> {
  const path = normalisePagePath(rawPath);
  if (!path) return "SKIPPED";
  const day = bangkokDayKey(now);
  try {
    await prisma.$executeRaw`
      INSERT INTO "page_view_daily" ("day", "path", "audience", "count")
      VALUES (${day}::date, ${path}, ${audience}::"PageViewAudience", 1)
      ON CONFLICT ("day", "path", "audience")
      DO UPDATE SET "count" = "page_view_daily"."count" + 1
    `;
    return "RECORDED";
  } catch {
    console.error("[usage] นับยอดเปิดหน้าไม่สำเร็จ");
    return "FAILED";
  }
}
