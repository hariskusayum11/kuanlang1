// รายการฟิลด์ที่ Verifier แก้ไขได้ — pure, ไม่มี server import
// ใช้ร่วมทั้ง core (edit.ts) และ UI (edit-panel.tsx) เพื่อไม่ให้ descriptor หลุดจากกัน
//
// ครอบคลุมทุกส่วนของแบบสอบถาม (Owner 2026-08-07):
//   - คอลัมน์ตรงบน Household (ส่วน 0/1/2/4/5/6 ที่เป็นฟิลด์เดี่ยว)
//   - คอลัมน์บน FloodRiskProfile (ส่วน 3 — 1:1)
//   - รายการ M:N (ความต้องการช่วยเหลือ / ทรัพยากร / ยานพาหนะ / ช่องทาง / อาสาสมัคร)
// จัดกลุ่มผูกกับ Entry Steps (lib/entry/steps.ts) เพื่อให้การแก้ตรงกับที่ผู้คีย์กรอก

export type EditableKind =
  | "text"
  | "textarea"
  | "number"
  | "phone"
  | "select"
  | "boolean"
  | "radio"
  | "checkbox-group";

/** ค่าฟอร์มของฟิลด์ 1 ตัว — ใช้ทั้งโหลดค่าเดิม (prefill) และรับค่ากลับจาก EditPanel */
export type EditableFormValue = string | boolean | string[];

/** สถานะจากกระดาษที่ผู้ตรวจต้องเห็น/แก้ได้ — null = ช่องมีค่าปกติ */
export type EditableFieldMark = "ILLEGIBLE" | "BLANK_IN_PAPER" | null;

/** คอลัมน์ที่ฟิลด์นี้ถูกบันทึกไว้ — ใช้แยก update target ใน core */
export type EditTarget =
  | "household"
  | "floodRiskProfile"
  | "digitalReadiness"
  | "assistanceNeeds"
  | "householdResources"
  | "evacuationVehicles"
  | "evacuationVehicleOther"
  | "alertChannelPrefs"
  | "volunteerInterests";

/** master data ที่ใช้เป็น dropdown/checkbox (โหลดใน loadHouseholdEditable) */
export type EditableMasterKey =
  | "namePrefixes"
  | "tambons"
  | "buildingTypes"
  | "ownershipTypes"
  | "resourceTypes"
  | "alertChannels"
  | "volunteerSkillTypes"
  | "assistanceNeedTypes";

export interface EditableField {
  /** ชื่อคอลัมน์บน target model (key ปกติของฟิลด์นี้) */
  key: string;
  /** ชื่อ fieldPath ตอนคีย์ หากต่างจากชื่อคอลัมน์/คีย์หน้าแก้ไข */
  fieldPath?: string;
  label: string;
  kind: EditableKind;
  /** model ที่ลงท้ายด้วย — default: household */
  target?: EditTarget;
  /** เข้ารหัสเมื่อเก็บ (🔒) */
  sensitive?: boolean;
  /** เบอร์โทร — คำนวณ blind index ใหม่ (respondentPhoneIdx) */
  isPhone?: boolean;
  /** select/checkbox ดึงตัวเลือกจาก master data ตัวใด */
  masterKey?: EditableMasterKey;
  /** number: ค่าสูงสุด */
  max?: number;
  /** boolean: ป้ายแสดงของ true/false (เช่น "มี"/"ไม่มี") */
  booleanLabels?: { true: string; false: string };
  /** radio/checkbox-group: ตัวเลือก enum ตามกระดาษ (M:N ใช้เป็น array) */
  options?: { value: string; label: string }[];
  /** checkbox-group: ตัวเลือกพิเศษที่ห้ามเลือกพร้อมรายการอื่น (เช่น ไม่มี/ไม่สะดวก) */
  exclusiveNone?: { key: string; label: string };
  /** text/textarea: จำกัดความยาว */
  maxLength?: number;
}

