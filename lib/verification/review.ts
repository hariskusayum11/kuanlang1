// Verification Review core — โหลดข้อมูลครัวเรือนเพื่อตรวจ + ยืนยัน VERIFIED
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - ทุกการเปิดดูข้อมูลอ่อนไหวต้องมี Audit READ (privacy)
// - ยืนยันได้เมื่อสถานะ ENTERED_1 เท่านั้น + ตรวจ RBAC/scope ฝั่ง server
// - ผู้คีย์ยืนยันงานตัวเองไม่ได้ (แยกหน้าที่ผู้คีย์/ผู้ตรวจ)
// - VERIFIED = transaction: flip สถานะ + verifiedBy/At
//   + snapshot HouseholdVersion + Audit VERIFY (race-guarded กันกดซ้ำ)
// - Audit ห้าม log ค่า PII ดิบ — เก็บเฉพาะ entity อ้างอิงและ metadata ปลอดภัย

import { AuditAction, FieldStatusEnum, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { decryptText } from "../crypto/encryption";
import { getKeyring } from "../crypto/keys";

function canVerify(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
}

/** ถอดรหัสเพื่อ "แสดงผลให้ผู้ตรวจ" — ล้มเหลว (key คนละชุด/ข้อมูลเสีย) → ป้ายกำกับ ไม่ crash */
function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptText(value, getKeyring());
  } catch {
    return "⚠️ ถอดรหัสไม่ได้";
  }
}

export interface ReviewField {
  label: string;
  value: string | null;
  status?: FieldStatusEnum;
  sensitive?: boolean;
}

export interface ReviewVulnerablePerson {
  seq: number;
  prefix: string | null;
  name: string | null;
  nameStatus: FieldStatusEnum;
  age: number | null;
  ageStatus: FieldStatusEnum;
  phone: string | null;
  phoneStatus: FieldStatusEnum;
  vulnerabilities: string[];
}

export interface HouseholdReview {
  householdId: string;
  sheetNo: string;
  communityName: string;
  status: SheetStatus;
  enteredAt: Date;
  enteredByName: string;
  enteredByMe: boolean;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  illegibleCount: number;
  blankCount: number;
  hasDuplicateFlag: boolean;
  /** ยืนยันได้: สถานะ ENTERED_1 และผู้ตรวจไม่ใช่ผู้คีย์เอง */
  canConfirm: boolean;
  sections: { title: string; fields: ReviewField[] }[];
  vulnerablePersons: ReviewVulnerablePerson[];
}

/** รวมคำนำหน้า + ชื่อ (ถอดรหัสแล้ว) เป็นชื่อแสดงผล */
function joinName(
  prefix: string | null,
  prefixOther: string | null,
  first: string | null,
  last: string | null,
): string | null {
  const px = prefix === "อื่นๆ" || prefix === null ? prefixOther ?? "" : prefix;
  const full = `${px ?? ""}${first ?? ""} ${last ?? ""}`.trim();
  return full === "" ? null : full;
}

/** กระจาย enum เป็นตัวเลือก label — ตาม data dictionary (docs/03) */
const FLOOR_LEVEL_LABEL: Record<string, string> = {
  BELOW_ROAD: "ต่ำกว่าถนน",
  EQUAL_ROAD: "เท่าถนน",
  ABOVE_ROAD: "สูงกว่าถนน",
};
const LAST_EVAC_LABEL: Record<string, string> = {
  UPPER_FLOOR: "อาศัยชั้น 2/ชั้น 3",
  ROOF: "อาศัยบนหลังคา",
  NEAREST_SITE: "ไปยังจุดอพยพใกล้ที่สุด",
  OTHER: "อื่น ๆ",
};
const NEAREST_EVAC_LABEL: Record<string, string> = {
  RELATIVE_HOUSE: "บ้านญาติ",
  SCHOOL: "โรงเรียน",
  TEMPLE_MOSQUE: "วัด/มัสยิด",
  COMMUNITY_CENTER: "ศูนย์ชุมชน",
  MUNICIPALITY: "พื้นที่เทศบาล",
  UNKNOWN: "ไม่ทราบ",
  OTHER: "อื่น ๆ",
};
const VEHICLE_LABEL: Record<string, string> = {
  CAR: "รถยนต์",
  MOTORCYCLE: "มอเตอร์ไซค์",
  BOAT: "เรือ",
  OTHER: "อื่น ๆ",
};
const RISK_SURVEYOR_LABEL: Record<string, string> = {
  LOW: "ต่ำ",
  MEDIUM: "ปานกลาง",
  HIGH: "สูง",
};

