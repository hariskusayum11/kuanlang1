// Data Migration — ย้ายบทบาทเดิมเข้า OFFICER (Owner Decision 2026-07-31 #R6-D)
// ---------------------------------------------------------------------------
//   COORDINATOR → OFFICER
//   VERIFIER    → OFFICER + hasGlobalCommunityScope = true
//
// ทำไมเป็นสคริปต์ ไม่ใช่ Prisma migration.sql:
//   นี่คือ Data Migration ไม่ใช่ DDL — เขียนเป็นฟังก์ชันทำให้ **ทดสอบตรรกะการแปลง
//   ได้จริงกับ PostgreSQL** ด้วยข้อมูลจำลองหลายรูปแบบ (หลายบทบาท / มี OFFICER อยู่แล้ว /
//   ธง global เดิมเป็น true) ซึ่ง .sql ในโฟลเดอร์ migrations ทดสอบแบบนั้นไม่ได้
//   และ **ห้ามทำใน seed** เพราะ Production ไม่ได้รัน seed
//
// รันได้ทุก environment:  node --env-file=.env --import tsx scripts/migrate-legacy-roles.ts
// ดูผลก่อนเขียนจริง:      ... scripts/migrate-legacy-roles.ts --dry-run

import { PrismaClient, UserRoleEnum, type Prisma } from "@prisma/client";

const LEGACY_ROLES = [UserRoleEnum.COORDINATOR, UserRoleEnum.VERIFIER] as const;

export interface MigrationCounts {
  /** บัญชีที่มีบทบาทเดิมที่ยังใช้งานอยู่ (ก่อนย้าย) */
  legacyUsers: number;
  usersWithCoordinator: number;
  usersWithVerifier: number;
  /** บัญชีที่ได้ OFFICER เพิ่มจริง (ที่มีอยู่แล้วไม่นับ) */
  officerRolesGranted: number;
  /** บัญชีที่มี OFFICER อยู่ก่อนแล้ว — ไม่สร้างซ้ำ */
  officerAlreadyPresent: number;
  /** บัญชีที่ถูกตั้งธง global (ที่เป็น true อยู่แล้วไม่นับ) */
  globalScopeGranted: number;
  /** แถวบทบาทเดิมที่ถูกปิดใช้งาน */
  legacyRolesDeactivated: number;
}

