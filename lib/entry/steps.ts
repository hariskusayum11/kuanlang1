// Wizard Step Configuration — ยึดแบบสอบถามกระดาษ + Data Dictionary (docs/03, docs/24 §6)
// กติกาสำคัญ (FR-ENT-01): ลำดับ step/ฟิลด์/ตัวเลือก ต้องตรงกระดาษ 100%
// - ไม่มี lastFloodYear (Orphan field — QM-11 ห้ามแสดงใน Entry Console)
// - ไม่มี lineUserId (ไม่ได้มาจากกระดาษ)
// - riskLevelSurveyor: คีย์ตามที่ผู้สำรวจติ๊กเท่านั้น (BR-54)
// หมายเหตุ: รอบนี้ยังไม่บันทึกคำตอบ (Owner Decision — payload ต้องมีกลไกเข้ารหัสก่อน)

export type MasterKey =
  | "namePrefixes"
  | "buildingTypes"
  | "ownershipTypes"
  | "tambons"
  | "moos"
  | "vulnerabilityTypes"
  | "assistanceNeedTypes"
  | "resourceTypes"
  | "alertChannels"
  | "volunteerSkillTypes";

export type FieldType =
  | "text"
  | "phone"
  | "number"
  | "date"
  | "radio"
  | "select"
  | "checkbox-group"
  | "boolean"
  | "textarea";

export interface EntryField {
  /** ชื่อฟิลด์ตรงกับ Prisma schema (Household.* / FloodRiskProfile.* ฯลฯ) */
  name: string;
  label: string;
  type: FieldType;
  /** ตัวเลือกจาก Master Data (โหลดจาก DB — ห้าม hardcode) */
  masterKey?: MasterKey;
  /** ตัวเลือก enum ตามกระดาษ (ลำดับตรงกระดาษ) */
  options?: { value: string; label: string }[];
  /** ป้ายตัวเลือก boolean ตามกระดาษ (ลำดับตรงกระดาษ เช่น "ไม่มี" ก่อน "มี") */
  booleanLabels?: { true: string; false: string; trueFirst: boolean };
  /** number: บังคับจำนวนเต็มไม่ติดลบ (เช่น อายุ/จำนวนคน) */
  integer?: boolean;
  /** number: ค่าสูงสุดที่ยอมรับ (clamp ระหว่างพิมพ์) */
  max?: number;
  /** Critical Field ⭐ — Entry 2 ต้องคีย์ซ้ำ (อ้าง docs/03) */
  critical?: boolean;
  /** ข้อมูลอ่อนไหว 🔒 (L3/L4) */
  sensitive?: boolean;
  hint?: string;
  /** แสดงเมื่อฟิลด์อื่นมีค่าที่กำหนด (skip logic ระดับฟิลด์ เช่น "อื่นๆ ระบุ") */
  showWhen?: { field: string; equals: string };
}

export interface EntryStep {
  id: string;
  paperSection: string;
  title: string;
  description?: string;
  /** step แบบตารางกลุ่มเปราะบาง (Grid — FR-ENT-10) */
  kind: "fields" | "vulnerable-grid";
  fields: EntryField[];
  /** ข้าม step นี้เมื่อ hasVulnerable = false (FR-ENT-13) */
  skipWhenNoVulnerable?: boolean;
}

const YES_NO: EntryField["booleanLabels"] = { true: "มี", false: "ไม่มี", trueFirst: true };

