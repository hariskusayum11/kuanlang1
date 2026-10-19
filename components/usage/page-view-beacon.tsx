"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// ส่งสัญญาณ "เปิดหน้า" 1 ครั้งต่อการเปลี่ยนหน้า (docs/36)
// - ส่งเฉพาะ pathname ไม่ส่ง query string (อาจมีคำค้น/ตัวกรองที่ระบุตัวบุคคล)
// - server แปลงเป็นรูปแบบเส้นทางอีกชั้น (domain/usage/page-path.ts) — ไม่เชื่อค่าจากที่นี่
// - sendBeacon ไม่บล็อกหน้า และไม่สนใจผล; ล้มเหลวก็เงียบ
// - prefetch ของ <Link> ไม่ mount หน้า จึงไม่ถูกนับ

const ENDPOINT = "/api/page-view";
/** React Strict Mode (dev) เรียก effect ซ้ำ — กันนับซ้ำของ path เดิมในช่วงสั้น ๆ */
const DEDUPE_MS = 2000;

let lastSent: { path: string; at: number } | null = null;

export function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (lastSent && lastSent.path === pathname && now - lastSent.at < DEDUPE_MS) return;
    lastSent = { path: pathname, at: now };

    try {
      const body = JSON.stringify({ path: pathname });
      if (typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        if (sent) return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // การนับต้องไม่ทำให้หน้าเว็บพัง
    }
  }, [pathname]);

  return null;
}
