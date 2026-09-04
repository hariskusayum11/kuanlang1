// ทะเบียน "กลุ่ม" (segment) สำหรับ Drill-down จากตัวเลขรายงาน → รายชื่อ → ส่งออก Excel
// -----------------------------------------------------------------------------
// ไฟล์นี้เป็น Pure (ไม่แตะ DB) — คืน where-fragment + metadata ให้ชั้น data นำไป query
// กติกา: where-fragment ทุกอันจะถูก AND กับ base where (trusted-where) เสมอ ที่ชั้น data
//   จึงเคารพ ตัวกรอง (ชุมชน/ตำบล/วันที่/สถานะ) และขอบเขตข้อมูลเดิมโดยอัตโนมัติ
// ความอ่อนไหว: health → ต้องมี MEDICAL_REPORT_EXPORT (ADMIN/ผู้บริหาร)
//              general → ต้องมี REPORT_SEGMENT_EXPORT (ADMIN/OFFICER/EXECUTIVE)

import { Prisma, VehicleType } from "@prisma/client";
import { PERMISSIONS, type Permission } from "../authz/permissions";
import type { TriageCode } from "../../domain/triage";

export type SegmentSensitivity = "health" | "general";
export type SegmentKind = "household" | "person";
export type DetailRelation = "assistance" | "vehicle" | "vulnerability";

export interface SegmentDescriptor {
  id: string;
  label: string;
  kind: SegmentKind;
  sensitivity: SegmentSensitivity;
  /** person + triage ที่เป็นค่า derived → ชั้น data ต้องกรองหลัง query (Prisma where ทำไม่ได้) */
  triage?: TriageCode | "UNASSESSED";
  /** where-fragment ระดับ household (kind = household) — ANDกับ base */
  householdWhere?: Prisma.HouseholdWhereInput;
  /** where-fragment ระดับ person (kind = person) เทียบ vulnerablePerson — household จะถูกเติม base ให้ */
  personWhere?: Prisma.VulnerablePersonWhereInput;
  /** ให้ชั้น data ดึง "รายละเอียด (อื่นๆ)" ของ relation นี้ที่ตรงกับ type — รองรับข้อ 6 (ดู "อื่นๆ") */
  detail?: { relation: DetailRelation; typeValue: string };
}

export function permissionForSegment(seg: SegmentDescriptor): Permission {
  return seg.sensitivity === "health"
    ? PERMISSIONS.MEDICAL_REPORT_EXPORT
    : PERMISSIONS.REPORT_SEGMENT_EXPORT;
}

// ---- กลุ่มระดับครัวเรือน (1 แถว = 1 ครัวเรือน) ----
const HOUSEHOLD_SEGMENTS: Record<string, SegmentDescriptor> = {
  households: { id: "households", label: "ครัวเรือนทั้งหมด", kind: "household", sensitivity: "general", householdWhere: {} },
  "vulnerable-households": {
    id: "vulnerable-households", label: "ครัวเรือนที่มีกลุ่มเปราะบาง", kind: "household", sensitivity: "health",
    householdWhere: { vulnerablePersons: { some: { isActive: true } } },
  },
  "assistance-households": {
    id: "assistance-households", label: "ครัวเรือนที่ต้องการความช่วยเหลือ", kind: "household", sensitivity: "general",
    householdWhere: { assistanceNeeds: { some: {} } },
  },
  flooded: {
    id: "flooded", label: "ครัวเรือนที่เคยน้ำท่วม", kind: "household", sensitivity: "general",
    householdWhere: { floodRiskProfile: { hasFloodedBefore: true } },
  },
  "without-kit": {
    id: "without-kit", label: "ไม่มีชุดยังชีพ", kind: "household", sensitivity: "general",
    householdWhere: { floodRiskProfile: { hasSurvivalKit: false } },
  },
  "without-resources": {
    id: "without-resources", label: "ไม่มีทรัพยากรรับมือ", kind: "household", sensitivity: "general",
    householdWhere: { hasNoResources: true },
  },
  smartphone: {
    id: "smartphone", label: "ใช้สมาร์ตโฟน", kind: "household", sensitivity: "general",
    householdWhere: { digitalReadiness: { usesSmartphone: true } },
  },
  "qr-ready": {
    id: "qr-ready", label: "สแกน QR ได้", kind: "household", sensitivity: "general",
    householdWhere: { digitalReadiness: { canScanQR: true } },
  },
  volunteers: {
    id: "volunteers", label: "สนใจเป็นอาสาสมัคร", kind: "household", sensitivity: "general",
    householdWhere: { volunteerNotAvailable: { not: true }, volunteerInterests: { some: { isAvailable: true } } },
  },
  "host-houses": {
    id: "host-houses", label: "ยินยอมเป็นจุดพักพิงเบื้องต้น", kind: "household", sensitivity: "general",
    householdWhere: { floodRiskProfile: { canBeHostHouse: true } },
  },
  "mental-health": {
    id: "mental-health", label: "ต้องการดูแลสุขภาพจิต", kind: "household", sensitivity: "health",
    householdWhere: { mentalHealthSupport: true },
  },
  poverty: {
    id: "poverty", label: "สนใจโครงการแก้ความยากจน", kind: "household", sensitivity: "general",
    householdWhere: { povertyProgramInterest: true },
  },
  "missing-coords": {
    id: "missing-coords", label: "ไม่มีพิกัด", kind: "household", sensitivity: "general",
    householdWhere: { OR: [{ latitude: null }, { longitude: null }] },
  },
  incomplete: {
    id: "incomplete", label: "ข้อมูลไม่ครบ", kind: "household", sensitivity: "general",
    householdWhere: { OR: [{ blankCount: { gt: 0 } }, { completenessScore: { lt: 1 } }] },
  },
  illegible: {
    id: "illegible", label: "มีช่องอ่านไม่ออก", kind: "household", sensitivity: "general",
    householdWhere: { illegibleCount: { gt: 0 } },
  },
};