export const ENTRY_STEPS: EntryStep[] = [
  {
    id: "survey-info",
    paperSection: "ส่วนที่ 0",
    title: "ข้อมูลการสำรวจ",
    description: "ข้อมูลสำหรับผู้บันทึก — คีย์ตามที่เขียนบนกระดาษ ห้ามเติมเอง",
    kind: "fields",
    fields: [
      { name: "surveyNo", label: "แบบสอบถามลำดับที่", type: "text" },
      {
        name: "communityNameOnPaper",
        label: "ชื่อชุมชน (ตามที่ผู้สำรวจเขียน)",
        type: "text",
        hint: "คีย์ตามตัวอักษร — ระบบจะเทียบกับชุมชนของ Batch ให้ภายหลัง",
      },
      { name: "surveyorNameOnPaper", label: "ชื่อ-นามสกุล ผู้สำรวจ", type: "text" },
      { name: "surveyorPhoneOnPaper", label: "เบอร์โทรศัพท์ผู้สำรวจ", type: "phone" },
      {
        name: "surveyedAt",
        label: "วันที่สำรวจ (วันที่/เดือน/ปี ตามกระดาษ)",
        type: "date",
        hint: "ห้ามใส่วันที่วันนี้แทนค่าว่าง (BR-47) — กระดาษเขียน พ.ศ. ให้คีย์ตามกระดาษ",
      },
    ],
  },
  {
    id: "basic-info",
    paperSection: "ส่วนที่ 1 ข้อ 1-2",
    title: "ข้อมูลพื้นฐาน",
    kind: "fields",
    fields: [
      {
        name: "buildingTypeId",
        label: "ประเภทของสิ่งปลูกสร้าง / สถานประกอบการ",
        type: "radio",
        masterKey: "buildingTypes",
      },
      {
        name: "buildingTypeOther",
        label: "อื่นๆ (ระบุ)",
        type: "text",
        showWhen: { field: "buildingTypeId", equals: "OTHER" },
      },
      { name: "placeName", label: "ชื่อสถานที่/ชื่อร้าน (ถ้ามี)", type: "text" },
      {
        name: "respondentPrefix",
        label: "คำนำหน้า (ผู้ให้ข้อมูล/เจ้าของ/ผู้ดูแล)",
        type: "select",
        masterKey: "namePrefixes",
      },
      {
        name: "respondentFirstName",
        label: "ชื่อ (ผู้ให้ข้อมูล/เจ้าของ/ผู้ดูแล)",
        type: "text",
        sensitive: true,
      },
      {
        name: "respondentLastName",
        label: "นามสกุล (ผู้ให้ข้อมูล/เจ้าของ/ผู้ดูแล)",
        type: "text",
        sensitive: true,
      },
      {
        name: "respondentPhone",
        label: "เบอร์โทรศัพท์ที่ติดต่อได้",
        type: "phone",
        critical: true,
        sensitive: true,
      },
    ],
  },
  {
    id: "location",
    paperSection: "ส่วนที่ 1 ข้อ 3-4",
    title: "ที่ตั้ง พิกัด และผู้อยู่อาศัย",
    kind: "fields",
    fields: [
      { name: "houseNo", label: "เลขที่", type: "text", critical: true },
      { name: "mooId", label: "หมู่ที่", type: "radio", masterKey: "moos", critical: true },
      { name: "soi", label: "ซอย", type: "text" },
      { name: "road", label: "ถนน", type: "text" },
      { name: "tambonId", label: "ตำบล", type: "radio", masterKey: "tambons" },
      {
        name: "coordinateRawText",
        label: "พิกัด GPS / ละติจูด-ลองจิจูด (ตามที่เขียนบนกระดาษ)",
        type: "text",
        critical: true,
        sensitive: true,
        hint: "คีย์ตามตัวอักษร ห้ามแปลงเอง — ระบบจะ parse เป็น lat/lng ภายหลัง (QM-04)",
      },
      {
        name: "memberCount",
        label: "จำนวนสมาชิกในครัวเรือน/หน่วยงาน (คน)",
        type: "number",
        integer: true,
        max: 5000,
      },
      {
        name: "ownershipTypeId",
        label: "กรรมสิทธิ์ในสิ่งปลูกสร้าง/ที่ดิน",
        type: "radio",
        masterKey: "ownershipTypes",
      },
      {
        name: "ownershipOther",
        label: "อื่นๆ (ระบุ)",
        type: "text",
        showWhen: { field: "ownershipTypeId", equals: "OTHER" },
      },
    ],
  },
  {
    id: "vulnerable-gate",
    paperSection: "ส่วนที่ 2 ข้อ 1",
    title: "กลุ่มเปราะบาง — มี/ไม่มี",
    description:
      "หากติ๊ก ☑ ไม่มีกลุ่มเปราะบาง ระบบจะข้ามตารางและความต้องการช่วยเหลือ (ข้ามไปส่วนที่ 3)",
    kind: "fields",
    fields: [
      {
        name: "hasVulnerable",
        label: "ในครัวเรือน/สถานประกอบการนี้ มีบุคคลกลุ่มเปราะบางหรือไม่",
        type: "boolean",
        booleanLabels: { true: "มี (กรอกตาราง)", false: "ติ๊ก ☑ ไม่มีกลุ่มเปราะบาง", trueFirst: true },
      },
    ],
  },
  {
    id: "vulnerable-persons",
    paperSection: "ส่วนที่ 2 ข้อ 2",
    title: "ตารางกลุ่มเปราะบาง (รายบุคคล)",
    description: "1 บรรทัดต่อ 1 คน — ติ๊กความเปราะบางได้มากกว่า 1 ข้อต่อคน",
    kind: "vulnerable-grid",
    skipWhenNoVulnerable: true,
    fields: [
      { name: "prefix", label: "คำนำหน้า", type: "select", masterKey: "namePrefixes" },
      { name: "firstName", label: "ชื่อ", type: "text", critical: true, sensitive: true },
      { name: "lastName", label: "นามสกุล", type: "text", sensitive: true },
      { name: "age", label: "อายุ (ปี)", type: "number" },
      { name: "phone", label: "เบอร์โทรศัพท์ (ถ้ามี)", type: "phone", critical: true, sensitive: true },
      {
        name: "vulnerabilities",
        label: "ลักษณะความเปราะบาง",
        type: "checkbox-group",
        masterKey: "vulnerabilityTypes",
        sensitive: true,
      },
    ],
  },
  {
    id: "assistance",
    paperSection: "ส่วนที่ 2 ข้อ 3",
    title: "ความต้องการช่วยเหลือเมื่อเกิดน้ำท่วม",
    kind: "fields",
    skipWhenNoVulnerable: true,
    fields: [
      {
        name: "assistanceTotalPersonCount",
        label: "ต้องการความช่วยเหลือ รวมทั้งหมด (คน)",
        type: "number",
        integer: true,
        max: 5000,
        hint: "ช่องรวมระดับครัวเรือน — ระบบจะเทียบกับผลรวมรายข้อเป็นคำเตือน (QM-07)",
      },
      {
        name: "assistanceNeeds",
        label: "ความต้องการ (เลือกได้หลายข้อ พร้อมจำนวนคน/รายละเอียดตามข้อ)",
        type: "checkbox-group",
        masterKey: "assistanceNeedTypes",
        sensitive: true,
      },
    ],
  },
  {
    id: "flood-risk",
    paperSection: "ส่วนที่ 3",
    title: "สภาพแวดล้อมและความเสี่ยงอุทกภัย",
    kind: "fields",
    fields: [
      {
        name: "floorLevelVsRoad",
        label: "1. ระดับพื้นบ้านเทียบถนน",
        type: "radio",
        options: [
          { value: "BELOW_ROAD", label: "ต่ำกว่าถนน" },
          { value: "EQUAL_ROAD", label: "เท่าถนน" },
          { value: "ABOVE_ROAD", label: "สูงกว่าถนน" },
        ],
      },
      {
        name: "hasFloodedBefore",
        label: "2. สถานที่แห่งนี้เคยน้ำท่วมหรือไม่",
        type: "boolean",
        booleanLabels: { true: "เคย", false: "ไม่เคย", trueFirst: true },
      },
      {
        name: "floodDepthMetersRaw",
        label: "3. ระดับน้ำท่วมสูงสุด — เมตร",
        type: "number",
        critical: true,
        hint: "2 ช่องตรงกระดาษ ห้ามรวมเป็นเซนติเมตรเอง (QM-08)",
      },
      { name: "floodDepthCmRaw", label: "3. ระดับน้ำท่วมสูงสุด — เซนติเมตร", type: "number", critical: true },
      { name: "lastFloodDurationDays", label: "4. น้ำท่วมครั้งล่าสุดนานกี่วัน", type: "number" },
      {
        name: "hasSafeParking",
        label: "5. มีพื้นที่จอดรถที่ปลอดภัยจากน้ำท่วมในสถานที่หรือไม่",
        type: "boolean",
        booleanLabels: YES_NO,
      },
      {
        name: "hasAlternateParking",
        label: "6. มีจุดจอดรถที่ปลอดภัยที่อื่นหรือไม่",
        type: "boolean",
        // กระดาษเรียง "ไม่มี" ก่อน "มี" — ต้องเรียงตาม (FR-ENT-01)
        booleanLabels: { true: "มี", false: "ไม่มี", trueFirst: false },
      },
      {
        name: "alternateParkingLocation",
        label: "ระบุสถานที่จอดรถ",
        type: "text",
        showWhen: { field: "hasAlternateParking", equals: "true" },
      },
      {
        name: "lastEvacuationPlace",
        label: "7. น้ำท่วมล่าสุด ท่านและสมาชิกอพยพไปอยู่ที่ใด",
        type: "radio",
        options: [
          { value: "UPPER_FLOOR", label: "อาศัยชั้น 2 / ชั้น 3" },
          { value: "ROOF", label: "อาศัยบนหลังคา" },
          { value: "NEAREST_SITE", label: "ไปยังจุดอพยพที่ใกล้ที่สุด" },
          { value: "OTHER", label: "อื่นๆ" },
        ],
      },
      {
        name: "lastEvacuationOther",
        label: "อื่นๆ (ระบุ)",
        type: "text",
        showWhen: { field: "lastEvacuationPlace", equals: "OTHER" },
      },
      {
        name: "nearestEvacSiteType",
        label: "8. จุดอพยพใกล้ที่สุด",
        type: "radio",
        options: [
          { value: "RELATIVE_HOUSE", label: "บ้านญาติ" },
          { value: "SCHOOL", label: "โรงเรียน" },
          { value: "TEMPLE_MOSQUE", label: "วัด/มัสยิด" },
          { value: "COMMUNITY_CENTER", label: "ศูนย์ชุมชน" },
          { value: "MUNICIPALITY", label: "พื้นที่เทศบาล" },
          { value: "UNKNOWN", label: "ไม่ทราบ" },
          { value: "OTHER", label: "อื่นๆ" },
        ],
      },
      {
        name: "nearestEvacSiteOther",
        label: "อื่นๆ (ระบุ)",
        type: "text",
        showWhen: { field: "nearestEvacSiteType", equals: "OTHER" },
      },
      {
        name: "evacuationVehicles",
        label: "9. ยานพาหนะที่ใช้ในกรณีอพยพ (เลือกได้หลายข้อ)",
        type: "checkbox-group",
        options: [
          { value: "CAR", label: "รถยนต์" },
          { value: "MOTORCYCLE", label: "มอเตอร์ไซค์" },
          { value: "BOAT", label: "เรือ" },
          { value: "OTHER", label: "อื่นๆ" },
        ],
      },
      {
        name: "hasSurvivalKit",
        label: "10. มีการเตรียมถุงยังชีพ/อาหาร/น้ำ/ไฟฉายสำรองไว้หรือไม่",
        type: "boolean",
        booleanLabels: { true: "เตรียม", false: "ไม่ได้เตรียม", trueFirst: true },
      },
      {
        name: "householdResources",
        label: "11. เครื่องมือ/ทรัพยากรที่ใช้รับมืออุทกภัย (☐ ไม่มี = ติ๊กยืนยันว่าไม่มี)",
        type: "checkbox-group",
        masterKey: "resourceTypes",
        hint: "ติ๊ก \"ไม่มี\" = EXPLICIT_NONE · ไม่ติ๊กเลย = ว่างในกระดาษ (QM-09)",
      },
      {
        name: "canBeHostHouse",
        label: "12. สถานที่นี้ใช้เป็น \"บ้านพี่เลี้ยง/จุดอพยพย่อย\" ได้หรือไม่",
        type: "boolean",
        booleanLabels: { true: "ได้", false: "ไม่ได้", trueFirst: true },
      },
    ],
  },
  {
    id: "alert-participation",
    paperSection: "ส่วนที่ 4",
    title: "การเตือนภัย การอพยพ และการมีส่วนร่วม",
    kind: "fields",
    fields: [
      {
        name: "alertChannels",
        label: "1. รับข่าวเตือนภัยจากช่องทางใด (เลือกได้หลายข้อ)",
        type: "checkbox-group",
        masterKey: "alertChannels",
      },
      {
        name: "usesSmartphone",
        label: "2. สมาชิกใช้สมาร์ทโฟน (iPhone/Android) หรือไม่",
        type: "boolean",
        booleanLabels: { true: "ใช้", false: "ไม่ใช้", trueFirst: true },
      },
      {
        name: "canScanQR",
        label: "3. สามารถสแกน QR Code ได้หรือไม่",
        type: "boolean",
        booleanLabels: { true: "ได้", false: "ไม่ได้", trueFirst: true },
      },
      {
        name: "volunteerInterests",
        label: "4. สนใจเข้าร่วมเป็นอาสาสมัคร (เลือกได้หลายด้าน · ☐ ไม่สะดวก = ติ๊กแยก)",
        type: "checkbox-group",
        masterKey: "volunteerSkillTypes",
        hint: "\"ไม่สะดวก\" เป็นสถานะไม่สมัคร ไม่ใช่ทักษะ (QM-12)",
      },
      {
        name: "mentalHealthSupport",
        label: "5. ต้องการการเยียวยาด้านจิตใจหรือไม่",
        type: "boolean",
        booleanLabels: { true: "ต้องการ", false: "ไม่ต้องการ", trueFirst: true },
        sensitive: true,
      },
      { name: "suggestion", label: "6. ข้อเสนอแนะเพิ่มเติม", type: "textarea" },
    ],
  },
  {
    id: "final",
    paperSection: "ส่วนที่ 5 + ท้ายเล่ม",
    title: "โครงการแก้จน และส่วนสำหรับผู้สำรวจ",
    kind: "fields",
    fields: [
      {
        name: "povertyProgramInterest",
        label: "สนใจเข้าร่วมกิจกรรมเสริมรายได้ (โครงการแก้ไขปัญหาความยากจนฯ ม.ทักษิณ)",
        type: "boolean",
        // กระดาษเรียง "ไม่สนใจ" ก่อน "สนใจ"
        booleanLabels: { true: "สนใจ", false: "ไม่สนใจ", trueFirst: false },
      },
      {
        name: "riskLevelSurveyor",
        label: "ระดับความเสี่ยงครัวเรือน (ตามที่ผู้สำรวจติ๊ก — ห้ามประเมินเอง BR-54)",
        type: "radio",
        options: [
          { value: "LOW", label: "ต่ำ" },
          { value: "MEDIUM", label: "ปานกลาง" },
          { value: "HIGH", label: "สูง" },
        ],
      },
      { name: "surveyorNote", label: "หมายเหตุเพิ่มเติม (ของผู้สำรวจ)", type: "textarea" },
    ],
  },
];

/** step ที่มองเห็นตามคำตอบ hasVulnerable (skip logic — FR-ENT-13) */
export function visibleSteps(hasVulnerable: boolean | null): EntryStep[] {
  if (hasVulnerable === false) {
    return ENTRY_STEPS.filter((s) => !s.skipWhenNoVulnerable);
  }
  return ENTRY_STEPS;
}
