"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeIntString } from "@/lib/entry/input-format";
import { updatePopulationAction } from "@/lib/community/actions";

type Props = {
  communityId: string;
  communityName: string;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  dataSource: string | null;
  dataNote: string | null;
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md animate-rise rounded-2xl bg-white p-7 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">ข้อมูลประชากรของชุมชน</h3>
            <p className="mt-1 text-sm text-slate-500">{props.communityName}</p>

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
                <p className="text-[11px] text-slate-400">
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
                  className="field max-w-28"
                />
                <p className="text-[11px] text-slate-400">ผ่านเป้าเมื่อ Coverage &gt; ค่านี้ (ค่าเริ่มต้น 60)</p>
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
              <p role="alert" className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost btn-md">
                ยกเลิก
              </button>
              <button type="button" onClick={() => void save()} disabled={busy} className="btn btn-primary btn-md">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
