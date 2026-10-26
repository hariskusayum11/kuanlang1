// กลุ่มเปราะบางสีแดง (docs/42) — ดึงข้อมูล + คัดกลุ่ม
// -----------------------------------------------------------------------------
// ใช้ข้อมูลที่ตรวจแล้วเท่านั้น (Owner Decision 2026-10-26 ข้อ 5) และกรองขอบเขตชุมชนที่ server
// (หัวหน้าชุมชน = เฉพาะชุมชนที่ผูกไว้ · ADMIN = ทุกชุมชน)
// การถอดรหัส "รายละเอียด" ทำเพื่อคัดกลุ่มเท่านั้น — ข้อความดิบไม่ถูกส่งออกจากโมดูลนี้
// (เฉพาะ notes ที่สรุปแล้ว) เพราะหัวหน้าชุมชนไม่มีสิทธิ์เห็นรายละเอียดโรค (docs/34)
import { prisma } from "../prisma";
import { decryptText } from "../crypto/encryption";
import { getKeyring } from "../crypto/keys";
import { hasPermission, scopedCommunityIds } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { buildVerifiedMapHouseholdWhere } from "../household/trusted-where";
import {
  classifyRedPerson,
  RED_GROUPS,
  tallyRedGroups,
  type FloorLevelCode,
  type RedClassification,
  type RedGroup,
  type RedGroupTally,
} from "../../domain/vulnerable/red-group";

const MEDICAL_EQUIP_CODE = "MEDICAL_EQUIP";

/** ฟิลด์ที่ยังเข้ารหัสอยู่ — ถอดเฉพาะตอนสร้างไฟล์ (ส่งออก) */
export interface RedPersonEncrypted {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export interface RedPersonRow {
  personId: string;
  householdId: string;
  seq: number;
  communityId: string;
  communityName: string;
  communityCode: string;
  sheetNo: string;
  prefix: string;
  nameStatus: string;
  age: number | null;
  ageMonths: number | null;
  /** ชื่อประเภทความเปราะบางที่ติ๊ก (ไม่มีรายละเอียดโรค) */
  typeNames: string[];
  classification: RedClassification;
  needsMedicalEquipment: boolean;
  houseNo: string | null;
  mooNo: number | null;
  soi: string | null;
  road: string | null;
  tambonName: string | null;
  lat: number | null;
  lng: number | null;
  coordinateRawText: string | null;
  verifiedAt: Date | null;
  encrypted: RedPersonEncrypted;
  respondentPhoneEncrypted: string | null;
}

export interface RedGroupResult {
  rows: RedPersonRow[];
  tally: RedGroupTally;
  /** ชุมชนในขอบเขต (แม้ไม่มีคนในกลุ่ม) — ให้ไฟล์/การ์ดบอกได้ว่า "ชุมชนนี้ไม่มี" ต่างจาก "ไม่ได้ดู" */
  communities: { id: string; nameTh: string; code: string }[];
}

export function canViewRedGroup(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.RED_GROUP_VIEW);
}

