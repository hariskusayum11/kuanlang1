"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserCommunitiesAction } from "@/lib/admin/actions";
import { Modal } from "@/components/ui/modal";

const ERRORS: Record<string, string> = {
  PROTECTED_ACCOUNT:
    "บัญชีนี้เป็นบัญชีคุ้มครอง — ผู้ดูแลระบบทั่วไปแก้ไขไม่ได้ ต้องให้บัญชีคุ้มครองด้วยกันเป็นผู้ดำเนินการ",
  NOT_ALLOWED: "ไม่มีสิทธิ์จัดการผู้ใช้",
  USER_NOT_FOUND: "ไม่พบผู้ใช้รายนี้",
  SELF_SCOPE_CHANGE: "กำหนดชุมชนให้บัญชีของตัวเองไม่ได้ — ให้แอดมินอีกคนเป็นผู้กำหนดให้",
  INVALID_COMMUNITY: "มีชุมชนที่ไม่ถูกต้องหรือถูกปิดใช้งานแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "คำขอไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/**
 * ชุมชนที่หัวหน้าชุมชนดูแล (docs/34) — แสดงเฉพาะแถวที่มีบทบาทหัวหน้าชุมชน
 * ฝั่ง server ตรวจซ้ำทั้งสิทธิ์ บัญชีคุ้มครอง และชุมชนที่มีอยู่จริง
 */
export function UserCommunityEditor({
  userId,
  userName,
  currentCommunityIds,
  communityOptions,
  isSelf,
}: {
  userId: string;
  userName: string;
  currentCommunityIds: string[];
  communityOptions: Array<{ id: string; nameTh: string }>;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentCommunityIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = communityOptions.filter((c) => currentCommunityIds.includes(c.id)).map((c) => c.nameTh);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await setUserCommunitiesAction({ userId, communityIds: selected });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(ERRORS[result.reason] ?? ERRORS.ERROR);
      }
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-sm ${names.length === 0 ? "btn-warning" : "btn-ghost"}`}
        disabled={isSelf}
        title={isSelf ? ERRORS.SELF_SCOPE_CHANGE : undefined}
        onClick={() => {
          setSelected(currentCommunityIds);
          setError(null);
          setOpen(true);
        }}
      >
        {names.length === 0 ? "กำหนดชุมชน" : `ชุมชน: ${names.join(", ")}`}
      </button>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} labelledBy={`community-editor-${userId}`}>
        <div className="card animate-pop p-6">
          <h3 id={`community-editor-${userId}`} className="text-lg font-bold text-slate-900">
            ชุมชนที่ดูแล — {userName}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            หัวหน้าชุมชนเห็นรายชื่อกลุ่มเปราะบาง (รวมประเภทความเปราะบาง) และบันทึกสถานะได้เฉพาะชุมชนที่เลือก
          </p>
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">เลือกชุมชน</legend>
            {communityOptions.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-slate-100 px-3 py-2 hover:border-slate-200">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                  }
                />
                <span className="text-sm font-medium text-slate-800">{c.nameTh}</span>
              </label>
            ))}
          </fieldset>
          {selected.length === 0 && (
            <p className="mt-3 text-xs text-sun-800">ไม่เลือกชุมชนเลย = หัวหน้าชุมชนจะไม่เห็นรายชื่อใด ๆ</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setOpen(false)} disabled={busy}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary btn-md" onClick={() => void save()} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
