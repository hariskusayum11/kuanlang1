// Entry Save core — บันทึกร่าง (Draft) และส่งใบ (Submit) แบบเข้ารหัส (R5, docs/28)
// ---------------------------------------------------------------------------
// กติกาสำคัญ:
// - payload ทั้งก้อนเข้ารหัสก่อนแตะ DB เสมอ (EntryAttempt.payload = { enc })
// - ฟิลด์ 🔒 บน Household/VulnerablePerson เข้ารหัสรายฟิลด์ + blind index เบอร์โทร
// - พิกัด/ที่อยู่เก็บตรงตามคำตัดสิน R5 (GIS) — คุมด้วย RBAC + Audit
// - ทุกฟังก์ชันตรวจว่าเป็น "เจ้าของ lock ที่ยังไม่หมดอายุ" เท่านั้น (getSheetForEntry)
// - Single-Entry (R4-1): attemptNo = 1 เสมอ — โครง Double-Entry คงอยู่แต่ปิดใช้

import {
  AuditAction,
  FieldStatusEnum,
  FloorLevel,
  LastEvacuationPlace,
  NearestEvacSiteType,
  Prisma,
  SheetStatus,
  SurveyorRiskLevel,
  VehicleType,
} from "@prisma/client";
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
import {
  composeCoordinateText,
  coordinateForStorage,
  parseCoordinateText,
} from "../../domain/geo/coordinate";
import { getSheetForEntry } from "./claim";
import {
  answerBoolean,
  answerCount,
  answerEnum,
  answerEnumList,
  answerIdList,
  answerString,
  assistanceNeedsFromPayload,
  entryPayloadSchema,
  parseThaiDate,
  sanitizeEntryPayload,
  type EntryPayload,
  type VulnerableRowInput,
} from "./payload";
import { EXPLICIT_NONE } from "./steps";

const ATTEMPT_NO = 1; // Single-Entry (R4-1)

/**
 * คำนำหน้า (FK master): ค่า EXPLICIT_NONE = ผู้คีย์ยืนยัน "ไม่ระบุ" → เก็บ null
 * (ไม่ใช่ id จริง จะชน FK) แต่ยังนับว่าตอบแล้วในฝั่ง validation
 */
function prefixIdOf(clean: EntryPayload, name: string): string | null {
  const v = answerString(clean, name);
  return v === EXPLICIT_NONE ? null : v;
}

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
  | {
      ok: true;
      householdId: string;
      duplicateSuspected: boolean;
      /** ใบนี้เคยตรวจแล้วและถูกแก้ → กลับไปรอตรวจใหม่ (UI ต้องบอกผู้คีย์) */
      reopenedForVerify: boolean;
    }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "LOCK_LOST" | "ALREADY_ENTERED" | "INVALID_MASTER" | "ERROR";
    };

interface VulnerableRowMapped {
  seq: number;
  namePrefixId: string | null;
  prefixOther: string | null;
  firstName: string | null;
  lastName: string | null;
  nameStatus: FieldStatusEnum;
  age: number | null;
  ageStatus: FieldStatusEnum;
  phone: string | null;
  phoneStatus: FieldStatusEnum;
  vulnerabilities: { typeId: string; detail: string | null }[];
}

/** สถานะของช่องว่าง — ถ้าผู้คีย์กด F2 = ILLEGIBLE, F3 = BLANK_IN_PAPER, ไม่กด = BLANK ตามเดิม */
function emptyStatusFromMark(mark: "ILLEGIBLE" | "BLANK_IN_PAPER" | null | undefined): FieldStatusEnum {
  return mark === "ILLEGIBLE" ? FieldStatusEnum.ILLEGIBLE : FieldStatusEnum.BLANK_IN_PAPER;
}

/**
 * แถวกลุ่มเปราะบางที่มีข้อมูลจริง → mapping พร้อมสถานะรายช่อง (pure)
 * marks: มาร์ก F2/F3 รายเซลล์ (คีย์ `vg-{ดัชนีเดิม}-firstName|lastName|age|phone`)
 * — แถวที่ว่างแต่ถูกมาร์กไว้ (เช่น กระดาษมีชื่อแต่อ่านไม่ออก) ต้องคงไว้ ไม่ตัดทิ้ง
 */