/** ฟิลด์ type ที่เลือกค่าจาก enum เป็น label — กัน label ผิดรูปไม่โผล่ */
function enumLabel(
  map: Record<string, string>,
  value: string | null | undefined,
): string | null {
  return value != null ? (map[value] ?? value) : null;
}

/** ระดับน้ำจาก 2 ช่อง (ม.+ซม.) — แสดงตามที่กรอก ไม่ต้องคำนวณ */
function floodDepthText(m: number | null, cm: number | null): string | null {
  const parts: string[] = [];
  if (m != null) parts.push(`${m} เมตร`);
  if (cm != null) parts.push(`${cm} ซม.`);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * โหลดครัวเรือนเพื่อตรวจ (ถอดรหัสข้อมูลอ่อนไหว) + เขียน Audit READ
 * นอก scope / ไม่พบ → null (ตอบเหมือนกันเพื่อกัน IDOR probing)
 */
export async function loadHouseholdForReview(
  ctx: AuthorizationContext,
  householdId: string,
): Promise<HouseholdReview | null> {
  if (!canVerify(ctx)) return null;

  const h = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    include: {
      sheet: { select: { sheetNo: true, status: true } },
      community: { select: { nameTh: true } },
      respondentPrefix: { select: { nameTh: true } },
      surveyorPrefix: { select: { nameTh: true } },
      buildingType: { select: { nameTh: true } },
      moo: { select: { number: true } },
      tambon: { select: { nameTh: true } },
      ownershipType: { select: { nameTh: true } },
      enteredBy: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      // ขยายเพื่อแสดงทุกส่วน (Owner: ตรวจต้องเห็นฟิลด์ทั้งหมดที่คีย์มา)
      assistanceNeeds: {
        orderBy: { needType: { sortOrder: "asc" } },
        include: { needType: { select: { nameTh: true } } },
      },
      floodRiskProfile: true,
      householdResources: {
        orderBy: { resourceType: { sortOrder: "asc" } },
        include: { resourceType: { select: { nameTh: true } } },
      },
      evacuationVehicles: true,
      alertChannelPrefs: {
        orderBy: { alertChannel: { sortOrder: "asc" } },
        include: { alertChannel: { select: { nameTh: true } } },
      },
      digitalReadiness: true,
      volunteerInterests: {
        orderBy: { volunteerType: { sortOrder: "asc" } },
        include: { volunteerType: { select: { nameTh: true } } },
      },
      vulnerablePersons: {
        orderBy: { seq: "asc" },
        include: {
          namePrefix: { select: { nameTh: true } },
          vulnerabilities: { include: { vulnerabilityType: { select: { nameTh: true } } } },
        },
      },
    },
  });
  if (!h) return null;

  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return null;

  // Audit READ — เปิดดูข้อมูลอ่อนไหว (ไม่ log ค่า PII ดิบ)
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "Household",
    entityId: h.id,
    reason: "verification-review",
  });

  const enteredByMe = h.enteredById === ctx.userId;
  const frp = h.floodRiskProfile;

  // --- ส่วนที่ 3 และฟิลด์ 4-5: ฟิลด์รวมที่แสดงเป็นรายการ (M:N) — รวมเป็นข้อความ
  const resourceList = h.householdResources.map(
    (r) => r.resourceType.nameTh + (r.quantity != null ? ` (${r.quantity})` : ""),
  );
  const vehicleList = h.evacuationVehicles.map(
    (v) => enumLabel(VEHICLE_LABEL, v.vehicleType) ?? v.detail ?? "",
  );
  const channelList = h.alertChannelPrefs.map((c) => c.alertChannel.nameTh);
  const volunteerList = h.volunteerInterests.map((v) => v.volunteerType.nameTh);
  const assistanceList = h.assistanceNeeds.map((a) => {
    const parts = [a.needType.nameTh];
    if (a.personCount != null) parts.push(`(${a.personCount} คน)`);
    if (a.detail) parts.push(`— ${safeDecrypt(a.detail)}`);
    return parts.join(" ");
  });

  const sections: HouseholdReview["sections"] = [
    {
      title: "ส่วนที่ 0 — ข้อมูลการสำรวจ",
      fields: [
        { label: "แบบสอบถามลำดับที่", value: h.surveyNo },
        { label: "ชื่อชุมชน (ตามกระดาษ)", value: h.communityNameOnPaper },
        {
          label: "ผู้สำรวจ",
          value: joinName(
            h.surveyorPrefix?.nameTh ?? null,
            h.surveyorPrefixOther,
            h.surveyorFirstNameOnPaper,
            h.surveyorLastNameOnPaper,
          ),
        },
        { label: "เบอร์ผู้สำรวจ", value: h.surveyorPhoneOnPaper },
        {
          label: "วันที่สำรวจ",
          value: h.surveyedAt ? h.surveyedAt.toLocaleDateString("th-TH") : null,
        },
      ],
    },
    {
      title: "ส่วนที่ 1 — ข้อมูลทั่วไปและที่ตั้ง",
      fields: [
        { label: "ประเภทสิ่งปลูกสร้าง", value: h.buildingType?.nameTh ?? h.buildingTypeOther },
        { label: "ชื่อสถานที่/ร้าน", value: h.placeName },
        {
          label: "ผู้ให้ข้อมูล",
          value: joinName(
            h.respondentPrefix?.nameTh ?? null,
            h.respondentPrefixOther,
            safeDecrypt(h.respondentFirstName),
            safeDecrypt(h.respondentLastName),
          ),
          sensitive: true,
        },
        { label: "เบอร์โทรผู้ให้ข้อมูล", value: safeDecrypt(h.respondentPhone), sensitive: true },
        { label: "บ้านเลขที่", value: h.houseNo },
        { label: "หมู่", value: h.mooNo != null ? `หมู่ ${h.mooNo}` : h.moo ? `หมู่ ${h.moo.number}` : null },
        { label: "ซอย", value: h.soi },
        { label: "ถนน", value: h.road },
        { label: "ตำบล", value: h.tambon?.nameTh ?? null },
        { label: "พิกัด (ดิบ)", value: h.coordinateRawText, sensitive: true },
        { label: "จำนวนสมาชิก", value: h.memberCount != null ? String(h.memberCount) : null },
        { label: "กรรมสิทธิ์", value: h.ownershipType?.nameTh ?? h.ownershipOther },
      ],
    },
    {
      title: "ส่วนที่ 2 — กลุ่มเปราะบาง",
      fields: [
        {
          label: "มีกลุ่มเปราะบาง",
          value: h.hasVulnerable == null ? null : h.hasVulnerable ? "มี" : "ไม่มี (ติ๊กยืนยัน)",
        },
        {
          label: "จำนวนที่ต้องการช่วยเหลือ (คน)",
          value: h.assistanceTotalPersonCount != null ? String(h.assistanceTotalPersonCount) : null,
        },
        {
          label: "ความต้องการช่วยเหลือ",
          value: assistanceList.length > 0 ? assistanceList.join(" · ") : null,
        },
      ],
    },
    {
      title: "ส่วนที่ 3 — สภาพแวดล้อมและความเสี่ยงอุทกภัย",
      fields: [
        {
          label: "1. ระดับพื้นบ้านเทียบถนน",
          value: enumLabel(FLOOR_LEVEL_LABEL, frp?.floorLevelVsRoad),
        },
        {
          label: "2. เคยน้ำท่วม",
          value: frp?.hasFloodedBefore == null
            ? null
            : frp.hasFloodedBefore ? "เคย" : "ไม่เคย",
        },
        {
          label: "3. ระดับน้ำท่วมสูงสุด (ม. + ซม.)",
          value: floodDepthText(frp?.floodDepthMetersRaw ?? null, frp?.floodDepthCmRaw ?? null),
        },
        {
          label: "4. น้ำท่วมครั้งล่าสุดนานกี่วัน",
          value: frp?.lastFloodDurationDays != null ? `${frp.lastFloodDurationDays} วัน` : null,
        },
        {
          label: "5. มีพื้นที่จอดรถปลอดภัย",
          value: frp?.hasSafeParking == null ? null : frp.hasSafeParking ? "มี" : "ไม่มี",
        },
        {
          label: "6. มีจุดจอดรถปลอดภัยที่อื่น",
          value: frp?.hasAlternateParking == null
            ? null
            : frp.hasAlternateParking ? "มี" : "ไม่มี",
        },
        { label: "ระบุสถานที่จอดรถ", value: frp?.alternateParkingLocation ?? null },
        {
          label: "7. ที่อพยพครั้งล่าสุด",
          value: enumLabel(LAST_EVAC_LABEL, frp?.lastEvacuationPlace),
        },
        { label: "ที่อพยพ (อื่น ๆ ระบุ)", value: frp?.lastEvacuationOther ?? null },
        {
          label: "8. จุดอพยพใกล้ที่สุด",
          value:
            frp && frp.nearestEvacSiteTypes.length > 0
              ? frp.nearestEvacSiteTypes
                  .map((t) => NEAREST_EVAC_LABEL[t] ?? t)
                  .join(", ")
              : enumLabel(NEAREST_EVAC_LABEL, frp?.nearestEvacSiteType),
        },
        { label: "จุดอพยพ (อื่น ๆ ระบุ)", value: frp?.nearestEvacSiteOther ?? null },
        {
          label: "9. ยานพาหนะอพยพ",
          value: vehicleList.length > 0 ? vehicleList.join(", ") : null,
        },
        {
          label: "10. มีถุงยังชีพ",
          value: frp?.hasSurvivalKit == null
            ? null
            : frp.hasSurvivalKit ? "เตรียม" : "ไม่ได้เตรียม",
        },
        {
          label: "11. ทรัพยากรรับมืออุทกภัย",
          value: resourceList.length > 0
            ? h.hasNoResources === true
              ? "ไม่มี (ติ๊กยืนยัน)"
              : resourceList.join(", ")
            : h.hasNoResources === true
              ? "ไม่มี (ติ๊กยืนยัน)"
              : null,
        },
        {
          label: "12. ใช้เป็นบ้านพี่เลี้ยงได้",
          value: frp?.canBeHostHouse == null ? null : frp.canBeHostHouse ? "ได้" : "ไม่ได้",
        },
      ],
    },
    {
      title: "ส่วนที่ 4 — การเตือนภัยและการมีส่วนร่วม",
      fields: [
        {
          label: "1. ช่องทางรับข่าวเตือนภัย",
          value: channelList.length > 0 ? channelList.join(", ") : null,
        },
        {
          label: "2. ใช้สมาร์ทโฟน",
          value: h.digitalReadiness?.usesSmartphone == null
            ? null
            : h.digitalReadiness.usesSmartphone ? "ใช้" : "ไม่ใช้",
        },
        {
          label: "3. สแกน QR ได้",
          value: h.digitalReadiness?.canScanQR == null
            ? null
            : h.digitalReadiness.canScanQR ? "ได้" : "ไม่ได้",
        },
        {
          label: "4. สนใจเป็นอาสาสมัคร",
          value: volunteerList.length > 0
            ? volunteerList.join(", ")
            : h.volunteerNotAvailable === true
              ? "ไม่สะดวกเข้าร่วม (ติ๊กยืนยัน)"
              : null,
        },
        {
          label: "5. ต้องการเยียวยาจิตใจ",
          value: h.mentalHealthSupport == null ? null : h.mentalHealthSupport ? "ต้องการ" : "ไม่ต้องการ",
          sensitive: true,
        },
        { label: "6. ข้อเสนอแนะ", value: h.suggestion },
      ],
    },
    {
      title: "ส่วนที่ 5-6 — ผู้สำรวจและโครงการแก้จน",
      fields: [
        {
          label: "ระดับความเสี่ยง (ผู้สำรวจติ๊ก)",
          value: enumLabel(RISK_SURVEYOR_LABEL, frp?.riskLevelSurveyor),
        },
        { label: "หมายเหตุผู้สำรวจ", value: h.surveyorNote },
        {
          label: "สนใจโครงการแก้จน",
          value: h.povertyProgramInterest == null
            ? null
            : h.povertyProgramInterest ? "สนใจ" : "ไม่สนใจ",
        },
      ],
    },
  ];

  return {
    householdId: h.id,
    sheetNo: h.sheet.sheetNo,
    communityName: h.community.nameTh,
    status: h.sheet.status,
    enteredAt: h.enteredAt,
    enteredByName: h.enteredBy.name,
    enteredByMe,
    verifiedAt: h.verifiedAt,
    verifiedByName: h.verifiedBy?.name ?? null,
    illegibleCount: h.illegibleCount,
    blankCount: h.blankCount,
    hasDuplicateFlag: h.hasDuplicateFlag,
    canConfirm: h.sheet.status === SheetStatus.ENTERED_1 && !enteredByMe,
    sections,
    vulnerablePersons: h.vulnerablePersons.map((p) => ({
      seq: p.seq,
      prefix: p.namePrefix?.nameTh ?? p.prefixOther,
      name: joinName(null, null, safeDecrypt(p.firstName), safeDecrypt(p.lastName)),
      nameStatus: p.nameStatus,
      age: p.age,
      ageStatus: p.ageStatus,
      phone: safeDecrypt(p.phone),
      phoneStatus: p.phoneStatus,
      vulnerabilities: p.vulnerabilities.map((v) => v.vulnerabilityType.nameTh),
    })),
  };
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "NOT_FOUND" | "WRONG_STATUS" | "SELF_VERIFY" | "ERROR";
    };

