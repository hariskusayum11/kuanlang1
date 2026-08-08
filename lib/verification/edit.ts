// Verification Edit core — Verifier แก้ไขข้อมูลที่คีย์ผิด (ทุกส่วน — Owner 2026-08-07)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - แก้ได้เฉพาะใบ ENTERED_1 (ยังไม่ยืนยัน) + RBAC/scope ฝั่ง server
// - ผู้คีย์แก้งานตัวเองไม่ได้ (แยกหน้าที่ผู้คีย์/ผู้ตรวจ)
// - ทุกการแก้เก็บ HouseholdVersion (สภาพก่อนแก้ = ค่า old ที่เข้ารหัส) แบบ append
//   + Audit UPDATE บันทึก "ชื่อฟิลด์ที่แก้" เท่านั้น — ห้าม log ค่า PII ดิบ
// - ฟิลด์อ่อนไหวเข้ารหัสใหม่ · เบอร์โทรคำนวณ blind index ใหม่ (จับซ้ำได้ตรง)
// - ครอบคลุม: คอลัมน์ Household · FloodRiskProfile (1:1) · รายการ M:N
//   (AssistanceNeed, HouseholdResource, EvacuationVehicle, AlertChannelPref, VolunteerInterest)

import { AuditAction, Prisma, SheetStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { decryptText, encryptText, normalizePhone, phoneBlindIndex } from "../crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring, getSearchHashKey } from "../crypto/keys";
import { getEntryMasterData } from "../entry/master-data";
import {
  EDITABLE_BY_KEY,
  LIST_TARGETS,
  type EditableField,
  type EditableFormValue,
  type EditableMasterKey,
  type EditTarget,
} from "./editable-fields";

function canVerify(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
}

// รับค่าแก้ไขแบบหลวมแต่มีขอบเขต (paper-first: ค่าว่าง = ลบค่า) — normalize รายฟิลด์ทีหลัง
const editsSchema = z.record(
  z.string().max(64),
  z.union([
    z.string().max(2000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(64)).max(50),
    z.null(),
  ]),
);

export interface EditableValues {
  values: Record<string, EditableFormValue>;
  /** ตัวเลือก master data (id → label) สำหรับ dropdown/checkbox ในฟอร์มแก้ไข */
  options: Record<EditableMasterKey, { id: string; label: string }[]>;
  canEdit: boolean;
}

/** decrypt เพื่อเติมค่าเริ่มต้นในฟอร์มแก้ไข — ล้มเหลว → ค่าว่าง (ผู้ตรวจกรอกใหม่) */
function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decryptText(value, getKeyring());
  } catch {
    return "";
  }
}

/** แปลงค่าดิบเป็นค่า form (null/undefined → "") */
function v(value: unknown): EditableFormValue {
  if (value === null || value === undefined) return "";
  return value as EditableFormValue;
}

/** คอลัมน์ FloodRiskProfile ที่แก้ไขได้ — ใช้แยก prefill + diff */
const FRP_KEYS = [
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
  "hasSurvivalKit",
  "canBeHostHouse",
  "riskLevelSurveyor",
] as const;

function frpValues(frp: Record<string, unknown> | null): Record<string, EditableFormValue> {
  if (!frp) return {};
  const out: Record<string, EditableFormValue> = {};
  for (const key of FRP_KEYS) {
    const raw = frp[key];
    out[key] = raw == null ? "" : typeof raw === "number" ? String(raw) : v(raw);
  }
  return out;
}

