/**
 * ตรวจนับข้อมูลบทบาท FIELD_SURVEYOR ก่อน/หลังการเลิกใช้ (Owner Decision #R6-E)
 *
 * รัน:  node --env-file=.env --import tsx scripts/audit-field-surveyor.ts
 * **ห้ามพิมพ์ PII** — รายงานเป็นจำนวนเท่านั้น
 */
import { PrismaClient, RegistrationRequestStatus, UserRoleEnum } from "@prisma/client";

const prisma = new PrismaClient();

export interface FieldSurveyorAudit {
  activeUserRoles: number;
  inactiveUserRoles: number;
  usersWithOnlyFieldSurveyor: number;
  usersWithFieldSurveyorAndOtherRoles: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  cancelledRequests: number;
}

export async function auditFieldSurveyor(
  client: PrismaClient = prisma,
): Promise<FieldSurveyorAudit> {
  const active = await client.userRole.findMany({
    where: { role: UserRoleEnum.FIELD_SURVEYOR, isActive: true },
    select: { userId: true },
  });
  const userIds = active.map((r) => r.userId);

  const roleCounts = await client.userRole.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, isActive: true },
    _count: { _all: true },
  });

  const countRequests = (status: RegistrationRequestStatus) =>
    client.registrationRequest.count({
      where: { requestedRole: UserRoleEnum.FIELD_SURVEYOR, status },
    });

  return {
    activeUserRoles: active.length,
    inactiveUserRoles: await client.userRole.count({
      where: { role: UserRoleEnum.FIELD_SURVEYOR, isActive: false },
    }),
    usersWithOnlyFieldSurveyor: roleCounts.filter((r) => r._count._all === 1).length,
    usersWithFieldSurveyorAndOtherRoles: roleCounts.filter((r) => r._count._all > 1).length,
    pendingRequests: await countRequests(RegistrationRequestStatus.PENDING),
    approvedRequests: await countRequests(RegistrationRequestStatus.APPROVED),
    rejectedRequests: await countRequests(RegistrationRequestStatus.REJECTED),
    cancelledRequests: await countRequests(RegistrationRequestStatus.CANCELLED),
  };
}

async function main() {
  const audit = await auditFieldSurveyor();
  console.log(JSON.stringify(audit, null, 2));
  const clean = audit.activeUserRoles === 0 && audit.pendingRequests === 0;
  console.log(
    clean
      ? "\n✓ ไม่เหลือ FIELD_SURVEYOR ที่ใช้งานอยู่ และไม่มีคำขอค้าง"
      : `\n! ต้องรัน migration — active ${audit.activeUserRoles} แถว · คำขอค้าง ${audit.pendingRequests} รายการ`,
  );
}

if (process.argv[1]?.includes("audit-field-surveyor")) {
  void main().finally(() => prisma.$disconnect());
}
