import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { buildAuthorization } from "../../lib/authz/access";
import { PERMISSIONS } from "../../lib/authz/permissions";
import { ROLE_PERMISSIONS } from "../../lib/authz/role-permissions";
import {
  ACTIVE_ROLES,
  LEGACY_ROLES,
  LEGACY_ROLE_REPLACEMENT,
  RESERVED_ROLES,
  ROLE_DISPLAY_ORDER,
  ROLE_HINTS,
  ROLE_LABELS,
  isLegacyRole,
} from "../../lib/authz/role-labels";
import { REQUESTABLE_ROLES } from "../../lib/registration/validation";
import { NAV_ITEMS, visibleNavItems } from "../../lib/navigation";

// Owner Decision 2026-07-31 #R6-D: ยุบ COORDINATOR + VERIFIER เข้า OFFICER
// Role ที่ใช้งานจริง = ADMIN / EXECUTIVE / OFFICER / DATA_ENTRY
// Owner Decision 2026-07-31 #R6-E: เลิกใช้ FIELD_SURVEYOR ในชั้นแอปพลิเคชัน

describe("OFFICER ครอบคลุมหน้าที่ของ COORDINATOR และ VERIFIER", () => {
  const officer = ROLE_PERMISSIONS[UserRoleEnum.OFFICER];

  it("1) OFFICER ได้ permission เดิมของ COORDINATOR ครบทุกข้อ", () => {
    for (const p of ROLE_PERMISSIONS[UserRoleEnum.COORDINATOR]) {
      expect(officer).toContain(p);
    }
  });

  it("2) OFFICER ได้ permission เดิมของ VERIFIER ครบทุกข้อ", () => {
    for (const p of ROLE_PERMISSIONS[UserRoleEnum.VERIFIER]) {
      expect(officer).toContain(p);
    }
  });

  it("OFFICER = union พอดี ไม่ขาดและไม่เกินจากที่ตั้งใจ", () => {
    // union ที่คาดไว้ = COORDINATOR ∪ VERIFIER ∪ สิทธิ์ที่ OFFICER ต้องมีเพิ่มเอง
    const expected = new Set([
      ...ROLE_PERMISSIONS[UserRoleEnum.COORDINATOR],
      ...ROLE_PERMISSIONS[UserRoleEnum.VERIFIER],
      PERMISSIONS.HOUSEHOLD_VIEW, // ดูข้อมูลครัวเรือนที่คีย์แล้ว (OFFICER เดิมมีอยู่)
    ]);
    expect([...officer].sort()).toEqual([...expected].sort());
  });

  it("ห้ามลด permission ที่ OFFICER เดิมมีอยู่", () => {
    for (const p of [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.COMMUNITY_VIEW,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.HOUSEHOLD_VIEW,
      PERMISSIONS.VERIFICATION_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ]) {
      expect(officer).toContain(p);
    }
  });

  it("OFFICER ต้องไม่ได้สิทธิ์ระดับผู้ดูแลระบบติดมาด้วย", () => {
    expect(officer).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(officer).not.toContain(PERMISSIONS.SETTINGS_VIEW);
  });

  it("3) OFFICER เห็นทุกชุมชน — Community Scope ถูกยกเลิกทั้งระบบ (#R7-B)", () => {
    expect(buildAuthorization([UserRoleEnum.OFFICER]).isGlobalScope).toBe(true);
  });

  it("4) ธง hasGlobalCommunityScope ไม่มีผลต่อ permission ของ OFFICER", () => {
    const authz = buildAuthorization([UserRoleEnum.OFFICER], {
      hasGlobalCommunityScope: true,
    });
    expect([...authz.permissions].sort()).toEqual(
      [...buildAuthorization([UserRoleEnum.OFFICER]).permissions].sort(),
    );
  });

  it("16) VERIFIER ได้เฉพาะ verification.view — การยกเลิก scope ไม่เพิ่ม permission", () => {
    expect(buildAuthorization([UserRoleEnum.VERIFIER]).permissions).toEqual([
      PERMISSIONS.VERIFICATION_VIEW,
    ]);
  });
});

