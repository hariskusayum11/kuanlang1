import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { listCommunities, updatePopulation } from "../../lib/community/core";

// Integration — Community management: ตั้ง totalHouseholds + RBAC/scope/audit
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();
const C1 = "TCM1";
const C2 = "TCM2";
const EMAILS = {
  officer: "test-cm-officer@test.invalid",
  exec: "test-cm-exec@test.invalid",
} as const;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [C1, C2] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: Community management", () => {
  let ctxOfficer: AuthorizationContext;
  let ctxExec: AuthorizationContext;
  let officerId = "";
  let c1Id = "";
  let c2Id = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const c1 = await prisma.community.create({ data: { code: C1, nameTh: "ชุมชนจัดการ 1" } });
    const c2 = await prisma.community.create({ data: { code: C2, nameTh: "ชุมชนจัดการ 2" } });
    c1Id = c1.id;
    c2Id = c2.id;

    const officer = await prisma.user.create({
      data: { email: EMAILS.officer, name: "CM Officer" },
    });
    officerId = officer.id;
    await prisma.userRole.create({
      data: { userId: officer.id, role: UserRoleEnum.OFFICER, isActive: true },
    });
    await prisma.userCommunityScope.create({ data: { userId: officer.id, communityId: c1.id } });

    // EXECUTIVE = global scope, มี COMMUNITY_VIEW แต่ไม่มี COMMUNITY_MANAGE
    const exec = await prisma.user.create({ data: { email: EMAILS.exec, name: "CM Exec" } });
    await prisma.userRole.create({
      data: { userId: exec.id, role: UserRoleEnum.EXECUTIVE, isActive: true },
    });

    const load = (u: { id: string; name: string; email: string }) =>
      loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    ctxOfficer = await load(officer);
    ctxExec = await load(exec);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("OFFICER ตั้ง totalHouseholds/target + Audit UPDATE (บันทึกค่า old→new)", async () => {
    const result = await updatePopulation(ctxOfficer, c1Id, {
      totalHouseholds: 120,
      targetCoveragePercent: 65,
      dataSource: "ทะเบียนราษฎร์ 2567",
    });
    expect(result).toEqual({ ok: true });

    const c = await prisma.community.findUniqueOrThrow({ where: { id: c1Id } });
    expect(c.totalHouseholds).toBe(120);
    expect(c.targetCoveragePercent).toBe(65);
    expect(c.populationDataSource).toBe("ทะเบียนราษฎร์ 2567");
    expect(c.populationUpdatedById).toBe(officerId);
    expect(c.lastPopulationUpdatedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE", entityType: "Community", entityId: c1Id },
    });
    expect(audit).not.toBeNull();
  });

  it("ค่าไม่ถูกต้อง (total = 0) → INVALID", async () => {
    const r = await updatePopulation(ctxOfficer, c1Id, {
      totalHouseholds: 0,
      targetCoveragePercent: 60,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID");
  });

  it("EXECUTIVE (ดูได้ แต่ไม่มีสิทธิ์แก้) → NOT_ALLOWED", async () => {
    expect(
      await updatePopulation(ctxExec, c1Id, { totalHouseholds: 999, targetCoveragePercent: 60 }),
    ).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });

  it("OFFICER แก้ชุมชนใดก็ได้ — Community Scope ถูกยกเลิก (#R7-B)", async () => {
    expect(
      await updatePopulation(ctxOfficer, c2Id, { totalHouseholds: 100, targetCoveragePercent: 60 }),
    ).toEqual({ ok: true });
  });

  it("listCommunities: ทุกบทบาทเห็นทุกชุมชน (#R7-B) · ยังบังคับ permission ตามเดิม", async () => {
    const officerList = await listCommunities(ctxOfficer);
    expect(officerList.allowed).toBe(true);
    const officerIds = officerList.communities.map((c) => c.id);
    expect(officerIds).toContain(c1Id);
    expect(officerIds).toContain(c2Id);

    const execList = await listCommunities(ctxExec);
    const ids = execList.communities.map((c) => c.id);
    expect(ids).toContain(c1Id);
    expect(ids).toContain(c2Id);
  });
});
