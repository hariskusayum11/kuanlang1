/**
 * ตรวจนับบทบาทเดิม (COORDINATOR / VERIFIER) ก่อนและหลัง Data Migration
 *
 * ใช้ก่อนรัน migration เพื่อดู "ของจริงมีเท่าไร" และใช้หลังรันเพื่อยืนยันว่าเหลือศูนย์
 * รันได้ทุก environment:  node --env-file=.env --import tsx scripts/audit-legacy-roles.ts
 *
 * **ห้ามพิมพ์ PII** — รายงานเป็นจำนวนเท่านั้น ไม่มีชื่อ อีเมล เบอร์โทร หรือ userId
 * (ระบบมีข้อมูลส่วนบุคคล/สุขภาพ — output ของสคริปต์อาจถูกแปะลง ticket หรือ log)
 */
import { PrismaClient, UserRoleEnum } from "@prisma/client";

const prisma = new PrismaClient();

const LEGACY = [UserRoleEnum.COORDINATOR, UserRoleEnum.VERIFIER] as const;

export interface LegacyRoleAudit {
  usersWithCoordinator: number;
  usersWithVerifier: number;
  usersWithBothLegacyRoles: number;
  verifierAlreadyGlobal: number;
  verifierNeedingGlobal: number;
  legacyUsersAlreadyOfficer: number;
  /** บัญชีที่มีบทบาทเดิมเป็นบทบาทเดียว — หลังย้ายจะเหลือ OFFICER อย่างเดียว */
  legacyUsersWithNoOtherRole: number;
  communityScopeRowsOfLegacyUsers: number;
  activeLegacyRoleRows: number;
  inactiveLegacyRoleRows: number;
}

export async function auditLegacyRoles(
  client: PrismaClient = prisma,
): Promise<LegacyRoleAudit> {
  const activeLegacy = await client.userRole.findMany({
    where: { role: { in: [...LEGACY] }, isActive: true },
    select: { userId: true, role: true },
  });

  const coordinators = new Set(
    activeLegacy.filter((r) => r.role === UserRoleEnum.COORDINATOR).map((r) => r.userId),
  );
  const verifiers = new Set(
    activeLegacy.filter((r) => r.role === UserRoleEnum.VERIFIER).map((r) => r.userId),
  );
  const legacyUserIds = [...new Set([...coordinators, ...verifiers])];

  const verifierAlreadyGlobal = await client.user.count({
    where: { id: { in: [...verifiers] }, hasGlobalCommunityScope: true },
  });

  const legacyUsersAlreadyOfficer = await client.userRole.count({
    where: { userId: { in: legacyUserIds }, role: UserRoleEnum.OFFICER, isActive: true },
  });

  const roleCounts = await client.userRole.groupBy({
    by: ["userId"],
    where: { userId: { in: legacyUserIds }, isActive: true },
    _count: { _all: true },
  });

  return {
    usersWithCoordinator: coordinators.size,
    usersWithVerifier: verifiers.size,
    usersWithBothLegacyRoles: [...coordinators].filter((id) => verifiers.has(id)).length,
    verifierAlreadyGlobal,
    verifierNeedingGlobal: verifiers.size - verifierAlreadyGlobal,
    legacyUsersAlreadyOfficer,
    legacyUsersWithNoOtherRole: roleCounts.filter((r) => r._count._all === 1).length,
    communityScopeRowsOfLegacyUsers: await client.userCommunityScope.count({
      where: { userId: { in: legacyUserIds } },
    }),
    activeLegacyRoleRows: activeLegacy.length,
    inactiveLegacyRoleRows: await client.userRole.count({
      where: { role: { in: [...LEGACY] }, isActive: false },
    }),
  };
}

async function main() {
  const audit = await auditLegacyRoles();
  console.log(JSON.stringify(audit, null, 2));
  if (audit.activeLegacyRoleRows === 0) {
    console.log("\n✓ ไม่เหลือบทบาทเดิมที่ใช้งานอยู่ — migration ทำงานครบแล้ว");
  } else {
    console.log(
      `\n! ยังเหลือบทบาทเดิมที่ใช้งานอยู่ ${audit.activeLegacyRoleRows} แถว — ต้องรัน migration`,
    );
  }
}

// รันเป็นสคริปต์เท่านั้น (import มาใช้ในเทสต์ได้โดยไม่ยิง console)
if (process.argv[1]?.includes("audit-legacy-roles")) {
  void main().finally(() => prisma.$disconnect());
}