describe("บทบาทเดิมถูกเลิกใช้ในชั้นแอปพลิเคชัน", () => {
  it("5) COORDINATOR ไม่อยู่ในรายการที่มอบหมายได้", () => {
    expect(ACTIVE_ROLES).not.toContain(UserRoleEnum.COORDINATOR);
    expect(RESERVED_ROLES).not.toContain(UserRoleEnum.COORDINATOR);
    expect(isLegacyRole(UserRoleEnum.COORDINATOR)).toBe(true);
  });

  it("6) VERIFIER ไม่อยู่ในรายการที่มอบหมายได้", () => {
    expect(ACTIVE_ROLES).not.toContain(UserRoleEnum.VERIFIER);
    expect(RESERVED_ROLES).not.toContain(UserRoleEnum.VERIFIER);
    expect(isLegacyRole(UserRoleEnum.VERIFIER)).toBe(true);
  });

  it("Role ที่ใช้งานจริง = ADMIN / EXECUTIVE / OFFICER / DATA_ENTRY", () => {
    expect([...ACTIVE_ROLES].sort()).toEqual(
      [
        UserRoleEnum.ADMIN,
        UserRoleEnum.EXECUTIVE,
        UserRoleEnum.OFFICER,
        UserRoleEnum.DATA_ENTRY,
      ].sort(),
    );
  });

  it("1) FIELD_SURVEYOR ไม่อยู่ในรายการที่มอบหมายได้ (Owner Decision #R6-E)", () => {
    expect(isLegacyRole(UserRoleEnum.FIELD_SURVEYOR)).toBe(true);
    expect(ACTIVE_ROLES).not.toContain(UserRoleEnum.FIELD_SURVEYOR);
    // ห้ามอยู่กลุ่ม "ยังไม่มีโมดูลรองรับ" เพราะสื่อว่าอนาคตอาจเปิดกลับ
    expect(RESERVED_ROLES).not.toContain(UserRoleEnum.FIELD_SURVEYOR);
  });

  it("12) FIELD_SURVEYOR ให้ Permission เป็นศูนย์", () => {
    expect(ROLE_PERMISSIONS[UserRoleEnum.FIELD_SURVEYOR]).toEqual([]);
    const authz = buildAuthorization([UserRoleEnum.FIELD_SURVEYOR]);
    expect(authz.permissions).toEqual([]);
    expect(visibleNavItems(authz.permissions)).toEqual([]);
  });

  it("13) [FIELD_SURVEYOR, DATA_ENTRY] ได้สิทธิ์จาก DATA_ENTRY เท่านั้น", () => {
    const combined = buildAuthorization([
      UserRoleEnum.FIELD_SURVEYOR,
      UserRoleEnum.DATA_ENTRY,
    ]);
    const dataEntryOnly = buildAuthorization([UserRoleEnum.DATA_ENTRY]);
    expect([...combined.permissions].sort()).toEqual(
      [...dataEntryOnly.permissions].sort(),
    );
  });

  it("4) คำขอสมัครไม่รับ FIELD_SURVEYOR", () => {
    expect(REQUESTABLE_ROLES as readonly UserRoleEnum[]).not.toContain(
      UserRoleEnum.FIELD_SURVEYOR,
    );
  });

  it("บทบาทสำรอง VOLUNTEER / RESEARCHER ยังไม่ถูกเปิดใช้งานใน commit นี้", () => {
    expect([...RESERVED_ROLES].sort()).toEqual(
      [UserRoleEnum.VOLUNTEER, UserRoleEnum.RESEARCHER].sort(),
    );
    expect(ACTIVE_ROLES).not.toContain(UserRoleEnum.VOLUNTEER);
    expect(ACTIVE_ROLES).not.toContain(UserRoleEnum.RESEARCHER);
  });

  it("ทุก role ในเอนัมยังต้องมีป้ายและคำอธิบาย — บัญชีเก่าต้องแสดงผลได้", () => {
    for (const role of Object.values(UserRoleEnum)) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_HINTS[role]).toBeTruthy();
    }
    // จัดกลุ่มครบ ไม่ทับกัน
    const grouped = [...ACTIVE_ROLES, ...RESERVED_ROLES, ...LEGACY_ROLES];
    expect(grouped.length).toBe(new Set(grouped).size);
    expect([...grouped].sort()).toEqual([...Object.values(UserRoleEnum)].sort());
    expect([...ROLE_DISPLAY_ORDER].sort()).toEqual([...grouped].sort());
  });

  it("บทบาทเดิมทุกตัวต้องระบุปลายทางได้ (ฐานของ Data Migration)", () => {
    for (const role of LEGACY_ROLES) {
      // null = ไม่มีบทบาททดแทน (FIELD_SURVEYOR) — ต้องเป็นค่าที่ "ตั้งใจระบุ" ไม่ใช่ค่าที่ลืมใส่
      expect(role in LEGACY_ROLE_REPLACEMENT).toBe(true);
    }
    expect(LEGACY_ROLE_REPLACEMENT[UserRoleEnum.COORDINATOR]).toBe(UserRoleEnum.OFFICER);
    expect(LEGACY_ROLE_REPLACEMENT[UserRoleEnum.VERIFIER]).toBe(UserRoleEnum.OFFICER);
    // ห้ามเดาบทบาททดแทนให้ผู้สำรวจ — ไม่มีข้อมูลว่าควรได้สิทธิ์ใด
    expect(LEGACY_ROLE_REPLACEMENT[UserRoleEnum.FIELD_SURVEYOR]).toBeNull();
  });

  it("8-9) คำขอสมัครไม่รับ COORDINATOR และ VERIFIER", () => {
    const requestable = REQUESTABLE_ROLES as readonly UserRoleEnum[];
    expect(requestable).not.toContain(UserRoleEnum.COORDINATOR);
    expect(requestable).not.toContain(UserRoleEnum.VERIFIER);
    // และต้องไม่มี legacy role ใดหลุดเข้ามาในอนาคต
    for (const role of LEGACY_ROLES) {
      expect(requestable).not.toContain(role);
    }
  });
});

