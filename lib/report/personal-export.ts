import { AuditAction, VehicleType } from "@prisma/client";
import { calculateFloodDepthCm, floodDepthMeters } from "../../domain/flood/depth";
import { effectiveTriage, triageLabel, type TriageCode } from "../../domain/triage";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { writeAuditLog } from "../audit/log";
import { decryptText } from "../crypto/encryption";
import { getKeyring } from "../crypto/keys";
import { buildUsableHouseholdWhere, type HouseholdAnalyticsFilters } from "../household/trusted-where";
import { prisma } from "../prisma";
import { assemblePersonName, formatAge, formatDiseases } from "./vulnerable-export";
import {
  buildPersonalReportWorkbook,
  PERSONAL_REPORT_SHEET_NAMES,
  type PersonalReportColumn,
  type PersonalReportSheet,
} from "./personal-workbook";

const VEHICLE_LABEL: Record<VehicleType, string> = {
  CAR: "รถยนต์",
  MOTORCYCLE: "มอเตอร์ไซค์",
  BOAT: "เรือ",
  OTHER: "อื่น ๆ",
};

const FLOOR_LABEL: Record<string, string> = {
  BELOW_ROAD: "ต่ำกว่าถนน",
  EQUAL_ROAD: "เท่าถนน",
  ABOVE_ROAD: "สูงกว่าถนน",
};

const EVACUATION_LABEL: Record<string, string> = {
  UPPER_FLOOR: "ชั้น 2/ชั้น 3",
  ROOF: "บนหลังคา",
  NEAREST_SITE: "จุดอพยพใกล้ที่สุด",
  OTHER: "อื่น ๆ",
  RELATIVE_HOUSE: "บ้านญาติ",
  SCHOOL: "โรงเรียน",
  TEMPLE_MOSQUE: "วัด/มัสยิด",
  COMMUNITY_CENTER: "ศูนย์ชุมชน",
  MUNICIPALITY: "พื้นที่เทศบาล",
  UNKNOWN: "ไม่ทราบ",
};

const RISK_LABEL: Record<string, string> = { LOW: "ต่ำ", MEDIUM: "ปานกลาง", HIGH: "สูง" };

const BASE_COLUMNS: PersonalReportColumn[] = [
  { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 18 },
  { key: "respondentName", header: "ชื่อผู้ให้ข้อมูลประจำครัวเรือน", width: 25 },
  { key: "respondentPhone", header: "เบอร์โทรผู้ให้ข้อมูล", width: 18 },
  { key: "houseNo", header: "บ้านเลขที่", width: 12 },
  { key: "mooNo", header: "หมู่", width: 8 },
  { key: "soi", header: "ซอย", width: 16 },
  { key: "road", header: "ถนน", width: 16 },
  { key: "tambon", header: "ตำบล", width: 16 },
  { key: "community", header: "ชุมชน", width: 22 },
  { key: "coordinates", header: "พิกัด", width: 23 },
  { key: "surveyedAt", header: "วันที่สำรวจ", width: 14 },
];

function boolText(value: boolean | null | undefined, yes = "ใช่", no = "ไม่ใช่"): string {
  return value == null ? "ไม่ระบุ" : value ? yes : no;
}

function enumText(value: string | null | undefined, labels: Record<string, string>): string {
  return value ? labels[value] ?? value : "ไม่ระบุ";
}

function filterDescription(filters: HouseholdAnalyticsFilters): string {
  const parts = ["เฉพาะใบตรวจแล้วและไม่ใช่ใบซ้ำจริง"];
  if (filters.dateFrom) parts.push(`ตั้งแต่ ${filters.dateFrom}`);
  if (filters.dateTo) parts.push(`ถึง ${filters.dateTo}`);
  if (filters.communityId) parts.push("กรองตามชุมชน");
  if (filters.tambonId) parts.push("กรองตามตำบล");
  return parts.join(" · ");
}

