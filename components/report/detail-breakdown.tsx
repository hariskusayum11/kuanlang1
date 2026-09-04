"use client";

// ปุ่ม "ดูรายละเอียด" ข้างแท่งที่มีช่อง "อื่นๆ" — กดแล้วเด้ง modal สรุปว่ากรอกอะไรมาบ้าง กี่คน
// aggregate (ข้อความ + จำนวน) ไม่ใช่รายชื่อ · ข้อมูลโหลดผ่าน /reports/detail-breakdown (ตรวจสิทธิ์+Audit ฝั่ง server)
import { useEffect, useRef, useState } from "react";
import type { DetailBreakdown } from "@/lib/report/detail-breakdown";

interface Payload extends DetailBreakdown {
  label: string;
  unit: string;
}

export function DetailBreakdownButton({
  kind,
  id,
  filterQuery,
}: {
  kind: "vulnerability" | "assistance" | "vehicle";
  id: string;
  filterQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const query = `kind=${kind}&id=${encodeURIComponent(id)}${filterQuery ? `&${filterQuery}` : ""}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-center shrink-0 whitespace-nowrap rounded-md border border-brand-200 px-2 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
      >
        ดูรายละเอียด
      </button>
      {open ? <Modal query={query} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Modal({ query, onClose }: { query: string; onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/reports/detail-breakdown?${query}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "โหลดข้อมูลไม่สำเร็จ");
        }
        return (await res.json()) as Payload;
      })
      .then((payload) => !cancelled && setData(payload))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const max = data && data.items.length ? data.items[0].count : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{data ? `รายละเอียด: ${data.label}` : "กำลังโหลด…"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {data
                ? `ระบุรายละเอียด ${data.withDetail.toLocaleString("th-TH")} ${data.unit} · ไม่ได้ระบุ ${data.withoutDetail.toLocaleString("th-TH")} ${data.unit}`
                : " "}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a className="btn btn-primary btn-sm" href={`/reports/detail-breakdown?${query}&format=xlsx`}>
              ดาวน์โหลด Excel
            </a>
            <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {error ? (
            <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          ) : !data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-8 w-full rounded-lg" />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อความรายละเอียดที่กรอกไว้ในกลุ่มนี้</p>
          ) : (
            <ol className="space-y-2">
              {data.items.map((item) => (
                <li key={item.text} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-sm text-slate-800">{item.text}</span>
                      <strong className="shrink-0 text-sm tabular-nums text-brand-700">{item.count.toLocaleString("th-TH")} {data.unit}</strong>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-alert-400" style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
          🔒 สรุปเชิงรวม (ไม่มีชื่อรายบุคคล) — การเปิดดูและดาวน์โหลดถูกบันทึกไว้ใน Audit Log
        </div>
      </div>
    </div>
  );
}
