"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveDuplicateFlagAction } from "@/lib/verification/actions";

type Candidate = {
  householdId: string;
  sheetNo: string;
  communityName: string;
  houseNo: string | null;
  mooNo: number | null;
  status: string;
};

type Props = {
  householdId: string;
  candidates: Candidate[];
  canResolve: boolean;
};

const ERRORS: Record<string, string> = {
  SELF_RESOLVE: "คุณเป็นผู้คีย์ใบนี้ ต้องให้ผู้ตรวจคนอื่นเป็นผู้ตัดสิน",
  WRONG_STATUS: "สถานะใบเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า",
  ALREADY_RESOLVED: "ธงนี้ถูกผู้ตรวจคนอื่นตัดสินแล้ว กรุณารีเฟรชหน้า",
  NOT_FOUND: "ไม่พบใบนี้ในขอบเขตที่คุณรับผิดชอบ",
  NOT_ALLOWED: "คุณไม่มีสิทธิ์ตัดสินธงซ้ำ",
  UNAUTHENTICATED: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "ระบบบันทึกคำตัดสินไม่สำเร็จ กรุณาลองใหม่",
};

export function DuplicateResolutionPanel({ householdId, candidates, canResolve }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "CONFIRMED_DUPLICATE" | "NOT_DUPLICATE") {
    const message =
      decision === "CONFIRMED_DUPLICATE"
        ? "ยืนยันว่าใบนี้เป็นครัวเรือนซ้ำจริง? ใบนี้จะยังไม่นับในยอดครัวเรือน"
        : "ยืนยันว่าใบนี้ไม่ซ้ำ? ระบบจะล้างธงและอนุญาตให้ตรวจยืนยันใบต่อได้";
    if (!window.confirm(message)) return;
    setBusy(true);
    setError(null);
    const result = await resolveDuplicateFlagAction(householdId, decision);
    if (!result.ok) {
      setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-amber-950">⚠ ระบบพบที่อยู่ตรงกับใบอื่นทุกช่อง</h3>
          <p className="mt-1 text-sm text-amber-800">
            บ้านเลขที่ หมู่ ชุมชน ซอย ถนน และตำบลตรงกัน เปิดเทียบกระดาษก่อนตัดสิน
          </p>
        </div>
        {canResolve && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("NOT_DUPLICATE")}
              className="btn btn-secondary btn-sm"
            >
              ✓ ยืนยันว่าไม่ซ้ำ
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("CONFIRMED_DUPLICATE")}
              className="btn btn-danger btn-sm"
            >
              ยืนยันว่าซ้ำจริง
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-amber-200 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-amber-100/70 text-xs text-amber-950">
            <tr>
              <th className="px-4 py-2.5">ใบที่ตรงกัน</th>
              <th className="px-4 py-2.5">ชุมชน</th>
              <th className="px-4 py-2.5">บ้านเลขที่ / หมู่</th>
              <th className="px-4 py-2.5">สถานะ</th>
              <th className="px-4 py-2.5 text-right">ตรวจเทียบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {candidates.map((candidate) => (
              <tr key={candidate.householdId}>
                <td className="px-4 py-3 font-mono font-bold">{candidate.sheetNo}</td>
                <td className="px-4 py-3">{candidate.communityName}</td>
                <td className="px-4 py-3">
                  {candidate.houseNo ?? "—"} / {candidate.mooNo != null && candidate.mooNo > 0 ? candidate.mooNo : "—"}
                </td>
                <td className="px-4 py-3">{candidate.status}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/verification/${candidate.householdId}`}
                    target="_blank"
                    className="btn btn-secondary btn-sm"
                  >
                    เปิดใบ
                  </Link>
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                  ไม่พบใบที่ตรงกันในขอบเขตชุมชนที่คุณมีสิทธิ์ดู
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!canResolve && (
        <p className="mt-3 text-xs font-semibold text-amber-900">
          คุณตัดสินใบนี้ไม่ได้ เนื่องจากเป็นผู้คีย์ใบเองหรือสถานะใบไม่อยู่ระหว่างรอตรวจ
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
