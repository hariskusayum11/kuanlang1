import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import type { AuthorizationContext } from "../../lib/authz/types";
import type { Keyring } from "../../lib/crypto/encryption";
import { fetchQuestionnaireAnalytics } from "../../lib/dashboard/questionnaire-analytics";
import { fetchSegmentRows } from "../../lib/report/segment-data";
import { resolveSegment } from "../../lib/report/segments";

// Invariant หลักของ Drill-down (ข้อ 3/7): จำนวน "รายชื่อ" ของกลุ่ม ต้องเท่ากับ
// ตัวเลข KPI ในรายงานเป๊ะ ๆ เสมอ — ถ้าเพี้ยน แปลว่าคนใช้เห็นเลข 38 แต่โหลดได้ 40 ชื่อ
// เทสต์นี้ล็อกไว้ว่า where ของ segment ตรงกับ where ที่ analytics ใช้นับ (ห้าม drift)

const ctx: AuthorizationContext = {
  userId: "test-segment-invariant",
  name: "t",
  email: "t@test.invalid",
  roles: [UserRoleEnum.ADMIN],
  permissions: [],
  isGlobalScope: true,
  isProtectedAccount: false,
  communityIds: [],
};
const filters = { status: "VERIFIED" as const };
// keyring หลอก 32 bytes — การนับ (rows.length) ไม่ขึ้นกับผลถอดรหัส (safeDecrypt กันพังแล้ว)
const fakeKeyring: Keyring = Object.freeze({ v1: Buffer.alloc(32) });

async function countRows(id: string): Promise<number> {
  const seg = resolveSegment(id);
  if (!seg) throw new Error(`resolveSegment คืน null สำหรับ ${id}`);
  const result = await fetchSegmentRows(ctx, filters, seg, fakeKeyring);
  return result.rows.length;
}

describe("Integration: segment drill-down invariant", () => {
  it("จำนวนรายชื่อของแต่ละกลุ่ม (household/person) = ตัวเลขในรายงานเป๊ะ", async () => {
    const a = await fetchQuestionnaireAnalytics({ isGlobalScope: true, communityIds: [] }, filters);

    const cases: Array<[string, number]> = [
      ["households", a.summary.households],
      ["vulnerable-people", a.summary.vulnerablePeople],
      ["vulnerable-households", a.summary.vulnerableHouseholds],
      ["flooded", a.flood.floodedHouseholds],
      ["without-kit", a.flood.withoutSurvivalKit],
      ["without-resources", a.flood.withoutResources],
      ["smartphone", a.preparedness.smartphoneHouseholds],
      ["qr-ready", a.preparedness.qrReadyHouseholds],
      ["volunteers", a.participation.volunteerHouseholds],
      ["host-houses", a.participation.potentialHostHouses],
      ["mental-health", a.participation.mentalHealthSupport],
      ["poverty", a.participation.povertyProgramInterest],
      ["missing-coords", a.quality.missingCoordinates],
      ["incomplete", a.quality.incomplete],
      ["illegible", a.quality.illegible],
    ];
    for (const [id, expected] of cases) {
      expect(await countRows(id), `กลุ่ม ${id} ต้องได้ ${expected} รายการ`).toBe(expected);
    }
  });

  it("triage: แต่ละระดับตรงกับรายงาน และผลรวมทุกระดับ = กลุ่มเปราะบางทั้งหมด (ไม่ตกหล่น)", async () => {
    const a = await fetchQuestionnaireAnalytics({ isGlobalScope: true, communityIds: [] }, filters);
    const p1 = await countRows("triage:P1");
    const p2 = await countRows("triage:P2");
    const p3 = await countRows("triage:P3");
    const un = await countRows("triage:UNASSESSED");
    expect(p1).toBe(a.triage.P1);
    expect(p2).toBe(a.triage.P2);
    expect(p3).toBe(a.triage.P3);
    expect(un).toBe(a.triage.UNASSESSED);
    expect(p1 + p2 + p3 + un).toBe(a.summary.vulnerablePeople);
  });
});
