// Entry Save core — บันทึกร่าง (Draft) และส่งใบ (Submit) แบบเข้ารหัส (R5, docs/28)
// ---------------------------------------------------------------------------
// กติกาสำคัญ:
// - payload ทั้งก้อนเข้ารหัสก่อนแตะ DB เสมอ (EntryAttempt.payload = { enc })
// - ฟิลด์ 🔒 บน Household/VulnerablePerson เข้ารหัสรายฟิลด์ + blind index เบอร์โทร
// - พิกัด/ที่อยู่เก็บตรงตามคำตัดสิน R5 (GIS) — คุมด้วย RBAC + Audit
// - ทุกฟังก์ชันตรวจว่าเป็น "เจ้าของ lock ที่ยังไม่หมดอายุ" เท่านั้น (getSheetForEntry)
// - Single-Entry (R4-1): attemptNo = 1 เสมอ — โครง Double-Entry คงอยู่แต่ปิดใช้

import { AuditAction, FieldStatusEnum, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import type { AuthorizationContext } from "../authz/types";
import {
  decryptJson,
  encryptJson,
  encryptText,
  phoneBlindIndex,
} from "../crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring, getSearchHashKey } from "../crypto/keys";
import { getSheetForEntry } from "./claim";
import {
  answerBoolean,
  answerCount,
  answerString,
  entryPayloadSchema,
  parseThaiDate,
  sanitizeEntryPayload,
  type EntryPayload,
  type VulnerableRowInput,
} from "./payload";

const ATTEMPT_NO = 1; // Single-Entry (R4-1)

export type SaveDraftResult =
  | { ok: true; savedAt: string }
  | { ok: false; reason: "NOT_ALLOWED" | "ERROR" };

/** บันทึกร่าง — upsert EntryAttempt รอบ 1 (payload เข้ารหัสทั้งก้อน) */
export async function saveDraft(
  ctx: AuthorizationContext,
  sheetId: string,
  payload: EntryPayload,
): Promise<SaveDraftResult> {
  const access = await getSheetForEntry(ctx, sheetId);
  if (access.kind !== "OK") return { ok: false, reason: "NOT_ALLOWED" };

  const clean = sanitizeEntryPayload(payload);
  const enc = encryptJson(clean, getKeyring(), CURRENT_KEY_VERSION);
  const now = new Date();
  try {
    await prisma.entryAttempt.upsert({
      where: { sheetId_attemptNo: { sheetId, attemptNo: ATTEMPT_NO } },
      create: {
        sheetId,
        attemptNo: ATTEMPT_NO,
        enteredById: ctx.userId,
        startedAt: now,
        payload: { enc },
      },
      // takeover หลัง lock หมดอายุ: ร่างโอนเป็นของเจ้าของ lock คนปัจจุบัน
      update: { payload: { enc }, enteredById: ctx.userId },
    });
    return { ok: true, savedAt: now.toISOString() };
  } catch {
    return { ok: false, reason: "ERROR" };
  }
}

/**
 * โหลดร่างของใบ (ถอดรหัสฝั่ง server หลังผ่านการตรวจเจ้าของ lock แล้วเท่านั้น)
 * decrypt ล้มเหลว (เช่น key คนละชุด) → null — เริ่มฟอร์มว่าง ไม่ crash
 */
export async function loadDraftPayload(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<EntryPayload | null> {
  const access = await getSheetForEntry(ctx, sheetId);
  if (access.kind !== "OK") return null;

  const attempt = await prisma.entryAttempt.findUnique({
    where: { sheetId_attemptNo: { sheetId, attemptNo: ATTEMPT_NO } },
    select: { payload: true },
  });
  const enc =
    attempt &&
    typeof attempt.payload === "object" &&
    attempt.payload !== null &&
    "enc" in attempt.payload &&
    typeof attempt.payload.enc === "string"
      ? attempt.payload.enc
      : null;
  if (!enc) return null;

  try {
    const raw = decryptJson(enc, getKeyring());
    return sanitizeEntryPayload(entryPayloadSchema.parse(raw));
  } catch {
    console.error("[entry] ถอดรหัสร่างไม่สำเร็จ", { sheetId });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Submit — สร้าง Household จาก payload (ฟิลด์อ่อนไหวเข้ารหัส) + ปิดใบเป็น ENTERED_1
// ---------------------------------------------------------------------------

export type SubmitEntryResult =
  | { ok: true; householdId: string; duplicateSuspected: boolean }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "LOCK_LOST" | "ALREADY_ENTERED" | "INVALID_MASTER" | "ERROR";
    };

interface VulnerableRowMapped {
  seq: number;
  fullName: string | null;
  fullNameStatus: FieldStatusEnum;
  age: number | null;
  ageStatus: FieldStatusEnum;
  phone: string | null;
  phoneStatus: FieldStatusEnum;
  vulnerabilities: { typeId: string; detail: string | null }[];
}

/** แถวกลุ่มเปราะบางที่มีข้อมูลจริง → mapping พร้อมสถานะรายช่อง (pure) */
export function mapVulnerableRows(rows: VulnerableRowInput[]): VulnerableRowMapped[] {
  const nonEmpty = rows.filter(
    (r) =>
      r.fullName.trim() !== "" ||
      String(r.age).trim() !== "" ||
      r.phone.trim() !== "" ||
      r.vulnerabilities.length > 0,
  );
  return nonEmpty.map((r, i) => {
    const ageRaw = String(r.age).trim();
    const ageNum = Number(ageRaw);
    const ageValid = ageRaw !== "" && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 120;
    return {
      seq: i + 1,
      fullName: r.fullName.trim() || null,
      fullNameStatus: r.fullName.trim()
        ? FieldStatusEnum.HAS_VALUE
        : FieldStatusEnum.BLANK_IN_PAPER,
      age: ageValid ? ageNum : null,
      ageStatus:
        ageRaw === ""
          ? FieldStatusEnum.BLANK_IN_PAPER
          : ageValid
            ? FieldStatusEnum.HAS_VALUE
            : FieldStatusEnum.ILLEGIBLE, // เขียนมาแต่ไม่ใช่อายุที่เป็นไปได้ (เช่น 999)
      phone: r.phone.trim() || null,
      phoneStatus: r.phone.trim()
        ? FieldStatusEnum.HAS_VALUE
        : FieldStatusEnum.BLANK_IN_PAPER,
      vulnerabilities: r.vulnerabilities.map((typeId) => ({
        typeId,
        detail: r.details[typeId]?.trim() || null,
      })),
    };
  });
}

export async function submitEntry(
  ctx: AuthorizationContext,
  sheetId: string,
  payload: EntryPayload,
): Promise<SubmitEntryResult> {
  const access = await getSheetForEntry(ctx, sheetId);
  if (access.kind !== "OK") return { ok: false, reason: "NOT_ALLOWED" };
  const { batchId, communityId } = access.sheet;

  const clean = sanitizeEntryPayload(payload);
  const keyring = getKeyring();
  const searchKey = getSearchHashKey();
  const now = new Date();

  // --- เตรียมข้อมูล Household (ฟิลด์อ่อนไหวเข้ารหัสก่อนเข้า transaction) ---
  const respondentName = answerString(clean, "respondentName");
  const respondentPhone = answerString(clean, "respondentPhone");
  const respondentPhoneIdx = respondentPhone
    ? phoneBlindIndex(respondentPhone, searchKey)
    : null;
  const surveyedAtRaw = answerString(clean, "surveyedAt");
  const marks = Object.entries(clean.marks).filter(([, v]) => v != null);
  const illegibleCount = marks.filter(([, v]) => v === "ILLEGIBLE").length;
  const blankCount = marks.filter(([, v]) => v === "BLANK_IN_PAPER").length;
  const vulnerableRows = mapVulnerableRows(clean.vulnerableRows);
  const hasVulnerable = answerBoolean(clean, "hasVulnerable");
  const enc = encryptJson(clean, keyring, CURRENT_KEY_VERSION);

  const householdData = {
    sheetId,
    batchId,
    communityId,
    // ส่วนที่ 0 — ตามกระดาษ ไม่ auto-fill
    surveyNo: answerString(clean, "surveyNo"),
    communityNameOnPaper: answerString(clean, "communityNameOnPaper"),
    surveyorNameOnPaper: answerString(clean, "surveyorNameOnPaper"),
    surveyorPhoneOnPaper: answerString(clean, "surveyorPhoneOnPaper"),
    surveyedAt: surveyedAtRaw ? parseThaiDate(surveyedAtRaw) : null, // parse ไม่ได้ → null (ดิบอยู่ใน payload)
    // ส่วนที่ 1
    buildingTypeId: answerString(clean, "buildingTypeId"),
    buildingTypeOther: answerString(clean, "buildingTypeOther"),
    placeName: answerString(clean, "placeName"),
    respondentName: respondentName
      ? encryptText(respondentName, keyring, CURRENT_KEY_VERSION)
      : null,
    respondentPhone: respondentPhone
      ? encryptText(respondentPhone, keyring, CURRENT_KEY_VERSION)
      : null,
    respondentPhoneIdx,
    houseNo: answerString(clean, "houseNo"),
    mooId: answerString(clean, "mooId"),
    soi: answerString(clean, "soi"),
    road: answerString(clean, "road"),
    tambonId: answerString(clean, "tambonId"),
    coordinateRawText: answerString(clean, "coordinateRawText"), // เก็บตรง (R5 — GIS)
    memberCount: answerCount(clean, "memberCount"),
    ownershipTypeId: answerString(clean, "ownershipTypeId"),
    ownershipOther: answerString(clean, "ownershipOther"),
    // ส่วนที่ 2
    hasVulnerable,
    assistanceTotalPersonCount: answerCount(clean, "assistanceTotalPersonCount"),
    // ส่วนที่ 4-5 (คอลัมน์ตรงบน Household — ส่วนที่เหลือของฟอร์มคงอยู่ใน payload
    // เข้ารหัส รอ materialize ลงตารางย่อย เช่น FloodRiskProfile ใน slice ถัดไป)
    mentalHealthSupport: answerBoolean(clean, "mentalHealthSupport"),
    suggestion: answerString(clean, "suggestion"),
    surveyorNote: answerString(clean, "surveyorNote"),
    povertyProgramInterest: answerBoolean(clean, "povertyProgramInterest"),
    enteredById: ctx.userId,
    illegibleCount,
    blankCount,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Race guard — ใบต้องยังเป็น lock ของเราที่ไม่หมดอายุ ณ วินาทีที่เขียน
      const closed = await tx.paperSheet.updateMany({
        where: {
          id: sheetId,
          status: SheetStatus.LOCKED,
          lockedById: ctx.userId,
          lockExpiresAt: { gt: now },
        },
        data: {
          status: SheetStatus.ENTERED_1,
          lockedById: null,
          lockedAt: null,
          lockExpiresAt: null,
        },
      });
      if (closed.count !== 1) return { kind: "LOCK_LOST" as const };

      // 2) EntryAttempt ฉบับส่ง (payload สุดท้ายเข้ารหัส + เวลาที่ใช้)
      const attempt = await tx.entryAttempt.upsert({
        where: { sheetId_attemptNo: { sheetId, attemptNo: ATTEMPT_NO } },
        create: {
          sheetId,
          attemptNo: ATTEMPT_NO,
          enteredById: ctx.userId,
          startedAt: now,
          submittedAt: now,
          payload: { enc },
        },
        update: { payload: { enc }, enteredById: ctx.userId, submittedAt: now },
      });
      const durationSeconds = Math.max(
        0,
        Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000),
      );
      await tx.entryAttempt.update({
        where: { id: attempt.id },
        data: { durationSeconds },
      });

      // 3) จับใบซ้ำจาก blind index เบอร์โทร (soft check — QM-03)
      const duplicateSuspected = respondentPhoneIdx
        ? (await tx.household.count({
            where: { respondentPhoneIdx, deletedAt: null },
          })) > 0
        : false;

      // 4) Household (1:1 กับใบ — unique sheetId กันซ้ำระดับ DB)
      const household = await tx.household.create({
        data: { ...householdData, hasDuplicateFlag: duplicateSuspected },
      });

      // 5) กลุ่มเปราะบางรายบุคคล + ลักษณะความเปราะบาง (ชื่อ/เบอร์/รายละเอียดเข้ารหัส)
      for (const row of vulnerableRows) {
        const person = await tx.vulnerablePerson.create({
          data: {
            householdId: household.id,
            seq: row.seq,
            fullName: row.fullName
              ? encryptText(row.fullName, keyring, CURRENT_KEY_VERSION)
              : null,
            fullNameStatus: row.fullNameStatus,
            age: row.age,
            ageStatus: row.ageStatus,
            phone: row.phone
              ? encryptText(row.phone, keyring, CURRENT_KEY_VERSION)
              : null,
            phoneStatus: row.phoneStatus,
          },
        });
        if (row.vulnerabilities.length > 0) {
          await tx.personVulnerability.createMany({
            data: row.vulnerabilities.map((v) => ({
              personId: person.id,
              vulnerabilityTypeId: v.typeId,
              detail: v.detail
                ? encryptText(v.detail, keyring, CURRENT_KEY_VERSION)
                : null,
              referenceDate: householdData.surveyedAt,
            })),
          });
        }
      }

      // 6) สถานะรายฟิลด์ (F2/F3) — ผูกกับ attempt เพื่อร่องรอยตรวจสอบ
      if (marks.length > 0) {
        await tx.fieldStatus.deleteMany({ where: { sheetId } });
        await tx.fieldStatus.createMany({
          data: marks.map(([fieldPath, status]) => ({
            sheetId,
            entryAttemptId: attempt.id,
            fieldPath,
            status:
              status === "ILLEGIBLE"
                ? FieldStatusEnum.ILLEGIBLE
                : FieldStatusEnum.BLANK_IN_PAPER,
          })),
        });
      }

      // 7) ตัวนับบนปึก
      await tx.paperBatch.update({
        where: { id: batchId },
        data: { enteredCount: { increment: 1 } },
      });

      return {
        kind: "OK" as const,
        householdId: household.id,
        duplicateSuspected,
      };
    });

    if (result.kind === "LOCK_LOST") return { ok: false, reason: "LOCK_LOST" };

    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entityType: "Household",
      entityId: result.householdId,
      changes: { sheetStatus: { old: "LOCKED", new: "ENTERED_1" } },
    });
    return {
      ok: true,
      householdId: result.householdId,
      duplicateSuspected: result.duplicateSuspected,
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 unique(sheetId) = ใบนี้มี Household แล้ว / P2003 = FK master ไม่ถูกต้อง
      if (e.code === "P2002") return { ok: false, reason: "ALREADY_ENTERED" };
      if (e.code === "P2003") return { ok: false, reason: "INVALID_MASTER" };
    }
    // ไม่ log รายละเอียด error (payload อาจโผล่) — log เฉพาะ context ปลอดภัย
    console.error("[entry] submitEntry ล้มเหลว", { sheetId });
    return { ok: false, reason: "ERROR" };
  }
}
