"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeIntString, sanitizePhone } from "@/lib/entry/input-format";
import {
  EDITABLE_FIELDS,
  type EditableFormValue,
  type EditableMasterKey,
} from "@/lib/verification/editable-fields";
import { editHouseholdAction } from "@/lib/verification/actions";

type Props = {
  householdId: string;
  initialValues: Record<string, EditableFormValue>;
  options: Record<EditableMasterKey, { id: string; label: string }[]>;
};

const ERRORS: Record<string, string> = {
  WRONG_STATUS: "ใบนี้ถูกยืนยัน/เปลี่ยนสถานะแล้ว — แก้ไขไม่ได้ (รีเฟรชหน้า)",
  SELF_EDIT: "คุณเป็นผู้คีย์ใบนี้ จึงแก้ไขเองไม่ได้",
  INVALID: "ค่าที่กรอกไม่ถูกต้อง — ตรวจตัวเลข/ความยาวอีกครั้ง",
  INVALID_MASTER: "ตัวเลือก (คำนำหน้า/หมู่/ตำบล/ทรัพยากร ฯลฯ) ไม่ตรงกับข้อมูลระบบ",
  NOT_FOUND: "ไม่พบใบนี้ในขอบเขตของคุณ",
  NOT_ALLOWED: "ไม่มีสิทธิ์แก้ไขใบนี้",
  UNAUTHENTICATED: "เซสชันหมดอายุ — เข้าสู่ระบบใหม่",
  ERROR: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่",
};

/** จัดกลุ่มฟิลด์ตามส่วนของแบบสอบถาม (ตรง Entry Steps — ผู้ตรวจเห็นภาพรวมเป็นหมวด) */
const SECTION_ORDER: { title: string; keys: string[] }[] = [
  {
    title: "ส่วนที่ 0 — ข้อมูลการสำรวจ",
    keys: [
      "surveyNo",
      "communityNameOnPaper",
      "surveyorPrefixId",
      "surveyorPrefixOther",
      "surveyorFirstNameOnPaper",
      "surveyorLastNameOnPaper",
      "surveyorPhoneOnPaper",
    ],
  },
  {
    title: "ส่วนที่ 1 — ข้อมูลทั่วไปและที่ตั้ง",
    keys: [
      "buildingTypeId",
      "buildingTypeOther",
      "placeName",
      "respondentPrefixId",
      "respondentPrefixOther",
      "respondentFirstName",
      "respondentLastName",
      "respondentPhone",
      "houseNo",
      "mooNo",
      "soi",
      "road",
      "tambonId",
      "memberCount",
      "ownershipTypeId",
      "ownershipOther",
    ],
  },
  {
    title: "ส่วนที่ 2 — กลุ่มเปราะบาง",
    keys: ["hasVulnerable", "assistanceTotalPersonCount", "assistanceNeedIds"],
  },
  {
    title: "ส่วนที่ 3 — สภาพแวดล้อมและความเสี่ยงอุทกภัย",
    keys: [
      "floorLevelVsRoad",
      "hasFloodedBefore",
      "floodDepthMetersRaw",
      "floodDepthCmRaw",
      "lastFloodDurationDays",
      "hasSafeParking",
      "hasAlternateParking",
      "alternateParkingLocation",
      "lastEvacuationPlace",
      "lastEvacuationOther",
      "nearestEvacSiteType",
      "nearestEvacSiteOther",
      "evacuationVehicleTypes",
      "hasSurvivalKit",
      "householdResourceIds",
      "canBeHostHouse",
    ],
  },
  {
    title: "ส่วนที่ 4 — การเตือนภัยและการมีส่วนร่วม",
    keys: [
      "alertChannelIds",
      "usesSmartphone",
      "canScanQR",
      "volunteerInterestIds",
      "mentalHealthSupport",
      "suggestion",
    ],
  },
  {
    title: "ส่วนที่ 5-6 — ผู้สำรวจและโครงการแก้จน",
    keys: ["riskLevelSurveyor", "surveyorNote", "povertyProgramInterest"],
  },
];

/** แปลงค่าเป็นสตริงสำหรับแสดง/input ฝั่ง client */
function toStr(v: EditableFormValue): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return Array.isArray(v) ? "" : (v ?? "");
}

