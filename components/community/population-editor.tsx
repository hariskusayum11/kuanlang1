"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeIntString } from "@/lib/entry/input-format";
import { updatePopulationAction } from "@/lib/community/actions";
import { Mascot } from "@/components/brand/mascot";
import { Modal } from "@/components/ui/modal";

type Props = {
  communityId: string;
  communityName: string;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  dataSource: string | null;
  dataNote: string | null;
  /** หัวหน้าชุมชนแก้ได้เฉพาะจำนวนครัวเรือน — เป้า % เป็นนโยบายของโครงการ (server บังคับซ้ำ · docs/43) */
  canEditTarget?: boolean;
};

const ERRORS: Record<string, string> = {
  NOT_ALLOWED: "ไม่มีสิทธิ์แก้ไขข้อมูลชุมชนนี้",
  NOT_FOUND: "ไม่พบชุมชนนี้ในขอบเขตของคุณ",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "ค่าที่กรอกไม่ถูกต้อง",
};

export function PopulationEditor(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(props.totalHouseholds?.toString() ?? "");
  const [target, setTarget] = useState(props.targetCoveragePercent.toString());
  const [source, setSource] = useState(props.dataSource ?? "");
  const [note, setNote] = useState(props.dataNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await updatePopulationAction(props.communityId, {
      totalHouseholds: total.trim() === "" ? null : Number(total),
      targetCoveragePercent: Number(target),
      dataSource: source.trim() || null,
      dataNote: note.trim() || null,
    });
    if (result.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    setError(("error" in result && result.error) || ERRORS[result.reason] || "เกิดข้อผิดพลาด");
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm">
        ตั้งค่าประชากร
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy="pop-editor-title">
        <div className="animate-rise rounded-3xl border-2 border-slate-200/80 bg-white p-7 shadow-lg">
            <div className="flex items-start gap-3.5">
              <Mascot role="field" mood="happy" motion="wiggle" size={56} decorative className="shrink-0" />
              <div className="min-w-0">
                <h3 id="pop-editor-title" className="text-lg font-bold text-slate-900">ข้อมูลประชากรของชุมชน</h3>
                <p className="mt-0.5 text-sm font-medium text-slate-500">{props.communityName}</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="label" htmlFor="pop-total">
                  จำนวนครัวเรือนทั้งหมด
                </label>
                <input
                  id="pop-total"
                  inputMode="numeric"
                  value={total}
                  onChange={(e) => setTotal(sanitizeIntString(e.target.value, 1_000_000))}
                  placeholder="เว้นว่าง = ยังไม่ทราบ"
                  className="field"
                />
                <p className="text-[11px] font-medium text-slate-400">
                  ตัวหารของ Coverage — เว้นว่างถ้ายังไม่ทราบ (ห้ามใส่ 0)
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="label" htmlFor="pop-target">
                  เปอร์เซ็นต์เป้าหมาย (%)
                </label>
                <input
                  id="pop-target"
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(sanitizeIntString(e.target.value, 100))}
                  readOnly={props.canEditTarget === false}
                  className="field max-w-28 read-only:bg-slate-50 read-only:text-slate-500"
                />
                <p className="text-[11px] font-medium text-slate-400">
                  ผ่านเป้าเมื่อ Coverage &gt; ค่านี้ (ค่าเริ่มต้น 60)
                  {props.canEditTarget === false ? " · กำหนดโดยผู้ดูแลระบบ" : ""}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="label" htmlFor="pop-source">
                  แหล่งที่มาข้อมูล (ถ้ามี)
                </label>
                <input
                  id="pop-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="เช่น ทะเบียนราษฎร์ 2567"
                  className="field"
                />
              </div>

              <div className="space-y-1.5">
                <label className="label" htmlFor="pop-note">
                  หมายเหตุ (ถ้ามี)
                </label>
                <input
                  id="pop-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ประมาณการจากผู้นำชุมชน"
                  className="field"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 animate-pop rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost btn-md">
                ยกเลิก
              </button>
              <button type="button" onClick={() => void save()} disabled={busy} className="btn btn-accent btn-md">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
        </div>
      </Modal>
    </>
  );
}
