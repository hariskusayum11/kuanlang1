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
  | "textarea"
  // 2 ช่องตัวเลขบนคำถามเดียว ตรงตามกระดาษ (เช่น "___ เมตร ___ ซม." — QM-08)
  | "measure-pair"
  // พิกัดช่องเดียวตามกระดาษ + แสดงผล parse ให้ผู้คีย์ทานทันที (QM-04)
  | "coordinate"
  // เลือกได้หลายข้อ + ช่องจำนวนคน/รายละเอียดรายข้อ ตาม requiresCount/requiresDetail ของ master
  | "assistance-needs";

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
  /** number/measure-pair: หน่วยแสดงต่อท้ายช่อง (เช่น "เมตร") */
  unit?: string;
  /** measure-pair: ช่องที่สองบนคำถามเดียว (เก็บเป็น answer key แยกของตัวเอง) */
  pair?: { name: string; unit: string; max?: number };
  /**
   * ต้องตอบก่อนส่งใบ — "ตอบ" หมายถึงมีค่า **หรือ** ถูกมาร์ก F2/F3
   * (CLAUDE.md: ห้ามบังคับให้ผู้คีย์เดาค่าที่อ่านไม่ออก — F2/F3 คือคำตอบที่ถูกต้อง)
   */
  required?: boolean;
  /** answer key เสริมของฟิลด์นี้ (เช่น จำนวน/รายละเอียดรายข้อ) — ต้องอยู่ใน whitelist ด้วย */
  extraKeys?: string[];
  /** Critical Field ⭐ — Entry 2 ต้องคีย์ซ้ำ (อ้าง docs/03) */
  critical?: boolean;
  /** ข้อมูลอ่อนไหว 🔒 (L3/L4) */
  sensitive?: boolean;
  hint?: string;
  /** แสดงเมื่อฟิลด์อื่นมีค่าที่กำหนด (skip logic ระดับฟิลด์ เช่น "อื่นๆ ระบุ") */
  showWhen?: { field: string; equals: string };
  /**
   * select: เพิ่มตัวเลือก "ไม่ระบุ" ที่ *นับว่าตอบแล้ว* (ค่าเก็บเป็น EXPLICIT_NONE)
   * ต่างจากช่องว่างที่แปลว่า "ยังไม่คีย์" — map เป็น null ตอนบันทึก (ไม่ใช่ FK)
   */
  explicitNone?: string;
  /**
   * text: เติมค่าจากรหัสใบ (sheetNo) อัตโนมัติและแก้ไขไม่ได้ — รหัสที่ระบบออกให้ตอนเริ่มใบ
   * คือ "แบบสอบถามลำดับที่" (#R7-A) ผู้คีย์เขียนรหัสนี้ลงกระดาษ ไม่ต้องพิมพ์เอง
   */
  readOnlyFromSheet?: boolean;
  /**
   * ค่าถูกกำหนดตั้งแต่ตอนเริ่มใบแล้ว (รหัสที่ระบบออก + ชุมชนที่ผู้คีย์เลือก) — ไม่ต้อง
   * ให้กรอกซ้ำ Wizard แสดงเป็น "ส่วนที่กรอกแล้ว" (read-only) ให้ข้ามไปช่องถัดไปได้ทันที
   * (ค่ายัง prefill ลง payload เพื่อบันทึกตามเดิม — แค่ไม่แสดงเป็นช่องกรอก)
   */
  confirmedFromStart?: boolean;
  /**
   * checkbox-group: ตัวเลือก "ไม่มี/ไม่สะดวก" แบบ exclusive อยู่ในกลุ่มเดียวกัน
   * (ติ๊ก none → ล้าง+ปิดตัวเลือกอื่น · ติ๊กตัวเลือกอื่น → ยกเลิก none อัตโนมัติ)
   * ค่า none เก็บเป็น boolean แยกคีย์ (`key`) — ต้องใส่ `key` นั้นใน `extraKeys` ด้วย
   * เพื่อให้ payload whitelist ยอมรับ · validation นับว่า "ตอบแล้ว" เมื่อ none = true
   */
  exclusiveNone?: { key: string; label: string };
  /**
   * บังคับให้ฟิลด์นี้ "ขึ้นต้นแถวใหม่" ในเลย์เอาต์หลายคอลัมน์ (col-start-1)
   * ใช้จัดกลุ่มที่ต้องอยู่แถวเดียวกัน เช่น คำนำหน้า/ชื่อ/นามสกุล ไม่ให้ถูกฟิลด์ก่อนหน้าดันแยกแถว
   */
  startsRow?: boolean;
  /**
   * บังคับให้ฟิลด์นี้กินเต็มความกว้าง (span ทุกคอลัมน์) → อยู่แถวของตัวเองเสมอ
   * ใช้กับคำถามป้ายยาวที่ถ้าวางคู่กันจะเบียด/ล้นแถว เช่น ข้อ boolean คำถามยาว
   */
  fullWidth?: boolean;
}

