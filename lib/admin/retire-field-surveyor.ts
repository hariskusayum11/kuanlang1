// Data Migration — เลิกใช้บทบาท FIELD_SURVEYOR ในชั้นแอปพลิเคชัน (Owner Decision #R6-E)
// ---------------------------------------------------------------------------
// ผู้สำรวจภาคสนาม **ไม่ใช่บัญชีผู้ใช้ระบบ** อีกต่อไป — เป็นข้อมูลประกอบของแบบสอบถาม
// (ชื่อ/เบอร์จากกระดาษ) จึงไม่ต้องมี User Account และห้ามใช้ตัดสิน Authorization
//
// **ไม่มีบทบาททดแทน** — ต่างจาก COORDINATOR/VERIFIER ที่ยุบเข้า OFFICER
// เพราะไม่มีข้อมูลใดบอกได้ว่าเจ้าของบัญชีควรได้สิทธิ์อะไร การเดาให้ = แจกสิทธิ์เกินจริง
//
// รัน:  node --env-file=.env --import tsx scripts/retire-field-surveyor.ts [--dry-run]

import {
  AuditAction,
  PrismaClient,
  RegistrationRequestStatus,
  UserRoleEnum,
  type Prisma,
} from "@prisma/client";

/** ระบุใน Audit ว่าใครเป็นผู้กระทำ เมื่อผู้กระทำคือ migration ไม่ใช่คน */
export const RETIRE_FIELD_SURVEYOR_MIGRATION_ID = "migration:retire-field-surveyor";

const REJECT_REASON =
  "บทบาทผู้สำรวจภาคสนามถูกยกเลิก — ปัจจุบันบันทึกผู้สำรวจเป็นข้อมูลในแบบสอบถาม ไม่ต้องมีบัญชีผู้ใช้";

export interface RetireCounts {
  /** แถว UserRole ที่ยังใช้งานอยู่ (ก่อนปิด) */
  activeUserRoles: number;
  usersWithOnlyFieldSurveyor: number;
  usersWithOtherRolesToo: number;
  /** คำขอ PENDING ที่ถูกเปลี่ยนเป็น REJECTED */
  pendingRequestsRejected: number;
  /** คำขอ APPROVED — **ไม่แตะ** รายงานไว้ให้ตรวจด้วยตา */
  approvedRequestsUntouched: number;
  /** คำขอที่ REJECTED/CANCELLED อยู่แล้ว — ไม่เปลี่ยนซ้ำ */
  alreadyClosedRequests: number;
  auditLogsWritten: number;
}

export interface RetireResult extends RetireCounts {
  dryRun: boolean;
  noop: boolean;
}

type Db = PrismaClient | Prisma.TransactionClient;

async function plan(tx: Db) {
  const activeRoles = await tx.userRole.findMany({
    where: { role: UserRoleEnum.FIELD_SURVEYOR, isActive: true },
    select: { userId: true },
  });
  const userIds = activeRoles.map((r) => r.userId);

  const roleCounts = await tx.userRole.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, isActive: true },
    _count: { _all: true },
  });

  const pendingRequests = await tx.registrationRequest.findMany({
    where: {
      requestedRole: UserRoleEnum.FIELD_SURVEYOR,
      status: RegistrationRequestStatus.PENDING,
    },
    select: { id: true },
  });

  const countRequests = (status: RegistrationRequestStatus) =>
    tx.registrationRequest.count({
      where: { requestedRole: UserRoleEnum.FIELD_SURVEYOR, status },
    });

  return {
    activeRoleCount: activeRoles.length,
    onlyFieldSurveyor: roleCounts.filter((r) => r._count._all === 1).length,
    withOtherRoles: roleCounts.filter((r) => r._count._all > 1).length,
    pendingRequestIds: pendingRequests.map((r) => r.id),
    approvedCount: await countRequests(RegistrationRequestStatus.APPROVED),
    alreadyClosed:
      (await countRequests(RegistrationRequestStatus.REJECTED)) +
      (await countRequests(RegistrationRequestStatus.CANCELLED)),
  };
}