export async function exportPersonalReport(
  ctx: AuthorizationContext,
  filters: Omit<HouseholdAnalyticsFilters, "status">,
): Promise<{ buffer: Buffer; householdCount: number; worksheetCount: number } | null> {
  if (!hasPermission(ctx, PERMISSIONS.PERSONAL_REPORT_EXPORT)) return null;

  const verifiedFilters: HouseholdAnalyticsFilters = { ...filters, status: "VERIFIED" };
  const where = buildUsableHouseholdWhere(
    verifiedFilters,
    ctx.isGlobalScope ? undefined : ctx.communityIds,
  );
  const households = await prisma.household.findMany({
    where,
    orderBy: [{ community: { code: "asc" } }, { houseNo: "asc" }, { id: "asc" }],
    select: {
      id: true,
      surveyNo: true,
      surveyedAt: true,
      surveyorPrefixOther: true,
      surveyorFirstNameOnPaper: true,
      surveyorLastNameOnPaper: true,
      surveyorPhoneOnPaper: true,
      enteredAt: true,
      verifiedAt: true,
      buildingTypeOther: true,
      placeName: true,
      respondentPrefixOther: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      houseNo: true,
      mooNo: true,
      soi: true,
      road: true,
      coordinateRawText: true,
      latitude: true,
      longitude: true,
      memberCount: true,
      ownershipOther: true,
      assistanceTotalPersonCount: true,
      hasNoResources: true,
      volunteerNotAvailable: true,
      mentalHealthSupport: true,
      suggestion: true,
      surveyorNote: true,
      povertyProgramInterest: true,
      completenessScore: true,
      illegibleCount: true,
      blankCount: true,
      sheet: { select: { sheetNo: true } },
      community: { select: { nameTh: true } },
      tambon: { select: { nameTh: true } },
      surveyorPrefix: { select: { nameTh: true } },
      respondentPrefix: { select: { nameTh: true } },
      buildingType: { select: { nameTh: true } },
      ownershipType: { select: { nameTh: true } },
      enteredBy: { select: { name: true, email: true } },
      verifiedBy: { select: { name: true, email: true } },
      vulnerablePersons: {
        where: { isActive: true },
        orderBy: { seq: "asc" },
        select: {
          seq: true,
          prefixOther: true,
          firstName: true,
          lastName: true,
          nameStatus: true,
          age: true,
          ageMonths: true,
          phone: true,
          triageLevel: true,
          notes: true,
          namePrefix: { select: { nameTh: true } },
          vulnerabilities: {
            select: {
              detail: true,
              pregnancyRawText: true,
              postpartumMonths: true,
              vulnerabilityType: { select: { nameTh: true, basePriority: true } },
            },
          },
        },
      },
      assistanceNeeds: {
        select: {
          personCount: true,
          detail: true,
          needType: { select: { nameTh: true } },
        },
      },
      floodRiskProfile: true,
      householdResources: {
        select: {
          quantity: true,
          detail: true,
          condition: true,
          isAvailableForCommunity: true,
          resourceType: { select: { nameTh: true } },
        },
      },
      evacuationVehicles: { select: { vehicleType: true, detail: true } },
      alertChannelPrefs: { select: { alertChannel: { select: { nameTh: true } } } },
      digitalReadiness: { select: { usesSmartphone: true, canScanQR: true, lineUserId: true } },
      volunteerInterests: {
        where: { isAvailable: true },
        select: {
          contactPersonName: true,
          contactPhone: true,
          volunteerType: { select: { nameTh: true } },
        },
      },
    },
  });

  const keyring = getKeyring();
  const decrypt = (value: string | null): string => {
    if (!value) return "";
    if (!/^v\d+:/.test(value)) return value;
    try {
      return decryptText(value, keyring);
    } catch {
      return "(ไม่สามารถแสดงข้อมูลได้)";
    }
  };

  const records = households.map((household) => {
    const respondentName = assemblePersonName(
      household.respondentPrefix?.nameTh ?? household.respondentPrefixOther ?? "",
      decrypt(household.respondentFirstName),
      decrypt(household.respondentLastName),
      "HAS_VALUE",
    );
    const coordinates = household.latitude != null && household.longitude != null
      ? `${household.latitude.toString()}, ${household.longitude.toString()}`
      : household.coordinateRawText ?? "";
    const base = {
      sheetNo: household.sheet.sheetNo,
      respondentName,
      respondentPhone: decrypt(household.respondentPhone),
      houseNo: household.houseNo ?? "",
      mooNo: household.mooNo != null && household.mooNo > 0 ? household.mooNo : "",
      soi: household.soi ?? "",
      road: household.road ?? "",
      tambon: household.tambon?.nameTh ?? "",
      community: household.community.nameTh,
      coordinates,
      surveyedAt: household.surveyedAt,
    };
    return { household, base };
  });

  const householdRows = records.map(({ household, base }) => ({
    ...base,
    surveyNo: household.surveyNo ?? "",
    placeName: household.placeName ?? "",
    buildingType: household.buildingType?.nameTh ?? household.buildingTypeOther ?? "",
    memberCount: household.memberCount,
    ownership: household.ownershipType?.nameTh ?? household.ownershipOther ?? "",
    surveyorName: `${household.surveyorPrefix?.nameTh ?? household.surveyorPrefixOther ?? ""}${household.surveyorFirstNameOnPaper ?? ""}${household.surveyorLastNameOnPaper ? ` ${household.surveyorLastNameOnPaper}` : ""}`.trim(),
    surveyorPhone: household.surveyorPhoneOnPaper ?? "",
    enteredBy: household.enteredBy.name || household.enteredBy.email,
    enteredAt: household.enteredAt,
    verifiedBy: household.verifiedBy?.name || household.verifiedBy?.email || "",
    verifiedAt: household.verifiedAt,
    suggestion: household.suggestion ?? "",
    surveyorNote: household.surveyorNote ?? "",
    completeness: household.completenessScore == null ? "ไม่ทราบ" : `${Math.round(household.completenessScore * 100)}%`,
    blankCount: household.blankCount,
    illegibleCount: household.illegibleCount,
    coordinateStatus: household.latitude == null || household.longitude == null ? "ไม่มีพิกัด" : "มีพิกัด",
  }));

  const vulnerableRows = records.flatMap(({ household, base }) => household.vulnerablePersons.map((person) => {
    const level = effectiveTriage(
      person.triageLevel as TriageCode | null,
      person.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
    );
    return {
      ...base,
      personSeq: person.seq,
      vulnerablePersonName: assemblePersonName(
        person.namePrefix?.nameTh ?? person.prefixOther ?? "",
        decrypt(person.firstName),
        decrypt(person.lastName),
        person.nameStatus,
      ),
      vulnerablePersonPhone: decrypt(person.phone),
      age: formatAge(person.age, person.ageMonths),
      vulnerabilities: formatDiseases(person.vulnerabilities.map((item) => ({
        nameTh: item.vulnerabilityType.nameTh,
        detail: decrypt(item.detail),
      }))),
      pregnancy: person.vulnerabilities.map((item) => item.pregnancyRawText).filter(Boolean).join("; "),
      postpartum: person.vulnerabilities.map((item) => item.postpartumMonths).filter((value) => value != null).map((value) => `${value} เดือน`).join("; "),
      triage: triageLabel(level),
      notes: decrypt(person.notes),
    };
  }));

  const assistanceRows = records.flatMap(({ household, base }) => household.assistanceNeeds.map((need) => ({
    ...base,
    needType: need.needType.nameTh,
    personCount: need.personCount,
    detail: decrypt(need.detail),
    householdTotal: household.assistanceTotalPersonCount,
  })));

  const supportRows = records.map(({ household, base }) => ({
    ...base,
    assistanceTotal: household.assistanceTotalPersonCount,
    assistanceDetails: household.assistanceNeeds.map((need) => {
      const count = need.personCount == null ? "" : ` ${need.personCount} คน`;
      const detail = decrypt(need.detail);
      return `${need.needType.nameTh}${count}${detail ? ` (${detail})` : ""}`;
    }).join("; "),
    mentalHealth: boolText(household.mentalHealthSupport, "ต้องการ", "ไม่ต้องการ"),
    mentalHealthIdentity: household.mentalHealthSupport === true
      ? "ชื่อที่แสดงคือผู้ให้ข้อมูล ไม่ได้ยืนยันว่าเป็นผู้รับบริการ"
      : "",
    povertyInterest: boolText(household.povertyProgramInterest, "สนใจ", "ไม่สนใจ"),
  }));

  const floodRows = records.map(({ household, base }) => {
    const flood = household.floodRiskProfile;
    const depthCm = flood
      ? calculateFloodDepthCm(flood.floodDepthMetersRaw, flood.floodDepthCmRaw) ?? flood.maxFloodDepthCm
      : null;
    return {
      ...base,
      floorLevel: enumText(flood?.floorLevelVsRoad, FLOOR_LABEL),
      floodedBefore: boolText(flood?.hasFloodedBefore, "เคย", "ไม่เคย"),
      maximumDepthMeters: depthCm == null ? "" : floodDepthMeters(depthCm),
      durationDays: flood?.lastFloodDurationDays,
      safeParking: boolText(flood?.hasSafeParking, "มี", "ไม่มี"),
      alternateParking: boolText(flood?.hasAlternateParking, "มี", "ไม่มี"),
      alternateParkingLocation: flood?.alternateParkingLocation ?? "",
      lastEvacuationPlace: enumText(flood?.lastEvacuationPlace, EVACUATION_LABEL),
      lastEvacuationOther: flood?.lastEvacuationOther ?? "",
      nearestSites: flood?.nearestEvacSiteTypes.map((value) => enumText(value, EVACUATION_LABEL)).join("; ") ?? "",
      nearestSiteOther: flood?.nearestEvacSiteOther ?? "",
      survivalKit: boolText(flood?.hasSurvivalKit, "เตรียม", "ไม่ได้เตรียม"),
      surveyorRisk: enumText(flood?.riskLevelSurveyor, RISK_LABEL),
      noResources: boolText(household.hasNoResources, "ไม่มีทรัพยากร", "มี/ไม่ได้ติ๊กว่าไม่มี"),
      resources: household.householdResources.map((resource) => {
        const quantity = resource.quantity == null ? "" : ` ${resource.quantity}`;
        const detail = resource.detail ? ` (${resource.detail})` : "";
        const condition = resource.condition ? ` สภาพ: ${resource.condition}` : "";
        return `${resource.resourceType.nameTh}${quantity}${detail}${condition}`;
      }).join("; "),
      vehicles: household.evacuationVehicles.map((vehicle) =>
        `${VEHICLE_LABEL[vehicle.vehicleType]}${vehicle.detail ? ` (${vehicle.detail})` : ""}`,
      ).join("; "),
      alertChannels: household.alertChannelPrefs.map((item) => item.alertChannel.nameTh).join("; "),
      smartphone: boolText(household.digitalReadiness?.usesSmartphone, "ใช้", "ไม่ใช้"),
      scanQr: boolText(household.digitalReadiness?.canScanQR, "ได้", "ไม่ได้"),
      lineUserId: household.digitalReadiness?.lineUserId ?? "",
      hostHouse: boolText(flood?.canBeHostHouse, "ยินยอมเบื้องต้น", "ไม่ยินยอม"),
      hostHouseNote: flood?.canBeHostHouse === true ? "ยังไม่ใช่ศูนย์อพยพที่ผ่านการรับรอง" : "",
    };
  });

  const volunteerRows = records.flatMap(({ household, base }) => household.volunteerInterests.map((interest) => ({
    ...base,
    volunteerContactName: decrypt(interest.contactPersonName),
    volunteerContactPhone: decrypt(interest.contactPhone),
    volunteerSkill: interest.volunteerType.nameTh,
    contactExplanation: interest.contactPersonName || interest.contactPhone
      ? "มีผู้ติดต่ออาสาสมัครระบุแยกในแบบสอบถาม"
      : "ไม่ได้ระบุผู้สมัครรายบุคคล กรุณาติดต่อผู้ให้ข้อมูลประจำครัวเรือน",
  })));

  const hostHouseCount = records.filter(({ household }) => household.floodRiskProfile?.canBeHostHouse === true).length;
  const mentalHealthCount = records.filter(({ household }) => household.mentalHealthSupport === true).length;
  const povertyCount = records.filter(({ household }) => household.povertyProgramInterest === true).length;
  const qualityCount = records.filter(({ household }) =>
    household.latitude == null || household.longitude == null || household.blankCount > 0 || household.illegibleCount > 0 || (household.completenessScore ?? 0) < 1,
  ).length;

  const sheets: PersonalReportSheet[] = [
    {
      name: PERSONAL_REPORT_SHEET_NAMES[0],
      title: "สรุปรายงานรายบุคคลจากแบบสอบถาม",
      note: "ตัวเลขในชีตนี้สรุปจากใบที่ผ่านการตรวจแล้วเท่านั้น รายชื่อในชีตระดับครัวเรือนคือผู้ให้ข้อมูล ไม่ใช่สมาชิกทุกคนในบ้าน",
      columns: [
        { key: "category", header: "หมวด", width: 28 },
        { key: "count", header: "จำนวนรายการ", width: 16 },
        { key: "unit", header: "หน่วย", width: 14 },
      ],
      rows: [
        { category: "ครัวเรือน", count: householdRows.length, unit: "ครัวเรือน" },
        { category: "บุคคลกลุ่มเปราะบาง", count: vulnerableRows.length, unit: "คน" },
        { category: "รายการความต้องการช่วยเหลือ", count: assistanceRows.length, unit: "รายการ" },
        { category: "ผู้สนใจเป็นอาสาสมัครแยกตามทักษะ", count: volunteerRows.length, unit: "รายการทักษะ" },
        { category: "บ้านที่ยินยอมเป็นจุดพักพิงเบื้องต้น", count: hostHouseCount, unit: "หลัง" },
        { category: "ครัวเรือนต้องการดูแลสุขภาพจิต", count: mentalHealthCount, unit: "ครัวเรือน" },
        { category: "ครัวเรือนสนใจโครงการแก้ไขความยากจน", count: povertyCount, unit: "ครัวเรือน" },
        { category: "ใบที่มีประเด็นคุณภาพข้อมูล", count: qualityCount, unit: "ใบ" },
      ],
    },
    {
      name: PERSONAL_REPORT_SHEET_NAMES[1],
      title: "ทะเบียนครัวเรือนและผู้ให้ข้อมูล",
      note: "ชื่อในชีตนี้คือผู้ให้ข้อมูลในแบบสอบถาม ไม่ได้หมายความว่าเป็นเจ้าของบ้านหรือผู้ได้รับความช่วยเหลือ",
      columns: [
        ...BASE_COLUMNS,
        { key: "surveyNo", header: "ลำดับแบบสอบถาม", width: 14 },
        { key: "placeName", header: "ชื่อสถานที่/ร้าน", width: 20 },
        { key: "buildingType", header: "ประเภทสิ่งปลูกสร้าง", width: 20 },
        { key: "memberCount", header: "สมาชิก (คน)", width: 12 },
        { key: "ownership", header: "กรรมสิทธิ์", width: 20 },
        { key: "surveyorName", header: "ชื่อผู้สำรวจ", width: 24 },
        { key: "surveyorPhone", header: "เบอร์ผู้สำรวจ", width: 16 },
        { key: "enteredBy", header: "ผู้คีย์ข้อมูล", width: 22 },
        { key: "enteredAt", header: "วันที่คีย์", width: 16 },
        { key: "verifiedBy", header: "ผู้ตรวจสอบ", width: 22 },
        { key: "verifiedAt", header: "วันที่ตรวจ", width: 16 },
        { key: "suggestion", header: "ข้อเสนอแนะ", width: 35 },
        { key: "surveyorNote", header: "หมายเหตุผู้สำรวจ", width: 35 },
        { key: "completeness", header: "ความครบถ้วน", width: 14 },
        { key: "blankCount", header: "ช่องว่างในกระดาษ", width: 16 },
        { key: "illegibleCount", header: "ช่องอ่านไม่ออก", width: 15 },
        { key: "coordinateStatus", header: "สถานะพิกัด", width: 15 },
      ],
      rows: householdRows,
    },
    {
      name: PERSONAL_REPORT_SHEET_NAMES[2],
      title: "รายชื่อบุคคลกลุ่มเปราะบาง",
      note: "คอลัมน์ชื่อบุคคลกลุ่มเปราะบางเป็นชื่อบุคคลจริงที่บันทึกในตารางกลุ่มเปราะบาง ส่วนชื่อผู้ให้ข้อมูลเป็นผู้ติดต่อของครัวเรือน",
      columns: [
        { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 18 },
        { key: "personSeq", header: "ลำดับบุคคล", width: 10 },
        { key: "vulnerablePersonName", header: "ชื่อบุคคลกลุ่มเปราะบาง", width: 27 },
        { key: "vulnerablePersonPhone", header: "เบอร์บุคคลกลุ่มเปราะบาง", width: 19 },
        { key: "age", header: "อายุ", width: 12 },
        { key: "vulnerabilities", header: "ลักษณะความเปราะบาง/รายละเอียด", width: 42 },
        { key: "pregnancy", header: "ข้อมูลอายุครรภ์ตามกระดาษ", width: 20 },
        { key: "postpartum", header: "หลังคลอด", width: 14 },
        { key: "triage", header: "ระดับความเร่งด่วน", width: 16 },
        { key: "notes", header: "หมายเหตุบุคคล", width: 28 },
        ...BASE_COLUMNS.slice(1),
      ],
      rows: vulnerableRows,
    },
    {
      name: PERSONAL_REPORT_SHEET_NAMES[3],
      title: "การช่วยเหลือ สุขภาพจิต และโครงการแก้ไขความยากจน",
      note: "ข้อมูลทั้งหมดในชีตนี้บันทึกระดับครัวเรือน ชื่อที่แสดงคือผู้ให้ข้อมูล/ผู้ติดต่อ ไม่ใช่รายชื่อผู้รับความช่วยเหลือหรือผู้รับบริการแต่ละคน",
      columns: [
        ...BASE_COLUMNS,
        { key: "assistanceTotal", header: "จำนวนที่ต้องการช่วยเหลือรวม", width: 20 },
        { key: "assistanceDetails", header: "ประเภท/จำนวน/รายละเอียดความช่วยเหลือ", width: 48 },
        { key: "mentalHealth", header: "ต้องการดูแลสุขภาพจิต", width: 20 },
        { key: "mentalHealthIdentity", header: "คำอธิบายผู้รับบริการ", width: 42 },
        { key: "povertyInterest", header: "สนใจโครงการแก้ไขความยากจน", width: 25 },
      ],
      rows: supportRows,
    },
    {
      name: PERSONAL_REPORT_SHEET_NAMES[4],
      title: "น้ำท่วม การอพยพ ทรัพยากร และความพร้อมของครัวเรือน",
      note: "รวมข้อมูลความพร้อมไว้หนึ่งแถวต่อครัวเรือน ชื่อที่แสดงคือผู้ให้ข้อมูล ระดับน้ำคำนวณจากช่องเมตรและเซนติเมตรแล้วแสดงเป็นเมตร บ้านพักพิงเป็นเพียงการยินยอมเบื้องต้น",
      columns: [
        ...BASE_COLUMNS,
        { key: "floorLevel", header: "ระดับพื้นเทียบถนน", width: 18 },
        { key: "floodedBefore", header: "เคยน้ำท่วม", width: 13 },
        { key: "maximumDepthMeters", header: "ระดับน้ำสูงสุด (เมตร)", width: 18 },
        { key: "durationDays", header: "ท่วมนาน (วัน)", width: 14 },
        { key: "safeParking", header: "ที่จอดรถปลอดภัย", width: 18 },
        { key: "alternateParking", header: "ที่จอดรถสำรอง", width: 17 },
        { key: "alternateParkingLocation", header: "สถานที่จอดรถสำรอง", width: 25 },
        { key: "lastEvacuationPlace", header: "ที่อพยพครั้งล่าสุด", width: 22 },
        { key: "lastEvacuationOther", header: "ที่อพยพอื่น ๆ", width: 22 },
        { key: "nearestSites", header: "จุดอพยพใกล้ที่สุด", width: 30 },
        { key: "nearestSiteOther", header: "จุดอพยพอื่น ๆ", width: 22 },
        { key: "survivalKit", header: "ถุงยังชีพ", width: 16 },
        { key: "surveyorRisk", header: "ความเสี่ยงที่ผู้สำรวจประเมิน", width: 22 },
        { key: "noResources", header: "สถานะทรัพยากร", width: 20 },
        { key: "resources", header: "ทรัพยากร/จำนวน/รายละเอียด", width: 42 },
        { key: "vehicles", header: "ยานพาหนะอพยพ", width: 30 },
        { key: "alertChannels", header: "ช่องทางรับข่าว", width: 32 },
        { key: "smartphone", header: "ใช้สมาร์ตโฟน", width: 16 },
        { key: "scanQr", header: "สแกน QR", width: 14 },
        { key: "lineUserId", header: "LINE User ID", width: 22 },
        { key: "hostHouse", header: "บ้านพักพิงเบื้องต้น", width: 20 },
        { key: "hostHouseNote", header: "หมายเหตุสถานะบ้านพักพิง", width: 38 },
      ],
      rows: floodRows,
    },
    {
      name: PERSONAL_REPORT_SHEET_NAMES[5],
      title: "ผู้สนใจเป็นอาสาสมัครแยกตามทักษะ",
      note: "ชื่อผู้ติดต่ออาสาสมัครแสดงเฉพาะเมื่อแบบสอบถามระบุไว้ หากว่างให้ติดต่อผู้ให้ข้อมูลประจำครัวเรือน ห้ามถือว่าผู้ให้ข้อมูลคืออาสาสมัครโดยอัตโนมัติ",
      columns: [
        { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 18 },
        { key: "volunteerContactName", header: "ชื่อผู้ติดต่ออาสาสมัคร (ถ้ามี)", width: 28 },
        { key: "volunteerContactPhone", header: "เบอร์ผู้ติดต่ออาสาสมัคร", width: 20 },
        { key: "volunteerSkill", header: "ทักษะที่สนใจ", width: 25 },
        { key: "contactExplanation", header: "สถานะการระบุตัวบุคคล", width: 42 },
        ...BASE_COLUMNS.slice(1),
      ],
      rows: volunteerRows,
    },
  ];

  const generatedAt = new Date();
  const buffer = await buildPersonalReportWorkbook({
    generatedAt,
    generatedBy: ctx.name || ctx.email,
    filterDescription: filterDescription(verifiedFilters),
    sheets,
  });

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.EXPORT,
    entityType: "PersonalQuestionnaireWorkbook",
    reason: "export-verified-personal-questionnaire-workbook",
    changes: {
      householdCount: households.length,
      worksheetCount: sheets.length,
      communityId: filters.communityId ?? null,
      tambonId: filters.tambonId ?? null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
    },
  });

  return { buffer, householdCount: households.length, worksheetCount: sheets.length };
}
