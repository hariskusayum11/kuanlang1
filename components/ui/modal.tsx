"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Modal กลางของระบบ — เรนเดอร์ผ่าน Portal ไปที่ <body> เสมอ
 *
 * เหตุผลที่ต้อง Portal (บั๊กจริงที่เคยเกิด):
 *   `.stagger > *` ใช้ `animation: slide-up ... both` ซึ่ง keyframe มี `transform`
 *   และ fill-mode `both` ทำให้ transform ค้างอยู่หลังอนิเมชันจบ
 *   ตาม CSS spec element ที่มี transform != none จะกลายเป็น containing block
 *   ของลูกที่เป็น `position: fixed` → modal ไปยึดขอบการ์ดแทนขอบจอ แล้วถูกตัดจนกดปุ่มไม่ได้
 *   การ Portal ออกไปที่ body ตัดปัญหานี้ทั้งหมด ไม่ว่าจะถูกวางไว้ใต้ ancestor แบบไหน
 *
 * รองรับเนื้อหาสูงเกินจอด้วย max-height + scroll ภายใน (ปุ่มยืนยันต้องกดได้เสมอ)
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  /** ไม่ส่ง = ปิดด้วย Esc/คลิกพื้นหลังไม่ได้ (ใช้กับกล่องที่ต้องตัดสินใจเท่านั้น) */
  onClose?: () => void;
  labelledBy?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ปิดด้วย Esc + ล็อกการเลื่อนพื้นหลังระหว่างเปิด
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(e) => {
        // ปิดเมื่อคลิกพื้นหลังเท่านั้น (ไม่ใช่คลิกในกล่องแล้วลากออกมาปล่อย)
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="my-auto w-full max-w-md">{children}</div>
    </div>,
    document.body,
  );
}
