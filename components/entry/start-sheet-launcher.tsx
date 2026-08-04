"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { StartSheetForm } from "./start-sheet-form";

interface CommunityOption {
  id: string;
  nameTh: string;
}

/**
 * Primary Action ของหน้าคีย์ — ปุ่มเดียว "เพิ่มแบบสอบถาม" (Owner feedback #4)
 *
 * หน้าแรกเดิมโชว์ dropdown ชุมชน + ปุ่มเริ่มตลอดเวลา ทำให้หน้ารก
 * ย้ายขั้นตอนเลือกชุมชน + ออกรหัสไปไว้ในกล่อง Modal ที่เปิดเมื่อกดปุ่มเท่านั้น
 */
export function StartSheetLauncher({ communities }: { communities: CommunityOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="chip chip-lg chip-accent shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
              <path
                d="M8 4h9a1 1 0 011 1v15l-3-2-3 2-3-2V5a1 1 0 011-1zM9 9h6M9 13h4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">เริ่มกรอกแบบสอบถามใบใหม่</h3>
            <p className="text-sm text-slate-500">
              กด &ldquo;เพิ่มแบบสอบถาม&rdquo; เลือกชุมชนของกระดาษที่ถืออยู่ ระบบจะออกรหัสให้เขียนลงบนกระดาษ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-accent btn-lg shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          เพิ่มแบบสอบถาม
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="animate-rise rounded-3xl bg-white p-7 shadow-lg">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">เพิ่มแบบสอบถามใบใหม่</h3>
              <p className="mt-0.5 text-sm text-slate-500">
                เลือกชุมชนของกระดาษที่ถืออยู่ ระบบจะออกรหัสให้ทันที
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิด"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <StartSheetForm communities={communities} hideHeader />
        </div>
      </Modal>
    </>
  );
}