/**
 * ปิดบทบาท FIELD_SURVEYOR และปิดคำขอสมัครที่ยังค้าง
 *
 * สิ่งที่ทำ:
 *  1. ปิดแถว UserRole ที่ยังใช้งานอยู่ (`isActive=false`) — **ไม่ลบทิ้ง** เก็บเป็นประวัติ
 *  2. เปลี่ยนคำขอ **PENDING → REJECTED** พร้อมเหตุผลและ Audit Log
 *
 * สิ่งที่ **ไม่** ทำโดยเจตนา:
 *  - ไม่เพิ่มบทบาททดแทนให้ใคร (ไม่มีข้อมูลสนับสนุนว่าควรได้สิทธิ์ใด)
 *  - ไม่แตะ `User.isActive` — บัญชีอาจมีบทบาทอื่นที่ยังใช้งานอยู่
 *    ถ้าไม่เหลือบทบาทอื่นเลย บัญชีนั้นจะใช้งานภายในไม่ได้เองอยู่แล้ว (permission = ศูนย์)
 *  - **ไม่แตะคำขอที่ APPROVED** — การเขียนทับเป็น REJECTED คือการทำลายประวัติ
 *    (คำขอนั้น "ถูกอนุมัติจริงในเวลานั้น") การเลิกใช้บทบาทแสดงผ่านการปิด UserRole แทน
 *
 * Transaction เดียว + Idempotent: ทุกขั้นกรองด้วย `isActive: true` / `status: PENDING`
 * รันซ้ำจึงไม่มีอะไรให้ทำและไม่เขียน Audit ซ้ำ
 */
export async function retireFieldSurveyor(
  client: PrismaClient,
  options: { dryRun?: boolean; actorUserId?: string | null } = {},
): Promise<RetireResult> {
  const dryRun = options.dryRun === true;

  return client.$transaction(async (tx) => {
    const p = await plan(tx);
    const nothingToDo = p.activeRoleCount === 0 && p.pendingRequestIds.length === 0;

    const counts: RetireCounts = {
      activeUserRoles: p.activeRoleCount,
      usersWithOnlyFieldSurveyor: p.onlyFieldSurveyor,
      usersWithOtherRolesToo: p.withOtherRoles,
      pendingRequestsRejected: p.pendingRequestIds.length,
      approvedRequestsUntouched: p.approvedCount,
      alreadyClosedRequests: p.alreadyClosed,
      auditLogsWritten: 0,
    };

    if (dryRun || nothingToDo) {
      return { ...counts, dryRun, noop: nothingToDo };
    }

    // 1) ปิดบทบาท — บทบาทอื่นของผู้ใช้ไม่ถูกแตะ เพราะกรองด้วย role ตรง ๆ
    await tx.userRole.updateMany({
      where: { role: UserRoleEnum.FIELD_SURVEYOR, isActive: true },
      data: { isActive: false },
    });

    // 2) ปิดคำขอที่ยังค้าง — เขียน Audit **ในทรานแซกชันเดียวกัน**
    //    (ไม่ใช้ writeAuditLog ซึ่งเป็น best-effort นอกทรานแซกชัน — ที่นี่ต้องการให้
    //     ร่องรอยกับการเปลี่ยนสถานะเกิดหรือหายไปพร้อมกัน ไม่มีอย่างใดอย่างหนึ่งค้าง)
    let auditLogsWritten = 0;
    for (const requestId of p.pendingRequestIds) {
      await tx.registrationRequest.update({
        where: { id: requestId },
        data: {
          status: RegistrationRequestStatus.REJECTED,
          rejectReason: REJECT_REASON,
          decidedAt: new Date(),
          // decidedById เว้นว่าง = ระบบเป็นผู้ตัดสิน ไม่ใช่แอดมินคนใด
          decidedById: options.actorUserId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: options.actorUserId ?? null, // null = ระบบ (ตามสคีมา AuditLog)
          action: AuditAction.REJECT,
          entityType: "RegistrationRequest",
          entityId: requestId,
          changes: {
            status: { old: RegistrationRequestStatus.PENDING, new: RegistrationRequestStatus.REJECTED },
            requestedRole: UserRoleEnum.FIELD_SURVEYOR,
            migration: RETIRE_FIELD_SURVEYOR_MIGRATION_ID,
          },
          reason: REJECT_REASON,
        },
      });
      auditLogsWritten += 1;
    }

    return { ...counts, auditLogsWritten, dryRun: false, noop: false };
  });
}

/** ยืนยันหลังรัน — ต้องไม่เหลือบทบาทที่ใช้งานอยู่และไม่มีคำขอค้าง */
export async function verifyFieldSurveyorRetired(client: Db): Promise<{
  activeUserRoles: number;
  pendingRequests: number;
  ok: boolean;
}> {
  const activeUserRoles = await client.userRole.count({
    where: { role: UserRoleEnum.FIELD_SURVEYOR, isActive: true },
  });
  const pendingRequests = await client.registrationRequest.count({
    where: {
      requestedRole: UserRoleEnum.FIELD_SURVEYOR,
      status: RegistrationRequestStatus.PENDING,
    },
  });
  return {
    activeUserRoles,
    pendingRequests,
    ok: activeUserRoles === 0 && pendingRequests === 0,
  };
}
