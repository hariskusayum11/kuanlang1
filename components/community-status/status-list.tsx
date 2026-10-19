"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import {
  INACTIVE_STATUSES,
  PERSON_STATUS_HINTS,
  PERSON_STATUS_LABELS,
  SELECTABLE_STATUSES,
  type PersonStatus,
} from "@/domain/vulnerable/status";
import { setVulnerableStatusAction } from "@/lib/vulnerable-status/actions";
import { statusChangeSchema } from "@/lib/vulnerable-status/validation";
import type { StatusPersonRow } from "@/lib/vulnerable-status/core";

type CountFilter = "ALL" | "COUNTED" | "NOT_COUNTED";

const ERRORS: Record<string, string> = {
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์บันทึกสถานะ",
  OUT_OF_SCOPE: "บุคคลนี้ไม่อยู่ในชุมชนที่คุณดูแล",
  NOT_FOUND: "ไม่พบรายชื่อนี้แล้ว — อาจถูกแก้ไขในแบบสอบถาม กรุณาโหลดหน้าใหม่",
  UNCHANGED: "สถานะนี้ถูกบันทึกไว้อยู่แล้ว",
  CONFLICT: "มีผู้อื่นเปลี่ยนสถานะของบุคคลนี้ไปก่อน กรุณาโหลดหน้าใหม่แล้วตรวจอีกครั้ง",
  INVALID_DATE: "วันที่ไม่ถูกต้อง",
  FUTURE_DATE: "วันที่ต้องไม่อยู่ในอนาคต",
  TOO_OLD: "วันที่ย้อนหลังเกิน 5 ปี — ตรวจสอบปีอีกครั้ง (ใช้ปี ค.ศ. ในปฏิทิน)",
  INVALID: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function StatusList({
  rows,
  communities,
  selectedCommunityId,
  today,
  oldestDate,
}: {
  rows: StatusPersonRow[];
  communities: Array<{ id: string; nameTh: string }>;
  selectedCommunityId: string | null;
  today: string;
  oldestDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [countFilter, setCountFilter] = useState<CountFilter>("ALL");
  const [editing, setEditing] = useState<StatusPersonRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("th-TH");
    return rows.filter((r) => {
      if (countFilter === "COUNTED" && r.status !== "ACTIVE") return false;
      if (countFilter === "NOT_COUNTED" && r.status === "ACTIVE") return false;
      if (!q) return true;
      return (
        r.fullName.toLocaleLowerCase("th-TH").includes(q) ||
        r.houseNo.toLocaleLowerCase("th-TH").includes(q) ||
        r.sheetNo.toLocaleLowerCase("th-TH").includes(q)
      );
    });
  }, [rows, query, countFilter]);

  const showCommunity = communities.length > 1 && !selectedCommunityId;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b-2 border-slate-100 px-4 py-4 sm:px-6">
        {communities.length > 1 && (
          <label className="min-w-[12rem] flex-1 sm:flex-none">
            <span className="label">ชุมชน</span>
            <select
              className="field"
              value={selectedCommunityId ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                router.push(value ? `${pathname}?community=${encodeURIComponent(value)}` : pathname);
              }}
            >
              <option value="">ทุกชุมชนที่ดูแล</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameTh}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-[12rem] flex-1">
          <span className="label">ค้นหา</span>
          <input
            className="field"
            type="search"
            placeholder="ชื่อ บ้านเลขที่ หรือรหัสแบบสอบถาม"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="กรองตามสถานะ">
          {(
            [
              ["ALL", "ทั้งหมด"],
              ["COUNTED", "นับอยู่"],
              ["NOT_COUNTED", "ไม่นับแล้ว"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={countFilter === value}
              onClick={() => setCountFilter(value)}
              className={`btn btn-sm ${countFilter === value ? "btn-primary" : "btn-ghost"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          {rows.length === 0
            ? "ยังไม่มีรายชื่อกลุ่มเปราะบางในชุมชนนี้"
            : "ไม่พบรายชื่อที่ตรงกับการค้นหา"}
        </p>
      ) : (
        <ul className="divide-y-2 divide-slate-50">
          {filtered.map((r) => {
            const inactive = r.status !== "ACTIVE";
            return (
              <li
                key={r.personId}
                className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-6 ${inactive ? "bg-slate-50/70" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`flex flex-wrap items-center gap-2 font-semibold ${inactive ? "text-slate-500" : "text-slate-900"}`}>
                    <span className={inactive ? "line-through decoration-slate-300" : ""}>{r.fullName}</span>
                    {inactive && <span className="badge badge-neutral">{r.statusLabel}</span>}
                    {r.pendingVerification && (
                      <span className="badge badge-warning" title="แบบสอบถามยังไม่ผ่านการตรวจ — ยังไม่ถูกนับในรายงาน">
                        รอตรวจ
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      r.ageText,
                      r.houseNo ? `บ้านเลขที่ ${r.houseNo}` : "ไม่มีบ้านเลขที่",
                      r.mooNo != null && r.mooNo > 0 ? `หมู่ ${r.mooNo}` : null,
                      showCommunity ? r.communityName : null,
                      r.sheetNo,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.vulnerabilityTypes.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {r.vulnerabilityTypes.map((t) => (
                        <span key={t} className="chip chip-neutral">
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  {inactive && r.eventDate && (
                    <p className="mt-1 text-xs text-slate-500">
                      {r.statusLabel}เมื่อ {thaiDate(r.eventDate)}
                      {r.recordedByName && ` · บันทึกโดย ${r.recordedByName}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${inactive ? "btn-ghost" : "btn-secondary"}`}
                  onClick={() => setEditing(r)}
                >
                  {inactive ? "แก้สถานะ" : "เปลี่ยนสถานะ"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <StatusDialog
          key={editing.personId}
          person={editing}
          today={today}
          oldestDate={oldestDate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusDialog({
  person,
  today,
  oldestDate,
  onClose,
  onSaved,
}: {
  person: StatusPersonRow;
  today: string;
  oldestDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = SELECTABLE_STATUSES.filter((s) => s !== person.status);
  // ไม่เลือกไว้ล่วงหน้าโดยตั้งใจ — ค่าเริ่มต้น "เสียชีวิต" กดบันทึกพลาดครั้งเดียวก็ผิดร้ายแรง
  const [target, setTarget] = useState<PersonStatus | null>(null);
  const [eventDate, setEventDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsDate = target != null && (INACTIVE_STATUSES as readonly string[]).includes(target);

  async function submit() {
    setError(null);
    if (!target) {
      setError("เลือกสถานะใหม่ก่อนบันทึก");
      return;
    }
    const payload = { personId: person.personId, target, ...(needsDate ? { eventDate } : {}) };
    const parsed = statusChangeSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? ERRORS.INVALID);
      return;
    }
    if (needsDate && (eventDate > today || eventDate < oldestDate)) {
      setError(eventDate > today ? ERRORS.FUTURE_DATE : ERRORS.TOO_OLD);
      return;
    }
    setBusy(true);
    try {
      const result = await setVulnerableStatusAction(payload);
      if (result.ok) onSaved();
      else setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    } catch {
      setError(ERRORS.ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={busy ? undefined : onClose} labelledBy="status-dialog-title">
      <form
        className="card animate-pop p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <h3 id="status-dialog-title" className="text-lg font-bold text-slate-900">
          เปลี่ยนสถานะ
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {person.fullName}
          {person.houseNo && ` · บ้านเลขที่ ${person.houseNo}`}
          {" · "}
          สถานะปัจจุบัน: <strong>{person.statusLabel}</strong>
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="label">สถานะใหม่</legend>
          {options.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 ${
                target === s ? "border-brand-400 bg-brand-50" : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="target"
                value={s}
                checked={target === s}
                onChange={() => setTarget(s)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {s === "ACTIVE" ? "คืนสถานะ (นับเป็นกลุ่มเปราะบางตามเดิม)" : PERSON_STATUS_LABELS[s]}
                </span>
                <span className="block text-xs text-slate-500">{PERSON_STATUS_HINTS[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsDate && (
          <label className="mt-4 block">
            <span className="label">วันที่เกิดเหตุการณ์ (โดยประมาณได้)</span>
            <input
              className="field"
              type="date"
              required
              max={today}
              min={oldestDate}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </label>
        )}

        {target && (
        <p className="mt-4 rounded-xl bg-mist px-3 py-2 text-xs leading-relaxed text-slate-600">
          {target === "ACTIVE"
            ? "ผู้นี้จะกลับมาถูกนับในรายงาน แผนที่ และลำดับการช่วยเหลือ"
            : "ผู้นี้จะไม่ถูกนับในรายงาน แผนที่ และลำดับการช่วยเหลือทันที · ข้อมูลแบบสอบถามเดิมไม่ถูกลบ และคืนสถานะภายหลังได้"}
          {" "}ทุกการเปลี่ยนแปลงถูกบันทึกไว้ตรวจสอบย้อนหลัง
        </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary btn-md" disabled={busy || !target}>
            {busy ? "กำลังบันทึก…" : "บันทึกสถานะ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
