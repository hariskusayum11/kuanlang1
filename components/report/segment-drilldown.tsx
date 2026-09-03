"use client";

// ปุ่มเปิด "รายชื่อของกลุ่มนี้" (Drill-down) — กดตัวเลข → เด้ง modal รายชื่อ + ปุ่มโหลด Excel
// ข้อมูลส่วนบุคคล: โหลดผ่าน /reports/segment (ตรวจ RBAC + Audit ฝั่ง server เสมอ)
import { useEffect, useRef, useState } from "react";
import type { HouseholdSegmentRow } from "@/lib/report/segment-data";
import type { VulnerableExportRow } from "@/lib/report/vulnerable-export";

interface HouseholdPayload {
  kind: "household";
  label: string;
  total: number;
  truncated: boolean;
  rows: HouseholdSegmentRow[];
}
interface PersonPayload {
  kind: "person";
  label: string;
  total: number;
  truncated: boolean;
  rows: VulnerableExportRow[];
}
type Payload = HouseholdPayload | PersonPayload;

export function SegmentDrilldown({
  segmentId,
  filterQuery,
  children,
}: {
  segmentId: string;
  filterQuery: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const query = `segment=${encodeURIComponent(segmentId)}${filterQuery ? `&${filterQuery}` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ดูรายชื่อของกลุ่มนี้"
        className="group relative w-full cursor-pointer rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {children}
        <span className="pointer-events-none absolute right-2 top-2 text-[10px] font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
          ดูรายชื่อ ›
        </span>
      </button>
      {open ? <DrilldownModal query={query} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DrilldownModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/reports/segment?${query}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "โหลดข้อมูลไม่สำเร็จ");
        }
        return (await res.json()) as Payload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{data ? data.label : "กำลังโหลด…"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {data ? `${data.total.toLocaleString("th-TH")} รายการ` : " "}
              {data?.truncated ? " · แสดง 1,000 รายการแรก (ไฟล์ Excel ได้ครบ)" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a className="btn btn-primary btn-sm" href={`/reports/segment-export?${query}`}>
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
                <div key={i} className="skeleton h-9 w-full rounded-lg" />
              ))}
            </div>
          ) : data.total === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">ไม่มีรายชื่อในกลุ่มนี้ตามตัวกรองปัจจุบัน</p>
          ) : data.kind === "person" ? (
            <PersonTable rows={data.rows} />
          ) : (
            <HouseholdTable rows={data.rows} />
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
          🔒 ข้อมูลส่วนบุคคล — การเปิดดูและการดาวน์โหลดถูกบันทึกไว้ใน Audit Log
        </div>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2 align-top ${mono ? "tabular-nums" : ""}`}>{children || "-"}</td>;
}

function HouseholdTable({ rows }: { rows: HouseholdSegmentRow[] }) {
  const withDetail = rows.some((r) => r.detail);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b-2 border-slate-100 text-xs text-slate-500">
          <tr>
            <Th>#</Th>
            <Th>ชื่อผู้ให้ข้อมูล</Th>
            <Th>เบอร์โทร</Th>
            <Th>ที่อยู่</Th>
            <Th>ชุมชน</Th>
            <Th>วันที่สำรวจ</Th>
            <Th>สถานะ</Th>
            {withDetail ? <Th>รายละเอียด (อื่นๆ)</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq} className="border-b border-slate-100">
              <Td mono>{r.seq}</Td>
              <Td>{r.respondentName}</Td>
              <Td mono>{r.respondentPhone}</Td>
              <Td>{addressText(r)}</Td>
              <Td>{r.community}</Td>
              <Td mono>{r.surveyedAt}</Td>
              <Td>{r.status}</Td>
              {withDetail ? <Td>{r.detail}</Td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonTable({ rows }: { rows: VulnerableExportRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b-2 border-slate-100 text-xs text-slate-500">
          <tr>
            <Th>#</Th>
            <Th>ชื่อ - นามสกุล</Th>
            <Th>อายุ</Th>
            <Th>โรค / ลักษณะความเปราะบาง</Th>
            <Th>ระดับเร่งด่วน</Th>
            <Th>ที่อยู่</Th>
            <Th>ชุมชน</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.sheetNo}-${r.seq}-${i}`} className="border-b border-slate-100">
              <Td mono>{i + 1}</Td>
              <Td>{r.fullName}</Td>
              <Td mono>{r.ageText}</Td>
              <Td>{r.diseases}</Td>
              <Td>{r.triage}</Td>
              <Td>{personAddress(r)}</Td>
              <Td>{r.community}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function addressText(r: HouseholdSegmentRow): string {
  return [
    r.houseNo && `บ้านเลขที่ ${r.houseNo}`,
    r.mooNo && `หมู่ ${r.mooNo}`,
    r.soi && `ซ.${r.soi}`,
    r.road && `ถ.${r.road}`,
    r.tambon && `ต.${r.tambon}`,
  ]
    .filter(Boolean)
    .join(" ");
}
function personAddress(r: VulnerableExportRow): string {
  return [
    r.houseNo && `บ้านเลขที่ ${r.houseNo}`,
    r.mooNo && `หมู่ ${r.mooNo}`,
    r.soi && `ซ.${r.soi}`,
    r.road && `ถ.${r.road}`,
    r.tambon && `ต.${r.tambon}`,
  ]
    .filter(Boolean)
    .join(" ");
}