describe("10) Navigation ของ OFFICER หลังยุบบทบาท", () => {
  const { permissions } = buildAuthorization([UserRoleEnum.OFFICER]);
  const hrefs = visibleNavItems(permissions).map((i) => i.href);

  it("เห็นเมนูที่รวมงานของ COORDINATOR และ VERIFIER ไว้ด้วยกัน", () => {
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/communities"); // เดิมของ COORDINATOR
    expect(hrefs).toContain("/verification"); // เดิมของ VERIFIER
  });

  it("ไม่เห็นเมนูจัดการผู้ใช้ (ยังเป็นของ ADMIN เท่านั้น)", () => {
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/admin/registrations");
  });

  it("เมนูทุกตัวตัดสินด้วย permission ไม่ใช่ชื่อ Role", () => {
    for (const item of NAV_ITEMS) {
      expect(item.permission).toBeTruthy();
    }
  });

  it("OFFICER เห็นเมนูครอบคลุมของ COORDINATOR รวมกับ VERIFIER เสมอ", () => {
    const coordinatorHrefs = visibleNavItems(
      ROLE_PERMISSIONS[UserRoleEnum.COORDINATOR],
    ).map((i) => i.href);
    const verifierHrefs = visibleNavItems(
      ROLE_PERMISSIONS[UserRoleEnum.VERIFIER],
    ).map((i) => i.href);
    for (const href of [...coordinatorHrefs, ...verifierHrefs]) {
      expect(hrefs).toContain(href);
    }
  });
});
