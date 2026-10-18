"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * ย้าย children ไปเรนเดอร์ที่ <body> — ใช้กับทุกอย่างที่ต้องลอยเหนือทั้งหน้า
 *
 * ทำไมต้องมี (บั๊กจริงที่เกิดซ้ำ 2 ครั้ง):
 *   element ที่มี `transform`, `opacity` หรืออนิเมชันที่แตะคุณสมบัติเหล่านี้
 *   จะกลายเป็น **stacking context** และยังค้างอยู่หลังอนิเมชันจบเมื่อใช้
 *   `animation-fill-mode: both` ซึ่งคลาสชุด `animate-*` ของระบบใช้ทั้งหมด
 *   ผลคือ `position: fixed` ที่อยู่ข้างในถูก "ขัง" ไว้ใน context นั้น
 *   z-index ของมันจึงไปเทียบกับ `z-index` ของ context แทนที่จะเทียบที่ระดับหน้า
 *   → modal ถูก header (`sticky z-20`) วาดทับ และ **เพิ่ม z-index เท่าไรก็ไม่ช่วย**
 *
 *   เคสที่เจอ: `.stagger > *` (transform) และ `animate-fade-in` ที่ div ราก
 *   ของหน้าแดชบอร์ด (opacity) — ทั้งคู่แก้ได้ด้วยการ Portal ออกมาที่ body
 *
 * คืน null ระหว่าง SSR และเรนเดอร์รอบแรก เพราะ createPortal ต้องมี DOM จริง
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
