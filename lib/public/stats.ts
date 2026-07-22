// Public data layer — ข้อมูลสาธารณะเท่านั้น (ไม่ต้อง login)
// กติกา (CLAUDE.md + docs/26): ห้ามคืน PII, พิกัดรายบ้าน, Household/Sheet ID
// ทุกฟังก์ชันคืนเฉพาะ aggregate ระดับพื้นที่ หรือข้อมูลราชการที่เผยแพร่ได้

import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * k-anonymity threshold — aggregate เกี่ยวกับ "กลุ่มคน" (เช่น กลุ่มเปราะบางรายพื้นที่)
 * ต่ำกว่าเกณฑ์นี้ต้อง suppress กันการย้อนระบุตัวบุคคล
 * ยังไม่มีข้อมูลจริงให้แสดงรอบนี้ — ประกาศไว้เป็นกติกากลางสำหรับทุก public aggregation
 */
export const PUBLIC_MIN_AGGREGATE = 5;

/**
 * จัดรูปตัวเลข aggregate หมวดอ่อนไหว (นับ "กลุ่มคน" เช่น ผู้ป่วยติดเตียงรายพื้นที่)
 * สำหรับแสดงสาธารณะ — Pure function ใช้กับทุกจุดที่จะแสดงตัวเลขหมวดนี้ในอนาคต
 *
 * กติกาเข้มกว่า threshold ปกติ: ค่า 0..(N-1) แสดงเป็น "น้อยกว่า N" ทั้งหมด
 * (ไม่แยก 0 ออก — การยืนยันว่า "มี/ไม่มี" ในพื้นที่เล็กก็เป็น inference risk ต่อข้อมูลสุขภาพ)
 * หมวดไม่อ่อนไหว (นับสถานที่/ครัวเรือนรวมระดับเครือข่าย) แสดงตรงได้ ไม่ต้องผ่านฟังก์ชันนี้
 */
export function formatSensitiveAggregate(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  if (safe < PUBLIC_MIN_AGGREGATE) return `น้อยกว่า ${PUBLIC_MIN_AGGREGATE}`;
  return safe.toLocaleString("th-TH");
}

export interface PublicStats {
  communities: number;
  tambons: number;
  /** นับเฉพาะใบที่ VERIFIED แล้วเท่านั้น (FR-RSK-07) — ไม่นับ draft/กำลังตรวจ */
  verifiedHouseholds: number;
  evacuationSites: number;
  generatedAt: Date;
}

export async function getPublicStats(): Promise<PublicStats> {
  const [communities, tambonLinks, verifiedHouseholds, evacuationSites] =
    await Promise.all([
      prisma.community.count({ where: { deletedAt: null, isActive: true } }),
      prisma.communityTambon.findMany({
        where: { community: { deletedAt: null, isActive: true } },
        select: { tambonId: true },
        distinct: ["tambonId"],
      }),
      prisma.household.count({
        where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED } },
      }),
      prisma.evacuationSite.count({ where: { isActive: true } }),
    ]);

  return {
    communities,
    tambons: tambonLinks.length,
    verifiedHouseholds,
    evacuationSites,
    generatedAt: new Date(),
  };
}

export interface PublicEmergencyContact {
  id: string;
  nameTh: string;
  phone: string;
  category: string;
  isNationwide: boolean;
}

/** เบอร์ติดต่อฉุกเฉินราชการ (Master Data ที่เผยแพร่ได้ — ไม่ใช่ข้อมูลบุคคล) */
export async function getPublicEmergencyContacts(): Promise<
  PublicEmergencyContact[]
> {
  const contacts = await prisma.emergencyContact.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameTh: "asc" }],
    select: {
      id: true,
      nameTh: true,
      phone: true,
      category: true,
      isNationwide: true,
    },
    take: 20,
  });
  return contacts;
}
