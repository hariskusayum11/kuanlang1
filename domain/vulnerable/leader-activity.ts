// ความเคลื่อนไหวของหัวหน้าชุมชน (docs/43 ข้อ 11) — แปลง Audit Log เป็นประโยคภาษาไทย · Pure Function
// อ่านจาก Audit Log ที่มีอยู่แล้ว (append-only) ไม่สร้างตารางแจ้งเตือนใหม่
// ข้อความไม่มี PII — Audit Log เก็บแค่รหัสสถานะ จำนวน และ id อยู่แล้ว

import { PERSON_STATUS_LABELS, type DisplayStatus } from "./status";

/** เหตุผลใน Audit Log ที่ถือเป็น "การกระทำของหัวหน้าชุมชน" ที่แอดมินควรรู้ */
export const LEADER_ACTIVITY_REASONS = [
  "vulnerable-status-change",
  "vulnerable-household-moved-out",
  "vulnerable-person-reported",
  "population-update",
  "host-shelter-verified",
  "host-shelter-updated",
  "host-shelter-revoked",
  "เพิ่มจุดสำคัญบนแผนที่",
  "แก้ไขจุดสำคัญบนแผนที่",
  "ลบจุดสำคัญออกจากแผนที่",
] as const;

export type LeaderActivityReason = (typeof LEADER_ACTIVITY_REASONS)[number];

/** ประเภทใหญ่สำหรับสีของป้าย — สถานะคน = ข้อมูลที่ตัวเลขทุกหน้าเปลี่ยนตาม จึงเด่นกว่า */
export type LeaderActivityKind = "status" | "person" | "community" | "site";

type Json = unknown;

function field(changes: Json, key: string): unknown {
  return changes && typeof changes === "object" ? (changes as Record<string, unknown>)[key] : undefined;
}

function statusLabel(code: unknown): string {
  return typeof code === "string" && code in PERSON_STATUS_LABELS
    ? PERSON_STATUS_LABELS[code as DisplayStatus]
    : "ไม่ทราบ";
}

const nf = (value: unknown) => (typeof value === "number" ? value.toLocaleString("th-TH") : "—");

export function describeLeaderActivity(
  reason: string,
  changes: Json,
): { kind: LeaderActivityKind; text: string } {
  switch (reason) {
    case "vulnerable-status-change": {
      const status = field(changes, "status");
      return {
        kind: "status",
        text: `เปลี่ยนสถานะกลุ่มเปราะบาง 1 คน: ${statusLabel(field(status, "old"))} → ${statusLabel(field(status, "new"))}`,
      };
    }
    case "vulnerable-household-moved-out":
      return { kind: "status", text: `บันทึกย้ายออกทั้งบ้าน ${nf(field(changes, "personCount"))} คน` };
    case "vulnerable-person-reported":
      return { kind: "person", text: "แจ้งเพิ่มคนเปราะบางรายใหม่ 1 คน (นับทันที)" };
    case "population-update": {
      const total = field(changes, "totalHouseholds");
      const show = (v: unknown) => (typeof v === "number" ? v.toLocaleString("th-TH") : "ยังไม่ทราบ");
      return { kind: "community", text: `แก้จำนวนครัวเรือนทั้งหมด: ${show(field(total, "old"))} → ${show(field(total, "new"))}` };
    }
    case "host-shelter-verified":
      return { kind: "site", text: "ยืนยันบ้านพักพิง" };
    case "host-shelter-updated":
      return { kind: "site", text: "แก้ข้อมูลบ้านพักพิง" };
    case "host-shelter-revoked":
      return { kind: "site", text: "ยกเลิกบ้านพักพิง" };
    case "เพิ่มจุดสำคัญบนแผนที่":
      return { kind: "site", text: "เพิ่มจุดสำคัญบนแผนที่" };
    case "แก้ไขจุดสำคัญบนแผนที่":
      return { kind: "site", text: "แก้ไขจุดสำคัญบนแผนที่" };
    case "ลบจุดสำคัญออกจากแผนที่":
      return { kind: "site", text: "ลบจุดสำคัญออกจากแผนที่" };
    default:
      return { kind: "community", text: reason };
  }
}

/** householdId ที่เกี่ยวข้อง (ถ้ามี) — ใช้ทำลิงก์ไปดูใบ */
export function activityHouseholdId(entityType: string, entityId: string | null, changes: Json): string | null {
  if (entityType === "Household") return entityId;
  const id = field(changes, "householdId");
  return typeof id === "string" ? id : null;
}
