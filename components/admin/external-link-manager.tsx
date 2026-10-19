"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { saveExternalLinkAction, setExternalLinkActiveAction } from "@/lib/external-links/actions";
import {
  EXTERNAL_LINK_CATEGORIES,
  EXTERNAL_LINK_CATEGORY_LABELS,
  externalLinkInputSchema,
  linkHost,
  type ExternalLinkCategory,
} from "@/lib/external-links/validation";
import type { ExternalLinkRow } from "@/lib/external-links/core";

type Draft = { id?: string; title: string; description: string; url: string; category: ExternalLinkCategory; sortOrder: string };

const EMPTY: Draft = { title: "", description: "", url: "https://", category: "WATER", sortOrder: "100" };

const ERRORS: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์จัดการลิงก์",
  NOT_FOUND: "ไม่พบลิงก์นี้แล้ว — โหลดหน้าใหม่",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  INVALID: "ข้อมูลไม่ถูกต้อง",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/** จัดการลิงก์ระบบภายนอกบนหน้าสาธารณะ (docs/37) — ไม่มีการลบจริง ใช้ปิดการแสดงผลแทน */
export function ExternalLinkManager({ links }: { links: ExternalLinkRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setError(null);
    const payload = { ...draft, description: draft.description || undefined, sortOrder: Number(draft.sortOrder) };
    const parsed = externalLinkInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? ERRORS.INVALID);
      return;
    }
    setBusy(true);
    try {
      const result = await saveExternalLinkAction(payload);
      if (result.ok) {
        setDraft(null);
        router.refresh();
      } else {
        setError(("message" in result && result.message) || ERRORS[result.reason] || ERRORS.ERROR);
      }
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(link: ExternalLinkRow) {
    setBusy(true);
    try {
      const result = await setExternalLinkActiveAction({ id: link.id, isActive: !link.isActive });
      if (result.ok) router.refresh();
      else setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end border-b-2 border-slate-100 px-6 py-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setError(null); setDraft(EMPTY); }}>
          + เพิ่มลิงก์
        </button>
      </div>
      {links.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">ยังไม่มีลิงก์ — กด “เพิ่มลิงก์” เพื่อเริ่ม</p>
      ) : (
        <ul className="divide-y-2 divide-slate-50">
          {links.map((link) => (
            <li key={link.id} className={`flex flex-wrap items-center justify-between gap-3 px-6 py-3 ${link.isActive ? "" : "bg-slate-50/70"}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {link.title}
                  <span className="badge badge-brand">{EXTERNAL_LINK_CATEGORY_LABELS[link.category]}</span>
                  {!link.isActive && <span className="badge badge-neutral">ซ่อนอยู่</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {link.description ? `${link.description} · ` : ""}
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline underline-offset-2">{linkHost(link.url)}</a>
                  {" · "}ลำดับ {link.sortOrder}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setDraft({ id: link.id, title: link.title, description: link.description ?? "", url: link.url, category: link.category, sortOrder: String(link.sortOrder) });
                  }}
                >
                  แก้ไข
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void toggle(link)}>
                  {link.isActive ? "ซ่อน" : "แสดง"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && !draft && <p role="alert" className="px-6 py-3 text-sm font-medium text-red-700">{error}</p>}

      <Modal open={draft !== null} onClose={busy ? undefined : () => setDraft(null)} labelledBy="external-link-title" size="lg">
        {draft && (
          <form
            className="card animate-pop space-y-4 p-6"
            onSubmit={(e) => { e.preventDefault(); void save(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}
          >
            <h3 id="external-link-title" className="text-lg font-bold text-slate-900">{draft.id ? "แก้ไขลิงก์" : "เพิ่มลิงก์"}</h3>
            <label className="block">
              <span className="label">ชื่อระบบ</span>
              <input className="field" value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="เรดาร์ตรวจอากาศหาดใหญ่" required />
            </label>
            <label className="block">
              <span className="label">คำอธิบายสั้น (ไม่บังคับ)</span>
              <input className="field" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="ดูกลุ่มฝนเคลื่อนที่ย้อนหลัง 2 ชั่วโมง" />
            </label>
            <label className="block">
              <span className="label">ลิงก์ (https:// เท่านั้น)</span>
              <input className="field" type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">หมวด</span>
                <select className="field" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExternalLinkCategory })}>
                  {EXTERNAL_LINK_CATEGORIES.map((c) => <option key={c} value={c}>{EXTERNAL_LINK_CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">ลำดับการแสดง (น้อยขึ้นก่อน)</span>
                <input className="field" type="number" min={0} max={999} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
              </label>
            </div>
            {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-md" onClick={() => setDraft(null)} disabled={busy}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary btn-md" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
