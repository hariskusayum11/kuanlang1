import { describe, expect, it } from "vitest";
import {
  PROTECTED_ACTIONS,
  canManageProtectedFlag,
  canResetOthersPassword,
  isBlockedByProtectedAccount,
  isLastProtectedAccount,
} from "../../domain/admin/protected-account";

describe("บัญชีคุ้มครอง — กฎว่าใครแตะบัญชีไหนได้", () => {
  it("เป้าหมายไม่ใช่บัญชีคุ้มครอง → กฎนี้ไม่เกี่ยว ปล่อยให้ guard เดิมตัดสิน", () => {
    expect(
      isBlockedByProtectedAccount({
        actorIsProtected: false,
        targetIsProtected: false,
        isSelf: false,
      }),
    ).toBe(false);
  });

  it("ADMIN ธรรมดาแตะบัญชีคุ้มครองไม่ได้", () => {
    expect(
      isBlockedByProtectedAccount({
        actorIsProtected: false,
        targetIsProtected: true,
        isSelf: false,
      }),
    ).toBe(true);
  });

  it("บัญชีคุ้มครองจัดการกันเองได้ (Owner Decision 2026-10-17)", () => {
    expect(
      isBlockedByProtectedAccount({
        actorIsProtected: true,
        targetIsProtected: true,
        isSelf: false,
      }),
    ).toBe(false);
  });

  it("ทำกับบัญชีตัวเอง → กฎนี้ไม่บล็อก (กฎ SELF_* จัดการแยก)", () => {
    // ถ้าบล็อกที่นี่ด้วย บัญชีคุ้มครองจะถอดธงของตัวเองไม่ได้ตลอดกาล
    expect(
      isBlockedByProtectedAccount({
        actorIsProtected: false,
        targetIsProtected: true,
        isSelf: true,
      }),
    ).toBe(false);
  });
});

describe("บัญชีคุ้มครอง — สิทธิ์ตั้ง/ถอดธง", () => {
  it("เฉพาะบัญชีคุ้มครองเท่านั้นที่ตั้งธงให้ผู้อื่นได้", () => {
    expect(canManageProtectedFlag(true)).toBe(true);
    // มิฉะนั้น ADMIN ธรรมดาจะแต่งตั้งตัวเองแล้วเดินผ่านกฎทั้งหมดในคลิกเดียว
    expect(canManageProtectedFlag(false)).toBe(false);
  });

  it("ถอดบัญชีคุ้มครองคนสุดท้ายไม่ได้", () => {
    expect(isLastProtectedAccount({ otherProtectedCount: 0, nextValue: false })).toBe(true);
    expect(isLastProtectedAccount({ otherProtectedCount: 1, nextValue: false })).toBe(false);
  });

  it("การ \"ตั้ง\" ธงไม่เคยทำให้เหลือศูนย์", () => {
    expect(isLastProtectedAccount({ otherProtectedCount: 0, nextValue: true })).toBe(false);
  });
});

describe("สิทธิ์ตั้งรหัสผ่านให้ผู้อื่น", () => {
  it("ต้องครบทั้ง permission และเป็นบัญชีคุ้มครอง", () => {
    expect(
      canResetOthersPassword({ hasPasswordResetPermission: true, actorIsProtected: true }),
    ).toBe(true);
    // ADMIN ทั่วไป: มี permission แต่ไม่ใช่บัญชีคุ้มครอง → ทำไม่ได้
    expect(
      canResetOthersPassword({ hasPasswordResetPermission: true, actorIsProtected: false }),
    ).toBe(false);
    // บัญชีคุ้มครองที่ถูกถอด permission ก็ทำไม่ได้ — ธงไม่ใช่สิทธิ์ในตัวเอง
    expect(
      canResetOthersPassword({ hasPasswordResetPermission: false, actorIsProtected: true }),
    ).toBe(false);
    expect(
      canResetOthersPassword({ hasPasswordResetPermission: false, actorIsProtected: false }),
    ).toBe(false);
  });
});

describe("รายการการกระทำที่ต้องถูกคุ้มครอง", () => {
  it("ครบทั้ง 5 อย่างและไม่มีรายการซ้ำ", () => {
    // รายการนี้เป็นสัญญาที่ integration test ยึดไว้ — เพิ่มการกระทำทำลายล้างใหม่
    // ต้องมาเพิ่มที่นี่ มิฉะนั้นจะไม่มีเทสต์ยืนยันว่า guard ถูกใส่จริง
    expect([...PROTECTED_ACTIONS].sort()).toEqual([
      "delete-user",
      "reset-password",
      "set-active",
      "set-global-scope",
      "set-roles",
    ]);
    expect(new Set(PROTECTED_ACTIONS).size).toBe(PROTECTED_ACTIONS.length);
  });
});