export function mapVulnerableRows(
  rows: VulnerableRowInput[],
  marks: Record<string, "ILLEGIBLE" | "BLANK_IN_PAPER" | null> = {},
): VulnerableRowMapped[] {
  const markOf = (origIndex: number, cell: string) => marks[`vg-${origIndex}-${cell}`] ?? null;
  const rowHasMark = (origIndex: number) =>
    (["firstName", "lastName", "age", "phone"] as const).some(
      (cell) => markOf(origIndex, cell) != null,
    );
  const kept = rows
    .map((r, origIndex) => ({ r, origIndex }))
    .filter(
      ({ r, origIndex }) =>
        r.prefix.trim() !== "" ||
        r.prefixOther.trim() !== "" ||
        r.firstName.trim() !== "" ||
        r.lastName.trim() !== "" ||
        String(r.age).trim() !== "" ||
        r.phone.trim() !== "" ||
        r.vulnerabilities.length > 0 ||
        rowHasMark(origIndex),
    );
  return kept.map(({ r, origIndex }, i) => {
    const ageRaw = String(r.age).trim();
    const ageNum = Number(ageRaw);
    const ageValid = ageRaw !== "" && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 120;
    const hasName = r.firstName.trim() !== "" || r.lastName.trim() !== "";
    const nameMark = markOf(origIndex, "firstName") ?? markOf(origIndex, "lastName");
    return {
      seq: i + 1,
      namePrefixId: r.prefix.trim() || null,
      prefixOther: r.prefixOther.trim() || null,
      firstName: r.firstName.trim() || null,
      lastName: r.lastName.trim() || null,
      nameStatus: hasName ? FieldStatusEnum.HAS_VALUE : emptyStatusFromMark(nameMark),
      age: ageValid ? ageNum : null,
      ageStatus:
        ageRaw === ""
          ? emptyStatusFromMark(markOf(origIndex, "age"))
          : ageValid
            ? FieldStatusEnum.HAS_VALUE
            : FieldStatusEnum.ILLEGIBLE, // เขียนมาแต่ไม่ใช่อายุที่เป็นไปได้ (เช่น 999)
      phone: r.phone.trim() || null,
      phoneStatus: r.phone.trim()
        ? FieldStatusEnum.HAS_VALUE
        : emptyStatusFromMark(markOf(origIndex, "phone")),
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
  const { communityId } = access.sheet;

  const clean = sanitizeEntryPayload(payload);
  const keyring = getKeyring();
  const searchKey = getSearchHashKey();
  const now = new Date();

  // --- เตรียมข้อมูล Household (ฟิลด์อ่อนไหวเข้ารหัสก่อนเข้า transaction) ---
  const respondentPrefixId = prefixIdOf(clean, "respondentPrefix");
  const respondentFirstName = answerString(clean, "respondentFirstName");
  const respondentLastName = answerString(clean, "respondentLastName");
  const respondentPhone = answerString(clean, "respondentPhone");
  const respondentPhoneIdx = respondentPhone
    ? phoneBlindIndex(respondentPhone, searchKey)
    : null;
  const surveyedAtRaw = answerString(clean, "surveyedAt");
  // พิกัดแยกเป็นสองช่อง (Owner Decision 2026-08-03) — ประกอบกลับเป็นคู่เพื่อเก็บค่าดิบ + derive
  const coordinateRawText =
    composeCoordinateText(
      answerString(clean, "latitudeText"),
      answerString(clean, "longitudeText"),
    ) || null;
  const parsedCoordinate = coordinateForStorage(parseCoordinateText(coordinateRawText));
  const marks = Object.entries(clean.marks).filter(([, v]) => v != null);
  const illegibleCount = marks.filter(([, v]) => v === "ILLEGIBLE").length;
  const blankCount = marks.filter(([, v]) => v === "BLANK_IN_PAPER").length;
  const vulnerableRows = mapVulnerableRows(clean.vulnerableRows, clean.marks);
  const hasVulnerable = answerBoolean(clean, "hasVulnerable");
  // ความต้องการช่วยเหลือรายข้อ — detail เป็นข้อมูลอ่อนไหว 🔒 จึงเข้ารหัสก่อนเก็บ
  const assistanceNeeds = assistanceNeedsFromPayload(clean).map((a) => ({
    needTypeId: a.needTypeId,
    personCount: a.personCount,
    detail: a.detail ? encryptText(a.detail, keyring, CURRENT_KEY_VERSION) : null,
  }));
  const enc = encryptJson(clean, keyring, CURRENT_KEY_VERSION);

  // --- ส่วนที่ 3: FloodRiskProfile (1:1) — materialize จาก payload ลงคอลัมน์จริง
  //     (ก่อนหน้านี้ค้างเฉพาะใน payload เข้ารหัส ทำให้หน้าตรวจไม่เห็นส่วนที่ 3)
  const nearestEvacSiteTypes = answerEnumList(
    clean,
    "nearestEvacSiteTypes",
    Object.values(NearestEvacSiteType),
  );
  const floodMeters = answerCount(clean, "floodDepthMetersRaw");
  const floodCm = answerCount(clean, "floodDepthCmRaw");
  const frpData = {
    floorLevelVsRoad: answerEnum(clean, "floorLevelVsRoad", Object.values(FloorLevel)),
    hasFloodedBefore: answerBoolean(clean, "hasFloodedBefore"),
    floodDepthMetersRaw: floodMeters,
    floodDepthCmRaw: floodCm,
    maxFloodDepthCm:
      floodMeters != null || floodCm != null ? (floodMeters ?? 0) * 100 + (floodCm ?? 0) : null,
    lastFloodDurationDays: answerCount(clean, "lastFloodDurationDays"),
    hasSafeParking: answerBoolean(clean, "hasSafeParking"),
    hasAlternateParking: answerBoolean(clean, "hasAlternateParking"),
    alternateParkingLocation: answerString(clean, "alternateParkingLocation"),
    lastEvacuationPlace: answerEnum(clean, "lastEvacuationPlace", Object.values(LastEvacuationPlace)),
    lastEvacuationOther: answerString(clean, "lastEvacuationOther"),
    nearestEvacSiteTypes,
    // scalar เดิม = ค่าตัวแรก (เข้ากันได้ย้อนหลังกับ risk list)
    nearestEvacSiteType: nearestEvacSiteTypes[0] ?? null,
    nearestEvacSiteOther: answerString(clean, "nearestEvacSiteOther"),
    hasSurvivalKit: answerBoolean(clean, "hasSurvivalKit"),
    canBeHostHouse: answerBoolean(clean, "canBeHostHouse"),
    riskLevelSurveyor: answerEnum(clean, "riskLevelSurveyor", Object.values(SurveyorRiskLevel)),
  };
  const hasFrpData = Object.values(frpData).some(
    (v) => v != null && !(Array.isArray(v) && v.length === 0),
  );

  // ส่วนที่ 3 ข้อ 9: ยานพาหนะอพยพ (M:N enum) + ระบุ OTHER
  const evacVehicleTypes = answerEnumList(clean, "evacuationVehicles", Object.values(VehicleType));
  const evacVehicleOther = answerString(clean, "evacuationVehiclesOther");
  // ส่วนที่ 3 ข้อ 11: ทรัพยากร (M:N master) — ตัดซ้ำกัน unique(householdId, resourceTypeId)
  const resourceTypeIds = [...new Set(answerIdList(clean, "householdResources"))];
  // ส่วนที่ 4 ข้อ 1: ช่องทางรับข่าว (M:N master)
  const alertChannelIds = [...new Set(answerIdList(clean, "alertChannels"))];
  // ส่วนที่ 4 ข้อ 4: อาสาสมัคร (M:N master)
  const volunteerTypeIds = [...new Set(answerIdList(clean, "volunteerInterests"))];
  // ส่วนที่ 4 ข้อ 2-3: ความพร้อมดิจิทัล (1:1)
  const usesSmartphone = answerBoolean(clean, "usesSmartphone");
  const canScanQR = answerBoolean(clean, "canScanQR");
  const hasDigitalData = usesSmartphone != null || canScanQR != null;

  const householdData = {
    sheetId,
    communityId,
    // ส่วนที่ 0 — ตามกระดาษ ไม่ auto-fill
    surveyNo: answerString(clean, "surveyNo"),
    communityNameOnPaper: answerString(clean, "communityNameOnPaper"),
    // ชื่อผู้สำรวจ (staff) เก็บ plaintext — คำนำหน้าเป็น FK master (Prisma ตรวจ FK)
    surveyorPrefixId: prefixIdOf(clean, "surveyorPrefix"),
    surveyorPrefixOther: answerString(clean, "surveyorPrefixOther"),
    surveyorFirstNameOnPaper: answerString(clean, "surveyorFirstNameOnPaper"),
    surveyorLastNameOnPaper: answerString(clean, "surveyorLastNameOnPaper"),
    surveyorPhoneOnPaper: answerString(clean, "surveyorPhoneOnPaper"),
    surveyedAt: surveyedAtRaw ? parseThaiDate(surveyedAtRaw) : null, // parse ไม่ได้ → null (ดิบอยู่ใน payload)
    // ส่วนที่ 1
    buildingTypeId: answerString(clean, "buildingTypeId"),
    buildingTypeOther: answerString(clean, "buildingTypeOther"),
    placeName: answerString(clean, "placeName"),
    respondentPrefixId, // FK master (plaintext) — Prisma ตรวจ FK; ไม่ถูกต้อง → P2003
    respondentPrefixOther: answerString(clean, "respondentPrefixOther"),
    respondentFirstName: respondentFirstName
      ? encryptText(respondentFirstName, keyring, CURRENT_KEY_VERSION)
      : null,
    respondentLastName: respondentLastName
      ? encryptText(respondentLastName, keyring, CURRENT_KEY_VERSION)
      : null,
    respondentPhone: respondentPhone
      ? encryptText(respondentPhone, keyring, CURRENT_KEY_VERSION)
      : null,
    respondentPhoneIdx,
    houseNo: answerString(clean, "houseNo"),
    mooNo: answerCount(clean, "mooNo"),
    soi: answerString(clean, "soi"),
    road: answerString(clean, "road"),
    tambonId: answerString(clean, "tambonId"),
    // ต้นฉบับเก็บตรงตามกระดาษเสมอ (R5 — GIS / QM-04)
    coordinateRawText: coordinateRawText,
    // Derived: เขียนเฉพาะเมื่อ parse ได้อย่างมั่นใจ (อยู่ในกรอบประเทศไทย)
    // สลับแกน/นอกกรอบ/อ่านไม่ออก → ปล่อย null ให้ผู้ตรวจตัดสินจากค่าดิบ ไม่เดาแทน
    latitude: parsedCoordinate?.lat ?? null,
    longitude: parsedCoordinate?.lng ?? null,
    memberCount: answerCount(clean, "memberCount"),
    ownershipTypeId: answerString(clean, "ownershipTypeId"),
    ownershipOther: answerString(clean, "ownershipOther"),
    // ส่วนที่ 2
    hasVulnerable,
    assistanceTotalPersonCount: answerCount(clean, "assistanceTotalPersonCount"),
    // ส่วนที่ 4-5 (คอลัมน์ตรงบน Household — ส่วนที่เหลือของฟอร์มคงอยู่ใน payload
    // เข้ารหัส รอ materialize ลงตารางย่อย เช่น FloodRiskProfile ใน slice ถัดไป)
    hasNoResources: answerBoolean(clean, "hasNoResources"),
    mentalHealthSupport: answerBoolean(clean, "mentalHealthSupport"),
    volunteerNotAvailable: answerBoolean(clean, "volunteerNotAvailable"),
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
      //    ไม่นับใบของตัวเองตอนแก้ซ้ำ ไม่งั้นการแก้จะติดธง "ซ้ำ" กับตัวเองเสมอ
      const existing = await tx.household.findUnique({
        where: { sheetId },
        select: {
          id: true,
          verifiedAt: true,
          communityId: true,
          houseNo: true,
          mooNo: true,
          soi: true,
          road: true,
          tambonId: true,
          duplicateResolution: true,
          duplicateResolvedAt: true,
          duplicateResolvedById: true,
        },
      });
      const addressForDuplicate = {
        communityId,
        houseNo: householdData.houseNo,
        mooNo: householdData.mooNo,
        soi: householdData.soi,
        road: householdData.road,
        tambonId: householdData.tambonId,
      };
      // ตรวจซ้ำเฉพาะเมื่อบ้านเลขที่และหมู่มีค่าครบ และที่อยู่ทุกส่วนตรงกัน
      // ไม่ใช้ชื่อหรือเบอร์โทร เพราะญาติ/ผู้ประสานงานอาจใช้ข้อมูลร่วมกันได้
      const duplicateSuspected = addressForDuplicate.houseNo != null && addressForDuplicate.mooNo != null
        ? (await tx.household.count({
            where: {
              ...addressForDuplicate,
              deletedAt: null,
              ...(existing ? { id: { not: existing.id } } : {}),
            },
          })) > 0
        : false;
      // ถ้าแก้ใบเดิมแต่ชุดที่อยู่ไม่เปลี่ยน ให้คงคำตัดสินของผู้ตรวจไว้
      // หากที่อยู่เปลี่ยน ต้องกลับมาให้ระบบตรวจและให้ผู้ตรวจตัดสินใหม่
      const preserveDuplicateDecision =
        existing != null &&
        existing.communityId === addressForDuplicate.communityId &&
        existing.houseNo === addressForDuplicate.houseNo &&
        existing.mooNo === addressForDuplicate.mooNo &&
        existing.soi === addressForDuplicate.soi &&
        existing.road === addressForDuplicate.road &&
        existing.tambonId === addressForDuplicate.tambonId &&
        existing.duplicateResolution != null;
      const effectiveDuplicateFlag = preserveDuplicateDecision
        ? existing.duplicateResolution === "CONFIRMED_DUPLICATE"
        : duplicateSuspected;

      // 4) Household (1:1 กับใบ — unique sheetId กันซ้ำระดับ DB)
      //    ผู้คีย์แก้ใบของตนได้ตลอด (#R7-C) → มีของเดิมให้เขียนทับ ไม่ใช่สร้างซ้ำ
      //    การแก้ใบที่ตรวจแล้วต้องล้าง verifiedBy/At ด้วย เพราะใบกลับไปรอตรวจใหม่
      let household: { id: string };
      if (existing) {
        household = await tx.household.update({
          where: { id: existing.id },
          data: {
            ...householdData,
            hasDuplicateFlag: effectiveDuplicateFlag,
            duplicateResolution: preserveDuplicateDecision ? existing.duplicateResolution : null,
            duplicateResolvedAt: preserveDuplicateDecision ? existing.duplicateResolvedAt : null,
            duplicateResolvedById: preserveDuplicateDecision ? existing.duplicateResolvedById : null,
            verifiedById: null,
            verifiedAt: null,
          },
          select: { id: true },
        });
        // ลูกของ Household ถูกสร้างใหม่ทั้งชุดจาก payload ล่าสุด
        await tx.assistanceNeed.deleteMany({ where: { householdId: existing.id } });
        await tx.personVulnerability.deleteMany({
          where: { person: { householdId: existing.id } },
        });
        await tx.vulnerablePerson.deleteMany({ where: { householdId: existing.id } });
        // ส่วนที่ 3-4 (materialize) — ล้างชุดเดิมก่อนสร้างใหม่จาก payload ล่าสุด
        await tx.floodRiskProfile.deleteMany({ where: { householdId: existing.id } });
        await tx.evacuationVehicle.deleteMany({ where: { householdId: existing.id } });
        await tx.householdResource.deleteMany({ where: { householdId: existing.id } });
        await tx.alertChannelPref.deleteMany({ where: { householdId: existing.id } });
        await tx.volunteerInterest.deleteMany({ where: { householdId: existing.id } });
        await tx.digitalReadiness.deleteMany({ where: { householdId: existing.id } });
      } else {
        household = await tx.household.create({
          data: { ...householdData, hasDuplicateFlag: effectiveDuplicateFlag },
          select: { id: true },
        });
      }
      const wasVerified = existing?.verifiedAt != null;

      // 4.1) ความต้องการช่วยเหลือรายข้อ (ส่วนที่ 2 ข้อ 3) — จำนวนคน/รายละเอียดตามกระดาษ
      if (assistanceNeeds.length > 0) {
        await tx.assistanceNeed.createMany({
          data: assistanceNeeds.map((a) => ({
            householdId: household.id,
            needTypeId: a.needTypeId,
            personCount: a.personCount,
            detail: a.detail,
          })),
        });
      }

      // 5) กลุ่มเปราะบางรายบุคคล + ลักษณะความเปราะบาง (ชื่อ/เบอร์/รายละเอียดเข้ารหัส)
      for (const row of vulnerableRows) {
        const person = await tx.vulnerablePerson.create({
          data: {
            householdId: household.id,
            seq: row.seq,
            namePrefixId: row.namePrefixId, // FK master (plaintext)
            prefixOther: row.prefixOther,
            firstName: row.firstName
              ? encryptText(row.firstName, keyring, CURRENT_KEY_VERSION)
              : null,
            lastName: row.lastName
              ? encryptText(row.lastName, keyring, CURRENT_KEY_VERSION)
              : null,
            nameStatus: row.nameStatus,
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

      // 5.1) ส่วนที่ 3-4 — materialize ลงตารางจริงเพื่อให้หน้าตรวจ/แก้/รายงานเห็นครบ
      if (hasFrpData) {
        await tx.floodRiskProfile.create({
          data: { householdId: household.id, ...frpData },
        });
      }
      if (evacVehicleTypes.length > 0) {
        await tx.evacuationVehicle.createMany({
          data: evacVehicleTypes.map((vehicleType) => ({
            householdId: household.id,
            vehicleType,
            // ระบุรายละเอียดผูกกับตัวเลือก OTHER เท่านั้น
            detail: vehicleType === VehicleType.OTHER ? evacVehicleOther : null,
          })),
        });
      }
      if (resourceTypeIds.length > 0) {
        await tx.householdResource.createMany({
          data: resourceTypeIds.map((resourceTypeId) => ({
            householdId: household.id,
            resourceTypeId,
          })),
        });
      }
      if (alertChannelIds.length > 0) {
        await tx.alertChannelPref.createMany({
          data: alertChannelIds.map((alertChannelId) => ({
            householdId: household.id,
            alertChannelId,
          })),
        });
      }
      if (volunteerTypeIds.length > 0) {
        await tx.volunteerInterest.createMany({
          data: volunteerTypeIds.map((volunteerTypeId) => ({
            householdId: household.id,
            volunteerTypeId,
          })),
        });
      }
      if (hasDigitalData) {
        await tx.digitalReadiness.create({
          data: { householdId: household.id, usesSmartphone, canScanQR },
        });
      }

      // 6) สถานะรายฟิลด์ — การส่งซ้ำต้องแทนสถานะทั้งชุด รวมกรณีแก้จนไม่มี mark เหลือ
      await tx.fieldStatus.deleteMany({ where: { sheetId } });
      if (marks.length > 0) {
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

      return {
        kind: "OK" as const,
        householdId: household.id,
        duplicateSuspected: effectiveDuplicateFlag && !preserveDuplicateDecision,
        wasVerified,
      };
    });

    if (result.kind === "LOCK_LOST") return { ok: false, reason: "LOCK_LOST" };

    // แก้ใบที่ตรวจแล้ว = เหตุการณ์คนละอย่างกับการคีย์ครั้งแรก ต้องแยกให้ตรวจย้อนหลังได้
    await writeAuditLog({
      userId: ctx.userId,
      action: result.wasVerified ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: "Household",
      entityId: result.householdId,
      changes: result.wasVerified
        ? {
            sheetStatus: { old: "VERIFIED", new: "ENTERED_1" },
            verification: { old: "VERIFIED", new: "CLEARED" },
            reason: "ผู้คีย์แก้ไขใบที่ตรวจแล้ว — ส่งกลับไปรอตรวจใหม่",
          }
        : { sheetStatus: { old: "LOCKED", new: "ENTERED_1" } },
    });
    return {
      ok: true,
      householdId: result.householdId,
      duplicateSuspected: result.duplicateSuspected,
      reopenedForVerify: result.wasVerified,
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
