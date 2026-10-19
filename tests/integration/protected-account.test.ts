import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuditAction, PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  deleteUser,
  setProtectedAccount,
  setUserActive,
  setUserCommunities,
  setUserGlobalScope,
  setUserRoles,
} from "../../lib/admin/users";
import { resetUserPassword } from "../../lib/admin/user-password";
import {
  PROTECTED_ACTIONS,
  type ProtectedAction,
} from "../../domain/admin/protected-account";

// Integration tests — บัญชีคุ้มครอง (Owner Decision 2026-10-17)
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (test-prot-*@test.invalid) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  /** บัญชีคุ้มครอง — เป้าหมายที่ต้องแตะไม่ได้ */
  guarded: "test-prot-guarded@test.invalid",
  /** บัญชีคุ้มครองอีกคน — ใช้ยืนยันว่าจัดการกันเองได้ */
  peer: "test-prot-peer@test.invalid",
  /** ADMIN ธรรมดา — ต้องถูกปฏิเสธทุกการกระทำกับ guarded */
  plainAdmin: "test-prot-plain@test.invalid",
  /** เป้าหมายธรรมดา — ใช้ยืนยันว่า ADMIN ธรรมดายังทำงานได้ตามปกติ */
  ordinary: "test-prot-ordinary@test.invalid",
} as const;

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
}

async function makeAdmin(email: string, name: string, isProtectedAccount = false) {
  const user = await prisma.user.create({
    data: { email, name, isActive: true, isProtectedAccount },
  });
  await prisma.userRole.create({
    data: { userId: user.id, role: UserRoleEnum.ADMIN, isActive: true },
  });
  return user;
}

