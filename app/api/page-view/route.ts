import { NextResponse, type NextRequest } from "next/server";
import { PageViewAudience } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { recordPageView } from "@/lib/usage/page-view";
import { isLikelyBot } from "@/domain/usage/page-path";

// รับสัญญาณ "เปิดหน้า" จาก components/usage/page-view-beacon.tsx (docs/36)
// ตอบ 204 เสมอ ไม่ว่าจะนับหรือไม่ — client ไม่ต้องรู้ผล และหน้าเว็บต้องไม่พังเพราะการนับ
// ไม่อ่าน/ไม่เก็บ IP, User Agent (ใช้แค่คัดบอททิ้ง) หรือ userId (ใช้ session แค่แยก "Login แล้ว")

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 1024;
const bodySchema = z.object({ path: z.string().min(1).max(512) });

function done() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    if (isLikelyBot(request.headers.get("user-agent"))) return done();
    // prefetch ไม่ใช่การเปิดหน้าจริง
    const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? "";
    if (/prefetch|prerender/i.test(purpose)) return done();
    // นับเฉพาะสัญญาณจากหน้าเว็บของระบบเอง — กันเว็บอื่นยิงมาปั่นยอด
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") return done();

    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY_LENGTH) return done();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return done();
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return done();

    // กลุ่มผู้ชมตัดสินฝั่ง server จาก session จริง ไม่เชื่อค่าจาก client
    let signedIn = false;
    try {
      signedIn = Boolean(await auth.api.getSession({ headers: request.headers }));
    } catch {
      signedIn = false;
    }

    await recordPageView(parsed.data.path, signedIn ? PageViewAudience.SIGNED_IN : PageViewAudience.PUBLIC);
  } catch {
    // recordPageView กลืน error เองแล้ว — ชั้นนี้กันกรณีอื่นที่ไม่คาดคิด
  }
  return done();
}