export function EditPanelFull({ householdId, initialValues, options }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, EditableFormValue>>(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = EDITABLE_FIELDS.some(
    (f) => JSON.stringify(values[f.key] ?? "") !== JSON.stringify(initialValues[f.key] ?? ""),
  );

  function set(key: string, value: EditableFormValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // ส่งเฉพาะฟิลด์ที่รู้จัก (server re-diff + ตรวจซ้ำ)
    const payload: Record<string, EditableFormValue> = {};
    for (const f of EDITABLE_FIELDS) payload[f.key] = values[f.key] ?? "";

    const result = await editHouseholdAction(householdId, payload);
    if (result.ok) {
      if (result.changedCount === 0) {
        setNotice("ไม่มีการเปลี่ยนแปลง");
        setBusy(false);
        return;
      }
      // โหลดหน้าใหม่ให้แสดงค่าใหม่ + version log ที่อัปเดต
      router.refresh();
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  function cancel() {
    setValues(initialValues);
    setError(null);
    setNotice(null);
  }

  return (
    <section className="card animate-fade-in !border-brand-300 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <span className="h-5 w-1.5 rounded-full bg-alert-400" />
          ข้อมูลใบ — แก้ไขได้ในหน้านี้เลย
        </h3>
        <span className="text-xs font-medium text-slate-400">ระบบเก็บสำเนาก่อนแก้ (version) ทุกครั้ง</span>
      </div>

      {SECTION_ORDER.map((section) => {
        const fields = EDITABLE_FIELDS.filter((f) => section.keys.includes(f.key));
        if (fields.length === 0) return null;
        return (
          <div key={section.title} className="mb-6">
            <h4 className="mb-3 text-sm font-bold text-slate-700">{section.title}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => {
                const val = values[f.key];
                const changed =
                  JSON.stringify(val ?? "") !== JSON.stringify(initialValues[f.key] ?? "");
                return (
                  <div key={f.key} className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      {f.label}
                      {f.sensitive && <span className="text-slate-400" title="เข้ารหัสเมื่อบันทึก">🔒</span>}
                      {changed && (
                        <span className="badge badge-accent !px-2 !py-0.5 !text-[10px]" title="มีการแก้ไข">
                          แก้แล้ว
                        </span>
                      )}
                    </label>
                    <FieldEditor
                      field={f}
                      value={val}
                      options={options}
                      changed={changed}
                      onSet={(value) => set(f.key, value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && (
        <p role="alert" className="mt-4 animate-pop rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 animate-pop rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600">
          {notice}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={cancel} disabled={busy || !dirty} className="btn btn-ghost btn-md">
          คืนค่าเดิม
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="btn btn-accent btn-md"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
      </div>
    </section>
  );
}

/** editor ตาม kind — ครอบคลุม text/textarea/number/phone/select/radio/boolean/checkbox-group */
function FieldEditor({
  field,
  value,
  options,
  changed,
  onSet,
}: {
  field: (typeof EDITABLE_FIELDS)[number];
  value: EditableFormValue;
  options: Props["options"];
  changed: boolean;
  onSet: (value: EditableFormValue) => void;
}) {
  const chgCls = changed ? "!border-alert-400 !bg-alert-50/40" : "";

  if (field.kind === "checkbox-group") {
    const checked = Array.isArray(value) ? value.map(String) : [];
    const opts = field.masterKey
      ? options[field.masterKey].map((o) => ({ value: o.id, label: o.label }))
      : (field.options ?? []);
    return (
      <div className={`flex flex-wrap gap-2 rounded-xl border-2 border-slate-100 p-2.5 ${chgCls}`}>
        {opts.map((o) => {
          const on = checked.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                on
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-slate-200 text-slate-600 hover:border-brand-300"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() =>
                  onSet(on ? checked.filter((c) => c !== o.value) : [...checked, o.value])
                }
              />
              {o.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.kind === "boolean") {
    const current = value === true;
    const blank = value === "" || value === null;
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-xl border-2 border-slate-100 p-2.5 ${chgCls}`}>
        <button
          type="button"
          onClick={() => onSet(!current)}
          className={`btn btn-sm ${current ? "btn-primary" : "btn-secondary"}`}
        >
          {current
            ? (field.booleanLabels?.true ?? "มี")
            : (field.booleanLabels?.false ?? "ไม่มี")}
        </button>
        {!blank && (
          <button
            type="button"
            onClick={() => onSet("")}
            className="btn btn-ghost btn-sm"
            title="ล้างค่า (ไม่ระบุ)"
          >
            ล้าง
          </button>
        )}
        {blank && <span className="text-[11px] font-medium text-slate-400">ยังไม่ระบุ</span>}
      </div>
    );
  }

  if (field.kind === "radio") {
    return (
      <div className={`flex flex-wrap gap-2 rounded-xl border-2 border-slate-100 p-2.5 ${chgCls}`}>
        {(field.options ?? []).map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold ${
              toStr(value) === o.value
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-slate-200 text-slate-600"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={field.key}
              checked={toStr(value) === o.value}
              onChange={() => onSet(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "select") {
    const strVal = toStr(value);
    const opts = field.masterKey ? options[field.masterKey] : [];
    return (
      <select
        value={strVal}
        onChange={(e) => onSet(e.target.value)}
        className={`field ${chgCls}`}
      >
        <option value="">— ไม่ระบุ —</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "textarea") {
    return (
      <textarea
        value={toStr(value)}
        maxLength={field.maxLength ?? 2000}
        rows={3}
        onChange={(e) => onSet(e.target.value)}
        className={`field resize-y ${chgCls}`}
      />
    );
  }

  // text / number / phone
  return (
    <input
      type="text"
      inputMode={field.kind === "phone" || field.kind === "number" ? "numeric" : undefined}
      maxLength={field.kind === "phone" ? 10 : undefined}
      value={toStr(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onSet(
          field.kind === "phone"
            ? sanitizePhone(raw)
            : field.kind === "number"
              ? sanitizeIntString(raw, field.max)
              : raw,
        );
      }}
      className={`field ${chgCls}`}
    />
  );
}
