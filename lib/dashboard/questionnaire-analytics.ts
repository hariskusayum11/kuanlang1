import { TriageLevel, VehicleType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  buildUsableHouseholdWhere,
  type HouseholdAnalyticsFilters,
} from "../household/trusted-where";
import type { DashboardScope } from "./get-dashboard-stats";

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
    triageGroups,
    assistanceGroups,
    assistanceTypes,
    floodedHouseholds,
    floodAggregate,
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
      by: ["triageLevel"],
      where: { household: where, isActive: true },
      _count: { _all: true },
    }),
    prisma.assistanceNeed.groupBy({
      by: ["needTypeId"],
      where: { household: where },
      _count: { _all: true },
      _sum: { personCount: true },
    }),
    prisma.assistanceNeedType.findMany({ select: { id: true, nameTh: true, sortOrder: true } }),
    prisma.floodRiskProfile.count({ where: { household: where, hasFloodedBefore: true } }),
    prisma.floodRiskProfile.aggregate({
      where: { household: where, hasFloodedBefore: true },
      _avg: { maxFloodDepthCm: true, lastFloodDurationDays: true },
      _max: { maxFloodDepthCm: true },
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
  for (const group of triageGroups) {
    const key = group.triageLevel ?? "UNASSESSED";
    triage[key] = group._count._all;
  }

  const assistanceById = new Map(assistanceGroups.map((g) => [g.needTypeId, g]));
  const alertsById = new Map(alertGroups.map((g) => [g.alertChannelId, g._count._all]));
  const volunteersById = new Map(volunteerGroups.map((g) => [g.volunteerTypeId, g._count._all]));

  return {
    summary: {
      households: householdAggregate._count._all,
      people: householdAggregate._sum.memberCount ?? 0,
      vulnerableHouseholds,
      vulnerablePeople,
      assistancePeople: householdAggregate._sum.assistanceTotalPersonCount ?? 0,
    },
    triage,
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
      averageDepthCm: floodAggregate._avg.maxFloodDepthCm,
      maximumDepthCm: floodAggregate._max.maxFloodDepthCm,
      averageDurationDays: floodAggregate._avg.lastFloodDurationDays,
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
