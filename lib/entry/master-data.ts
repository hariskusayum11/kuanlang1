// Master Data สำหรับ Entry Console — โหลดจาก DB (ห้าม hardcode — CLAUDE.md)
// ส่งเฉพาะ id/code/nameTh ที่จำเป็นต่อการแสดงตัวเลือก — ไม่มี PII

import { prisma } from "../prisma";

export interface MasterOption {
  id: string;
  code: string;
  label: string;
}

export interface EntryMasterData {
  namePrefixes: MasterOption[];
  buildingTypes: MasterOption[];
  ownershipTypes: MasterOption[];
  tambons: MasterOption[];
  moos: MasterOption[];
  vulnerabilityTypes: (MasterOption & {
    requiresDetail: boolean;
    detailLabel: string | null;
  })[];
  assistanceNeedTypes: (MasterOption & {
    requiresCount: boolean;
    requiresDetail: boolean;
  })[];
  resourceTypes: MasterOption[];
  alertChannels: MasterOption[];
  volunteerSkillTypes: MasterOption[];
}

/** ตัวเลือกทั้งหมดสำหรับใบใน community ที่กำหนด (ตำบล/หมู่ จำกัดตามชุมชนของ Batch) */
export async function getEntryMasterData(
  communityId: string,
): Promise<EntryMasterData> {
  const [
    namePrefixes,
    buildingTypes,
    ownershipTypes,
    communityTambons,
    vulnerabilityTypes,
    assistanceNeedTypes,
    resourceTypes,
    alertChannels,
    volunteerSkillTypes,
  ] = await Promise.all([
    prisma.namePrefix.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.buildingType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.ownershipType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.communityTambon.findMany({
      where: { communityId },
      select: { tambon: { select: { id: true, code: true, nameTh: true } } },
      orderBy: { isPrimary: "desc" },
    }),
    prisma.vulnerabilityType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameTh: true,
        requiresDetail: true,
        detailLabel: true,
      },
    }),
    prisma.assistanceNeedType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameTh: true,
        requiresCount: true,
        requiresDetail: true,
      },
    }),
    prisma.resourceType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.alertChannel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    prisma.volunteerSkillType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
  ]);

  const tambonIds = communityTambons.map((ct) => ct.tambon.id);
  const moos = await prisma.moo.findMany({
    where: { tambonId: { in: tambonIds } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, tambonId: true },
  });
  const tambonNameById = new Map(
    communityTambons.map((ct) => [ct.tambon.id, ct.tambon.nameTh]),
  );

  const opt = (r: { id: string; code: string; nameTh: string }): MasterOption => ({
    id: r.id,
    code: r.code,
    label: r.nameTh,
  });

  return {
    namePrefixes: namePrefixes.map(opt),
    buildingTypes: buildingTypes.map(opt),
    ownershipTypes: ownershipTypes.map(opt),
    tambons: communityTambons.map((ct) => opt(ct.tambon)),
    moos: moos.map((m) => ({
      id: m.id,
      code: String(m.number),
      label:
        tambonIds.length > 1
          ? `หมู่ ${m.number} (ต.${tambonNameById.get(m.tambonId) ?? "?"})`
          : `หมู่ ${m.number}`,
    })),
    vulnerabilityTypes: vulnerabilityTypes.map((v) => ({
      ...opt(v),
      requiresDetail: v.requiresDetail,
      detailLabel: v.detailLabel,
    })),
    assistanceNeedTypes: assistanceNeedTypes.map((a) => ({
      ...opt(a),
      requiresCount: a.requiresCount,
      requiresDetail: a.requiresDetail,
    })),
    resourceTypes: resourceTypes.map(opt),
    alertChannels: alertChannels.map(opt),
    volunteerSkillTypes: volunteerSkillTypes.map(opt),
  };
}
