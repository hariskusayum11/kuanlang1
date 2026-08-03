import { describe, expect, it } from "vitest";
import {
  groupVerificationQueue,
  type QueueItemLike,
} from "../../domain/verification/group-queue";

// ปึกถูกยกเลิกจากระบบแล้ว (Owner Decision 2026-08-03) — คิวจึงเหลือ 2 ชั้น
// ชุมชน → คนกรอก

function item(over: Partial<QueueItemLike> & { householdId: string }): QueueItemLike {
  return {
    communityId: "c1",
    communityName: "ชุมชนท่าเคียน",
    enteredById: "u1",
    enteredByName: "สมชาย",
    ...over,
  };
}

describe("groupVerificationQueue", () => {
  it("array ว่าง → กลุ่มว่าง", () => {
    expect(groupVerificationQueue([])).toEqual([]);
  });

  it("รายการเดียว → มีครบ 2 ชั้น community/enterer อย่างละ 1", () => {
    const groups = groupVerificationQueue([item({ householdId: "h1" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].communityId).toBe("c1");
    expect(groups[0].count).toBe(1);
    expect(groups[0].enterers).toHaveLength(1);
    expect(groups[0].enterers[0].count).toBe(1);
    expect(groups[0].enterers[0].items).toEqual([item({ householdId: "h1" })]);
  });

  it("ชุมชนเดียวกัน คนกรอกต่างกัน → แยกเป็นคนละ enterer group", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", enteredById: "u1", enteredByName: "สมชาย" }),
      item({ householdId: "h2", enteredById: "u2", enteredByName: "สมหญิง" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].enterers).toHaveLength(2);
    expect(groups[0].count).toBe(2);
  });

  it("คนกรอกคนเดียวกัน หลายใบ → รวมอยู่ใน items เดียวกัน ตามลำดับเดิม", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1" }),
      item({ householdId: "h2" }),
      item({ householdId: "h3" }),
    ]);
    const enterer = groups[0].enterers[0];
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

  it("คนกรอกภายในชุมชนเดียวกันเรียงตามชื่อ ก-ฮ", () => {
    const groups = groupVerificationQueue([
      item({ householdId: "h1", enteredById: "u2", enteredByName: "สมหญิง" }),
      item({ householdId: "h2", enteredById: "u1", enteredByName: "กมล" }),
    ]);
    expect(groups[0].enterers.map((e) => e.enteredByName)).toEqual(["กมล", "สมหญิง"]);
  });

  it("ลำดับ item ภายในกลุ่มเดียวกันคงตามลำดับที่ส่งเข้ามา (ไม่จัดเรียงซ้ำ)", () => {
    // จำลองว่าผู้เรียกจัดลำดับความสำคัญมาก่อนแล้ว (เช่น ใบสงสัยซ้ำก่อน)
    const groups = groupVerificationQueue([
      item({ householdId: "priority" }),
      item({ householdId: "normal" }),
    ]);
    expect(groups[0].enterers[0].items.map((i) => i.householdId)).toEqual([
      "priority",
      "normal",
    ]);
  });

  it("โครงสร้างซับซ้อน: 2 ชุมชน × 2 คนกรอก นับ count ถูกทุกชั้น", () => {
    const items = [
      item({ householdId: "1", communityId: "c1", communityName: "ก", enteredById: "u1", enteredByName: "x" }),
      item({ householdId: "2", communityId: "c1", communityName: "ก", enteredById: "u2", enteredByName: "y" }),
      item({ householdId: "3", communityId: "c1", communityName: "ก", enteredById: "u1", enteredByName: "x" }),
      item({ householdId: "4", communityId: "c2", communityName: "ข", enteredById: "u3", enteredByName: "z" }),
    ];
    const groups = groupVerificationQueue(items);
    expect(groups).toHaveLength(2);
    const c1 = groups.find((g) => g.communityId === "c1")!;
    expect(c1.count).toBe(3);
    expect(c1.enterers).toHaveLength(2);
    const u1 = c1.enterers.find((e) => e.enteredById === "u1")!;
    expect(u1.count).toBe(2);
    const c2 = groups.find((g) => g.communityId === "c2")!;
    expect(c2.count).toBe(1);
    expect(c2.enterers).toHaveLength(1);
  });
});
