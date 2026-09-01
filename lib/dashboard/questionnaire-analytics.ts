import { TriageLevel, VehicleType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  buildUsableHouseholdWhere,
  type HouseholdAnalyticsFilters,
} from "../household/trusted-where";
import type { DashboardScope } from "./get-dashboard-stats";
import { effectiveTriage, type TriageCode } from "../../domain/triage";
import { calculateFloodDepthCm } from "../../domain/flood/depth";

export interface NamedCount {
  key: string;
  label: string;
  count: number;
  people?: number;
}

export interface QuestionnaireAnalytics {
  summary: {
    households: number;
    people: number;
    vulnerableHouseholds: number;
    vulnerablePeople: number;
    assistancePeople: number;
  };
  triage: Record<"P1" | "P2" | "P3" | "UNASSESSED", number>;
  vulnerability: {
    ages: {
      under5: number;
      age5To17: number;
      age18To59: number;
      age60Plus: number;
      unknown: number;
    };
    types: NamedCount[];
    unclassifiedPeople: number;
  };
  housing: {
    rentedHouseholds: number;
    unknownOwnership: number;
    unknownBuildingType: number;
    ownershipTypes: NamedCount[];
    buildingTypes: NamedCount[];
  };
  assistance: NamedCount[];
  flood: {
    floodedHouseholds: number;
    averageDepthCm: number | null;
    maximumDepthCm: number | null;
    averageDurationDays: number | null;
    withoutSurvivalKit: number;
    withoutResources: number;
  };
  preparedness: {
    vehicles: NamedCount[];
    alertChannels: NamedCount[];
    smartphoneHouseholds: number;
    qrReadyHouseholds: number;
  };
  participation: {
    volunteerHouseholds: number;
    volunteerSkills: NamedCount[];
    potentialHostHouses: number;
    mentalHealthSupport: number;
    povertyProgramInterest: number;
  };
  quality: {
    missingCoordinates: number;
    incomplete: number;
    illegible: number;
  };
  options: {
    communities: { id: string; label: string }[];
    tambons: { id: string; label: string }[];
  };
}

const VEHICLE_LABEL: Record<VehicleType, string> = {
  CAR: "รถยนต์",
  MOTORCYCLE: "มอเตอร์ไซค์",
  BOAT: "เรือ",
  OTHER: "อื่น ๆ",
};

export function summarizeVulnerableAges(
  groups: { age: number | null; count: number }[],
): QuestionnaireAnalytics["vulnerability"]["ages"] {
  const result = { under5: 0, age5To17: 0, age18To59: 0, age60Plus: 0, unknown: 0 };
  for (const group of groups) {
    if (group.age == null) result.unknown += group.count;
    else if (group.age < 5) result.under5 += group.count;
    else if (group.age < 18) result.age5To17 += group.count;
    else if (group.age < 60) result.age18To59 += group.count;
    else result.age60Plus += group.count;
  }
  return result;
}

