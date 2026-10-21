"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { SectionTitle } from "@/components/layout/page-hero";
import { Modal } from "@/components/ui/modal";
import { RuleEditor, type RuleEditorProps } from "./rule-editor";

/**
 * กล่อง "เกณฑ์ที่ใช้" บนหน้าที่ใช้กฎจริง (/medical /risk · docs/40)
 * สรุปเห็นทันที · "ดูเกณฑ์ทั้งหมด" กางรายละเอียดในที่ · ADMIN กด "แก้เกณฑ์" เปิดตัวแก้ใน Modal
 * `editor` = null เมื่อไม่มีสิทธิ์ — การซ่อนปุ่มไม่ใช่การกันสิทธิ์ server action ตรวจซ้ำเสมอ (lib/rules/core.ts)
 */
export function RulesPanel({
  id,
  title,
  status,
  isDraft,
  summary,
  details,
  editor,
}: {
  id: string;
  title: string;
  status: string;
  isDraft: boolean;
  summary: ReactNode;
  details: ReactNode;
  editor: RuleEditorProps | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const detailsId = useId();
  const editorTitleId = useId();

  return (
    <section id={id} className="card scroll-mt-24 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-6 py-4">
        <SectionTitle
          title={title}
          tone="brand"
          aside={<span className={`badge ${isDraft ? "badge-warning" : "badge-success"}`}>{status}</span>}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "ซ่อนรายละเอียด" : "ดูเกณฑ์ทั้งหมด"}
          </button>
          {editor ? (
            <button type="button" className="btn btn-accent btn-sm" onClick={() => { setSaved(null); setEditing(true); }}>
              แก้เกณฑ์
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-6">
        {saved ? <p role="status" className="text-sm font-semibold text-emerald-700">{saved}</p> : null}
        {summary}
        <div id={detailsId} hidden={!expanded} className="space-y-6 border-t-2 border-slate-100 pt-5">
          {details}
          <p className="text-xs text-slate-500">
            {editor ? "การแก้ทุกครั้งสร้างเวอร์ชันใหม่ พร้อมผู้แก้ เวลา เหตุผล และค่าก่อน/หลัง · " : "การแก้เกณฑ์ทำได้เฉพาะผู้ดูแลระบบ · "}
            <Link href="/priority-rules" className="font-semibold text-brand-700 underline underline-offset-2">เปิดหน้ากฎการจัดลำดับฉบับเต็ม</Link>
          </p>
        </div>
      </div>

      {editor ? (
        <Modal open={editing} onClose={() => setEditing(false)} labelledBy={editorTitleId} size="xl">
          <RuleEditor
            {...editor}
            titleId={editorTitleId}
            onDone={(message) => { setEditing(false); if (message) setSaved(message); }}
          />
        </Modal>
      ) : null}
    </section>
  );
}
