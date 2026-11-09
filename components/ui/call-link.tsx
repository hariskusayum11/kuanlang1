"use client";

// ลิงก์โทรออกแบบต้องยืนยันก่อน (Owner Decision 2026-11-09 · docs/44)
// กดครั้งแรกเปิดกล่อง "โทรหา … ใช่ไหม" → กด "โทรเลย" จึงโทร — กันกดโดนโดยไม่ตั้งใจ (โดยเฉพาะบนมือถือขณะเลื่อนหน้า)
// เบอร์ที่ใช้โทร = ตัวเลขและ + เท่านั้น (ตัดช่องว่าง/ขีดออก)
import { useId, useState, type ReactNode } from "react";
import { Modal } from "./modal";

export function CallLink({
  phone,
  name,
  className,
  children,
}: {
  phone: string;
  /** ชื่อปลายทาง เช่น "สายด่วน ปภ." หรือชื่ออาสาสมัคร — แสดงในกล่องยืนยัน */
  name: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dial = phone.replace(/[^\d+]/g, "");
  if (!dial) return <span className={className}>{children}</span>;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`โทรหา ${name} ${phone}`}>
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="card space-y-4 p-6 text-center">
          <h2 id={titleId} className="text-lg font-bold text-ink-900">โทรออกใช่ไหม</h2>
          <div>
            <p className="text-sm text-slate-600">{name}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-ink-900">{phone}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-center">
            {/* ปิดกล่องหลังกด — กลับมาที่หน้าเดิมหลังวางสาย */}
            <a href={`tel:${dial}`} className="btn btn-primary btn-lg" onClick={() => setOpen(false)}>
              โทรเลย
            </a>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setOpen(false)} autoFocus>
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