// ---- กลุ่มระดับบุคคล (1 แถว = 1 คนในกลุ่มเปราะบาง) — health เสมอ ----
const PERSON_SEGMENTS: Record<string, SegmentDescriptor> = {
  "vulnerable-people": {
    id: "vulnerable-people", label: "กลุ่มเปราะบางทั้งหมด", kind: "person", sensitivity: "health", personWhere: {},
  },
  "triage:P1": { id: "triage:P1", label: "วิกฤต (P1)", kind: "person", sensitivity: "health", triage: "P1", personWhere: {} },
  "triage:P2": { id: "triage:P2", label: "เร่งด่วน (P2)", kind: "person", sensitivity: "health", triage: "P2", personWhere: {} },
  "triage:P3": { id: "triage:P3", label: "เฝ้าระวัง (P3)", kind: "person", sensitivity: "health", triage: "P3", personWhere: {} },
  "triage:UNASSESSED": {
    id: "triage:UNASSESSED", label: "ยังไม่ประเมินระดับ", kind: "person", sensitivity: "health", triage: "UNASSESSED", personWhere: {},
  },
};

const VEHICLE_VALUES = new Set<string>(Object.values(VehicleType));

/**
 * แปลง segment id → descriptor · คืน null ถ้าไม่รู้จัก (กัน id ปลอมจาก client)
 * id แบบพิมพ์ตามชนิด (typed): `assistance:<typeId>` `vehicle:<VehicleType>` `alert:<channelId>`
 *   `skill:<typeId>` `vuln:<typeId>` — label จริงของ typed segment เติมภายหลังจาก master data
 */
export function resolveSegment(id: string): SegmentDescriptor | null {
  if (HOUSEHOLD_SEGMENTS[id]) return HOUSEHOLD_SEGMENTS[id];
  if (PERSON_SEGMENTS[id]) return PERSON_SEGMENTS[id];

  const sep = id.indexOf(":");
  if (sep <= 0) return null;
  const prefix = id.slice(0, sep);
  const value = id.slice(sep + 1);
  if (!value) return null;

  switch (prefix) {
    case "assistance":
      return {
        id, label: "ความช่วยเหลือ", kind: "household", sensitivity: "general",
        householdWhere: { assistanceNeeds: { some: { needTypeId: value } } },
        detail: { relation: "assistance", typeValue: value },
      };
    case "vehicle":
      if (!VEHICLE_VALUES.has(value)) return null;
      return {
        id, label: "ยานพาหนะอพยพ", kind: "household", sensitivity: "general",
        householdWhere: { evacuationVehicles: { some: { vehicleType: value as VehicleType } } },
        detail: { relation: "vehicle", typeValue: value },
      };
    case "alert":
      return {
        id, label: "ช่องทางรับข่าวสาร", kind: "household", sensitivity: "general",
        householdWhere: { alertChannelPrefs: { some: { alertChannelId: value } } },
      };
    case "skill":
      return {
        id, label: "ทักษะอาสาสมัคร", kind: "household", sensitivity: "general",
        householdWhere: { volunteerInterests: { some: { volunteerTypeId: value, isAvailable: true } } },
      };
    case "vuln":
      return {
        id, label: "ลักษณะความเปราะบาง", kind: "person", sensitivity: "health",
        personWhere: { vulnerabilities: { some: { vulnerabilityTypeId: value } } },
        detail: { relation: "vulnerability", typeValue: value },
      };
    default:
      return null;
  }
}