/** เปรียบเทียบชุดค่า — ค่าที่เท่ากัน fn=skip (สะอาด ไม่สร้าง diff ปลอม) */
function sameValue(a: EditableFormValue, b: EditableFormValue): boolean {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

/**
 * โหลดค่าปัจจุบันของฟิลด์ที่แก้ได้ (ถอดรหัส) + ตัวเลือก master สำหรับฟอร์มแก้ไข
 * นอก scope / ไม่พบ → null. canEdit = ENTERED_1 และผู้ตรวจไม่ใช่ผู้คีย์
 */
export async function loadHouseholdEditable(
  ctx: AuthorizationContext,
  householdId: string,
): Promise<EditableValues | null> {
  if (!canVerify(ctx)) return null;

  const h = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    select: {
      id: true,
      communityId: true,
      enteredById: true,
      sheet: { select: { status: true } },
      surveyNo: true,
      communityNameOnPaper: true,
      surveyorPrefixId: true,
      surveyorPrefixOther: true,
      surveyorFirstNameOnPaper: true,
      surveyorLastNameOnPaper: true,
      surveyorPhoneOnPaper: true,
      buildingTypeId: true,
      buildingTypeOther: true,
      placeName: true,
      respondentPrefixId: true,
      respondentPrefixOther: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      houseNo: true,
      mooNo: true,
      soi: true,
      road: true,
      tambonId: true,
      memberCount: true,
      ownershipTypeId: true,
      ownershipOther: true,
      hasVulnerable: true,
      assistanceTotalPersonCount: true,
      mentalHealthSupport: true,
      suggestion: true,
      surveyorNote: true,
      povertyProgramInterest: true,
      digitalReadiness: { select: { usesSmartphone: true, canScanQR: true } },
      floodRiskProfile: true,
      assistanceNeeds: { select: { needTypeId: true } },
      householdResources: { select: { resourceTypeId: true } },
      evacuationVehicles: { select: { vehicleType: true } },
      alertChannelPrefs: { select: { alertChannelId: true } },
      volunteerInterests: { select: { volunteerTypeId: true } },
    },
  });
  if (!h) return null;
  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return null;

  const master = await getEntryMasterData(h.communityId);
  const toOpts = (arr: { id: string; label: string }[]) =>
    arr.map((o) => ({ id: o.id, label: o.label }));

  const values: Record<string, EditableFormValue> = {
    // ส่วน 0
    surveyNo: v(h.surveyNo),
    communityNameOnPaper: v(h.communityNameOnPaper),
    surveyorPrefixId: v(h.surveyorPrefixId),
    surveyorPrefixOther: v(h.surveyorPrefixOther),
    surveyorFirstNameOnPaper: v(h.surveyorFirstNameOnPaper),
    surveyorLastNameOnPaper: v(h.surveyorLastNameOnPaper),
    surveyorPhoneOnPaper: v(h.surveyorPhoneOnPaper),
    // ส่วน 1
    buildingTypeId: v(h.buildingTypeId),
    buildingTypeOther: v(h.buildingTypeOther),
    placeName: v(h.placeName),
    respondentPrefixId: v(h.respondentPrefixId),
    respondentPrefixOther: v(h.respondentPrefixOther),
    respondentFirstName: safeDecrypt(h.respondentFirstName),
    respondentLastName: safeDecrypt(h.respondentLastName),
    respondentPhone: safeDecrypt(h.respondentPhone),
    houseNo: v(h.houseNo),
    mooNo: h.mooNo != null ? String(h.mooNo) : "",
    soi: v(h.soi),
    road: v(h.road),
    tambonId: v(h.tambonId),
    memberCount: h.memberCount != null ? String(h.memberCount) : "",
    ownershipTypeId: v(h.ownershipTypeId),
    ownershipOther: v(h.ownershipOther),
    // ส่วน 2 (ระดับครัวเรือน)
    hasVulnerable: h.hasVulnerable ?? "",
    assistanceTotalPersonCount:
      h.assistanceTotalPersonCount != null ? String(h.assistanceTotalPersonCount) : "",
    assistanceNeedIds: h.assistanceNeeds.map((a) => a.needTypeId),
    // ส่วน 3
    ...frpValues(h.floodRiskProfile as Record<string, unknown> | null),
    evacuationVehicleTypes: h.evacuationVehicles.map((ev) => String(ev.vehicleType ?? "")),
    householdResourceIds: h.householdResources.map((r) => r.resourceTypeId),
    // ส่วน 4
    alertChannelIds: h.alertChannelPrefs.map((c) => c.alertChannelId),
    volunteerInterestIds: h.volunteerInterests.map((vi) => vi.volunteerTypeId),
    usesSmartphone: h.digitalReadiness?.usesSmartphone ?? "",
    canScanQR: h.digitalReadiness?.canScanQR ?? "",
    mentalHealthSupport: h.mentalHealthSupport ?? "",
    suggestion: v(h.suggestion),
    // ส่วน 5-6
    surveyorNote: v(h.surveyorNote),
    povertyProgramInterest: h.povertyProgramInterest ?? "",
  };

  return {
    values,
    options: {
      namePrefixes: toOpts(master.namePrefixes),
      tambons: toOpts(master.tambons),
      buildingTypes: toOpts(master.buildingTypes),
      ownershipTypes: toOpts(master.ownershipTypes),
      resourceTypes: toOpts(master.resourceTypes),
      alertChannels: toOpts(master.alertChannels),
      volunteerSkillTypes: toOpts(master.volunteerSkillTypes),
      assistanceNeedTypes: toOpts(master.assistanceNeedTypes),
    },
    // ADMIN แก้ได้ทุกใบทุกสถานะ (Owner 2026-08-08) — รวมใบที่ VERIFIED และใบของตัวเอง
    // ผู้ตรวจทั่วไปยังจำกัด: เฉพาะ ENTERED_1 และต้องไม่ใช่ผู้คีย์เอง (แยกหน้าที่)
    canEdit:
      ctx.roles.includes("ADMIN") ||
      (h.sheet.status === SheetStatus.ENTERED_1 && h.enteredById !== ctx.userId),
  };
}

