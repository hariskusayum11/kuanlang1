// Verification Queue Grouping — Pure Function (tests: tests/unit/group-queue.test.ts)
// ---------------------------------------------------------------------------
// ผู้ตรวจที่เห็นได้หลายชุมชนต้องยัง "ตรวจง่าย" จึงจัดคิวเป็นลำดับชั้น
// ชุมชน → ปึก (Batch) → คนกรอก แทนตารางแบนยาวเรียงตามคิวเข้าเพียงอย่างเดียว
// (โมดูลนี้ไม่รู้จัก Role และไม่ตัดสิน scope — รับรายการที่ผ่านการกรองมาแล้วเท่านั้น)
//
// ไม่มี DOM / ไม่มี Prisma — รับ array ธรรมดาเข้ามาแล้วจัดกลุ่ม ทดสอบได้โดยตรง

/** ป้ายกำกับกลุ่มของใบที่ยังไม่ได้จัดเข้าปึก — ห้ามส่ง null ดิบไปแสดงผล (#R6-F) */
export const UNBATCHED_LABEL = "ยังไม่ได้จัดเข้าปึก";

export interface QueueItemLike {
  householdId: string;
  communityId: string;
  communityName: string;
  /** null = ใบยังไม่ได้จัดเข้าปึก (Batch เป็นทางเลือก) */
  batchId: string | null;
  batchCode: string | null;
  enteredById: string;
  enteredByName: string;
}

export interface EntererGroup<T extends QueueItemLike> {
  enteredById: string;
  enteredByName: string;
  count: number;
  items: T[];
}

export interface BatchGroup<T extends QueueItemLike> {
  batchId: string | null;
  /** ข้อความที่แสดงได้เสมอ — รหัสปึก หรือ UNBATCHED_LABEL เมื่อไม่มีปึก */
  batchLabel: string;
  count: number;
  enterers: EntererGroup<T>[];
}

export interface CommunityGroup<T extends QueueItemLike> {
  communityId: string;
  communityName: string;
  count: number;
  batches: BatchGroup<T>[];
}

/**
 * จัดคิวเป็นลำดับชั้น ชุมชน → ปึก → คนกรอก
 * - ใบที่ยังไม่ได้จัดเข้าปึกรวมเป็นกลุ่มเดียว วางไว้ **บนสุด** ของแต่ละชุมชน
 * - ลำดับกลุ่ม (ชุมชน/ปึก/คนกรอก) เรียงตามชื่อ/รหัส (ก-ฮ) ให้สแกนหาง่าย
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
        batches: [],
      };
      communities.set(item.communityId, community);
    }
    community.count += 1;

    let batch = community.batches.find((b) => b.batchId === item.batchId);
    if (!batch) {
      batch = {
        batchId: item.batchId,
        batchLabel: item.batchId === null ? UNBATCHED_LABEL : item.batchCode ?? item.batchId,
        count: 0,
        enterers: [],
      };
      community.batches.push(batch);
    }
    batch.count += 1;

    let enterer = batch.enterers.find((e) => e.enteredById === item.enteredById);
    if (!enterer) {
      enterer = {
        enteredById: item.enteredById,
        enteredByName: item.enteredByName,
        count: 0,
        items: [],
      };
      batch.enterers.push(enterer);
    }
    enterer.count += 1;
    enterer.items.push(item);
  }

  const groups = [...communities.values()];
  groups.sort((a, b) => a.communityName.localeCompare(b.communityName, "th"));
  for (const community of groups) {
    // ใบที่ยังไม่ได้จัดเข้าปึกขึ้นก่อนเสมอ — เป็นกองที่ยังไม่มีใครดูแล ไม่ควรจมท้ายรายการ
    community.batches.sort((a, b) => {
      if ((a.batchId === null) !== (b.batchId === null)) return a.batchId === null ? -1 : 1;
      return a.batchLabel.localeCompare(b.batchLabel, "th");
    });
    for (const batch of community.batches) {
      batch.enterers.sort((a, b) => a.enteredByName.localeCompare(b.enteredByName, "th"));
    }
  }
  return groups;
}
