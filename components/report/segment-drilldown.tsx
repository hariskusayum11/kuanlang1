"use client";

// ปุ่มเปิด "รายชื่อของกลุ่มนี้" (Drill-down) — กดตัวเลข → เด้ง modal รายชื่อ + ปุ่มโหลด Excel
// ข้อมูลส่วนบุคคล: โหลดผ่าน /reports/segment (ตรวจ RBAC + Audit ฝั่ง server เสมอ)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdSegmentRow } from "@/lib/report/segment-data";
import type { VulnerableExportRow } from "@/lib/report/vulnerable-export";
import { isTriageBelowRecommendation, TRIAGE_LABEL } from "@/domain/triage";

interface HouseholdPayload {
  kind: "household";
  label: string;
  total: number;
  truncated: boolean;
  rows: HouseholdSegmentRow[];
  quickEdit: QuickEditConfig | null;
}
interface PersonPayload {
  kind: "person";
  label: string;
  total: number;
  truncated: boolean;
  rows: VulnerableExportRow[];
  quickEdit: QuickEditConfig | null;
}
type Payload = HouseholdPayload | PersonPayload;

interface QuickEditConfig {
  kind: "triage" | "host-house" | "volunteer" | "survival-kit" | "assistance";
  volunteerSkills: { id: string; label: string }[];
  assistanceTypes: { id: string; label: string; requiresCount: boolean; requiresDetail: boolean }[];
}

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
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<HouseholdSegmentRow | VulnerableExportRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

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
  }, [query, reloadToken]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visiblePersonRows = data?.kind === "person" ? filterRows(data.rows, search) : [];
  const visibleHouseholdRows = data?.kind === "household" ? filterRows(data.rows, search) : [];
  const visibleCount = data?.kind === "person" ? visiblePersonRows.length : visibleHouseholdRows.length;

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
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <label className="block min-w-[240px] flex-1 text-sm font-semibold text-slate-600">
                  ค้นหา
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="input mt-1 w-full"
                    placeholder="ชื่อ รหัสใบ บ้านเลขที่ หรือชุมชน"
                  />
                </label>
                <span className="pb-2 text-xs text-slate-500">
                  แสดง {visibleCount.toLocaleString("th-TH")} รายการ
                </span>
              </div>
              {visibleCount === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">ไม่พบรายการที่ค้นหา</p>
              ) : data.kind === "person" ? (
                <PersonTable rows={visiblePersonRows} canEdit={Boolean(data.quickEdit)} onEdit={setEditing} />
              ) : (
                <HouseholdTable rows={visibleHouseholdRows} canEdit={Boolean(data.quickEdit)} onEdit={setEditing} />
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">
          🔒 ข้อมูลส่วนบุคคล — การเปิดดูและการดาวน์โหลดถูกบันทึกไว้ใน Audit Log
        </div>
      </div>
      {data?.quickEdit && editing ? (
        <QuickEditDialog
          config={data.quickEdit}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadToken((value) => value + 1);
            // อัปเดตตัวเลขบนหน้ารายงานที่อยู่หลัง modal ทันที (server component คำนวณใหม่)
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2 align-top ${mono ? "tabular-nums" : ""}`}>{children || "-"}</td>;
}

function HouseholdTable({ rows, canEdit, onEdit }: { rows: HouseholdSegmentRow[]; canEdit: boolean; onEdit: (row: HouseholdSegmentRow) => void }) {
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
            {canEdit ? <Th>จัดการ</Th> : null}
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
              {canEdit ? <Td><button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={() => onEdit(r)}>แก้ไข</button></Td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonTable({ rows, canEdit, onEdit }: { rows: VulnerableExportRow[]; canEdit: boolean; onEdit: (row: VulnerableExportRow) => void }) {
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
            {canEdit ? <Th>จัดการ</Th> : null}
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
              {canEdit ? <Td><button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={() => onEdit(r)}>แก้ไข</button></Td> : null}
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

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("th-TH").replace(/\s+/g, " ");
}

function filterRows<T extends HouseholdSegmentRow | VulnerableExportRow>(rows: T[], search: string): T[] {
  const needle = normalizeSearch(search);
  if (!needle) return rows;
  return rows.filter((row) => {
    const values = "respondentName" in row
      ? [row.respondentName, row.respondentPhone, row.sheetNo, row.houseNo, row.mooNo, row.soi, row.road, row.tambon, row.community, row.detail]
      : [row.fullName, row.sheetNo, row.houseNo, row.mooNo, row.soi, row.road, row.tambon, row.community, row.diseases, row.triage];
    return normalizeSearch(values.filter(Boolean).join(" ")).includes(needle);
  });
}

const TRIAGE_OPTIONS = [["P1", "วิกฤต"], ["P2", "เร่งด่วน"], ["P3", "เฝ้าระวัง"]] as const;

function QuickEditDialog({
  config,
  row,
  onClose,
  onSaved,
}: {
  config: QuickEditConfig;
  row: HouseholdSegmentRow | VulnerableExportRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const householdRow = "respondentName" in row ? row : null;
  const personRow = "fullName" in row ? row : null;
  const triageRecommended = personRow?.triageRecommended ?? null;
  const recommendationReasons = personRow?.triageRecommendationReasons ?? [];
  const initialVolunteer = householdRow?.quickEdit?.volunteerState ?? "UNSPECIFIED";
  const [triage, setTriage] = useState(personRow?.triageCode ?? "P3");
  const [hostHouse, setHostHouse] = useState<"true" | "false" | "null">(
    householdRow?.quickEdit?.hostHouse === true ? "true" : householdRow?.quickEdit?.hostHouse === false ? "false" : "null",
  );
  const [survivalKit, setSurvivalKit] = useState<"true" | "false" | "null">(
    householdRow?.quickEdit?.hasSurvivalKit === true ? "true" : householdRow?.quickEdit?.hasSurvivalKit === false ? "false" : "null",
  );
  const [volunteerState, setVolunteerState] = useState(initialVolunteer);
  const [skillIds, setSkillIds] = useState<string[]>(householdRow?.quickEdit?.volunteerSkillIds ?? []);
  const initialAssistance = householdRow?.quickEdit?.assistance ?? null;
  const [assistanceActive, setAssistanceActive] = useState(Boolean(initialAssistance));
  const [assistanceTypeId, setAssistanceTypeId] = useState(initialAssistance?.typeId ?? config.assistanceTypes[0]?.id ?? "");
  const [assistanceCount, setAssistanceCount] = useState(initialAssistance?.personCount?.toString() ?? "");
  const [assistanceDetail, setAssistanceDetail] = useState(initialAssistance?.detail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordId = row.recordId;
  const title = personRow?.fullName ?? householdRow?.respondentName ?? "รายการนี้";
  const selectedAssistanceType = config.assistanceTypes.find((item) => item.id === assistanceTypeId);

  async function save() {
    if (!recordId) {
      setError("ไม่พบรหัสรายการ กรุณาปิดแล้วเปิดรายชื่อใหม่");
      return;
    }
    const body = config.kind === "triage"
      ? { kind: "triage", recordId, value: triage }
      : config.kind === "host-house"
        ? { kind: "host-house", recordId, value: hostHouse === "null" ? null : hostHouse === "true" }
        : config.kind === "survival-kit"
          ? { kind: "survival-kit", recordId, value: survivalKit === "null" ? null : survivalKit === "true" }
          : config.kind === "assistance"
            ? {
                kind: "assistance",
                recordId,
                needId: initialAssistance?.needId,
                active: assistanceActive,
                typeId: assistanceTypeId,
                personCount: selectedAssistanceType?.requiresCount && assistanceCount !== "" ? Number(assistanceCount) : null,
                detail: assistanceDetail,
              }
            : { kind: "volunteer", recordId, state: volunteerState, skillIds: volunteerState === "INTERESTED" ? skillIds : [] };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/reports/quick-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "บันทึกข้อมูลไม่สำเร็จ");
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function toggleSkill(id: string) {
    setSkillIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-900/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ไขข้อมูลจากรายงาน"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">แก้ไขข้อมูล</h3>
        <p className="mt-1 text-sm text-slate-500">{title}</p>

        <div className="mt-5">
          {config.kind === "triage" ? (
            <label className="block text-sm font-semibold text-slate-700">
              ระดับความเร่งด่วน
              <select value={triage ?? "P3"} onChange={(event) => setTriage(event.target.value as "P1" | "P2" | "P3")} className="input mt-1 w-full">
                {TRIAGE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {triageRecommended ? (
                <span className="mt-2 block rounded-lg bg-slate-50 px-3 py-2 text-xs font-normal leading-5 text-slate-600">
                  ระบบแนะนำ: <strong>{TRIAGE_LABEL[triageRecommended]}</strong>
                  {recommendationReasons.length ? ` จากลักษณะ: ${recommendationReasons.join(", ")}` : ""}
                </span>
              ) : null}
              {triageRecommended && isTriageBelowRecommendation(triage as "P1" | "P2" | "P3", triageRecommended) ? (
                <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-normal leading-5 text-amber-800">
                  ระดับที่เลือกต่ำกว่าคำแนะนำของระบบ แต่ยังบันทึกได้เมื่อข้อมูลจากพื้นที่ยืนยันว่ามีความพร้อมเพียงพอ
                </span>
              ) : null}
            </label>
          ) : config.kind === "host-house" ? (
            <label className="block text-sm font-semibold text-slate-700">
              การยินยอมเป็นจุดพักพิงเบื้องต้น
              <select value={hostHouse} onChange={(event) => setHostHouse(event.target.value as "true" | "false" | "null")} className="input mt-1 w-full">
                <option value="true">ยินยอม</option>
                <option value="false">ไม่ยินยอม</option>
                <option value="null">ไม่ระบุ</option>
              </select>
            </label>
          ) : config.kind === "survival-kit" ? (
            <label className="block text-sm font-semibold text-slate-700">
              การมีชุดยังชีพ
              <select value={survivalKit} onChange={(event) => setSurvivalKit(event.target.value as "true" | "false" | "null")} className="input mt-1 w-full">
                <option value="true">มี</option>
                <option value="false">ไม่มี</option>
                <option value="null">ไม่ระบุ</option>
              </select>
            </label>
          ) : config.kind === "assistance" ? (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                สถานะความต้องการ
                <select value={assistanceActive ? "active" : "cancelled"} onChange={(event) => setAssistanceActive(event.target.value === "active")} className="input mt-1 w-full">
                  <option value="active">ยังต้องการความช่วยเหลือ</option>
                  <option value="cancelled">ยกเลิกรายการนี้</option>
                </select>
              </label>
              {assistanceActive ? (
                <>
                  <label className="block text-sm font-semibold text-slate-700">
                    ประเภทความช่วยเหลือ
                    <select value={assistanceTypeId} onChange={(event) => setAssistanceTypeId(event.target.value)} className="input mt-1 w-full">
                      {config.assistanceTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                    </select>
                  </label>
                  {selectedAssistanceType?.requiresCount ? (
                    <label className="block text-sm font-semibold text-slate-700">
                      จำนวนคน
                      <input type="number" min={1} max={5000} step={1} value={assistanceCount} onChange={(event) => setAssistanceCount(event.target.value)} className="input mt-1 w-full" />
                    </label>
                  ) : null}
                  <label className="block text-sm font-semibold text-slate-700">
                    รายละเอียด{selectedAssistanceType?.requiresDetail ? " (จำเป็น)" : " (ถ้ามี)"}
                    <textarea maxLength={1000} rows={3} value={assistanceDetail} onChange={(event) => setAssistanceDetail(event.target.value)} className="input mt-1 w-full" />
                  </label>
                </>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  เมื่อบันทึก รายการนี้จะถูกนำออกจากความต้องการของครัวเรือน แต่ใบแบบสอบถามจะไม่ถูกลบ
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                ความสนใจเป็นอาสาสมัคร
                <select
                  value={volunteerState}
                  onChange={(event) => {
                    const value = event.target.value as typeof volunteerState;
                    setVolunteerState(value);
                    if (value !== "INTERESTED") setSkillIds([]);
                  }}
                  className="input mt-1 w-full"
                >
                  <option value="INTERESTED">สนใจ</option>
                  <option value="UNAVAILABLE">ไม่สะดวก</option>
                  <option value="UNSPECIFIED">ไม่ระบุ</option>
                </select>
              </label>
              {volunteerState === "INTERESTED" ? (
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-700">ทักษะอาสาสมัคร</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {config.volunteerSkills.map((skill) => (
                      <label key={skill.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <input type="checkbox" checked={skillIds.includes(skill.id)} onChange={() => toggleSkill(skill.id)} />
                        <span>{skill.label}</span>
                      </label>
                    ))}
                  </div>
                  {skillIds.length === 0 ? <p className="mt-2 text-xs font-semibold text-red-600">กรุณาเลือกอย่างน้อย 1 ทักษะ</p> : null}
                </fieldset>
              ) : null}
            </div>
          )}
        </div>

        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving
              || (config.kind === "volunteer" && volunteerState === "INTERESTED" && skillIds.length === 0)
              || (config.kind === "assistance" && assistanceActive && (
                !assistanceTypeId
                || (selectedAssistanceType?.requiresCount && (!assistanceCount || Number(assistanceCount) < 1))
                || (selectedAssistanceType?.requiresDetail && !assistanceDetail.trim())
              ))}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
