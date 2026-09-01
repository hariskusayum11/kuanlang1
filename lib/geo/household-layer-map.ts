import { AuditAction, Prisma, TriageLevel } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import type { AuthorizationContext } from "../authz/types";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import { buildVerifiedMapHouseholdWhere } from "../household/trusted-where";
import { effectiveTriage, type TriageCode } from "../../domain/triage";
import { calculateFloodDepthCm } from "../../domain/flood/depth";

export interface HouseholdMapFilters {
  communityId?: string;
  tambonId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface VolunteerMapSkill {
  code: string;
  label: string;
}

export interface HouseholdLayerPoint {
  id: string;
  sheetNo: string;
  surveyNo: string | null;
  houseNo: string | null;
  mooNo: number | null;
  soi: string | null;
  road: string | null;
  tambonName: string | null;
  lat: number;
  lng: number;
  communityName: string;
  vulnerableCount: number;
  triage: Record<"P1" | "P2" | "P3" | "UNASSESSED", number>;
  volunteerSkills: VolunteerMapSkill[];
  assistanceNeeds: { label: string; people: number | null }[];
  potentialHostHouse: boolean;
  /** ระดับน้ำสูงสุดจากแบบสอบถาม ใช้สร้างฮีตแมป (ซม.) */
  floodDepthCm: number | null;
}

export interface HouseholdLayerMapResult {
  points: HouseholdLayerPoint[];
  center: { lat: number; lng: number };
  missingCoordinates: {
    uniqueHouseholds: number;
    vulnerable: number;
    volunteer: number;
    hostHouse: number;
    floodDepth: number;
  };
  totals: { vulnerable: number; volunteer: number; hostHouse: number; floodDepth: number };
  options: {
    communities: { id: string; label: string }[];
    tambons: { id: string; label: string }[];
    volunteerSkills: VolunteerMapSkill[];
  };
}

const FALLBACK = { lat: 7.0075, lng: 100.42 };

function validCoordinate(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function getHouseholdLayerMap(
  ctx: AuthorizationContext,
  filters: HouseholdMapFilters,
): Promise<HouseholdLayerMapResult> {
  if (!hasPermission(ctx, PERMISSIONS.MAP_VIEW)) {
    return {
      points: [], center: FALLBACK,
      missingCoordinates: { uniqueHouseholds: 0, vulnerable: 0, volunteer: 0, hostHouse: 0, floodDepth: 0 },
      totals: { vulnerable: 0, volunteer: 0, hostHouse: 0, floodDepth: 0 },
      options: { communities: [], tambons: [], volunteerSkills: [] },
    };
  }

  const scopeIds = ctx.isGlobalScope ? undefined : ctx.communityIds;
  const baseWhere = buildVerifiedMapHouseholdWhere(filters, scopeIds);
  const layerWhere: Prisma.HouseholdWhereInput = {
    AND: [
      baseWhere,
      {
        OR: [
          { vulnerablePersons: { some: { isActive: true } } },
          { volunteerInterests: { some: { isAvailable: true } }, volunteerNotAvailable: { not: true } },
          { floodRiskProfile: { canBeHostHouse: true } },
          { floodRiskProfile: { maxFloodDepthCm: { not: null } } },
        ],
      },
    ],
  };

  const [households, communities, tambons, volunteerSkillTypes] = await Promise.all([
    prisma.household.findMany({
      where: layerWhere,
      select: {
        id: true,
        surveyNo: true,
        houseNo: true,
        mooNo: true,
        soi: true,
        road: true,
        latitude: true,
        longitude: true,
        sheet: { select: { sheetNo: true } },
        community: { select: { nameTh: true } },
        tambon: { select: { nameTh: true } },
        vulnerablePersons: {
          where: { isActive: true },
          select: {
            triageLevel: true,
            vulnerabilities: {
              select: { vulnerabilityType: { select: { basePriority: true } } },
            },
          },
        },
        volunteerInterests: {
          where: { isAvailable: true },
          select: { volunteerType: { select: { code: true, nameTh: true } } },
        },
        assistanceNeeds: {
          select: { personCount: true, needType: { select: { nameTh: true } } },
        },
        floodRiskProfile: {
          select: {
            canBeHostHouse: true,
            floodDepthMetersRaw: true,
            floodDepthCmRaw: true,
            maxFloodDepthCm: true,
          },
        },
      },
    }),
    prisma.community.findMany({
      where: { deletedAt: null, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      select: { id: true, nameTh: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.tambon.findMany({ select: { id: true, nameTh: true, code: true }, orderBy: { code: "asc" } }),
    prisma.volunteerSkillType.findMany({
      select: { code: true, nameTh: true },
      orderBy: [{ sortOrder: "asc" }, { nameTh: "asc" }],
    }),
  ]);

  const points: HouseholdLayerPoint[] = [];
  const missing = { uniqueHouseholds: 0, vulnerable: 0, volunteer: 0, hostHouse: 0, floodDepth: 0 };
  const totals = { vulnerable: 0, volunteer: 0, hostHouse: 0, floodDepth: 0 };
  let sumLat = 0;
  let sumLng = 0;

  for (const household of households) {
    const vulnerable = household.vulnerablePersons.length > 0;
    const volunteer = household.volunteerInterests.length > 0;
    const hostHouse = household.floodRiskProfile?.canBeHostHouse === true;
    const floodDepthCm = household.floodRiskProfile
      ? calculateFloodDepthCm(
          household.floodRiskProfile.floodDepthMetersRaw,
          household.floodRiskProfile.floodDepthCmRaw,
        ) ?? household.floodRiskProfile.maxFloodDepthCm
      : null;
    const hasFloodDepth = floodDepthCm != null;
    if (vulnerable) totals.vulnerable += 1;
    if (volunteer) totals.volunteer += 1;
    if (hostHouse) totals.hostHouse += 1;
    if (hasFloodDepth) totals.floodDepth += 1;

    const lat = household.latitude === null ? null : Number(household.latitude);
    const lng = household.longitude === null ? null : Number(household.longitude);
    if (!validCoordinate(lat, lng)) {
      missing.uniqueHouseholds += 1;
      if (vulnerable) missing.vulnerable += 1;
      if (volunteer) missing.volunteer += 1;
      if (hostHouse) missing.hostHouse += 1;
      if (hasFloodDepth) missing.floodDepth += 1;
      continue;
    }

    const triage = { P1: 0, P2: 0, P3: 0, UNASSESSED: 0 };
    for (const person of household.vulnerablePersons) {
      const level = effectiveTriage(
        person.triageLevel as TriageCode | null,
        person.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
      );
      triage[level ?? "UNASSESSED"] += 1;
    }
    points.push({
      id: household.id,
      sheetNo: household.sheet.sheetNo,
      surveyNo: household.surveyNo,
      houseNo: household.houseNo,
      mooNo: household.mooNo != null && household.mooNo > 0 ? household.mooNo : null,
      soi: household.soi,
      road: household.road,
      tambonName: household.tambon?.nameTh ?? null,
      lat,
      lng: lng as number,
      communityName: household.community.nameTh,
      vulnerableCount: household.vulnerablePersons.length,
      triage,
      volunteerSkills: household.volunteerInterests.map((v) => ({
        code: v.volunteerType.code,
        label: v.volunteerType.nameTh,
      })),
      assistanceNeeds: household.assistanceNeeds.map((need) => ({
        label: need.needType.nameTh,
        people: need.personCount,
      })),
      potentialHostHouse: hostHouse,
      floodDepthCm,
    });
    sumLat += lat;
    sumLng += lng as number;
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "HouseholdLayerMap",
    reason: `เปิดแผนที่จุดครัวเรือนพร้อมที่อยู่สำหรับผู้มีสิทธิ์ (${points.length} จุด, ไม่มีพิกัด ${missing.uniqueHouseholds})`,
  });

  return {
    points,
    center: points.length ? { lat: sumLat / points.length, lng: sumLng / points.length } : FALLBACK,
    missingCoordinates: missing,
    totals,
    options: {
      communities: communities.map((c) => ({ id: c.id, label: `${c.nameTh} (${c.code})` })),
      tambons: tambons.map((t) => ({ id: t.id, label: t.nameTh })),
      volunteerSkills: volunteerSkillTypes.map((skill) => ({ code: skill.code, label: skill.nameTh })),
    },
  };
}
