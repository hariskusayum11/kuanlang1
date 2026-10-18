import { beforeEach, describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import {
  APPROVABLE_ROLES,
  APPROVABLE_ROLE_LABELS,
  REQUESTABLE_ROLES,
  REQUESTABLE_ROLE_LABELS,
  registrationSchema,
} from "../../lib/registration/validation";
import {
  REGISTRATION_RATE_LIMIT,
  consumeRegistrationQuota,
  resetRegistrationQuota,
} from "../../lib/registration/rate-limit";

const VALID_INPUT = {
  email: "somchai@example.com",
  password: "correct-horse-8",
  firstName: "สมชาย",
  lastName: "ใจดี",
  phone: "0812345678",
  requestedRole: UserRoleEnum.DATA_ENTRY,
  communityId: "",
  organization: "เทศบาลเมืองควนลัง",
  note: "",
};

describe("registrationSchema (Zod — ใช้ทั้ง client และ server)", () => {
  it("input ถูกต้องผ่าน และช่องว่าง ('') กลายเป็น undefined", () => {
    const parsed = registrationSchema.parse(VALID_INPUT);
    expect(parsed.email).toBe("somchai@example.com");
    expect(parsed.communityId).toBeUndefined();
    expect(parsed.note).toBeUndefined();
    expect(parsed.organization).toBe("เทศบาลเมืองควนลัง");
  });

  it("บทบาทอำนาจสูงนอก whitelist (เช่น ADMIN/EXECUTIVE) ถูกปฏิเสธ", () => {
    for (const role of [
      UserRoleEnum.ADMIN,
      // Owner Decision 2026-10-18: EXECUTIVE สมัครเองไม่ได้แล้ว — ADMIN เป็นผู้มอบตอนอนุมัติ
      UserRoleEnum.EXECUTIVE,
      UserRoleEnum.VERIFIER,
      UserRoleEnum.COORDINATOR,
      UserRoleEnum.RESEARCHER,
    ]) {
      const result = registrationSchema.safeParse({
        ...VALID_INPUT,
        requestedRole: role,
      });
      expect(result.success).toBe(false);
    }
  });

  it("whitelist = DATA_ENTRY, OFFICER, VOLUNTEER เท่านั้น และมี label ไทยครบ", () => {
    // Owner Decision 2026-10-18: EXECUTIVE ถอดออก (ADMIN มอบตอนอนุมัติ) · เพิ่ม OFFICER
    expect([...REQUESTABLE_ROLES].sort()).toEqual(
      [
        UserRoleEnum.DATA_ENTRY,
        UserRoleEnum.OFFICER,
        UserRoleEnum.VOLUNTEER,
      ].sort(),
    );
    for (const role of REQUESTABLE_ROLES) {
      expect(REQUESTABLE_ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("EXECUTIVE สมัครเองไม่ได้ — ADMIN มอบให้ตอนอนุมัติเท่านั้น", () => {
    expect([...REQUESTABLE_ROLES]).not.toContain(UserRoleEnum.EXECUTIVE);
    // ส่งมาทาง payload ตรง ๆ ก็ต้องถูกปฏิเสธที่ schema ไม่ใช่แค่ซ่อนใน dropdown
    expect(
      registrationSchema.safeParse({
        ...VALID_INPUT,
        requestedRole: UserRoleEnum.EXECUTIVE,
      }).success,
    ).toBe(false);
    // แต่ ADMIN ต้องยังมอบได้ตอนอนุมัติ (และคำขอเก่าที่ยื่นเป็น EXECUTIVE ต้องอนุมัติได้)
    expect([...APPROVABLE_ROLES]).toContain(UserRoleEnum.EXECUTIVE);
  });

  it("ADMIN ไม่อยู่ใน APPROVABLE_ROLES — ต้องมอบจากหน้าจัดการผู้ใช้เท่านั้น", () => {
    expect([...APPROVABLE_ROLES]).not.toContain(UserRoleEnum.ADMIN);
    for (const role of APPROVABLE_ROLES) {
      expect(APPROVABLE_ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("FIELD_SURVEYOR สมัครเองไม่ได้ (Owner Decision 2026-07-26 — ยังไม่มีโมดูลให้ใช้)", () => {
    expect([...REQUESTABLE_ROLES]).not.toContain(UserRoleEnum.FIELD_SURVEYOR);
    // ส่งมาทาง payload ตรง ๆ ก็ต้องถูกปฏิเสธที่ schema ไม่ใช่แค่ซ่อนใน dropdown
    expect(
      registrationSchema.safeParse({
        ...VALID_INPUT,
        requestedRole: UserRoleEnum.FIELD_SURVEYOR,
      }).success,
    ).toBe(false);
  });

  it("รหัสผ่านสั้นกว่า 8 ตัว / อีเมลผิดรูปแบบ / ชื่อสั้นเกิน ถูกปฏิเสธ", () => {
    expect(
      registrationSchema.safeParse({ ...VALID_INPUT, password: "short7!" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...VALID_INPUT, email: "not-an-email" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...VALID_INPUT, firstName: "" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...VALID_INPUT, lastName: "" }).success,
    ).toBe(false);
  });

  it("เบอร์โทรต้องเป็นตัวเลข 10 หลัก — ตัวอักษร/รูปแบบมีขีด/สั้นเกินถูกปฏิเสธ, ค่าว่าง = ไม่กรอก", () => {
    expect(registrationSchema.safeParse({ ...VALID_INPUT, phone: "โทรหาผม" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...VALID_INPUT, phone: "081-234-5678" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...VALID_INPUT, phone: "12345" }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...VALID_INPUT, phone: "0812345678" }).success).toBe(true);
    const parsed = registrationSchema.parse({ ...VALID_INPUT, phone: "  " });
    expect(parsed.phone).toBeUndefined();
  });

  it("communityId ต้องเป็น cuid เมื่อกรอก", () => {
    expect(
      registrationSchema.safeParse({ ...VALID_INPUT, communityId: "1; DROP TABLE" })
        .success,
    ).toBe(false);
  });
});

describe("consumeRegistrationQuota — rate limit ต่อ IP (in-memory)", () => {
  beforeEach(() => resetRegistrationQuota());

  it(`อนุญาต ${REGISTRATION_RATE_LIMIT.max} ครั้งใน window เดียว ครั้งถัดไปถูกปฏิเสธ`, () => {
    const now = 1_000_000;
    for (let i = 0; i < REGISTRATION_RATE_LIMIT.max; i += 1) {
      expect(consumeRegistrationQuota("1.2.3.4", now + i)).toBe(true);
    }
    expect(consumeRegistrationQuota("1.2.3.4", now + 100)).toBe(false);
  });

  it("พ้น window แล้วโควตารีเซ็ต", () => {
    const now = 1_000_000;
    for (let i = 0; i < REGISTRATION_RATE_LIMIT.max; i += 1) {
      consumeRegistrationQuota("1.2.3.4", now);
    }
    expect(consumeRegistrationQuota("1.2.3.4", now)).toBe(false);
    expect(
      consumeRegistrationQuota("1.2.3.4", now + REGISTRATION_RATE_LIMIT.windowMs),
    ).toBe(true);
  });

  it("คนละ key นับแยกกัน", () => {
    const now = 1_000_000;
    for (let i = 0; i < REGISTRATION_RATE_LIMIT.max; i += 1) {
      consumeRegistrationQuota("1.1.1.1", now);
    }
    expect(consumeRegistrationQuota("1.1.1.1", now)).toBe(false);
    expect(consumeRegistrationQuota("2.2.2.2", now)).toBe(true);
  });
});