/**
 * ค่าที่หมายถึง "ผู้คีย์ยืนยันว่าไม่ระบุ" — ต่างจากค่าว่างที่แปลว่า "ยังไม่คีย์"
 * isAnswered() คืน true เพราะเป็นสตริงไม่ว่าง แต่ save.ts map เป็น null ก่อนลง FK
 */
export const EXPLICIT_NONE = "__none__";

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

// ไม่มีคำนำหน้าในกระดาษ → เลือก "ไม่ระบุ" ได้เลย (Owner: ให้ติ๊กง่าย ๆ สถานะเท่ากับเว้นว่าง)
const PREFIX_HINT = 'ถ้าไม่มีคำนำหน้า เลือก "ไม่ระบุ" ได้เลย';

const PREFIX_NONE_LABEL = "ไม่ระบุ";

export const ENTRY_STEPS: EntryStep[] = [
  {
    id: "survey-info",
    paperSection: "ส่วนที่ 0",
    title: "ข้อมูลการสำรวจ",
    description: "ข้อมูลสำหรับผู้บันทึก — คีย์ตามที่เขียนบนกระดาษ ห้ามเติมเอง",
    kind: "fields",
    fields: [
      {
        name: "surveyNo",
        label: "รหัสแบบสอบถาม",
        type: "text",
        required: true,
        readOnlyFromSheet: true,
        confirmedFromStart: true,
        hint: "รหัสที่ระบบออกให้ตอนเริ่มใบ — เขียนรหัสนี้ลงบนกระดาษ · แก้ไม่ได้",
      },
      {
        name: "communityNameOnPaper",
        label: "ชุมชน",
        type: "text",
        confirmedFromStart: true,
        hint: "ชุมชนที่เลือกไว้ตอนเริ่มใบ — บันทึกให้อัตโนมัติ",
      },
      {
        name: "surveyorPrefix",
        label: "คำนำหน้า (ผู้สำรวจ)",
        type: "select",
        masterKey: "namePrefixes",
        explicitNone: PREFIX_NONE_LABEL,
        hint: PREFIX_HINT,
      },
      {
        name: "surveyorPrefixOther",
        label: "ระบุคำนำหน้า (ผู้สำรวจ)",
        type: "text",
        showWhen: { field: "surveyorPrefix", equals: "OTHER" },
      },
      { name: "surveyorFirstNameOnPaper", label: "ชื่อ (ผู้สำรวจ)", type: "text" },
      { name: "surveyorLastNameOnPaper", label: "นามสกุล (ผู้สำรวจ)", type: "text" },
      { name: "surveyorPhoneOnPaper", label: "เบอร์โทรศัพท์ผู้สำรวจ", type: "phone" },
      {
        name: "surveyedAt",
        label: "วันที่สำรวจ (วันที่/เดือน/ปี ตามกระดาษ)",
        required: true,
        type: "date",
        hint: "ห้ามใส่วันที่วันนี้แทนค่าว่าง — กระดาษเขียน พ.ศ. ให้คีย์ตามกระดาษ",
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
        explicitNone: PREFIX_NONE_LABEL,
        hint: PREFIX_HINT,
        // ขึ้นแถวใหม่ให้ คำนำหน้า/ชื่อ/นามสกุล อยู่แถวเดียวกัน (ไม่ถูก "ชื่อสถานที่" ดันแยก)
        startsRow: true,
      },
      {
        name: "respondentPrefixOther",
        label: "ระบุคำนำหน้า (ผู้ให้ข้อมูล)",
        type: "text",
        showWhen: { field: "respondentPrefix", equals: "OTHER" },
      },
      {
        name: "respondentFirstName",
        label: "ชื่อ (ผู้ให้ข้อมูล/เจ้าของ/ผู้ดูแล)",
        type: "text",
        required: true,
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
      { name: "houseNo", label: "เลขที่", type: "text", critical: true, required: true },
      { name: "mooNo", label: "หมู่ที่", type: "number", integer: true, max: 999, critical: true, required: true },
      { name: "soi", label: "ซอย", type: "text", startsRow: true },
      { name: "road", label: "ถนน", type: "text" },
      { name: "tambonId", label: "ตำบล", type: "radio", masterKey: "tambons", required: true },
      {
        // แยกเป็นสองช่อง ละติจูด/ลองจิจูด (Owner Decision 2026-08-03) แต่ยังเป็นพิกัดจุดเดียว
        // ประกอบกลับเป็น coordinateRawText ตอนบันทึก — ใช้กลไก pair เดียวกับ measure-pair
        name: "latitudeText",
        label: "พิกัด GPS / ละติจูด-ลองจิจูด (ตามที่เขียนบนกระดาษ)",
        type: "coordinate",
        critical: true,
        sensitive: true,
        pair: { name: "longitudeText", unit: "" },
        hint: "คีย์ตามตัวเลขที่เขียนมา ห้ามจัดรูปแบบใหม่ — ระบบจะอ่านค่าให้ทานเองด้านล่าง",
      },
      {
        name: "memberCount",
        label: "จำนวนสมาชิกในครัวเรือน/หน่วยงาน (คน)",
        type: "number",
        required: true,
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
        required: true,
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
      { name: "prefixOther", label: "ระบุคำนำหน้า (อื่นๆ)", type: "text" },
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
        hint: "ช่องรวมระดับครัวเรือน — ระบบจะเทียบกับผลรวมรายข้อเป็นคำเตือน",
      },
      {
        name: "assistanceNeeds",
        label: "ความต้องการ (เลือกได้หลายข้อ พร้อมจำนวนคน/รายละเอียดตามข้อ)",
        type: "assistance-needs",
        masterKey: "assistanceNeedTypes",
        extraKeys: ["assistanceNeedCounts", "assistanceNeedDetails"],
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
        // คำถามเดียว 2 ช่องตรงกระดาษ — คีย์ตามช่อง ระบบคำนวณ ซม.รวมให้เอง (QM-08)
        name: "floodDepthMetersRaw",
        label: "3. ระดับน้ำท่วมสูงสุด (วัดจากพื้น)",
        type: "measure-pair",
        integer: true,
        unit: "เมตร",
        max: 10,
        pair: { name: "floodDepthCmRaw", unit: "ซม.", max: 99 },
        critical: true,
        hint: "กรอกตามช่องบนกระดาษ — เขียนไว้ช่องไหนใส่ช่องนั้น ไม่ต้องคิดเลขรวมเอง",
      },
      { name: "lastFloodDurationDays", label: "4. น้ำท่วมครั้งล่าสุดนานกี่วัน", type: "number", fullWidth: true },
      {
        name: "hasSafeParking",
        label: "5. มีพื้นที่จอดรถที่ปลอดภัยจากน้ำท่วมในสถานที่หรือไม่",
        type: "boolean",
        booleanLabels: YES_NO,
        fullWidth: true,
      },
      {
        name: "hasAlternateParking",
        label: "6. มีจุดจอดรถที่ปลอดภัยที่อื่นหรือไม่",
        type: "boolean",
        // กระดาษเรียง "ไม่มี" ก่อน "มี" — ต้องเรียงตาม (FR-ENT-01)
        booleanLabels: { true: "มี", false: "ไม่มี", trueFirst: false },
        fullWidth: true,
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
        name: "nearestEvacSiteTypes",
        label: "8. จุดอพยพใกล้ที่สุด (เลือกได้หลายข้อ)",
        type: "checkbox-group",
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
        showWhen: { field: "nearestEvacSiteTypes", equals: "OTHER" },
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
        // ติ๊ก "อื่นๆ" ในกลุ่มด้านบน → เปิดช่องระบุ (showWhen รองรับ checkbox-group แล้ว)
        name: "evacuationVehiclesOther",
        label: "อื่นๆ ระบุยานพาหนะ",
        type: "text",
        showWhen: { field: "evacuationVehicles", equals: "OTHER" },
      },
      {
        name: "hasSurvivalKit",
        label: "10. มีการเตรียมถุงยังชีพ/อาหาร/น้ำ/ไฟฉายสำรองไว้หรือไม่",
        type: "boolean",
        booleanLabels: { true: "เตรียม", false: "ไม่ได้เตรียม", trueFirst: true },
      },
      {
        name: "householdResources",
        label: "11. เครื่องมือ/ทรัพยากรที่ใช้รับมืออุทกภัย (เลือกได้หลายข้อ)",
        type: "checkbox-group",
        masterKey: "resourceTypes",
        // "ไม่มี" อยู่ในกลุ่มเดียวกัน (exclusive) — ติ๊กแล้วติ๊กอย่างอื่นไม่ได้
        // เก็บลง Household.hasNoResources (ไม่ใช่ประเภททรัพยากรใน master resourceTypes)
        exclusiveNone: { key: "hasNoResources", label: "ไม่มี" },
        extraKeys: ["hasNoResources"],
        hint: "ติ๊ก \"ไม่มี\" เมื่อยืนยันว่าไม่มีทรัพยากร · ไม่ติ๊กเลย = ว่างในกระดาษ (กด F3)",
      },
      {
        // resourceTypes มีตัวเลือกรหัส OTHER (อื่นๆ) — ติ๊กแล้วเปิดช่องระบุ
        name: "householdResourcesOther",
        label: "อื่นๆ ระบุทรัพยากร",
        type: "text",
        showWhen: { field: "householdResources", equals: "OTHER" },
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
        fullWidth: true,
      },
      {
        name: "canScanQR",
        label: "3. สามารถสแกน QR Code ได้หรือไม่",
        type: "boolean",
        booleanLabels: { true: "ได้", false: "ไม่ได้", trueFirst: true },
        fullWidth: true,
      },
      {
        name: "volunteerInterests",
        label: "4. สนใจเข้าร่วมเป็นอาสาสมัคร (เลือกได้หลายด้าน)",
        type: "checkbox-group",
        masterKey: "volunteerSkillTypes",
        // "ไม่สะดวก" อยู่ในกลุ่มเดียวกัน (exclusive) — ติ๊กแล้วติ๊กด้านอื่นไม่ได้
        // เก็บลง Household.volunteerNotAvailable (ไม่ใช่ทักษะใน master volunteerSkillTypes)
        exclusiveNone: { key: "volunteerNotAvailable", label: "ไม่สะดวกเข้าร่วม" },
        extraKeys: ["volunteerNotAvailable"],
        hint: "ติ๊ก \"ไม่สะดวกเข้าร่วม\" เมื่อกระดาษระบุว่าไม่สะดวก · ไม่ติ๊กเลย = ว่างในกระดาษ (กด F3)",
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
    // แยกจากส่วนโครงการแก้จน (Owner Decision 2026-08-03) — ส่วนผู้สำรวจขึ้นก่อนเป็นส่วนที่ 5
    id: "surveyor",
    paperSection: "ส่วนที่ 5",
    title: "สำหรับผู้สำรวจ",
    kind: "fields",
    fields: [
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
  {
    id: "poverty-program",
    paperSection: "ส่วนที่ 6",
    title: "โครงการแก้จน",
    kind: "fields",
    fields: [
      {
        name: "povertyProgramInterest",
        label: "สนใจเข้าร่วมกิจกรรมเสริมรายได้ (โครงการแก้ไขปัญหาความยากจนฯ ม.ทักษิณ)",
        type: "boolean",
        // กระดาษเรียง "ไม่สนใจ" ก่อน "สนใจ"
        booleanLabels: { true: "สนใจ", false: "ไม่สนใจ", trueFirst: false },
      },
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