/** คัดกลุ่มสีแดงในขอบเขตของผู้ใช้ — ผู้เรียกต้องตรวจ canViewRedGroup ก่อน (ฟังก์ชันนี้ตรวจซ้ำ) */
export async function listRedGroupPeople(
  ctx: AuthorizationContext,
  now: Date = new Date(),
): Promise<RedGroupResult> {
  if (!canViewRedGroup(ctx)) {
    return { rows: [], tally: tallyRedGroups([]), communities: [] };
  }
  const scopeIds = scopedCommunityIds(ctx);
  const keyring = getKeyring();
  const safeDecrypt = (value: string | null): string | null => {
    if (!value) return null;
    try {
      return decryptText(value, keyring);
    } catch {
      return null;
    }
  };

  const [households, communities] = await Promise.all([
    prisma.household.findMany({
      where: {
        AND: [buildVerifiedMapHouseholdWhere({}, scopeIds), { vulnerablePersons: { some: { isActive: true } } }],
      },
      select: {
        id: true,
        communityId: true,
        memberCount: true,
        surveyedAt: true,
        enteredAt: true,
        verifiedAt: true,
        houseNo: true,
        mooNo: true,
        soi: true,
        road: true,
        latitude: true,
        longitude: true,
        coordinateRawText: true,
        respondentPhone: true,
        community: { select: { nameTh: true, code: true } },
        tambon: { select: { nameTh: true } },
        sheet: { select: { sheetNo: true } },
        floodRiskProfile: { select: { floorLevelVsRoad: true } },
        assistanceNeeds: { select: { needType: { select: { code: true } } } },
        vulnerablePersons: {
          where: { isActive: true },
          orderBy: { seq: "asc" },
          select: {
            id: true,
            seq: true,
            firstName: true,
            lastName: true,
            phone: true,
            nameStatus: true,
            age: true,
            ageMonths: true,
            prefixOther: true,
            namePrefix: { select: { nameTh: true } },
            vulnerabilities: {
              select: {
                detail: true,
                vulnerabilityType: { select: { code: true, nameTh: true, sortOrder: true } },
              },
            },
          },
        },
      },
    }),
    prisma.community.findMany({
      where: { deletedAt: null, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
      select: { id: true, nameTh: true, code: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const rows: RedPersonRow[] = [];
  for (const h of households) {
    const needsMedicalEquipment = h.assistanceNeeds.some((need) => need.needType.code === MEDICAL_EQUIP_CODE);
    const householdInput = {
      memberCount: h.memberCount,
      floorLevelVsRoad: (h.floodRiskProfile?.floorLevelVsRoad ?? null) as FloorLevelCode | null,
      needsMedicalEquipment,
      referenceDate: h.surveyedAt ?? h.enteredAt,
    };
    for (const p of h.vulnerablePersons) {
      const classification = classifyRedPerson(
        {
          age: p.age,
          ageMonths: p.ageMonths,
          vulnerabilities: p.vulnerabilities.map((v) => ({
            code: v.vulnerabilityType.code,
            detail: safeDecrypt(v.detail),
          })),
        },
        householdInput,
        now,
      );
      if (!classification) continue;
      rows.push({
        personId: p.id,
        householdId: h.id,
        seq: p.seq,
        communityId: h.communityId,
        communityName: h.community.nameTh,
        communityCode: h.community.code,
        sheetNo: h.sheet.sheetNo,
        prefix: p.namePrefix?.nameTh ?? p.prefixOther ?? "",
        nameStatus: p.nameStatus,
        age: p.age,
        ageMonths: p.ageMonths,
        typeNames: [...p.vulnerabilities]
          .sort((a, b) => a.vulnerabilityType.sortOrder - b.vulnerabilityType.sortOrder)
          .map((v) => v.vulnerabilityType.nameTh),
        classification,
        needsMedicalEquipment,
        houseNo: h.houseNo,
        mooNo: h.mooNo != null && h.mooNo > 0 ? h.mooNo : null,
        soi: h.soi,
        road: h.road,
        tambonName: h.tambon?.nameTh ?? null,
        lat: h.latitude === null ? null : Number(h.latitude),
        lng: h.longitude === null ? null : Number(h.longitude),
        coordinateRawText: h.coordinateRawText,
        verifiedAt: h.verifiedAt,
        encrypted: { firstName: p.firstName, lastName: p.lastName, phone: p.phone },
        respondentPhoneEncrypted: h.respondentPhone,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.communityCode.localeCompare(b.communityCode) ||
      a.sheetNo.localeCompare(b.sheetNo) ||
      a.seq - b.seq,
  );

  return {
    rows,
    tally: tallyRedGroups(rows.map((row) => ({ householdId: row.householdId, classification: row.classification }))),
    communities,
  };
}

/** บ้าน → กลุ่มสีแดงของคนในบ้าน (ใช้กรองหมุดแผนที่ — ไม่มีชื่อ/รายละเอียด) */
export function redGroupsByHousehold(rows: readonly RedPersonRow[]): Map<string, RedGroup[]> {
  const map = new Map<string, Set<RedGroup>>();
  for (const row of rows) {
    const set = map.get(row.householdId) ?? new Set<RedGroup>();
    for (const group of row.classification.groups) set.add(group);
    map.set(row.householdId, set);
  }
  return new Map([...map].map(([id, set]) => [id, RED_GROUPS.filter((group) => set.has(group))]));
}
