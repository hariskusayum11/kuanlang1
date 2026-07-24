import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { canVerify, householdCommunityFilter } from "../../lib/verification/queue";
import { buildAuthorization } from "../../lib/authz/access";
import type { AuthorizationContext } from "../../lib/authz/types";

function ctxWith(
  roles: UserRoleEnum[],
  scope: { isGlobalScope?: boolean; communityIds?: string[] } = {},
): AuthorizationContext {
  const { permissions } = buildAuthorization(roles);
  return {
    userId: "u1",
    name: "ทดสอบ",
    email: "t@test.invalid",
    roles,
    permissions,
    isGlobalScope: scope.isGlobalScope ?? false,
    communityIds: scope.communityIds ?? [],
  };
}

describe("canVerify — ต้องมี verification.view", () => {
  it("VERIFIER / OFFICER / ADMIN ตรวจได้", () => {
    expect(canVerify(ctxWith([UserRoleEnum.VERIFIER]))).toBe(true);
    expect(canVerify(ctxWith([UserRoleEnum.OFFICER]))).toBe(true);
    expect(canVerify(ctxWith([UserRoleEnum.ADMIN]))).toBe(true);
  });

  it("DATA_ENTRY / EXECUTIVE ตรวจไม่ได้", () => {
    expect(canVerify(ctxWith([UserRoleEnum.DATA_ENTRY]))).toBe(false);
    expect(canVerify(ctxWith([UserRoleEnum.EXECUTIVE]))).toBe(false);
  });
});

describe("householdCommunityFilter — บังคับ scope (ห้าม fallback ทั้งระบบ)", () => {
  it("global scope → ไม่กรอง ({})", () => {
    expect(
      householdCommunityFilter(ctxWith([UserRoleEnum.ADMIN], { isGlobalScope: true })),
    ).toEqual({});
  });

  it("scope ว่าง → null (ไม่เห็นงานใดเลย)", () => {
    expect(
      householdCommunityFilter(ctxWith([UserRoleEnum.VERIFIER], { communityIds: [] })),
    ).toBeNull();
  });

  it("มี scope → กรองเฉพาะชุมชนที่รับผิดชอบ", () => {
    expect(
      householdCommunityFilter(
        ctxWith([UserRoleEnum.VERIFIER], { communityIds: ["c1", "c2"] }),
      ),
    ).toEqual({ communityId: { in: ["c1", "c2"] } });
  });
});