export async function fetchQuestionnaireAnalytics(
  scope: DashboardScope,
  filters: HouseholdAnalyticsFilters,
): Promise<QuestionnaireAnalytics> {
  const scopeIds = scope.isGlobalScope ? undefined : scope.communityIds;
  const where = buildUsableHouseholdWhere(filters, scopeIds);

  const [
    householdAggregate,
    vulnerableHouseholds,
    vulnerablePeople,
    vulnerableAgeGroups,
    vulnerabilityGroups,
    vulnerabilityTypes,
    unclassifiedVulnerablePeople,
    vulnerablePeopleForTriage,
    ownershipGroups,
    ownershipTypes,
    buildingGroups,
    buildingTypes,
    assistanceGroups,
    assistanceTypes,
    floodedHouseholds,
    floodRecords,
    withoutSurvivalKit,
    withoutResources,
    vehicleGroups,
    alertGroups,
    alertTypes,
    smartphoneHouseholds,
    qrReadyHouseholds,
    volunteerHouseholds,
    volunteerGroups,
    volunteerTypes,
    potentialHostHouses,
    mentalHealthSupport,
    povertyProgramInterest,
    missingCoordinates,
    incomplete,
    illegible,
    communities,
    tambons,
  ] = await Promise.all([
    prisma.household.aggregate({
      where,
      _count: { _all: true },
      _sum: { memberCount: true, assistanceTotalPersonCount: true },
    }),
    prisma.household.count({ where: { ...where, vulnerablePersons: { some: { isActive: true } } } }),
    prisma.vulnerablePerson.count({ where: { household: where, isActive: true } }),
    prisma.vulnerablePerson.groupBy({
      by: ["age"],
      where: { household: where, isActive: true },
      _count: { _all: true },
    }),
    prisma.personVulnerability.groupBy({
      by: ["vulnerabilityTypeId"],
      where: { person: { household: where, isActive: true } },
      _count: { _all: true },
    }),
    prisma.vulnerabilityType.findMany({
      select: { id: true, nameTh: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.vulnerablePerson.count({
      where: { household: where, isActive: true, vulnerabilities: { none: {} } },
    }),
    prisma.vulnerablePerson.findMany({
      where: { household: where, isActive: true },
      select: {
        triageLevel: true,
        vulnerabilities: {
          select: { vulnerabilityType: { select: { basePriority: true } } },
        },
      },
    }),
    prisma.household.groupBy({
      by: ["ownershipTypeId"],
      where,
      _count: { _all: true },
    }),
    prisma.ownershipType.findMany({
      select: { id: true, code: true, nameTh: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.household.groupBy({
      by: ["buildingTypeId"],
      where,
      _count: { _all: true },
    }),
    prisma.buildingType.findMany({
      select: { id: true, nameTh: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.assistanceNeed.groupBy({
      by: ["needTypeId"],
      where: { household: where },
      _count: { _all: true },
      _sum: { personCount: true },
    }),
    prisma.assistanceNeedType.findMany({ select: { id: true, nameTh: true, sortOrder: true } }),
    prisma.floodRiskProfile.count({ where: { household: where, hasFloodedBefore: true } }),
    prisma.floodRiskProfile.findMany({
      where: { household: where, hasFloodedBefore: true },
      select: {
        floodDepthMetersRaw: true,
        floodDepthCmRaw: true,
        maxFloodDepthCm: true,
        lastFloodDurationDays: true,
      },
    }),
    prisma.floodRiskProfile.count({ where: { household: where, hasSurvivalKit: false } }),
    prisma.household.count({ where: { ...where, hasNoResources: true } }),
    prisma.evacuationVehicle.groupBy({
      by: ["vehicleType"],
      where: { household: where },
      _count: { _all: true },
    }),
    prisma.alertChannelPref.groupBy({
      by: ["alertChannelId"],
      where: { household: where },
      _count: { _all: true },
    }),
    prisma.alertChannel.findMany({ select: { id: true, nameTh: true, sortOrder: true } }),
    prisma.digitalReadiness.count({ where: { household: where, usesSmartphone: true } }),
    prisma.digitalReadiness.count({ where: { household: where, canScanQR: true } }),
    prisma.household.count({
      where: {
        ...where,
        volunteerNotAvailable: { not: true },
        volunteerInterests: { some: { isAvailable: true } },
      },
    }),
    prisma.volunteerInterest.groupBy({
      by: ["volunteerTypeId"],
      where: { household: where, isAvailable: true },
      _count: { _all: true },
    }),
    prisma.volunteerSkillType.findMany({ select: { id: true, nameTh: true, sortOrder: true } }),
    prisma.floodRiskProfile.count({ where: { household: where, canBeHostHouse: true } }),
    prisma.household.count({ where: { ...where, mentalHealthSupport: true } }),
    prisma.household.count({ where: { ...where, povertyProgramInterest: true } }),
    prisma.household.count({ where: { AND: [where, { OR: [{ latitude: null }, { longitude: null }] }] } }),
    prisma.household.count({ where: { AND: [where, { OR: [{ blankCount: { gt: 0 } }, { completenessScore: { lt: 1 } }] }] } }),
    prisma.household.count({ where: { ...where, illegibleCount: { gt: 0 } } }),
    prisma.community.findMany({
      where: {
        deletedAt: null,
        ...(scopeIds ? { id: { in: scopeIds } } : {}),
      },
      select: { id: true, nameTh: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.tambon.findMany({ select: { id: true, nameTh: true, code: true }, orderBy: { code: "asc" } }),
  ]);

  const triage = { P1: 0, P2: 0, P3: 0, UNASSESSED: 0 };
  for (const person of vulnerablePeopleForTriage) {
    const level = effectiveTriage(
      person.triageLevel as TriageCode | null,
      person.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
    );
    triage[level ?? "UNASSESSED"] += 1;
  }

  const assistanceById = new Map(assistanceGroups.map((g) => [g.needTypeId, g]));
  const alertsById = new Map(alertGroups.map((g) => [g.alertChannelId, g._count._all]));
  const volunteersById = new Map(volunteerGroups.map((g) => [g.volunteerTypeId, g._count._all]));
  const vulnerabilityById = new Map(vulnerabilityGroups.map((g) => [g.vulnerabilityTypeId, g._count._all]));
  const ownershipById = new Map(ownershipGroups.map((g) => [g.ownershipTypeId, g._count._all]));
  const buildingById = new Map(buildingGroups.map((g) => [g.buildingTypeId, g._count._all]));
  const rentedType = ownershipTypes.find((type) => type.code === "RENTED");
  const floodDepths = floodRecords.flatMap((record) => {
    const depth = calculateFloodDepthCm(record.floodDepthMetersRaw, record.floodDepthCmRaw)
      ?? record.maxFloodDepthCm;
    return depth == null ? [] : [depth];
  });
  const floodDurations = floodRecords.flatMap((record) =>
    record.lastFloodDurationDays == null ? [] : [record.lastFloodDurationDays],
  );

  return {
    summary: {
      households: householdAggregate._count._all,
      people: householdAggregate._sum.memberCount ?? 0,
      vulnerableHouseholds,
      vulnerablePeople,
      assistancePeople: householdAggregate._sum.assistanceTotalPersonCount ?? 0,
    },
    triage,
    vulnerability: {
      ages: summarizeVulnerableAges(
        vulnerableAgeGroups.map((group) => ({ age: group.age, count: group._count._all })),
      ),
      types: vulnerabilityTypes.flatMap((type) => {
        const count = vulnerabilityById.get(type.id) ?? 0;
        return count ? [{ key: type.id, label: type.nameTh, count }] : [];
      }),
      unclassifiedPeople: unclassifiedVulnerablePeople,
    },
    housing: {
      rentedHouseholds: rentedType ? ownershipById.get(rentedType.id) ?? 0 : 0,
      unknownOwnership: ownershipById.get(null) ?? 0,
      unknownBuildingType: buildingById.get(null) ?? 0,
      ownershipTypes: ownershipTypes.flatMap((type) => {
        const count = ownershipById.get(type.id) ?? 0;
        return count ? [{ key: type.id, label: type.nameTh, count }] : [];
      }),
      buildingTypes: buildingTypes.flatMap((type) => {
        const count = buildingById.get(type.id) ?? 0;
        return count ? [{ key: type.id, label: type.nameTh, count }] : [];
      }),
    },
    assistance: assistanceTypes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((type) => {
        const group = assistanceById.get(type.id);
        return group
          ? [{ key: type.id, label: type.nameTh, count: group._count._all, people: group._sum.personCount ?? 0 }]
          : [];
      }),
    flood: {
      floodedHouseholds,
      averageDepthCm: floodDepths.length
        ? floodDepths.reduce((sum, depth) => sum + depth, 0) / floodDepths.length
        : null,
      maximumDepthCm: floodDepths.length ? Math.max(...floodDepths) : null,
      averageDurationDays: floodDurations.length
        ? floodDurations.reduce((sum, days) => sum + days, 0) / floodDurations.length
        : null,
      withoutSurvivalKit,
      withoutResources,
    },
    preparedness: {
      vehicles: vehicleGroups.map((group) => ({
        key: group.vehicleType,
        label: VEHICLE_LABEL[group.vehicleType],
        count: group._count._all,
      })),
      alertChannels: alertTypes
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((type) => {
          const count = alertsById.get(type.id) ?? 0;
          return count ? [{ key: type.id, label: type.nameTh, count }] : [];
        }),
      smartphoneHouseholds,
      qrReadyHouseholds,
    },
    participation: {
      volunteerHouseholds,
      volunteerSkills: volunteerTypes
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((type) => {
          const count = volunteersById.get(type.id) ?? 0;
          return count ? [{ key: type.id, label: type.nameTh, count }] : [];
        }),
      potentialHostHouses,
      mentalHealthSupport,
      povertyProgramInterest,
    },
    quality: { missingCoordinates, incomplete, illegible },
    options: {
      communities: communities.map((c) => ({ id: c.id, label: `${c.nameTh} (${c.code})` })),
      tambons: tambons.map((t) => ({ id: t.id, label: t.nameTh })),
    },
  };
}
