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
import {
  ACTIVE_ROLES,
  RESERVED_ROLES,
  ROLE_HINTS,
  ROLE_LABELS,
} from "../../lib/authz/role-labels";
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

  it("ACTIVE_ROLES + RESERVED_ROLES ต้องครอบคลุมทุก role ครบและไม่ทับกัน", () => {
    const grouped = [...ACTIVE_ROLES, ...RESERVED_ROLES];
    expect(grouped.length).toBe(new Set(grouped).size); // ไม่ทับกัน
    expect([...grouped].sort()).toEqual([...Object.values(UserRoleEnum)].sort());
    // ทุก role ต้องมีคำอธิบายให้แอดมินอ่าน ไม่งั้นเลือกผิดได้
    for (const role of grouped) {
      expect(ROLE_HINTS[role]).toBeTruthy();
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("role ที่ยังไม่มี permission ต้องไม่ถูกจัดอยู่กลุ่ม 'ใช้งานได้แล้ว'", () => {
    for (const role of ACTIVE_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
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

  it("ADMIN = Full System Administrator — เพิ่ม permission ใหม่ต้องตกถึง ADMIN เสมอ", () => {
    // Owner Decision 2026-07-31: ไม่แยก ADMIN เป็นผู้ดูแลสิทธิ์จำกัด
    // เทสต์นี้จับกรณีที่มีคนเพิ่ม permission ใหม่แล้วลืมให้ ADMIN
    const authz = buildAuthorization([UserRoleEnum.ADMIN]);
    for (const permission of ALL_PERMISSIONS) {
      expect(authz.permissions).toContain(permission);
    }
    // ...และห้ามมี role อื่นที่กว้างเท่า ADMIN โดยไม่ตั้งใจ
    for (const role of Object.values(UserRoleEnum)) {
      if (role === UserRoleEnum.ADMIN) continue;
      expect(ROLE_PERMISSIONS[role].length).toBeLessThan(ALL_PERMISSIONS.length);
    }
  });

  it("ADMIN เป็น global จาก Role — ธงรายบัญชี false ต้องไม่ลดสิทธิ์", () => {
    // ธง hasGlobalCommunityScope เป็น "ทางเพิ่ม" เท่านั้น ห้ามใช้เป็นทางลด
    const authz = buildAuthorization([UserRoleEnum.ADMIN], {
      hasGlobalCommunityScope: false,
    });
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

  it("ไม่มี role ใดนอกจาก ADMIN/EXECUTIVE ที่เป็น global จากชื่อ Role", () => {
    // Legacy role ที่ยังค้างใน enum ห้ามถูกใช้เป็นกลไกให้ Global Scope
    // ใครต้องเห็นทั้งระบบให้เปิดธง hasGlobalCommunityScope รายบัญชีแทน
    for (const role of Object.values(UserRoleEnum)) {
      if (role === UserRoleEnum.ADMIN || role === UserRoleEnum.EXECUTIVE) continue;
      expect(buildAuthorization([role]).isGlobalScope).toBe(false);
    }
  });

  it("ธง Global Community Scope ระดับบัญชี ทำให้ OFFICER เห็นทุกชุมชนได้", () => {
    const scoped = buildAuthorization([UserRoleEnum.OFFICER]);
    const global = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: true,
    });
    expect(scoped.isGlobalScope).toBe(false);
    expect(global.isGlobalScope).toBe(true);
    // ให้ scope เพิ่ม ต้องไม่ทำให้ permission เปลี่ยน
    expect([...global.permissions].sort()).toEqual([...scoped.permissions].sort());
  });

  it("ธงระดับบัญชีเป็นของใครของมัน — ไม่ทำให้ OFFICER คนอื่นเป็น global", () => {
    // จำลอง 2 บัญชีที่มี role เดียวกัน ต่างกันแค่ธง
    const officerA = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: true,
    });
    const officerB = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: false,
    });
    expect(officerA.isGlobalScope).toBe(true);
    expect(officerB.isGlobalScope).toBe(false);
    // ยืนยันว่า OFFICER ไม่เคยถูกใส่ใน GLOBAL_SCOPE_ROLES (กันแก้ผิดทาง)
    expect(GLOBAL_SCOPE_ROLES).not.toContain(UserRoleEnum.OFFICER);
  });

  it("ไม่ส่ง account options = ไม่ global (ค่าเริ่มต้นต้องปลอดภัยเสมอ)", () => {
    expect(buildAuthorization([UserRoleEnum.OFFICER]).isGlobalScope).toBe(false);
    expect(buildAuthorization([UserRoleEnum.DATA_ENTRY], {}).isGlobalScope).toBe(false);
  });

  it("OFFICER ยังคง community scope ตามเดิม — ไม่ใช่ global แม้มี verification.view", () => {
    const authz = buildAuthorization([UserRoleEnum.OFFICER]);
    expect(authz.permissions).toContain(PERMISSIONS.VERIFICATION_VIEW);
    expect(authz.isGlobalScope).toBe(false);
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

  it("เมนูที่ implemented แล้ว ตรงกับหน้าที่สร้างจริง", () => {
    const implemented = NAV_ITEMS.filter((i) => i.implemented);
    expect(implemented.map((i) => i.href)).toEqual([
      "/dashboard",
      "/communities",
      "/surveys",
      "/batches",
      "/verification",
      "/admin/registrations",
      "/admin/users",
    ]);
  });

  it("หน้าจัดการผู้ใช้ต้องใช้สิทธิ์ user.manage เท่านั้น", () => {
    const item = NAV_ITEMS.find((i) => i.href === "/admin/users");
    expect(item?.permission).toBe(PERMISSIONS.USER_MANAGE);
    // VERIFIER/DATA_ENTRY ต้องไม่เห็นเมนูนี้
    expect(
      visibleNavItems(ROLE_PERMISSIONS[UserRoleEnum.VERIFIER]).map((i) => i.href),
    ).not.toContain("/admin/users");
    expect(
      visibleNavItems(ROLE_PERMISSIONS[UserRoleEnum.DATA_ENTRY]).map((i) => i.href),
    ).not.toContain("/admin/users");
  });
});
