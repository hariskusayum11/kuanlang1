// สถานะกลุ่มเปราะบางหลังการสำรวจ (Owner Decision 2026-10-19 · docs/34)
// Pure Function ล้วน ไม่แตะฐานข้อมูล จึงทดสอบทุกเส้นทางได้โดยไม่ต้องมี DB
//
// แนวคิด: "เสียชีวิต / ย้ายออก / ไม่เข้าเกณฑ์แล้ว" เป็น **เหตุการณ์หลังการสำรวจ**
// ไม่ใช่การแก้ข้อมูลกระดาษ — จึงเก็บแยกที่ VulnerablePerson.isActive + deactivated*
// และไม่ทำให้ใบกลับไปรอตรวจ ตัวเลขทุกหน้าที่กรอง isActive จะเปลี่ยนตามทันที

/** สถานะที่ทำให้บุคคลนั้นไม่ถูกนับเป็นกลุ่มเปราะบางอีกต่อไป (รหัสที่เก็บใน deactivatedReason) */
export const INACTIVE_STATUSES = ["DECEASED", "MOVED_OUT", "NO_LONGER_ELIGIBLE"] as const;
export type InactiveStatus = (typeof INACTIVE_STATUSES)[number];

/** สถานะที่ผู้ใช้เลือกได้ — ACTIVE = "คืนสถานะ" */
export type PersonStatus = "ACTIVE" | InactiveStatus;
export const SELECTABLE_STATUSES: readonly PersonStatus[] = ["ACTIVE", ...INACTIVE_STATUSES];

/**
 * สถานะสำหรับแสดงผล — เพิ่ม INACTIVE_UNKNOWN ไว้รองรับแถวที่ isActive=false
 * แต่ไม่มีรหัสที่รู้จัก (เช่น ข้อมูลที่ถูกปิดด้วยวิธีอื่นก่อนมีฟีเจอร์นี้) ห้ามเดาว่าเป็นสถานะใด
 */
export type DisplayStatus = PersonStatus | "INACTIVE_UNKNOWN";

export const PERSON_STATUS_LABELS: Record<DisplayStatus, string> = {
  ACTIVE: "ปกติ",
  DECEASED: "เสียชีวิต",
  MOVED_OUT: "ย้ายออก",
  NO_LONGER_ELIGIBLE: "ไม่เข้าเกณฑ์แล้ว",
  INACTIVE_UNKNOWN: "ไม่นับแล้ว (ไม่ระบุเหตุผล)",
};

/** คำอธิบายสั้นใต้ตัวเลือก — ช่วยให้หัวหน้าชุมชนเลือกถูก */
export const PERSON_STATUS_HINTS: Record<PersonStatus, string> = {
  ACTIVE: "คืนสถานะกรณีบันทึกผิด — กลับมานับเป็นกลุ่มเปราะบางตามเดิม",
  DECEASED: "ผู้นั้นเสียชีวิตแล้ว",
  MOVED_OUT: "ย้ายออกจากชุมชน ไม่ได้อาศัยอยู่ที่บ้านหลังนี้แล้ว",
  NO_LONGER_ELIGIBLE: "เช่น คลอดแล้ว เด็กอายุเกิน 5 ปี หรือหายป่วยแล้ว",
};

export function isInactiveStatus(value: unknown): value is InactiveStatus {
  return (INACTIVE_STATUSES as readonly unknown[]).includes(value);
}

export function isPersonStatus(value: unknown): value is PersonStatus {
  return value === "ACTIVE" || isInactiveStatus(value);
}

/** อ่านสถานะจากคอลัมน์ในฐานข้อมูล */
export function displayStatusOf(row: {
  isActive: boolean;
  deactivatedReason: string | null;
}): DisplayStatus {
  if (row.isActive) return "ACTIVE";
  return isInactiveStatus(row.deactivatedReason) ? row.deactivatedReason : "INACTIVE_UNKNOWN";
}

export type TransitionResult = { ok: true } | { ok: false; reason: "UNCHANGED" };

/** เปลี่ยนได้ทุกทิศทาง ยกเว้นเปลี่ยนเป็นสถานะเดิม (กันเขียน Audit Log ซ้ำโดยไม่มีอะไรเปลี่ยน) */
export function checkTransition(current: DisplayStatus, target: PersonStatus): TransitionResult {
  return current === target ? { ok: false, reason: "UNCHANGED" } : { ok: true };
}

/**
 * ค่าที่ต้องเขียนลงคอลัมน์เมื่อเปลี่ยนเป็น target
 * คืนสถานะ (ACTIVE) ล้างค่าเหตุการณ์ทั้งหมด — ประวัติเดิมอยู่ใน Audit Log
 */
export function statusColumns(
  target: PersonStatus,
  eventDate: Date | null,
  actorId: string,
): {
  isActive: boolean;
  deactivatedReason: string | null;
  deactivatedAt: Date | null;
  deactivatedById: string | null;
} {
  if (target === "ACTIVE") {
    return { isActive: true, deactivatedReason: null, deactivatedAt: null, deactivatedById: null };
  }
  return { isActive: false, deactivatedReason: target, deactivatedAt: eventDate, deactivatedById: actorId };
}

/** ย้อนหลังได้ไม่เกินกี่ปี — กันพิมพ์ปีผิด (เช่น พ.ศ./ค.ศ. สลับ) */
export const MAX_EVENT_YEARS_BACK = 5;

