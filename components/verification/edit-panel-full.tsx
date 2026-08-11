"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeIntString, sanitizePhone } from "@/lib/entry/input-format";
import {
  EDITABLE_FIELDS,
  type EditableFieldMark,
  type EditableFormValue,
  type EditableMasterKey,
} from "@/lib/verification/editable-fields";
import { editHouseholdAction } from "@/lib/verification/actions";

type StoredStatus = "HAS_VALUE" | "EXPLICIT_NONE" | "BLANK_IN_PAPER" | "ILLEGIBLE";

type Props = {
  householdId: string;
  initialValues: Record<string, EditableFormValue>;
  initialFieldMarks: Record<string, Exclude<EditableFieldMark, null>>;
  vulnerablePersons: {
    id: string;
    seq: number;
    prefix: string;
    firstName: string;
    lastName: string;
    nameStatus: StoredStatus;
    age: number | null;
    ageStatus: StoredStatus;
    phone: string;
    phoneStatus: StoredStatus;
    vulnerabilities: string[];
  }[];
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
      "nearestEvacSiteTypes",
      "nearestEvacSiteOther",
      "evacuationVehicleTypes",
      "evacuationVehiclesOther",
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

function optionIsOther(
  masterKey: EditableMasterKey,
  selected: EditableFormValue | undefined,
  options: Props["options"],
): boolean {
  if (typeof selected !== "string" || selected === "") return false;
  return options[masterKey].some(
    (option) => option.id === selected && option.label.includes("อื่น"),
  );
}

/** ซ่อนช่องลูกที่ไม่ได้ถูกถามตามเงื่อนไขเดิม แต่ต้องแสดงเสมอถ้ามี F2/F3 */
function editableFieldVisible(
  key: string,
  values: Record<string, EditableFormValue>,
  options: Props["options"],
  mark: EditableFieldMark,
): boolean {
  if (mark) return true;
  switch (key) {
    case "surveyorPrefixOther":
      return optionIsOther("namePrefixes", values.surveyorPrefixId, options);
    case "buildingTypeOther":
      return optionIsOther("buildingTypes", values.buildingTypeId, options);
    case "respondentPrefixOther":
      return optionIsOther("namePrefixes", values.respondentPrefixId, options);
    case "ownershipOther":
      return optionIsOther("ownershipTypes", values.ownershipTypeId, options);
    case "alternateParkingLocation":
      return values.hasAlternateParking === true;
    case "lastEvacuationOther":
      return values.lastEvacuationPlace === "OTHER";
    case "nearestEvacSiteOther":
      return Array.isArray(values.nearestEvacSiteTypes) && values.nearestEvacSiteTypes.includes("OTHER");
    case "evacuationVehiclesOther":
      return Array.isArray(values.evacuationVehicleTypes) && values.evacuationVehicleTypes.includes("OTHER");
    default:
      return true;
  }
}

function StoredPersonValue({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: StoredStatus;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      {status === "ILLEGIBLE" ? (
        <div className="mt-1 rounded-lg border-2 border-sun-300 bg-sun-50 px-3 py-2 text-sm font-bold text-sun-900">
          F2 · อ่านไม่ออก
        </div>
      ) : status === "BLANK_IN_PAPER" ? (
        <div className="mt-1 rounded-lg border-2 border-slate-300 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
          F3 · ว่างในกระดาษ
        </div>
      ) : (
        <p className="mt-1 min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
          {value || (status === "EXPLICIT_NONE" ? "ไม่มี" : "—")}
        </p>
      )}
    </div>
  );
}

export function EditPanelFull({ householdId, initialValues, initialFieldMarks, vulnerablePersons, options }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, EditableFormValue>>(initialValues);
  const [fieldMarks, setFieldMarks] = useState<Record<string, EditableFieldMark>>(
    initialFieldMarks,
  );
  const [resolvingMarks, setResolvingMarks] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = EDITABLE_FIELDS.some((f) =>
    JSON.stringify(values[f.key] ?? "") !== JSON.stringify(initialValues[f.key] ?? "") ||
    (fieldMarks[f.key] ?? null) !== (initialFieldMarks[f.key] ?? null),
  );

  function set(key: string, value: EditableFormValue) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // เมื่อผู้ตรวจกรอกค่าจริง ถือว่าแก้สถานะ F2/F3 เดิมแล้ว
    setFieldMarks((prev) => (prev[key] ? { ...prev, [key]: null } : prev));
    setResolvingMarks((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // ส่งเฉพาะค่าที่เปลี่ยนจริง — ค่าดั้งเดิมช่องอื่นต้องไม่ขวางการแก้ช่องนี้
    const payload: Record<string, EditableFormValue> = {};
    const markPayload: Record<string, EditableFieldMark> = {};
    for (const f of EDITABLE_FIELDS) {
      if (JSON.stringify(values[f.key] ?? "") !== JSON.stringify(initialValues[f.key] ?? "")) {
        payload[f.key] = values[f.key] ?? "";
      }
      if ((fieldMarks[f.key] ?? null) !== (initialFieldMarks[f.key] ?? null)) {
        markPayload[f.key] = fieldMarks[f.key] ?? null;
      }
    }

    const result = await editHouseholdAction(householdId, payload, markPayload);
    if (result.ok) {
      if (result.changedCount === 0) {
        setNotice("ไม่มีการเปลี่ยนแปลง");
        setBusy(false);
        return;
      }
      // โหลดหน้าใหม่ให้แสดงค่าใหม่ + version log ที่อัปเดต
      router.refresh();
      setBusy(false);
      return;
    }
    setError(ERRORS[result.reason] ?? ERRORS.ERROR);
    setBusy(false);
  }

  function cancel() {
    setValues(initialValues);
    setFieldMarks(initialFieldMarks);
    setResolvingMarks(new Set());
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
        const fields = EDITABLE_FIELDS.filter(
          (f) => section.keys.includes(f.key) && editableFieldVisible(f.key, values, options, fieldMarks[f.key] ?? null),
        );
        if (fields.length === 0) return null;
        return (
          <div
            key={section.title}
            className="mb-6 overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50/40"
          >
            <h4 className="border-b-2 border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-800">
              {section.title}
            </h4>
            <div className="space-y-3 p-4">
              {fields.map((f) => {
                const val = values[f.key];
                const changed =
                  JSON.stringify(val ?? "") !== JSON.stringify(initialValues[f.key] ?? "") ||
                  (f.exclusiveNone != null &&
                    JSON.stringify(values[f.exclusiveNone.key] ?? "") !==
                      JSON.stringify(initialValues[f.exclusiveNone.key] ?? "")) ||
                  (fieldMarks[f.key] ?? null) !== (initialFieldMarks[f.key] ?? null);
                const mark = fieldMarks[f.key] ?? null;
                const resolvingMark = mark !== null && resolvingMarks.has(f.key);
                return (
                  <div key={f.key} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      {f.label}
                      {f.sensitive && <span className="text-slate-400" title="เข้ารหัสเมื่อบันทึก">🔒</span>}
                      {changed && (
                        <span className="badge badge-accent !px-2 !py-0.5 !text-[10px]" title="มีการแก้ไข">
                          แก้แล้ว
                        </span>
                      )}
                    </label>
                    {mark && !resolvingMark ? (
                      <div className={`rounded-xl border-2 px-3.5 py-3 ${
                        mark === "ILLEGIBLE"
                          ? "border-sun-300 bg-sun-50 text-sun-900"
                          : "border-slate-300 bg-slate-100 text-slate-700"
                      }`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold">
                              {mark === "ILLEGIBLE" ? "F2 · อ่านไม่ออก" : "F3 · ว่างในกระดาษ"}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold opacity-75">
                              สถานะที่ผู้กรอกระบุจากแบบกระดาษ
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setResolvingMarks((prev) => new Set(prev).add(f.key))}
                            className="btn btn-secondary btn-sm"
                          >
                            กรอกค่าที่ถูกต้อง
                          </button>
                        </div>
                      </div>
                    ) : (
                      <FieldEditor
                        field={f}
                        value={val}
                        options={options}
                        changed={changed}
                        exclusiveNoneValue={
                          f.exclusiveNone ? values[f.exclusiveNone.key] : undefined
                        }
                        onSet={(value) => set(f.key, value)}
                        onSetExclusive={(key, value) => set(key, value)}
                      />
                    )}
                    {resolvingMark && (
                      <p className="text-[11px] font-semibold text-sun-700">
                        เดิมเป็น {mark === "ILLEGIBLE" ? "F2 อ่านไม่ออก" : "F3 ว่างในกระดาษ"} — เมื่อเลือกหรือพิมพ์ค่าใหม่ สถานะเดิมจะถูกแทนที่
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {section.keys.includes("hasVulnerable") && vulnerablePersons.length > 0 && (
              <div className="border-t-2 border-slate-100 bg-white p-4">
                <h5 className="mb-3 text-sm font-bold text-slate-700">รายชื่อบุคคลเปราะบาง</h5>
                <div className="space-y-3">
                  {vulnerablePersons.map((person) => (
                    <div
                      key={person.id}
                      className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4"
                    >
                      <p className="mb-3 text-xs font-bold text-slate-500">
                        บุคคลลำดับที่ {person.seq}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StoredPersonValue
                          label="ชื่อ-นามสกุล"
                          value={`${person.prefix}${person.firstName} ${person.lastName}`.trim()}
                          status={person.nameStatus}
                        />
                        <StoredPersonValue
                          label="อายุ"
                          value={person.age == null ? "" : `${person.age} ปี`}
                          status={person.ageStatus}
                        />
                        <StoredPersonValue
                          label="เบอร์โทรศัพท์"
                          value={person.phone}
                          status={person.phoneStatus}
                        />
                        <StoredPersonValue
                          label="ความเปราะบาง"
                          value={person.vulnerabilities.join(", ")}
                          status="HAS_VALUE"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
  exclusiveNoneValue,
  onSet,
  onSetExclusive,
}: {
  field: (typeof EDITABLE_FIELDS)[number];
  value: EditableFormValue;
  options: Props["options"];
  changed: boolean;
  exclusiveNoneValue?: EditableFormValue;
  onSet: (value: EditableFormValue) => void;
  onSetExclusive: (key: string, value: EditableFormValue) => void;
}) {
  const chgCls = changed ? "!border-alert-400 !bg-alert-50/40" : "";

  if (field.kind === "checkbox-group") {
    const checked = Array.isArray(value) ? value.map(String) : [];
    const none = field.exclusiveNone;
    const noneOn = none != null && exclusiveNoneValue === true;
    const opts = field.masterKey
      ? options[field.masterKey].map((o) => ({ value: o.id, label: o.label }))
      : (field.options ?? []);
    return (
      <div className={`flex flex-wrap gap-2 rounded-xl border-2 border-slate-100 p-2.5 ${chgCls}`}>
        {none && (
          <label
            className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              noneOn
                ? "border-slate-500 bg-slate-100 font-bold text-slate-800"
                : "border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={noneOn}
              onChange={() => {
                const next = !noneOn;
                onSetExclusive(none.key, next);
                if (next) onSet([]);
              }}
            />
            <CheckBoxIndicator on={noneOn} tone="slate" />
            {none.label}
          </label>
        )}
        {opts.map((o) => {
          const on = checked.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex select-none items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                on
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-slate-200 text-slate-600 hover:border-brand-300"
              } ${noneOn ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={noneOn}
                onChange={() =>
                  onSet(on ? checked.filter((c) => c !== o.value) : [...checked, o.value])
                }
              />
              <CheckBoxIndicator on={on} tone="brand" />
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

function CheckBoxIndicator({ on, tone }: { on: boolean; tone: "brand" | "slate" }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
        on
          ? tone === "brand"
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-slate-500 bg-slate-500 text-white"
          : "border-slate-300 bg-white"
      }`}
    >
      {on && <span className="text-[10px] font-black leading-none">✓</span>}
    </span>
  );
}
