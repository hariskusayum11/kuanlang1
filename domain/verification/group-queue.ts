// Verification Queue Grouping — Pure Function (tests: tests/unit/group-queue.test.ts)
// ---------------------------------------------------------------------------
// ผู้ตรวจที่เห็นได้หลายชุมชนต้องยัง "ตรวจง่าย" จึงจัดคิวเป็นลำดับชั้น
// ชุมชน → คนกรอก แทนตารางแบนยาวเรียงตามคิวเข้าเพียงอย่างเดียว
//
// เดิมมีชั้น "ปึก" คั่นกลาง แต่ปึกถูกยกเลิกจากระบบแล้ว (Owner Decision 2026-08-03)
// จึงเหลือสองชั้นที่ยังมีความหมายกับการตรวจจริง
// (โมดูลนี้ไม่รู้จัก Role และไม่ตัดสิน scope — รับรายการที่ผ่านการกรองมาแล้วเท่านั้น)
//
// ไม่มี DOM / ไม่มี Prisma — รับ array ธรรมดาเข้ามาแล้วจัดกลุ่ม ทดสอบได้โดยตรง

export interface QueueItemLike {
  householdId: string;
  communityId: string;
  communityName: string;
  enteredById: string;
  enteredByName: string;
}

export interface EntererGroup<T extends QueueItemLike> {
  enteredById: string;
  enteredByName: string;
  count: number;
  items: T[];
}

export interface CommunityGroup<T extends QueueItemLike> {
  communityId: string;
  communityName: string;
  count: number;
  enterers: EntererGroup<T>[];
}

/**
 * จัดคิวเป็นลำดับชั้น ชุมชน → คนกรอก
 * - ลำดับกลุ่ม (ชุมชน/คนกรอก) เรียงตามชื่อ (ก-ฮ) ให้สแกนหาง่าย
 * - ลำดับรายการ "ภายใน" แต่ละกลุ่มคงตามลำดับที่ส่งเข้ามา (ผู้เรียกกำหนดลำดับความสำคัญ
 *   เช่น ใบสงสัยซ้ำก่อน แล้วเรียงตามเวลาคีย์ — ฟังก์ชันนี้ไม่ตัดสินใจเรื่องนั้นซ้ำ)
 */
export function groupVerificationQueue<T extends QueueItemLike>(
  items: readonly T[],
): CommunityGroup<T>[] {
  const communities = new Map<string, CommunityGroup<T>>();

  for (const item of items) {
    let community = communities.get(item.communityId);
    if (!community) {
      community = {
        communityId: item.communityId,
        communityName: item.communityName,
        count: 0,
        enterers: [],
      };
      communities.set(item.communityId, community);
    }
    community.count += 1;

    let enterer = community.enterers.find((e) => e.enteredById === item.enteredById);
    if (!enterer) {
      enterer = {
        enteredById: item.enteredById,
        enteredByName: item.enteredByName,
        count: 0,
        items: [],
      };
      community.enterers.push(enterer);
    }
    enterer.count += 1;
    enterer.items.push(item);
  }

  const groups = [...communities.values()];
  groups.sort((a, b) => a.communityName.localeCompare(b.communityName, "th"));
  for (const community of groups) {
    community.enterers.sort((a, b) => a.enteredByName.localeCompare(b.enteredByName, "th"));
  }
  return groups;
}
