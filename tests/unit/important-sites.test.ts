import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { buildAuthorization } from "../../lib/authz/access";
import type { AuthorizationContext } from "../../lib/authz/types";
import { canManageImportantSites, IMPORTANT_SITE_TYPES } from "../../lib/geo/important-sites";

function context(role: UserRoleEnum): AuthorizationContext {
  return {
    userId: "test-user",
    name: "Test",
    email: "test@example.invalid",
    roles: [role],
    permissions: buildAuthorization([role]).permissions,
    isGlobalScope: true,
    isProtectedAccount: false,
    communityIds: [],
  };
}

describe("important map sites", () => {
  it("ให้เฉพาะ ADMIN จัดการจุดสำคัญ", () => {
    expect(canManageImportantSites(context(UserRoleEnum.ADMIN))).toBe(true);
    expect(canManageImportantSites(context(UserRoleEnum.OFFICER))).toBe(false);
    expect(canManageImportantSites(context(UserRoleEnum.EXECUTIVE))).toBe(false);
  });

  it("มีประเภทหลักที่ใช้ในพื้นที่", () => {
    const values = IMPORTANT_SITE_TYPES.map((item) => item.value);
    expect(values).toContain("SCHOOL");
    expect(values).toContain("TEMPLE_OR_MOSQUE");
    expect(values).toContain("COMMUNITY_CENTER");
  });
});