// ตัวช่วยสั้น ๆ ลดซ้ำ
const YES_NO: EditableField["booleanLabels"] = { true: "มี", false: "ไม่มี" };
const EVER_FLOOD: EditableField["booleanLabels"] = { true: "เคย", false: "ไม่เคย" };
const PARKING_ALT: EditableField["booleanLabels"] = { true: "มี", false: "ไม่มี" };
const KIT_READY: EditableField["booleanLabels"] = { true: "เตรียม", false: "ไม่ได้เตรียม" };
const HOST_OK: EditableField["booleanLabels"] = { true: "ได้", false: "ไม่ได้" };
const MENTAL_NEED: EditableField["booleanLabels"] = { true: "ต้องการ", false: "ไม่ต้องการ" };
const INTEREST: EditableField["booleanLabels"] = { true: "สนใจ", false: "ไม่สนใจ" };

export const EDITABLE_FIELDS: readonly EditableField[] = [
  // ---- ส่วนที่ 0: ข้อมูลการสำรวจ ----
  { key: "surveyNo", label: "แบบสอบถามลำดับที่", kind: "text", maxLength: 64 },
  { key: "communityNameOnPaper", label: "ชื่อชุมชน (ตามกระดาษ)", kind: "text", maxLength: 200 },
  { key: "surveyorPrefixId", fieldPath: "surveyorPrefix", label: "คำนำหน้า (ผู้สำรวจ)", kind: "select", masterKey: "namePrefixes" },
  { key: "surveyorPrefixOther", label: "ระบุคำนำหน้า (ผู้สำรวจ)", kind: "text", maxLength: 64 },
  { key: "surveyorFirstNameOnPaper", label: "ชื่อ (ผู้สำรวจ)", kind: "text", maxLength: 200 },
  { key: "surveyorLastNameOnPaper", label: "นามสกุล (ผู้สำรวจ)", kind: "text", maxLength: 200 },
  { key: "surveyorPhoneOnPaper", label: "เบอร์โทรผู้สำรวจ", kind: "phone" },

  // ---- ส่วนที่ 1: ข้อมูลพื้นฐานและที่ตั้ง ----
  { key: "buildingTypeId", label: "ประเภทสิ่งปลูกสร้าง", kind: "select", masterKey: "buildingTypes" },
  { key: "buildingTypeOther", label: "ประเภท (อื่น ๆ ระบุ)", kind: "text", maxLength: 200 },
  { key: "placeName", label: "ชื่อสถานที่/ร้าน", kind: "text", maxLength: 200 },
  { key: "respondentPrefixId", fieldPath: "respondentPrefix", label: "คำนำหน้า (ผู้ให้ข้อมูล)", kind: "select", masterKey: "namePrefixes" },
  { key: "respondentPrefixOther", label: "ระบุคำนำหน้า (ผู้ให้ข้อมูล)", kind: "text", maxLength: 64 },
  { key: "respondentFirstName", label: "ชื่อผู้ให้ข้อมูล", kind: "text", sensitive: true, maxLength: 200 },
  { key: "respondentLastName", label: "นามสกุลผู้ให้ข้อมูล", kind: "text", sensitive: true, maxLength: 200 },
  { key: "respondentPhone", label: "เบอร์โทรผู้ให้ข้อมูล", kind: "phone", sensitive: true, isPhone: true },
  { key: "houseNo", label: "บ้านเลขที่", kind: "text", maxLength: 64 },
  { key: "mooNo", label: "หมู่", kind: "number", max: 999 },
  { key: "soi", label: "ซอย", kind: "text", maxLength: 120 },
  { key: "road", label: "ถนน", kind: "text", maxLength: 120 },
  { key: "tambonId", label: "ตำบล", kind: "select", masterKey: "tambons" },
  { key: "memberCount", label: "จำนวนสมาชิก (คน)", kind: "number", max: 5000 },
  { key: "ownershipTypeId", label: "กรรมสิทธิ์", kind: "select", masterKey: "ownershipTypes" },
  { key: "ownershipOther", label: "กรรมสิทธิ์ (อื่น ๆ ระบุ)", kind: "text", maxLength: 200 },

  // ---- ส่วนที่ 2: กลุ่มเปราะบาง (ระดับครัวเรือน) ----
  { key: "hasVulnerable", label: "มีกลุ่มเปราะบาง", kind: "boolean", booleanLabels: YES_NO },
  {
    key: "assistanceTotalPersonCount",
    label: "ความช่วยเหลือรวมทั้งหมด (คน)",
    kind: "number",
    max: 5000,
  },
  {
    key: "assistanceNeedIds",
    fieldPath: "assistanceNeeds",
    label: "ความต้องการช่วยเหลือ",
    kind: "checkbox-group",
    target: "assistanceNeeds",
    masterKey: "assistanceNeedTypes",
  },

  // ---- ส่วนที่ 3: ความเสี่ยง (FloodRiskProfile 1:1) ----
  {
    key: "floorLevelVsRoad",
    label: "ระดับพื้นบ้านเทียบถนน",
    kind: "radio",
    target: "floodRiskProfile",
    options: [
      { value: "BELOW_ROAD", label: "ต่ำกว่าถนน" },
      { value: "EQUAL_ROAD", label: "เท่าถนน" },
      { value: "ABOVE_ROAD", label: "สูงกว่าถนน" },
    ],
  },
  { key: "hasFloodedBefore", label: "เคยน้ำท่วม", kind: "boolean", target: "floodRiskProfile", booleanLabels: EVER_FLOOD },
  { key: "floodDepthMetersRaw", label: "ระดับน้ำสูงสุด — เมตร", kind: "number", target: "floodRiskProfile", max: 10 },
  { key: "floodDepthCmRaw", label: "ระดับน้ำสูงสุด — ซม.", kind: "number", target: "floodRiskProfile", max: 99 },
  { key: "lastFloodDurationDays", label: "น้ำท่วมครั้งล่าสุด (วัน)", kind: "number", target: "floodRiskProfile", max: 365 },
  { key: "hasSafeParking", label: "มีที่จอดรถปลอดภัยในสถานที่", kind: "boolean", target: "floodRiskProfile", booleanLabels: YES_NO },
  { key: "hasAlternateParking", label: "มีที่จอดรถที่อื่น", kind: "boolean", target: "floodRiskProfile", booleanLabels: PARKING_ALT },
  { key: "alternateParkingLocation", label: "ระบุที่จอดรถ", kind: "text", target: "floodRiskProfile", maxLength: 200 },
  {
    key: "lastEvacuationPlace",
    label: "ที่อพยพครั้งล่าสุด",
    kind: "radio",
    target: "floodRiskProfile",
    options: [
      { value: "UPPER_FLOOR", label: "ชั้น 2/ชั้น 3" },
      { value: "ROOF", label: "บนหลังคา" },
      { value: "NEAREST_SITE", label: "จุดอพยพใกล้ที่สุด" },
      { value: "OTHER", label: "อื่น ๆ" },
    ],
  },
  { key: "lastEvacuationOther", label: "ที่อพยพ (อื่น ๆ ระบุ)", kind: "text", target: "floodRiskProfile", maxLength: 200 },
  {
    key: "nearestEvacSiteTypes",
    label: "จุดอพยพใกล้ที่สุด (เลือกได้หลายข้อ)",
    kind: "checkbox-group",
    target: "floodRiskProfile",
    options: [
      { value: "RELATIVE_HOUSE", label: "บ้านญาติ" },
      { value: "SCHOOL", label: "โรงเรียน" },
      { value: "TEMPLE_MOSQUE", label: "วัด/มัสยิด" },
      { value: "COMMUNITY_CENTER", label: "ศูนย์ชุมชน" },
      { value: "MUNICIPALITY", label: "พื้นที่เทศบาล" },
      { value: "UNKNOWN", label: "ไม่ทราบ" },
      { value: "OTHER", label: "อื่น ๆ" },
    ],
  },
  { key: "nearestEvacSiteOther", label: "จุดอพยพ (อื่น ๆ ระบุ)", kind: "text", target: "floodRiskProfile", maxLength: 200 },
  {
    key: "evacuationVehicleTypes",
    fieldPath: "evacuationVehicles",
    label: "ยานพาหนะอพยพ",
    kind: "checkbox-group",
    target: "evacuationVehicles",
    options: [
      { value: "CAR", label: "รถยนต์" },
      { value: "MOTORCYCLE", label: "มอเตอร์ไซค์" },
      { value: "BOAT", label: "เรือ" },
      { value: "OTHER", label: "อื่น ๆ" },
    ],
  },
  {
    key: "evacuationVehiclesOther",
    fieldPath: "evacuationVehiclesOther",
    label: "ยานพาหนะอพยพ (อื่น ๆ ระบุ)",
    kind: "text",
    target: "evacuationVehicleOther",
    maxLength: 200,
  },
  { key: "hasSurvivalKit", label: "เตรียมถุงยังชีพ", kind: "boolean", target: "floodRiskProfile", booleanLabels: KIT_READY },
  {
    key: "householdResourceIds",
    fieldPath: "householdResources",
    label: "ทรัพยากรรับมืออุทกภัย",
    kind: "checkbox-group",
    target: "householdResources",
    masterKey: "resourceTypes",
    exclusiveNone: { key: "hasNoResources", label: "ไม่มี" },
  },
  { key: "hasNoResources", label: "ไม่มีทรัพยากร", kind: "boolean" },
  { key: "canBeHostHouse", label: "ใช้เป็นบ้านพี่เลี้ยงได้", kind: "boolean", target: "floodRiskProfile", booleanLabels: HOST_OK },

  // ---- ส่วนที่ 4: การมีส่วนร่วม ----
  {
    key: "alertChannelIds",
    fieldPath: "alertChannels",
    label: "ช่องทางรับข่าวเตือนภัย",
    kind: "checkbox-group",
    target: "alertChannelPrefs",
    masterKey: "alertChannels",
  },
  { key: "usesSmartphone", label: "ใช้สมาร์ทโฟน", kind: "boolean", target: "digitalReadiness", booleanLabels: YES_NO },
  { key: "canScanQR", label: "สแกน QR ได้", kind: "boolean", target: "digitalReadiness", booleanLabels: YES_NO },
  {
    key: "volunteerInterestIds",
    fieldPath: "volunteerInterests",
    label: "สนใจเป็นอาสาสมัคร",
    kind: "checkbox-group",
    target: "volunteerInterests",
    masterKey: "volunteerSkillTypes",
    exclusiveNone: { key: "volunteerNotAvailable", label: "ไม่สะดวกเข้าร่วม" },
  },
  { key: "volunteerNotAvailable", label: "ไม่สะดวกเข้าร่วมเป็นอาสาสมัคร", kind: "boolean" },
  { key: "mentalHealthSupport", label: "ต้องการเยียวยาจิตใจ", kind: "boolean", sensitive: true, booleanLabels: MENTAL_NEED },
  { key: "suggestion", label: "ข้อเสนอแนะ", kind: "textarea", maxLength: 2000 },

  // ---- ส่วนที่ 5-6: ผู้สำรวจ + โครงการแก้จน ----
  {
    key: "riskLevelSurveyor",
    label: "ระดับความเสี่ยง (ผู้สำรวจติ๊ก)",
    kind: "radio",
    target: "floodRiskProfile",
    options: [
      { value: "LOW", label: "ต่ำ" },
      { value: "MEDIUM", label: "ปานกลาง" },
      { value: "HIGH", label: "สูง" },
    ],
  },
  { key: "surveyorNote", label: "หมายเหตุผู้สำรวจ", kind: "textarea", maxLength: 2000 },
  { key: "povertyProgramInterest", label: "สนใจโครงการแก้จน", kind: "boolean", booleanLabels: INTEREST },
] as const;

/** คีย์ที่เป้าหมายเป็น M:N — ค่าฟอร์มเป็น array ของ id/enum แล้ว core จะ sync แถวของจริง */
export const LIST_TARGETS: ReadonlySet<EditTarget> = new Set<EditTarget>([
  "assistanceNeeds",
  "householdResources",
  "evacuationVehicles",
  "alertChannelPrefs",
  "volunteerInterests",
]);

export const EDITABLE_BY_KEY = new Map(EDITABLE_FIELDS.map((f) => [f.key, f]));

/** ฟิลด์ที่บันทึกลง FloodRiskProfile (1:1) — แยก update target ใน edit.ts */
export function targetOf(field: EditableField): EditTarget {
  return field.target ?? "household";
}
