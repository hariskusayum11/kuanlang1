// Verification Edit core — Verifier แก้ไขข้อมูลที่คีย์ผิด (Slice 2)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - แก้ได้เฉพาะใบ ENTERED_1 (ยังไม่ยืนยัน) + RBAC/scope ฝั่ง server
// - ผู้คีย์แก้งานตัวเองไม่ได้ (แยกหน้าที่ผู้คีย์/ผู้ตรวจ)
// - ทุกการแก้เก็บ HouseholdVersion (สภาพก่อนแก้ = ค่า old ที่เข้ารหัส) แบบ append
//   + Audit UPDATE บันทึก "ชื่อฟิลด์ที่แก้" เท่านั้น — ห้าม log ค่า PII ดิบ
// - ฟิลด์อ่อนไหวเข้ารหัสใหม่ · เบอร์โทรคำนวณ blind index ใหม่ (จับซ้ำได้ตรง)

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
  type EditableField,
  type EditableMasterKey,
} from "./editable-fields";

function canVerify(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
}

// รับค่าแก้ไขแบบหลวมแต่มีขอบเขต (paper-first: ค่าว่าง = ลบค่า) — normalize รายฟิลด์ทีหลัง
const editsSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(200), z.number().finite(), z.null()]),
);

export interface EditableValues {
  values: Record<string, string>;
  /** ตัวเลือก master data (id → label) สำหรับ dropdown ในฟอร์มแก้ไข */
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
      communityId: true,
      enteredById: true,
      sheet: { select: { status: true } },
      respondentPrefixId: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      houseNo: true,
      mooId: true,
      soi: true,
      road: true,
      tambonId: true,
      memberCount: true,
    },
  });
  if (!h) return null;
  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return null;

  const master = await getEntryMasterData(h.communityId);
  const toOpts = (arr: { id: string; label: string }[]) =>
    arr.map((o) => ({ id: o.id, label: o.label }));

  const values: Record<string, string> = {
    respondentPrefixId: h.respondentPrefixId ?? "",
    respondentFirstName: safeDecrypt(h.respondentFirstName),
    respondentLastName: safeDecrypt(h.respondentLastName),
    respondentPhone: safeDecrypt(h.respondentPhone),
    houseNo: h.houseNo ?? "",
    mooId: h.mooId ?? "",
    soi: h.soi ?? "",
    road: h.road ?? "",
    tambonId: h.tambonId ?? "",
    memberCount: h.memberCount != null ? String(h.memberCount) : "",
  };

  return {
    values,
    options: {
      namePrefixes: toOpts(master.namePrefixes),
      moos: toOpts(master.moos),
      tambons: toOpts(master.tambons),
    },
    canEdit: h.sheet.status === SheetStatus.ENTERED_1 && h.enteredById !== ctx.userId,
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

/** normalize ค่าตาม kind → string ที่จะเก็บ ("" = ลบค่า → null). คืน null ถ้าค่าไม่ผ่าน */
export function normalizeValue(
  field: EditableField,
  raw: string | number | null,
): { ok: true; value: string } | { ok: false } {
  if (raw === null) return { ok: true, value: "" };
  if (field.kind === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (String(raw).trim() === "") return { ok: true, value: "" };
    if (!Number.isInteger(n) || n < 0 || (field.max != null && n > field.max)) {
      return { ok: false };
    }
    return { ok: true, value: String(n) };
  }
  const s = String(raw).trim();
  if (field.kind === "phone") return { ok: true, value: normalizePhone(s) };
  return { ok: true, value: s };
}

/**
 * แก้ไขฟิลด์ Household โดย Verifier — snapshot ก่อนแก้ + เข้ารหัสใหม่ + audit
 * rawEdits: { columnKey: value } เฉพาะฟิลด์ใน EDITABLE_FIELDS (นอกนั้นถูกตัดทิ้ง)
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
      respondentPrefixId: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      houseNo: true,
      mooId: true,
      soi: true,
      road: true,
      tambonId: true,
      memberCount: true,
    },
  });
  if (!h) return { ok: false, reason: "NOT_FOUND" };

  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return { ok: false, reason: "NOT_FOUND" };
  if (h.sheet.status !== SheetStatus.ENTERED_1) return { ok: false, reason: "WRONG_STATUS" };
  if (h.enteredById === ctx.userId) return { ok: false, reason: "SELF_EDIT" };

  const keyring = getKeyring();
  const searchKey = getSearchHashKey();

  // ค่าเดิม (ถอดรหัสฝั่ง sensitive) เพื่อเทียบว่าเปลี่ยนจริงไหม
  const currentPlain = (field: EditableField): string => {
    const v = (h as Record<string, unknown>)[field.key];
    if (v == null) return "";
    if (field.sensitive) return safeDecrypt(String(v));
    if (field.kind === "phone") return normalizePhone(String(v));
    return String(v);
  };

  const updateData: Record<string, unknown> = {};
  const editedFields: string[] = [];

  for (const [key, rawVal] of Object.entries(parsed.data)) {
    const field = EDITABLE_BY_KEY.get(key);
    if (!field) continue; // whitelist — คีย์นอกรายการถูกตัดทิ้ง

    const norm = normalizeValue(field, rawVal);
    if (!norm.ok) return { ok: false, reason: "INVALID" };

    const oldCmp = field.kind === "phone" ? normalizePhone(currentPlain(field)) : currentPlain(field);
    const newCmp = norm.value;
    if (oldCmp === newCmp) continue; // ไม่เปลี่ยน → ข้าม

    editedFields.push(field.key);
    const empty = newCmp === "";
    if (field.sensitive) {
      updateData[field.key] = empty ? null : encryptText(newCmp, keyring, CURRENT_KEY_VERSION);
      if (field.isPhone) {
        updateData.respondentPhoneIdx = empty ? null : phoneBlindIndex(newCmp, searchKey);
      }
    } else if (field.kind === "number") {
      updateData[field.key] = empty ? null : Number(newCmp);
    } else {
      // text/select (รวม FK master — Prisma ตรวจ FK; ไม่ถูกต้อง → P2003)
      updateData[field.key] = empty ? null : newCmp;
    }
  }

  if (editedFields.length === 0) return { ok: true, changedCount: 0 };

  try {
    await prisma.$transaction(async (tx) => {
      // race guard — ใบต้องยัง ENTERED_1 ณ เวลาที่เขียน (กันแก้หลังถูกยืนยัน)
      const still = await tx.paperSheet.count({
        where: { household: { id: h.id }, status: SheetStatus.ENTERED_1 },
      });
      if (still !== 1) throw new Prisma.PrismaClientKnownRequestError("WRONG_STATUS", {
        code: "P2025",
        clientVersion: "edit",
      });

      // snapshot ก่อนแก้ (ค่า old — ฟิลด์อ่อนไหวยังเป็น ciphertext ไม่รั่ว plaintext)
      const before = await tx.household.findUniqueOrThrow({ where: { id: h.id } });
      const snapshot = JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue;
      const versionNo = (await tx.householdVersion.count({ where: { householdId: h.id } })) + 1;
      await tx.householdVersion.create({
        data: {
          householdId: h.id,
          versionNo,
          snapshot,
          changedById: ctx.userId,
          changeReason: "verifier-edit",
        },
      });

      await tx.household.update({ where: { id: h.id }, data: updateData });
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
