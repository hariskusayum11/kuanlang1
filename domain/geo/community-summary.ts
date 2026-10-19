// สรุปรายชุมชนสำหรับกล่องข้อมูลบนแผนที่ (docs/35 §กล่องข้อมูลชุมชน)
// Pure Function ล้วน — รับแถวที่ดึงมาแล้ว คืนตัวเลขรวม ไม่แตะฐานข้อมูล
//
// ข้อมูลระดับชุมชนเท่านั้น: จำนวนนับรวม ไม่มีชื่อ/บ้านเลขที่/พิกัดรายบ้าน
// แผนที่สาธารณะใช้เฉพาะ area + ครัวเรือนที่ตรวจแล้ว + จุดอพยพ (ไม่มีตัวเลขกลุ่มเปราะบาง)

/** 1 ไร่ = 1,600 ตารางเมตร */
export const SQUARE_METERS_PER_RAI = 1600;

export function squareMetersToRai(squareMeters: number | null | undefined): number | null {
  if (squareMeters == null || !Number.isFinite(squareMeters) || squareMeters <= 0) return null;
  return squareMeters / SQUARE_METERS_PER_RAI;
}

/** "≈ 846 ไร่" — ปัดเป็นจำนวนเต็ม เพราะขอบเขตวาดมือ ความละเอียดระดับทศนิยมไม่มีความหมาย */
export function formatRai(rai: number | null): string {
  if (rai == null) return "ไม่ทราบ";
  return `≈ ${Math.round(rai).toLocaleString("th-TH")} ไร่`;
}

export interface VulnerableTypeCount {
  name: string;
  count: number;
}

export interface CommunityVulnerableSummary {
  /** จำนวนคน (ไม่ใช่จำนวนประเภท) ที่ยังนับเป็นกลุ่มเปราะบาง */
  activePersons: number;
  /** คนที่บันทึกว่า เสียชีวิต/ย้ายออก/ไม่เข้าเกณฑ์แล้ว (docs/34) */
  inactivePersons: number;
  /** แยกตามประเภท — คนหนึ่งมีได้หลายประเภท ผลรวมจึงอาจมากกว่า activePersons */
  byType: VulnerableTypeCount[];
}

export interface VulnerablePersonRow {
  communityId: string;
  isActive: boolean;
  types: ReadonlyArray<{ name: string; sortOrder: number }>;
}

/**
 * รวมกลุ่มเปราะบางรายชุมชน
 * ประเภทเรียงตาม sortOrder ของ master data (ลำดับเดียวกับแบบสอบถาม) ไม่ใช่ตามจำนวน
 * — ให้ทุกชุมชนเรียงเหมือนกัน เทียบกันด้วยตาได้
 */
export function summarizeVulnerableByCommunity(
  rows: ReadonlyArray<VulnerablePersonRow>,
): Map<string, CommunityVulnerableSummary> {
  const acc = new Map<string, { active: number; inactive: number; types: Map<string, { count: number; sortOrder: number }> }>();
  for (const row of rows) {
    let entry = acc.get(row.communityId);
    if (!entry) {
      entry = { active: 0, inactive: 0, types: new Map() };
      acc.set(row.communityId, entry);
    }
    if (!row.isActive) {
      entry.inactive += 1;
      continue;
    }
    entry.active += 1;
    // ประเภทซ้ำในคนเดียวกันนับครั้งเดียว
    for (const type of new Map(row.types.map((t) => [t.name, t])).values()) {
      const current = entry.types.get(type.name);
      entry.types.set(type.name, { count: (current?.count ?? 0) + 1, sortOrder: type.sortOrder });
    }
  }

  const result = new Map<string, CommunityVulnerableSummary>();
  for (const [communityId, entry] of acc) {
    result.set(communityId, {
      activePersons: entry.active,
      inactivePersons: entry.inactive,
      byType: [...entry.types.entries()]
        .sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[0].localeCompare(b[0], "th"))
        .map(([name, value]) => ({ name, count: value.count })),
    });
  }
  return result;
}

export const EMPTY_VULNERABLE_SUMMARY: CommunityVulnerableSummary = {
  activePersons: 0,
  inactivePersons: 0,
  byType: [],
};

/** วันที่แบบไทยสั้น สำหรับกำกับ "ข้อมูล ณ วันที่" (ใช้เวลาไทย) */
export function thaiShortDate(date: Date): string {
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}