export type EditResult =
  | { ok: true; changedCount: number }
  | {
      ok: false;
      reason:
        | "NOT_ALLOWED"
        | "NOT_FOUND"
        | "WRONG_STATUS"
        | "SELF_EDIT"
        | "INVALID"
        | "INVALID_MASTER"
        | "ERROR";
    };

/** normalize ค่าตาม kind → ค่า form ที่จะเก็บ ("" = ลบค่า → null). คืน null ถ้าค่าไม่ผ่าน */
export function normalizeValue(
  field: EditableField,
  raw: EditableFormValue | null,
): { ok: true; value: EditableFormValue } | { ok: false } {
  if (field.kind === "checkbox-group") {
    if (raw == null) return { ok: true, value: [] };
    if (!Array.isArray(raw)) return { ok: false };
    return { ok: true, value: raw.map((x) => String(x)).filter((x) => x !== "") };
  }
  if (field.kind === "boolean") {
    if (raw === "" || raw === null) return { ok: true, value: "" };
    if (typeof raw === "boolean") return { ok: true, value: raw };
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return { ok: false };
  }
  if (field.kind === "number") {
    if (raw === null || String(raw).trim() === "") return { ok: true, value: "" };
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n < 0 || (field.max != null && n > field.max)) {
      return { ok: false };
    }
    return { ok: true, value: String(n) };
  }
  const s = String(raw ?? "").trim();
  if (field.kind === "phone") return { ok: true, value: normalizePhone(s) };
  if (field.maxLength != null && s.length > field.maxLength) return { ok: false };
  return { ok: true, value: s };
}

/** หน้าตาของ record ที่ apply edits ใช้เป็น snapshot (รวม relations) */
type HouseholdSnapshot = Prisma.HouseholdGetPayload<{
  include: {
    floodRiskProfile: true;
    digitalReadiness: true;
    assistanceNeeds: { select: { needTypeId: true } };
    householdResources: { select: { resourceTypeId: true } };
    evacuationVehicles: { select: { vehicleType: true } };
    alertChannelPrefs: { select: { alertChannelId: true } };
    volunteerInterests: { select: { volunteerTypeId: true } };
  };
}>;

