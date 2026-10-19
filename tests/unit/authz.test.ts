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
  ROLE_PERMISSIONS,
} from "../../lib/authz/role-permissions";
import {
  ACTIVE_ROLES,
  LEGACY_ROLES,
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

  it("ACTIVE + RESERVED + LEGACY ต้องครอบคลุมทุก role ครบและไม่ทับกัน", () => {
    // LEGACY = บทบาทที่เลิกใช้ในชั้นแอป แต่ยังต้องแสดงผลได้เพราะบัญชีเก่ายังถืออยู่
    const grouped = [...ACTIVE_ROLES, ...RESERVED_ROLES, ...LEGACY_ROLES];
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

  it("ทุก role เห็นทุกชุมชน — Community Scope ถูกยกเลิกทั้งระบบ (#R7-B)", () => {
    for (const role of ACTIVE_ROLES) {
      expect(buildAuthorization([role]).isGlobalScope).toBe(true);
    }
  });
});

describe("buildAuthorization", () => {
  it("ไม่มี role → ไม่มี permission", () => {
    const authz = buildAuthorization([]);
    expect(authz.permissions).toEqual([]);
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
  });

  it("VERIFIER ไม่มี dashboard.view (matrix: เห็นเฉพาะคิวตัวเอง)", () => {
    const authz = buildAuthorization([UserRoleEnum.VERIFIER]);
    expect(authz.permissions).not.toContain(PERMISSIONS.DASHBOARD_VIEW);
  });






  it("ทุก role เป็น global scope — Community Scope ถูกยกเลิก (#R7-B)", () => {
    for (const role of Object.values(UserRoleEnum)) {
      expect(buildAuthorization([role]).isGlobalScope).toBe(true);
    }
    expect(buildAuthorization([]).isGlobalScope).toBe(true);
  });

  it("ธง hasGlobalCommunityScope ไม่มีผลอีกแล้ว — ทุกค่าให้ผลเหมือนกัน", () => {
    // ธงยังอยู่ในฐานข้อมูลเพื่อให้เปิด scope กลับได้ แต่ต้องไม่ตัดสินสิทธิ์แล้ว
    const on = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: true,
    });
    const off = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: false,
    });
    expect(on.isGlobalScope).toBe(true);
    expect(off.isGlobalScope).toBe(true);
    expect([...on.permissions].sort()).toEqual([...off.permissions].sort());
  });

  it("OFFICER ยังมี verification.view (permission ไม่ถูกกระทบจากการยกเลิก scope)", () => {
    const authz = buildAuthorization([UserRoleEnum.OFFICER]);
    expect(authz.permissions).toContain(PERMISSIONS.VERIFICATION_VIEW);
  });

  it("EXECUTIVE/แพทย์ดูข้อมูลสุขภาพได้ แต่ไม่มีสิทธิ์จัดการผู้ใช้/ตั้งค่า/แก้ครัวเรือน", () => {
    const authz = buildAuthorization([UserRoleEnum.EXECUTIVE]);
    expect(authz.permissions).toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(authz.permissions).toContain(PERMISSIONS.MAP_VIEW);
    expect(authz.permissions).toContain(PERMISSIONS.MEDICAL_CASE_VIEW);
    expect(authz.permissions).toContain(PERMISSIONS.MEDICAL_MAP_VIEW);
    expect(authz.permissions).toContain(PERMISSIONS.MEDICAL_REPORT_EXPORT);
    expect(authz.permissions).toContain(PERMISSIONS.PERSONAL_REPORT_EXPORT);
    expect(authz.permissions).not.toContain(PERMISSIONS.HOUSEHOLD_VIEW);
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

  it("แยกฟังก์ชันสำคัญออกมาใน sidebar ภายใต้หมวดที่ชัดเจน", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "แดชบอร์ดผู้บริหาร",
      "คีย์แบบสอบถาม",
      "รอตรวจสอบ",
      "ข้อมูลครัวเรือน",
      "สถานะกลุ่มเปราะบาง",
      "ถังขยะแบบสอบถาม",
      "ข้อมูลชุมชน",
      "ข้อมูลสุขภาพและกลุ่มเปราะบาง",
      "แผนที่ข้อมูลสำรวจ",
      "ความเสี่ยงและการช่วยเหลือ",
      "รายงานและส่งออก",
      "ผลงานผู้กรอก",
      // หน้าเดียวของอาสาสมัคร — อยู่หมวด overview เพราะเป็นหน้าแรกของเขา
      "ศูนย์อาสาสมัคร",
      "ผู้ใช้และสิทธิ์",
      "คำขอลงทะเบียน",
      "ลิงก์ระบบภายนอก",
      "ตั้งค่าระบบ",
    ]);
    expect(NAV_ITEMS.map((item) => item.group)).toEqual([
      "overview",
      "data",
      "data",
      "data",
      "data",
      "data",
      "analysis",
      "analysis",
      "analysis",
      "analysis",
      "analysis",
      "analysis",
      "overview",
      "system",
      "system",
      "system",
      "system",
    ]);
  });

  it("DATA_ENTRY เห็นเฉพาะเมนูแบบสอบถาม", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.DATA_ENTRY]);
    const items = visibleNavItems(permissions);
    expect(items.map((i) => i.href)).toEqual(["/surveys"]);
  });

  it("VOLUNTEER เห็นเฉพาะศูนย์อาสาสมัคร — ไม่เห็นแดชบอร์ดผู้บริหาร", () => {
    // Owner Decision 2026-10-18: อาสาสมัครเห็นเฉพาะข้อมูลที่จำเป็นต่อภารกิจ
    const { permissions } = buildAuthorization([UserRoleEnum.VOLUNTEER]);
    expect(visibleNavItems(permissions).map((i) => i.href)).toEqual(["/volunteer"]);
  });

  it("COMMUNITY_LEADER เห็นเฉพาะหน้าสถานะกลุ่มเปราะบาง — ไม่มีสิทธิ์อื่น (docs/34)", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.COMMUNITY_LEADER]);
    expect(permissions).toEqual([PERMISSIONS.VULNERABLE_STATUS_UPDATE]);
    expect(visibleNavItems(permissions).map((i) => i.href)).toEqual(["/community-status"]);
  });

  it("บทบาทอื่นนอกจาก ADMIN/หัวหน้าชุมชน บันทึกสถานะกลุ่มเปราะบางไม่ได้", () => {
    for (const role of Object.values(UserRoleEnum)) {
      if (role === UserRoleEnum.ADMIN || role === UserRoleEnum.COMMUNITY_LEADER) continue;
      expect(buildAuthorization([role]).permissions).not.toContain(PERMISSIONS.VULNERABLE_STATUS_UPDATE);
    }
  });

  it("EXECUTIVE ไม่เห็นเมนูตั้งค่าระบบ", () => {
    const { permissions } = buildAuthorization([UserRoleEnum.EXECUTIVE]);
    const hrefs = visibleNavItems(permissions).map((i) => i.href);
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/map");
    expect(hrefs).toContain("/medical");
    expect(hrefs).not.toContain("/households");
  });

  it("เมนูที่ implemented แล้ว ตรงกับหน้าที่สร้างจริง", () => {
    const implemented = NAV_ITEMS.filter((i) => i.implemented);
    expect(implemented.map((i) => i.href)).toEqual([
      "/dashboard",
      "/surveys",
      "/verification",
      "/households",
      "/community-status",
      "/admin/sheets",
      "/communities",
      "/medical",
      "/map",
      "/risk",
      "/reports",
      "/keyer-performance",
      "/volunteer",
      "/admin/users",
      "/admin/registrations",
      "/admin/links",
      "/settings",
    ]);
  });

  it("VERIFIER เห็นเมนูรอตรวจสอบโดยตรง", () => {
    const items = visibleNavItems(ROLE_PERMISSIONS[UserRoleEnum.VERIFIER]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: "รอตรวจสอบ", href: "/verification" });
  });

  it("เมนูผู้ใช้และสิทธิ์ต้องใช้ user.manage และคำขอต้องใช้ registration.manage", () => {
    const item = NAV_ITEMS.find((i) => i.href === "/admin/users");
    expect(item?.permission).toBe(PERMISSIONS.USER_MANAGE);
    expect(NAV_ITEMS.find((i) => i.href === "/admin/registrations")?.permission).toBe(
      PERMISSIONS.REGISTRATION_MANAGE,
    );
    // VERIFIER/DATA_ENTRY ต้องไม่เห็นเมนูนี้
    expect(
      visibleNavItems(ROLE_PERMISSIONS[UserRoleEnum.VERIFIER]).map((i) => i.href),
    ).not.toContain("/admin/users");
    expect(
      visibleNavItems(ROLE_PERMISSIONS[UserRoleEnum.DATA_ENTRY]).map((i) => i.href),
    ).not.toContain("/admin/users");
  });
});
