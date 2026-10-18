"use client";

import { useEffect, type ReactNode } from "react";
import { Portal } from "./portal";

/**
 * Modal กลางของระบบ — เรนเดอร์ผ่าน Portal ไปที่ <body> เสมอ
 *
 * เหตุผลที่ต้อง Portal อยู่ใน components/ui/portal.tsx (บั๊กที่เกิดซ้ำ 2 ครั้ง:
 * `transform` จาก `.stagger` และ `opacity` จาก `animate-fade-in`)
 *
 * รองรับเนื้อหาสูงเกินจอด้วย max-height + scroll ภายใน (ปุ่มยืนยันต้องกดได้เสมอ)
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  size = "md",
  children,
}: {
  open: boolean;
  /** ไม่ส่ง = ปิดด้วย Esc/คลิกพื้นหลังไม่ได้ (ใช้กับกล่องที่ต้องตัดสินใจเท่านั้น) */
  onClose?: () => void;
  labelledBy?: string;
  /** ความกว้างกล่อง — ค่าเริ่มต้น md สำหรับกล่องยืนยัน, lg สำหรับฟอร์มหลายช่อง */
  size?: "md" | "lg";
  children: ReactNode;
}) {
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

  if (!open) return null;

  return (
    <Portal>
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
      <div className={`my-auto w-full ${size === "lg" ? "max-w-2xl" : "max-w-md"}`}>{children}</div>
    </div>
    </Portal>
  );
}
