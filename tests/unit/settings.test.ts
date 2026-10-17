import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { buildAuthorization } from "../../lib/authz/access";
import type { AuthorizationContext } from "../../lib/authz/types";
import { DEFAULT_SYSTEM_PREFERENCES, saveSystemPreferences } from "../../lib/settings/core";

const permissions = buildAuthorization([UserRoleEnum.ADMIN]).permissions;
const ctx: AuthorizationContext = {
  userId: "admin-test",
  name: "Admin",
  email: "admin@test.invalid",
  roles: [UserRoleEnum.ADMIN],
  permissions,
  isGlobalScope: true,
  isProtectedAccount: false,
  communityIds: [],
};

describe("system settings validation", () => {
  it("มีค่าเริ่มต้นที่ปลอดภัยและแดชบอร์ดเริ่มจากข้อมูลตรวจแล้ว", () => {
    expect(DEFAULT_SYSTEM_PREFERENCES.dashboardDefaultStatus).toBe("VERIFIED");
    expect(DEFAULT_SYSTEM_PREFERENCES.mapDefaultZoom).toBeGreaterThanOrEqual(5);
  });

  it("ไม่รับพิกัดหรือระดับซูมผิดช่วงก่อนแตะฐานข้อมูล", async () => {
    await expect(saveSystemPreferences(ctx, { ...DEFAULT_SYSTEM_PREFERENCES, mapDefaultLat: 100 })).resolves.toEqual({ ok: false, error: "ละติจูดไม่ถูกต้อง" });
    await expect(saveSystemPreferences(ctx, { ...DEFAULT_SYSTEM_PREFERENCES, mapDefaultZoom: 30 })).resolves.toEqual({ ok: false, error: "ระดับซูมต้องอยู่ระหว่าง 5–19" });
  });
});

