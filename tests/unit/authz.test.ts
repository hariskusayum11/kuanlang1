import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import {
  buildAuthorization,
  canAccessCommunity,
  hasAnyPermission,
  hasPermission,
} from "../../lib/authz/access";
import { ALL_PERMISSIONS, PERMISSIONS } from "../../lib/authz/permissions";
import {
  GLOBAL_SCOPE_ROLES,
  ROLE_PERMISSIONS,
} from "../../lib/authz/role-permissions";
import { NAV_ITEMS, visibleNavItems } from "../../lib/navigation";

describe("permissions constants", () => {
  it("ทุก role ใน enum มี mapping ครบ", () => {
    for (const role of Object.values(UserRoleEnum)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("mapping ไม่มี permission นอกเหนือจากที่ประกาศ", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });

  it("global scope roles = ADMIN + EXECUTIVE เท่านั้น", () => {
    expect([...GLOBAL_SCOPE_ROLES].sort()).toEqual(
      [UserRoleEnum.ADMIN, UserRoleEnum.EXECUTIVE].sort(),
    );
  });
});

describe("buildAuthorization", () => {
  it("ไม่มี role → ไม่มี permission และไม่ global", () => {
    const authz = buildAuthorization([]);
    expect(authz.permissions).toEqual([]);
    expect(authz.isGlobalScope).toBe(false);
  });

  it("ADMIN ได้ทุก permission และเป็น global scope", () => {
    const authz = buildAuthorization([UserRoleEnum.ADMIN]);
    expect([...authz.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(authz.isGlobalScope).toBe(true);
  });

  it("FIELD_SURVEYOR ไม่มี permission ใดเลย", () => {
    const authz = buildAuthorization([UserRoleEnum.FIELD_SURVEYOR]);
    expect(authz.permissions).toEqual([]);
    expect(authz.isGlobalScope).toBe(false);
  });

  it("หลาย role → union ของ permission ไม่ซ้ำ", () => {
    const authz = buildAuthorization([
      UserRoleEnum.VERIFIER,
      UserRoleEnum.DATA_ENTRY,
    ]);
    expect([...authz.permissions].sort()).toEqual(
      [PERMISSIONS.VERIFICATION_VIEW, PERMISSIONS.SURVEY_ENTRY].sort(),
    );
    expect(authz.permissions.length).toBe(new Set(authz.permissions).size);
    expect(authz.isGlobalScope).toBe(false);
  });

  it("VERIFIER ไม่มี dashboard.view (matrix: เห็นเฉพาะคิวตัวเอง)", () => {
    const authz = buildAuthorization([UserRoleEnum.VERIFIER]);
    expect(authz.permissions).not.toContain(PERMISSIONS.DASHBOARD_VIEW);
  });

  it("EXECUTIVE ดูได้แต่ไม่มีสิทธิ์จัดการผู้ใช้/ตั้งค่า", () => {
    const authz = buildAuthorization([UserRoleEnum.EXECUTIVE]);
    expect(authz.permissions).toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(authz.permissions).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(authz.permissions).not.toContain(PERMISSIONS.SETTINGS_VIEW);
  });
});

describe("hasPermission / hasAnyPermission", () => {
  const ctx = { permissions: [PERMISSIONS.DASHBOARD_VIEW] };

  it("มี permission → true, ไม่มี → false", () => {
    expect(hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
    expect(hasPermission(ctx, PERMISSIONS.USER_MANAGE)).toBe(false);
  });

  it("hasAnyPermission ตรงอย่างน้อยหนึ่ง → true, ว่าง → false", () => {
    expect(
      hasAnyPermission(ctx, [PERMISSIONS.USER_MANAGE, PERMISSIONS.DASHBOARD_VIEW]),
    ).toBe(true);
    expect(hasAnyPermission(ctx, [PERMISSIONS.USER_MANAGE])).toBe(false);
    expect(hasAnyPermission(ctx, [])).toBe(false);
  });
});

describe("canAccessCommunity", () => {
  it("global scope เข้าถึงได้ทุกชุมชน", () => {
    expect(
      canAccessCommunity({ isGlobalScope: true, communityIds: [] }, "any-id"),
    ).toBe(true);
  });

  it("scoped user เข้าถึงเฉพาะชุมชนใน scope", () => {
    const ctx = { isGlobalScope: false, communityIds: ["c1", "c2"] };
    expect(canAccessCommunity(ctx, "c1")).toBe(true);
    expect(canAccessCommunity(ctx, "c3")).toBe(false);
  });

  it("scope ว่างและไม่ global → ปฏิเสธเสมอ (ไม่ fallback เป็น global)", () => {
    expect(
      canAccessCommunity({ isGlobalScope: false, communityIds: [] }, "c1"),
    ).toBe(false);
  });
});

describe("visibleNavItems", () => {
  it("ไม่มี permission → เมนูว่าง", () => {
    expect(visibleNavItems([])).toEqual([]);
  });

  it("ADMIN เห็นครบทุกเมนู", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.ADMIN]);
    expect(visibleNavItems(permissions).length).toBe(NAV_ITEMS.length);
  });

  it("DATA_ENTRY เห็นเฉพาะเมนูแบบสอบถาม", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.DATA_ENTRY]);
    const items = visibleNavItems(permissions);
    expect(items.map((i) => i.href)).toEqual(["/surveys"]);
  });

  it("EXECUTIVE ไม่เห็นเมนูตั้งค่าระบบ", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.EXECUTIVE]);
    const hrefs = visibleNavItems(permissions).map((i) => i.href);
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).toContain("/dashboard");
  });

  it("เมนูที่ implemented แล้ว = /dashboard, /surveys, /batches, /verification, /admin/registrations", () => {
    const implemented = NAV_ITEMS.filter((i) => i.implemented);
    expect(implemented.map((i) => i.href)).toEqual([
      "/dashboard",
      "/surveys",
      "/batches",
      "/verification",
      "/admin/registrations",
    ]);
  });
});
