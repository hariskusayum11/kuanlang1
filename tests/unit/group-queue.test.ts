import { describe, expect, it } from "vitest";
import {
  groupVerificationQueue,
  UNBATCHED_LABEL,
  type QueueItemLike,
} from "../../domain/verification/group-queue";

function item(over: Partial<QueueItemLike> & { householdId: string }): QueueItemLike {
  return {
    communityId: "c1",
    communityName: "ชุมชนท่าเคียน",
    batchId: "b1",
    batchCode: "BATCH-TK01-001",
    enteredById: "u1",
    enteredByName: "สมชาย",
    ...over,
  };
}

describe("groupVerificationQueue", () => {
  it("array ว่าง → กลุ่มว่าง", () => {
    expect(groupVerificationQueue([])).toEqual([]);
  });

  it("รายการเดียว → มีครบ 3 ชั้น community/batch/enterer อย่างละ 1", () => {
    const groups = groupVerificationQueue([item({ householdId: "h1" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].communityId).toBe("c1");
    expect(groups[0].count).toBe(1);
    expect(groups[0].batches).toHaveLength(1);
    expect(groups[0].batches[0].count).toBe(1);
    expect(groups[0].batches[0].enterers).toHaveLength(1);
    expect(groups[0].batches[0].enterers[0].count).toBe(1);
    expect(groups[0].batches[0].enterers[0].items).toEqual([item({ householdId: "h1" })]);
  });

  it("ชุมชนเดียวกัน ปึกต่างกัน → แยกเป็นคนละ batch group", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", batchId: "b1", batchCode: "BATCH-A" }),
      item({ householdId: "h2", batchId: "b2", batchCode: "BATCH-B" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].batches).toHaveLength(2);
    expect(groups[0].count).toBe(2);
  });

  it("ปึกเดียวกัน คนกรอกต่างกัน → แยกเป็นคนละ enterer group", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", enteredById: "u1", enteredByName: "สมชาย" }),
      item({ householdId: "h2", enteredById: "u2", enteredByName: "สมหญิง" }),
    ]);
    expect(groups[0].batches[0].enterers).toHaveLength(2);
    expect(groups[0].batches[0].count).toBe(2);
  });

  it("คนกรอกคนเดียวกัน หลายใบ → รวมอยู่ใน items เดียวกัน ตามลำดับเดิม", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1" }),
      item({ householdId: "h2" }),
      item({ householdId: "h3" }),
    ]);
    const enterer = groups[0].batches[0].enterers[0];
    expect(enterer.count).toBe(3);
    expect(enterer.items.map((i) => i.householdId)).toEqual(["h1", "h2", "h3"]);
  });

  it("หลายชุมชน → เรียงชื่อชุมชน ก-ฮ ไม่ใช่ตามลำดับที่ส่งเข้ามา", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", communityId: "c2", communityName: "ชุมชนหน้าควน" }),
      item({ householdId: "h2", communityId: "c1", communityName: "ชุมชนควนสันติ" }),
    ]);
    expect(groups.map((g) => g.communityName)).toEqual([
      "ชุมชนควนสันติ",
      "ชุมชนหน้าควน",
    ]);
  });

  it("ปึกภายในชุมชนเดียวกันเรียงตามรหัสปึก", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", batchId: "b2", batchCode: "BATCH-002" }),
      item({ householdId: "h2", batchId: "b1", batchCode: "BATCH-001" }),
    ]);
    expect(groups[0].batches.map((b) => b.batchLabel)).toEqual([
      "BATCH-001",
      "BATCH-002",
    ]);
  });

  it("ใบที่ยังไม่ได้จัดเข้าปึก → รวมเป็นกลุ่มเดียว ป้ายเป็นข้อความไทย ไม่ใช่ null", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", batchId: null, batchCode: null }),
      item({ householdId: "h2", batchId: null, batchCode: null }),
    ]);
    expect(groups[0].batches).toHaveLength(1);
    expect(groups[0].batches[0].batchId).toBeNull();
    expect(groups[0].batches[0].batchLabel).toBe(UNBATCHED_LABEL);
    expect(groups[0].batches[0].count).toBe(2);
  });

  it("ใบที่ยังไม่ได้จัดเข้าปึกอยู่บนสุดของชุมชนเสมอ แม้ป้ายจะเรียงทีหลัง", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", batchId: "b1", batchCode: "BATCH-001" }),
      item({ householdId: "h2", batchId: null, batchCode: null }),
    ]);
    expect(groups[0].batches.map((b) => b.batchLabel)).toEqual([
      UNBATCHED_LABEL,
      "BATCH-001",
    ]);
  });

  it("ลำดับ item ภายในกลุ่มเดียวกันคงตามลำดับที่ส่งเข้ามา (ไม่จัดเรียงซ้ำ)", () => {
    // จำลองว่าผู้เรียกจัดลำดับความสำคัญมาก่อนแล้ว (เช่น ใบสงสัยซ้ำก่อน)
    const groups = groupVerificationQueue([
      item({ householdId: "priority" }),
      item({ householdId: "normal" }),
    ]);
    expect(groups[0].batches[0].enterers[0].items.map((i) => i.householdId)).toEqual([
      "priority",
      "normal",
    ]);
  });

  it("โครงสร้างซับซ้อน: 2 ชุมชน × 2 ปึก × 2 คนกรอก นับ count ถูกทุกชั้น", () => {
    const items = [
      item({ householdId: "1", communityId: "c1", communityName: "ก", batchId: "b1", batchCode: "B1", enteredById: "u1", enteredByName: "x" }),
      item({ householdId: "2", communityId: "c1", communityName: "ก", batchId: "b1", batchCode: "B1", enteredById: "u2", enteredByName: "y" }),
      item({ householdId: "3", communityId: "c1", communityName: "ก", batchId: "b2", batchCode: "B2", enteredById: "u1", enteredByName: "x" }),
      item({ householdId: "4", communityId: "c2", communityName: "ข", batchId: "b3", batchCode: "B3", enteredById: "u3", enteredByName: "z" }),
    ];
    const groups = groupVerificationQueue(items);
    expect(groups).toHaveLength(2);
    const c1 = groups.find((g) => g.communityId === "c1")!;
    expect(c1.count).toBe(3);
    expect(c1.batches).toHaveLength(2);
    const b1 = c1.batches.find((b) => b.batchId === "b1")!;
    expect(b1.count).toBe(2);
    expect(b1.enterers).toHaveLength(2);
    const c2 = groups.find((g) => g.communityId === "c2")!;
    expect(c2.count).toBe(1);
  });
});
