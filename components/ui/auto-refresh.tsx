"use client";

// ดึงข้อมูลหน้า (Server Components) ใหม่เป็นระยะ — ใช้กับหน้าที่ผู้คนเปิดค้างไว้ดูสถานการณ์ เช่น หน้าแรก
// - ทำเฉพาะตอนแท็บแสดงอยู่ (ไม่กินเน็ต/แบตตอนแท็บซ่อน)
// - กลับมาที่แท็บหลังพ้นรอบไปแล้ว → ดึงใหม่ทันที
// - router.refresh() คงสถานะฝั่ง client (จุดวัดที่เลือก โหมดย้อนดู การเลื่อนหน้า) ไว้ตามเดิม
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const last = useRef(Date.now());
  useEffect(() => {
    const refresh = () => {
      last.current = Date.now();
      router.refresh();
    };
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= intervalMs) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);
  return null;
}