describe.skipIf(!isLocalDevDb)("Integration: บัญชีคุ้มครอง", () => {
  let plainCtx: AuthorizationContext;
  let peerCtx: AuthorizationContext;
  let guardedId: string;
  let ordinaryId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    const guarded = await makeAdmin(EMAILS.guarded, "Protected Guarded", true);
    guardedId = guarded.id;

    const peer = await makeAdmin(EMAILS.peer, "Protected Peer", true);
    peerCtx = await loadContextOrThrow({ id: peer.id, name: peer.name, email: peer.email });

    const plain = await makeAdmin(EMAILS.plainAdmin, "Plain Admin");
    plainCtx = await loadContextOrThrow({ id: plain.id, name: plain.name, email: plain.email });

    const ordinary = await makeAdmin(EMAILS.ordinary, "Ordinary Target");
    ordinaryId = ordinary.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  describe("ADMIN ธรรมดาแตะบัญชีคุ้มครองไม่ได้ — ครบทุกการกระทำ", () => {
    // ตารางนี้ผูกกับ PROTECTED_ACTIONS โดยตรง — เพิ่มการกระทำใหม่ใน domain
    // แล้วไม่มาเพิ่มที่นี่ เทสต์ "ครอบคลุมครบ" ด้านล่างจะฟ้องทันที
    //
    // reason ต่างกันได้ตามด่านที่ดักก่อน แต่ invariant ที่ต้องจริงเสมอคือ "ถูกปฏิเสธ":
    //  - reset-password ถูกดักตั้งแต่ด่านแรก เพราะ ADMIN ทั่วไปตั้งรหัสให้ "ใครก็ตาม"
    //    ไม่ได้อยู่แล้ว (Owner Decision 2026-10-18) จึงได้ NOT_ALLOWED ไม่ถึงด่านคุ้มครอง
    //  - ที่เหลือ ADMIN ทั่วไปทำกับบัญชีทั่วไปได้ จึงต้องถูกดักด้วย PROTECTED_ACCOUNT
    const cases: Record<
      ProtectedAction,
      { run: () => Promise<{ ok: boolean; reason?: string }>; expected: string }
    > = {
      "delete-user": { run: () => deleteUser(plainCtx, guardedId), expected: "PROTECTED_ACCOUNT" },
      "set-active": { run: () => setUserActive(plainCtx, guardedId, false), expected: "PROTECTED_ACCOUNT" },
      "set-roles": { run: () => setUserRoles(plainCtx, guardedId, [UserRoleEnum.VOLUNTEER]), expected: "PROTECTED_ACCOUNT" },
      "reset-password": { run: () => resetUserPassword(plainCtx, guardedId), expected: "NOT_ALLOWED" },
      "set-global-scope": { run: () => setUserGlobalScope(plainCtx, guardedId, true), expected: "PROTECTED_ACCOUNT" },
      "set-communities": { run: () => setUserCommunities(plainCtx, guardedId, []), expected: "PROTECTED_ACCOUNT" },
    };

    it("รายการเคสครอบคลุมทุกค่าใน PROTECTED_ACTIONS (กันลืมใส่ guard ในอนาคต)", () => {
      expect(Object.keys(cases).sort()).toEqual([...PROTECTED_ACTIONS].sort());
    });

    for (const action of PROTECTED_ACTIONS) {
      it(`${action} → ถูกปฏิเสธ (${cases[action].expected})`, async () => {
        const result = await cases[action].run();
        expect(result).toMatchObject({ ok: false, reason: cases[action].expected });
      });
    }

    it("บัญชีคุ้มครองไม่ถูกแตะจริง — ยังใช้งานอยู่และยังเป็น ADMIN", async () => {
      const user = await prisma.user.findUnique({
        where: { id: guardedId },
        select: { isActive: true, isProtectedAccount: true },
      });
      expect(user).toMatchObject({ isActive: true, isProtectedAccount: true });
      const roles = await prisma.userRole.findMany({
        where: { userId: guardedId, isActive: true },
        select: { role: true },
      });
      expect(roles.map((r) => r.role)).toContain(UserRoleEnum.ADMIN);
    });

    it("เขียน Audit REJECT ทุกครั้งที่ถูกปฏิเสธ — ต้องรู้ว่ามีคนพยายาม", async () => {
      const attempts = await prisma.auditLog.findMany({
        where: {
          entityId: guardedId,
          action: AuditAction.REJECT,
          reason: "protected-account-blocked",
        },
        select: { userId: true, changes: true },
      });
      for (const a of attempts) expect(a.userId).toBe(plainCtx.userId);
      const blocked = attempts.map((a) => (a.changes as { blocked?: string }).blocked);
      // reset-password ถูกปฏิเสธตั้งแต่ด่านแรก จึงไม่ถึงด่านคุ้มครองและไม่มี REJECT ของตัวเอง
      const reachesProtectedGuard = PROTECTED_ACTIONS.filter((a) => a !== "reset-password");
      expect(attempts.length).toBeGreaterThanOrEqual(reachesProtectedGuard.length);
      for (const action of reachesProtectedGuard) expect(blocked).toContain(action);
    });
  });

  describe("ของเดิมยังทำงานปกติ", () => {
    it("ADMIN ธรรมดาจัดการบัญชีทั่วไปได้ตามเดิม", async () => {
      const result = await setUserGlobalScope(plainCtx, ordinaryId, true);
      expect(result).toMatchObject({ ok: true });
    });

    it("ADMIN ธรรมดาตั้งรหัสผ่านให้ 'บัญชีทั่วไป' ก็ไม่ได้ (Owner Decision 2026-10-18)", async () => {
      expect(await resetUserPassword(plainCtx, ordinaryId)).toEqual({
        ok: false,
        reason: "NOT_ALLOWED",
      });
    });

    it("บัญชีคุ้มครองตั้งรหัสผ่านให้บัญชีทั่วไปได้", async () => {
      const result = await resetUserPassword(peerCtx, ordinaryId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.tempPassword.length).toBeGreaterThan(0);
      const user = await prisma.user.findUnique({
        where: { id: ordinaryId },
        select: { mustChangePassword: true },
      });
      expect(user!.mustChangePassword).toBe(true);
      // คืนสถานะเดิมไม่ให้กระทบเทสต์อื่นในไฟล์นี้
      await prisma.user.update({
        where: { id: ordinaryId },
        data: { mustChangePassword: false },
      });
    });

    it("บัญชีคุ้มครองจัดการบัญชีคุ้มครองด้วยกันได้", async () => {
      const result = await setUserGlobalScope(peerCtx, guardedId, true);
      expect(result).toMatchObject({ ok: true });
      // คืนค่าเดิมไม่ให้กระทบเทสต์อื่น
      await setUserGlobalScope(peerCtx, guardedId, false);
    });
  });

  describe("การตั้ง/ถอดธงคุ้มครอง", () => {
    it("ADMIN ธรรมดาตั้งธงให้ตัวเองไม่ได้ — ช่องโหว่ที่ร้ายแรงที่สุดถ้าพลาด", async () => {
      expect(await setProtectedAccount(plainCtx, plainCtx.userId, true)).toEqual({
        ok: false,
        reason: "NOT_ALLOWED",
      });
      const user = await prisma.user.findUnique({
        where: { id: plainCtx.userId },
        select: { isProtectedAccount: true },
      });
      expect(user!.isProtectedAccount).toBe(false);
    });

    it("ADMIN ธรรมดาตั้งธงให้คนอื่นก็ไม่ได้", async () => {
      expect(await setProtectedAccount(plainCtx, ordinaryId, true)).toEqual({
        ok: false,
        reason: "NOT_ALLOWED",
      });
    });

    it("บัญชีคุ้มครองตั้งธงให้ผู้อื่นได้ + เขียน Audit ค่าก่อน/หลัง", async () => {
      expect(await setProtectedAccount(peerCtx, ordinaryId, true)).toEqual({
        ok: true,
        isProtectedAccount: true,
        changed: true,
      });
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: ordinaryId, reason: "protected-account-granted" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.changes).toMatchObject({
        field: "isProtectedAccount",
        before: false,
        after: true,
      });
    });

    it("ตั้งค่าเดิมซ้ำ → ไม่เปลี่ยนอะไร (changed: false)", async () => {
      expect(await setProtectedAccount(peerCtx, ordinaryId, true)).toEqual({
        ok: true,
        isProtectedAccount: true,
        changed: false,
      });
    });

    it("ถอดธงคืนได้", async () => {
      expect(await setProtectedAccount(peerCtx, ordinaryId, false)).toEqual({
        ok: true,
        isProtectedAccount: false,
        changed: true,
      });
    });

    it("ถอดบัญชีคุ้มครองคนสุดท้ายไม่ได้", async () => {
      // เหลือ guarded กับ peer → ถอด guarded ออกก่อน (ยังเหลือ peer)
      expect(await setProtectedAccount(peerCtx, guardedId, false)).toMatchObject({ ok: true });

      // ตอนนี้ peer อาจไม่ใช่คนสุดท้ายของทั้งระบบ ถ้ามีบัญชีคุ้มครองจริงอยู่แล้ว
      // จึงตรวจเฉพาะเมื่อ peer เป็นคนสุดท้ายจริง ๆ (ไม่ทำให้เทสต์เปราะต่อข้อมูลในเครื่อง)
      const others = await prisma.user.count({
        where: { isProtectedAccount: true, id: { not: peerCtx.userId } },
      });
      if (others === 0) {
        expect(await setProtectedAccount(peerCtx, peerCtx.userId, false)).toEqual({
          ok: false,
          reason: "LAST_PROTECTED_ACCOUNT",
        });
      }

      // คืนสถานะเดิมให้ guarded เพื่อไม่ให้เทสต์อื่นที่รันตามมาเพี้ยน
      await setProtectedAccount(peerCtx, guardedId, true);
    });
  });
});