/** อ่านค่าปัจจุบันของฟิลด์จาก snapshot ก่อนแก้ (เทียบว่าเปลี่ยนจริงไหม) */
function currentValue(field: EditableField, hh: HouseholdSnapshot): EditableFormValue {
  const target: EditTarget = field.target ?? "household";

  if (target === "floodRiskProfile") {
    return frpValues(hh.floodRiskProfile as Record<string, unknown> | null)[field.key] ?? "";
  }
  if (target === "digitalReadiness") {
    const dr = hh.digitalReadiness as Record<string, unknown> | null;
    if (!dr) return "";
    const raw = dr[field.key];
    return typeof raw === "boolean" ? raw : "";
  }
  if (target === "evacuationVehicles") {
    return hh.evacuationVehicles.map((ev) => String(ev.vehicleType ?? ""));
  }
  if (target === "assistanceNeeds") {
    return hh.assistanceNeeds.map((a) => a.needTypeId);
  }
  if (target === "householdResources") {
    return hh.householdResources.map((r) => r.resourceTypeId);
  }
  if (target === "alertChannelPrefs") {
    return hh.alertChannelPrefs.map((c) => c.alertChannelId);
  }
  if (target === "volunteerInterests") {
    return hh.volunteerInterests.map((vi) => vi.volunteerTypeId);
  }
  return v((hh as Record<string, unknown>)[field.key]);
}

/**
 * แก้ไขฟิลด์ Household/FloodRiskProfile/รายการ M:N โดย Verifier
 * — snapshot ก่อนแก้ + เข้ารหัสใหม่ + audit (ทุก target ใน transaction เดียว)
 * rawEdits: { fieldKey: value } เฉพาะฟิลด์ใน EDITABLE_FIELDS (นอกนั้นถูกตัดทิ้ง)
 */