export interface MigrationResult extends MigrationCounts {
  dryRun: boolean;
  /** true = ไม่มีอะไรให้ย้าย (รันซ้ำแล้วผลเท่าเดิม) */
  noop: boolean;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** อ่านสภาพก่อนย้าย — ใช้ทั้งตอน dry-run และตอนรันจริง */
async function planMigration(tx: Db) {
  const activeLegacy = await tx.userRole.findMany({
    where: { role: { in: [...LEGACY_ROLES] }, isActive: true },
    select: { userId: true, role: true },
  });

  const coordinators = new Set(
    activeLegacy.filter((r) => r.role === UserRoleEnum.COORDINATOR).map((r) => r.userId),
  );
  const verifiers = new Set(
    activeLegacy.filter((r) => r.role === UserRoleEnum.VERIFIER).map((r) => r.userId),
  );
  const legacyUserIds = [...new Set([...coordinators, ...verifiers])];

  // บัญชีที่มี OFFICER อยู่แล้ว — ต้องไม่สร้างแถวซ้ำ (@@unique([userId, role]) กันได้
  // แต่การนับต้องตรงกับความจริง ไม่ใช่รายงานว่า "เพิ่ม" ทั้งที่ไม่ได้เพิ่ม)
  const existingOfficer = new Set(
    (
      await tx.userRole.findMany({
        where: { userId: { in: legacyUserIds }, role: UserRoleEnum.OFFICER, isActive: true },
        select: { userId: true },
      })
    ).map((r) => r.userId),
  );

  // VERIFIER ที่ธง global ยังเป็น false — เฉพาะกลุ่มนี้ที่ต้องเปลี่ยน
  const verifiersNeedingGlobal = (
    await tx.user.findMany({
      where: { id: { in: [...verifiers] }, hasGlobalCommunityScope: false },
      select: { id: true },
    })
  ).map((u) => u.id);

  return {
    coordinators,
    verifiers,
    legacyUserIds,
    existingOfficer,
    verifiersNeedingGlobal,
    activeLegacyRowCount: activeLegacy.length,
  };
}

/**
 * ย้ายบทบาทเดิมทั้งหมดเข้า OFFICER
 *
 * คุณสมบัติที่ต้องรักษา:
 *  - **Transaction เดียว** — ถ้าล้มกลางทาง ต้องไม่เหลือสภาพครึ่ง ๆ กลาง ๆ เช่น
 *    ปิด VERIFIER ไปแล้วแต่ยังไม่ได้ตั้งธง global (ผู้ใช้จะเสียขอบเขตการมองเห็นทันที)
 *  - **Idempotent** — รันซ้ำได้ ผลไม่เปลี่ยน เพราะทุกขั้นกรองด้วย `isActive: true`
 *    และใช้ upsert ที่ `@@unique([userId, role])` จึงไม่มีทางเกิด Role ซ้ำ
 *  - **ไม่แตะบทบาทอื่น** — FIELD_SURVEYOR / VOLUNTEER / RESEARCHER / DATA_ENTRY /
 *    EXECUTIVE / ADMIN คงเดิมทุกแถว
 *  - **ไม่แตะ Community Scope** — COORDINATOR เดิมยังผูกชุมชนเท่าเดิม
 *    ส่วน VERIFIER ได้ธง global เพิ่ม แต่ scope เดิมไม่ถูกลบ
 *
 * ลำดับสำคัญ: ตั้งธง global **ก่อน** ปิด VERIFIER เสมอ — เรียงกลับกันไม่ได้
 * แม้อยู่ใน transaction เดียวกัน เพราะการอ่านว่า "ใครเป็น VERIFIER" ต้องเกิดก่อนปิด
 */
export async function migrateLegacyRoles(
  client: PrismaClient,
  options: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const dryRun = options.dryRun === true;

  return client.$transaction(async (tx) => {
    const plan = await planMigration(tx);

    const officerToGrant = plan.legacyUserIds.filter(
      (id) => !plan.existingOfficer.has(id),
    );

    const counts: MigrationCounts = {
      legacyUsers: plan.legacyUserIds.length,
      usersWithCoordinator: plan.coordinators.size,
      usersWithVerifier: plan.verifiers.size,
      officerRolesGranted: officerToGrant.length,
      officerAlreadyPresent: plan.existingOfficer.size,
      globalScopeGranted: plan.verifiersNeedingGlobal.length,
      legacyRolesDeactivated: plan.activeLegacyRowCount,
    };

    if (dryRun || plan.legacyUserIds.length === 0) {
      return { ...counts, dryRun, noop: plan.legacyUserIds.length === 0 };
    }

    // 1) VERIFIER → ธง global (ต้องทำก่อนปิดบทบาท มิฉะนั้นหาไม่เจอว่าใครเป็น VERIFIER)
    if (plan.verifiersNeedingGlobal.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: plan.verifiersNeedingGlobal } },
        data: { hasGlobalCommunityScope: true },
      });
    }

    // 2) มอบ OFFICER — upsert กัน Role ซ้ำ และปลุกแถวที่เคยถูกปิดไว้กลับมา
    for (const userId of plan.legacyUserIds) {
      await tx.userRole.upsert({
        where: { userId_role: { userId, role: UserRoleEnum.OFFICER } },
        create: { userId, role: UserRoleEnum.OFFICER },
        update: { isActive: true },
      });
    }

    // 3) ปิดบทบาทเดิม — ไม่ลบแถวทิ้ง เพราะแถวที่ปิดไว้คือหลักฐานว่า "ใครเคยเป็นอะไร"
    //    ซึ่งเป็นสิ่งเดียวที่ทำให้ย้อนกลับด้วยมือได้ (ดู Rollback ในเอกสาร)
    await tx.userRole.updateMany({
      where: { role: { in: [...LEGACY_ROLES] }, isActive: true },
      data: { isActive: false },
    });

    return { ...counts, dryRun: false, noop: false };
  });
}

/** ยืนยันหลังย้าย — ต้องไม่เหลือบทบาทเดิมที่ยังใช้งานอยู่ */
export async function verifyMigration(client: Db): Promise<{
  activeCoordinator: number;
  activeVerifier: number;
  ok: boolean;
}> {
  const activeCoordinator = await client.userRole.count({
    where: { role: UserRoleEnum.COORDINATOR, isActive: true },
  });
  const activeVerifier = await client.userRole.count({
    where: { role: UserRoleEnum.VERIFIER, isActive: true },
  });
  return {
    activeCoordinator,
    activeVerifier,
    ok: activeCoordinator === 0 && activeVerifier === 0,
  };
}