/**
 * ยืนยันครัวเรือนเป็น VERIFIED — สถานะ ENTERED_1 → VERIFIED (race-guarded)
 * + verifiedBy/At + snapshot HouseholdVersion + Audit VERIFY
 */
export async function verifyHousehold(
  ctx: AuthorizationContext,
  householdId: string,
): Promise<VerifyResult> {
  if (!canVerify(ctx)) return { ok: false, reason: "NOT_ALLOWED" };

  const h = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    select: {
      id: true,
      communityId: true,
      sheetId: true,
      enteredById: true,
      sheet: { select: { status: true } },
    },
  });
  if (!h) return { ok: false, reason: "NOT_FOUND" };

  const inScope = ctx.isGlobalScope || ctx.communityIds.includes(h.communityId);
  if (!inScope) return { ok: false, reason: "NOT_FOUND" };
  if (h.sheet.status !== SheetStatus.ENTERED_1) return { ok: false, reason: "WRONG_STATUS" };
  // แยกหน้าที่: ผู้คีย์ยืนยันงานตัวเองไม่ได้ (BR — separation of duties)
  if (h.enteredById === ctx.userId) return { ok: false, reason: "SELF_VERIFY" };

  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) Race guard — ใบต้องยังเป็น ENTERED_1 ณ วินาทีที่เขียน (กันกดยืนยันซ้อน/ซ้ำ)
      const flipped = await tx.paperSheet.updateMany({
        where: { id: h.sheetId, status: SheetStatus.ENTERED_1 },
        data: { status: SheetStatus.VERIFIED },
      });
      if (flipped.count !== 1) return { kind: "WRONG_STATUS" as const };

      // 2) snapshot ทั้ง record (ฟิลด์อ่อนไหวยังเป็น ciphertext ใน snapshot — ไม่รั่ว plaintext)
      // JSON.parse(stringify) แปลง Decimal(lat/lng)/Date เป็นค่า JSON-safe ก่อนเก็บลง Json column
      const full = await tx.household.findUniqueOrThrow({ where: { id: h.id } });
      const snapshot = JSON.parse(JSON.stringify(full)) as Prisma.InputJsonValue;
      const versionNo =
        (await tx.householdVersion.count({ where: { householdId: h.id } })) + 1;
      await tx.householdVersion.create({
        data: {
          householdId: h.id,
          versionNo,
          snapshot,
          changedById: ctx.userId,
          changeReason: "verified",
        },
      });

      // 3) ประทับผู้ยืนยัน + เวลา
      await tx.household.update({
        where: { id: h.id },
        data: { verifiedById: ctx.userId, verifiedAt: now },
      });

      return { kind: "OK" as const };
    });

    if (result.kind === "WRONG_STATUS") return { ok: false, reason: "WRONG_STATUS" };

    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.VERIFY,
      entityType: "Household",
      entityId: h.id,
      changes: { sheetStatus: { old: "ENTERED_1", new: "VERIFIED" } },
    });
    return { ok: true };
  } catch {
    console.error("[verification] verifyHousehold ล้มเหลว", { householdId });
    return { ok: false, reason: "ERROR" };
  }
}