export async function applyHouseholdEdits(
  ctx: AuthorizationContext,
  householdId: string,
  rawEdits: unknown,
): Promise<EditResult> {
  if (!canVerify(ctx)) return { ok: false, reason: "NOT_ALLOWED" };

  const parsed = editsSchema.safeParse(rawEdits);
  if (!parsed.success) return { ok: false, reason: "INVALID" };

  const h = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    select: {
      id: true,
      communityId: true,
      enteredById: true,
      sheet: { select: { status: true } },
    },
  });
  if (!h) return { ok: false, reason: "NOT_FOUND" };
  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return { ok: false, reason: "NOT_FOUND" };
  // ADMIN แก้ได้ทุกสถานะ/ทุกใบ (Owner 2026-08-08) — ข้ามข้อจำกัดของผู้ตรวจทั่วไป
  const isAdmin = ctx.roles.includes("ADMIN");
  if (!isAdmin) {
    if (h.sheet.status !== SheetStatus.ENTERED_1) return { ok: false, reason: "WRONG_STATUS" };
    if (h.enteredById === ctx.userId) return { ok: false, reason: "SELF_EDIT" };
  }

  const keyring = getKeyring();
  const searchKey = getSearchHashKey();

  // สถานะก่อนแก้ — ใช้ทั้งเป็น snapshot และเทียบว่าเปลี่ยนจริงไหม
  const before = (await prisma.household.findFirstOrThrow({
    where: { id: h.id },
    include: {
      floodRiskProfile: true,
      digitalReadiness: true,
      assistanceNeeds: { select: { needTypeId: true } },
      householdResources: { select: { resourceTypeId: true } },
      evacuationVehicles: { select: { vehicleType: true } },
      alertChannelPrefs: { select: { alertChannelId: true } },
      volunteerInterests: { select: { volunteerTypeId: true } },
    },
  })) as HouseholdSnapshot;

  const master = await getEntryMasterData(h.communityId);
  const masterIds = new Map<EditableMasterKey, Set<string>>();
  const masterEntries = Object.entries(master) as [EditableMasterKey, { id: string }[]][];
  for (const [k, arr] of masterEntries) {
    masterIds.set(k, new Set(arr.map((o) => o.id)));
  }

  // แยกการแก้ตาม target
  const householdUpdate: Record<string, unknown> = {};
  const frpUpdate: Record<string, unknown> = {};
  const drUpdate: Record<string, unknown> = {};
  const listUpdates: Partial<Record<EditTarget, { value: string[] }>> = {};
  const editedFields: string[] = [];

  for (const [key, rawVal] of Object.entries(parsed.data)) {
    const field = EDITABLE_BY_KEY.get(key);
    if (!field) continue; // whitelist — คีย์นอกรายการถูกตัดทิ้ง

    const norm = normalizeValue(field, rawVal as EditableFormValue);
    if (!norm.ok) return { ok: false, reason: "INVALID" };
    const next = norm.value;

    // master FK check (เฉพาะ select/checkbox-group ที่ใช้ master)
    if (field.masterKey) {
      const allowed = masterIds.get(field.masterKey);
      if (allowed) {
        const values = Array.isArray(next) ? next.map(String) : [String(next ?? "")];
        if (values.some((item) => item !== "" && !allowed.has(item))) {
          return { ok: false, reason: "INVALID_MASTER" };
        }
      }
    }

    if (sameValue(currentValue(field, before), next)) continue; // ไม่เปลี่ยน → ข้าม

    editedFields.push(key);
    const target: EditTarget = field.target ?? "household";

    if (target === "floodRiskProfile") {
      const empty = next === "";
      // ฟิลด์ตัวเลขบน FRP เก็บเป็น Int — ต้องแปลงก่อนเขียน (Prisma ตรวจชนิด)
      frpUpdate[field.key] =
        empty || field.kind !== "number" ? (empty ? null : next) : Number(next);
      // จุดอพยพหลายค่า — เขียน scalar เดิมคู่กัน (ค่าตัวแรก) เพื่อเข้ากันได้ย้อนหลัง
      if (field.key === "nearestEvacSiteTypes") {
        frpUpdate.nearestEvacSiteType = Array.isArray(next) ? (next[0] ?? null) : null;
      }
      continue;
    }
    if (target === "digitalReadiness") {
      const empty = next === "";
      drUpdate[field.key] = empty ? null : next;
      continue;
    }
    if (LIST_TARGETS.has(target)) {
      listUpdates[target] = { value: Array.isArray(next) ? next : [] };
      continue;
    }

    // household — ฟิลด์อ่อนไหวเข้ารหัส + เบอร์โทรคำนวณ blind index ใหม่
    const empty = next === "";
    if (field.sensitive) {
      householdUpdate[field.key] = empty
        ? null
        : encryptText(String(next), keyring, CURRENT_KEY_VERSION);
      if (field.isPhone) {
        householdUpdate.respondentPhoneIdx = empty
          ? null
          : phoneBlindIndex(String(next), searchKey);
      }
    } else if (field.kind === "number") {
      householdUpdate[field.key] = empty ? null : Number(next);
    } else if (field.kind === "boolean") {
      householdUpdate[field.key] = empty ? null : next === true;
    } else {
      householdUpdate[field.key] = empty ? null : next;
    }
  }

  if (editedFields.length === 0) return { ok: true, changedCount: 0 };

  try {
    await prisma.$transaction(async (tx) => {
      // race guard — ผู้ตรวจทั่วไป: ใบต้องยัง ENTERED_1 ณ เวลาที่เขียน (กันแก้หลังถูกยืนยัน)
      // ADMIN: แก้ได้ทุกสถานะ (รวม VERIFIED) — คงสถานะเดิมไว้ ไม่ย้อนเป็น ENTERED_1
      if (!isAdmin) {
        const still = await tx.paperSheet.count({
          where: { household: { id: h.id }, status: SheetStatus.ENTERED_1 },
        });
        if (still !== 1)
          throw new Prisma.PrismaClientKnownRequestError("WRONG_STATUS", {
            code: "P2025",
            clientVersion: "edit",
          });
      }

      // snapshot ก่อนแก้ (ค่า old — ฟิลด์อ่อนไหวยังเป็น ciphertext ไม่รั่ว plaintext)
      const snapshot = JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue;
      const versionNo =
        (await tx.householdVersion.count({ where: { householdId: h.id } })) + 1;
      await tx.householdVersion.create({
        data: {
          householdId: h.id,
          versionNo,
          snapshot,
          changedById: ctx.userId,
          changeReason: "verifier-edit",
        },
      });

      if (Object.keys(householdUpdate).length > 0) {
        await tx.household.update({ where: { id: h.id }, data: householdUpdate });
      }
      if (Object.keys(frpUpdate).length > 0) {
        if (before.floodRiskProfile) {
          await tx.floodRiskProfile.update({
            where: { householdId: h.id },
            data: frpUpdate as { [x: string]: unknown },
          });
        } else {
          await tx.floodRiskProfile.create({
            data: { householdId: h.id, ...(frpUpdate as object) },
          });
        }
      }
      if (Object.keys(drUpdate).length > 0) {
        if (before.digitalReadiness) {
          await tx.digitalReadiness.update({
            where: { householdId: h.id },
            data: drUpdate as { [x: string]: unknown },
          });
        } else {
          await tx.digitalReadiness.create({
            data: { householdId: h.id, ...(drUpdate as object) },
          });
        }
      }

      // sync รายการ M:N — ลบชุดเดิม สร้างชุดใหม่จากค่าที่แก้
      if (listUpdates.assistanceNeeds) {
        await tx.assistanceNeed.deleteMany({ where: { householdId: h.id } });
        for (const id of listUpdates.assistanceNeeds.value) {
          await tx.assistanceNeed.create({ data: { householdId: h.id, needTypeId: id } });
        }
      }
      if (listUpdates.householdResources) {
        await tx.householdResource.deleteMany({ where: { householdId: h.id } });
        for (const id of listUpdates.householdResources.value) {
          await tx.householdResource.create({
            data: { householdId: h.id, resourceTypeId: id },
          });
        }
      }
      if (listUpdates.evacuationVehicles) {
        await tx.evacuationVehicle.deleteMany({ where: { householdId: h.id } });
        for (const vehicle of listUpdates.evacuationVehicles.value) {
          await tx.evacuationVehicle.create({
            data: { householdId: h.id, vehicleType: vehicle as never },
          });
        }
      }
      if (listUpdates.alertChannelPrefs) {
        await tx.alertChannelPref.deleteMany({ where: { householdId: h.id } });
        for (const id of listUpdates.alertChannelPrefs.value) {
          await tx.alertChannelPref.create({
            data: { householdId: h.id, alertChannelId: id },
          });
        }
      }
      if (listUpdates.volunteerInterests) {
        await tx.volunteerInterest.deleteMany({ where: { householdId: h.id } });
        for (const id of listUpdates.volunteerInterests.value) {
          await tx.volunteerInterest.create({
            data: { householdId: h.id, volunteerTypeId: id },
          });
        }
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, reason: "WRONG_STATUS" };
      if (e.code === "P2003") return { ok: false, reason: "INVALID_MASTER" };
    }
    console.error("[verification] applyHouseholdEdits ล้มเหลว", { householdId });
    return { ok: false, reason: "ERROR" };
  }

  // Audit UPDATE — บันทึกเฉพาะชื่อฟิลด์ที่แก้ (ค่า old/new อยู่ใน HouseholdVersion ที่เข้ารหัส)
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "Household",
    entityId: h.id,
    changes: { editedFields },
    reason: "verifier-edit",
  });

  return { ok: true, changedCount: editedFields.length };
}