/**
 * ตรวจวันที่เกิดเหตุการณ์ (รูปแบบ YYYY-MM-DD จาก <input type="date">)
 * `today` รับเข้ามาเป็น "YYYY-MM-DD" ตามเวลาไทย เพื่อให้ผลแน่นอนในเทสต์
 */
export function parseEventDate(
  value: string,
  today: string,
): { ok: true; date: Date } | { ok: false; reason: "INVALID_DATE" | "FUTURE_DATE" | "TOO_OLD" } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, reason: "INVALID_DATE" };
  const date = new Date(`${value}T00:00:00.000Z`);
  // กันวันที่ที่ไม่มีจริง เช่น 2026-02-30 (Date จะเลื่อนไปเดือนถัดไปเงียบ ๆ)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, reason: "INVALID_DATE" };
  }
  if (value > today) return { ok: false, reason: "FUTURE_DATE" };
  const oldest = `${Number(today.slice(0, 4)) - MAX_EVENT_YEARS_BACK}${today.slice(4)}`;
  if (value < oldest) return { ok: false, reason: "TOO_OLD" };
  return { ok: true, date };
}

/** วันนี้ตามเวลาไทย (UTC+7 ไม่มี DST) ในรูป YYYY-MM-DD */
export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// ขอบเขตชุมชน — ข้อยกเว้นของ #R7-B เฉพาะหน้านี้
// ---------------------------------------------------------------------------

export type StatusScope = { kind: "ALL" } | { kind: "COMMUNITIES"; communityIds: string[] };

/**
 * ชุมชนที่ผู้ใช้เปลี่ยนสถานะได้
 *
 * Community Scope ถูกยกเลิกทั้งระบบ (#R7-B) แต่หัวหน้าชุมชนเห็นข้อมูลสุขภาพรายบุคคล
 * จึงต้องจำกัดเฉพาะชุมชนที่ผูกไว้ใน UserCommunityScope — **ใช้กับหน้านี้หน้าเดียว**
 * ไม่ได้เปิด scope กลับให้หน้าอื่น
 *
 * ADMIN เห็นทุกชุมชน (ดูแลแทน/คืนสถานะที่บันทึกผิด) · ไม่ดูธง hasGlobalCommunityScope
 * โดยตั้งใจ — ธงนั้นไม่มีความหมายแล้วหลัง #R7-B และอาจค้างค่า true จากของเดิม
 */
export function resolveStatusScope(roles: readonly string[], communityIds: readonly string[]): StatusScope {
  if (roles.includes("ADMIN")) return { kind: "ALL" };
  return { kind: "COMMUNITIES", communityIds: [...new Set(communityIds)] };
}

export function scopeAllows(scope: StatusScope, communityId: string): boolean {
  return scope.kind === "ALL" || scope.communityIds.includes(communityId);
}

// ---------------------------------------------------------------------------
// คงสถานะไว้เมื่อผู้คีย์เปิดใบเดิมขึ้นมาแก้ (lib/entry/save.ts)
// ---------------------------------------------------------------------------

/** กุญแจเทียบชื่อ — ตัดช่องว่างซ้ำและไม่สนตัวพิมพ์ (ชื่อว่าง = "" ไม่ใช้เทียบ) */
export function nameKey(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName ?? "", lastName ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("th-TH");
}

export interface CarriedStatus {
  deactivatedReason: string | null;
  deactivatedAt: Date | null;
  deactivatedById: string | null;
}

/**
 * การแก้ใบลบกลุ่มเปราะบางทั้งชุดแล้วสร้างใหม่จาก payload (#R7-C) — ถ้าไม่ย้ายสถานะ
 * ข้ามมา คนที่หัวหน้าชุมชนบันทึกว่าเสียชีวิตจะ "กลับมามีชีวิต" ในรายงานเงียบ ๆ
 *
 * จับคู่ด้วยชื่อเป็นหลัก ไม่ใช่ลำดับแถว — ผู้คีย์อาจลบแถวที่ 2 ทำให้แถวเลื่อน
 * ถ้าใช้ลำดับอย่างเดียว สถานะ "เสียชีวิต" จะไปติดกับคนที่ยังมีชีวิต (ผิดร้ายแรงกว่าหาย)
 *  - มีชื่อ → จับคู่เมื่อชื่อตรงกัน "คนเดียว" เท่านั้น (ชื่อซ้ำในบ้าน = ไม่เดา)
 *  - ไม่มีชื่อ (อ่านไม่ออก/เว้นว่าง) → จับคู่ลำดับเดียวกันที่ไม่มีชื่อเหมือนกัน
 *
 * คืน Map<ลำดับแถวใหม่, สถานะ> และจำนวนที่จับคู่ไม่ได้ (ให้ผู้เรียกบันทึก Audit)
 */
export function carryOverStatuses(
  previous: ReadonlyArray<{ seq: number; nameKey: string; isActive: boolean } & CarriedStatus>,
  next: ReadonlyArray<{ seq: number; nameKey: string }>,
): { carried: Map<number, CarriedStatus>; dropped: number } {
  const carried = new Map<number, CarriedStatus>();
  let dropped = 0;
  for (const prev of previous) {
    if (prev.isActive) continue;
    const candidates = prev.nameKey
      ? next.filter((n) => n.nameKey === prev.nameKey)
      : next.filter((n) => !n.nameKey && n.seq === prev.seq);
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (!target || carried.has(target.seq)) {
      dropped += 1;
      continue;
    }
    carried.set(target.seq, {
      deactivatedReason: prev.deactivatedReason,
      deactivatedAt: prev.deactivatedAt,
      deactivatedById: prev.deactivatedById,
    });
  }
  return { carried, dropped };
}
