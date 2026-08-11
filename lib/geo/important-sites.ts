import { AuditAction, EvacuationSiteType, UserRoleEnum } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import type { AuthorizationContext } from "../authz/types";

export interface ImportantSitePoint {
  id: string;
  communityId: string;
  communityName: string;
  name: string;
  type: EvacuationSiteType | null;
  address: string | null;
  lat: number;
  lng: number;
  capacity: number | null;
}

export const IMPORTANT_SITE_TYPES: { value: EvacuationSiteType; label: string }[] = [
  { value: EvacuationSiteType.SCHOOL, label: "โรงเรียน" },
  { value: EvacuationSiteType.TEMPLE_OR_MOSQUE, label: "วัด / มัสยิด" },
  { value: EvacuationSiteType.COMMUNITY_CENTER, label: "ศูนย์ชุมชน / ศูนย์อพยพ" },
  { value: EvacuationSiteType.MUNICIPAL_AREA, label: "อาคารหรือพื้นที่เทศบาล" },
  { value: EvacuationSiteType.RELATIVE_HOME, label: "บ้านพักพิง" },
  { value: EvacuationSiteType.OTHER, label: "จุดสำคัญอื่น ๆ" },
];

export function canManageImportantSites(ctx: AuthorizationContext): boolean {
  return ctx.roles.includes(UserRoleEnum.ADMIN);
}

export async function getImportantSites(communityId?: string): Promise<ImportantSitePoint[]> {
  const rows = await prisma.evacuationSite.findMany({
    where: { isActive: true, ...(communityId ? { communityId } : {}) },
    select: {
      id: true, communityId: true, name: true, type: true, address: true,
      latitude: true, longitude: true, capacity: true,
      community: { select: { nameTh: true } },
    },
    orderBy: [{ community: { code: "asc" } }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    communityId: row.communityId,
    communityName: row.community.nameTh,
    name: row.name,
    type: row.type,
    address: row.address,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    capacity: row.capacity,
  }));
}

export type ImportantSiteInput = {
  id?: string;
  communityId: string;
  name: string;
  type: string;
  address?: string;
  latitude: number;
  longitude: number;
  capacity?: number | null;
};

function validate(input: ImportantSiteInput): string | null {
  if (!input.communityId) return "กรุณาเลือกชุมชน";
  if (!input.name.trim() || input.name.trim().length > 150) return "ชื่อจุดต้องมี 1–150 ตัวอักษร";
  if (!Object.values(EvacuationSiteType).includes(input.type as EvacuationSiteType)) return "ประเภทจุดไม่ถูกต้อง";
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) return "ละติจูดไม่ถูกต้อง";
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) return "ลองจิจูดไม่ถูกต้อง";
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > 1_000_000)) return "ความจุไม่ถูกต้อง";
  if ((input.address?.length ?? 0) > 500) return "ที่อยู่ยาวเกิน 500 ตัวอักษร";
  return null;
}

export async function saveImportantSite(ctx: AuthorizationContext, input: ImportantSiteInput) {
  if (!canManageImportantSites(ctx)) return { ok: false as const, error: "เฉพาะผู้ดูแลระบบเท่านั้น" };
  const error = validate(input);
  if (error) return { ok: false as const, error };
  const data = {
    communityId: input.communityId,
    name: input.name.trim(),
    type: input.type as EvacuationSiteType,
    address: input.address?.trim() || null,
    latitude: input.latitude,
    longitude: input.longitude,
    capacity: input.capacity ?? null,
    isActive: true,
  };
  const site = input.id
    ? await prisma.evacuationSite.update({ where: { id: input.id }, data, select: { id: true } })
    : await prisma.evacuationSite.create({ data, select: { id: true } });
  await writeAuditLog({
    userId: ctx.userId,
    action: input.id ? AuditAction.UPDATE : AuditAction.CREATE,
    entityType: "EvacuationSite",
    entityId: site.id,
    reason: input.id ? "แก้ไขจุดสำคัญบนแผนที่" : "เพิ่มจุดสำคัญบนแผนที่",
    changes: { type: input.type, communityId: input.communityId },
  });
  return { ok: true as const };
}

export async function deleteImportantSite(ctx: AuthorizationContext, id: string) {
  if (!canManageImportantSites(ctx)) return { ok: false as const, error: "เฉพาะผู้ดูแลระบบเท่านั้น" };
  const existing = await prisma.evacuationSite.findUnique({ where: { id }, select: { id: true, type: true, communityId: true } });
  if (!existing) return { ok: false as const, error: "ไม่พบจุดที่ต้องการลบ" };
  await prisma.evacuationSite.delete({ where: { id } });
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.DELETE,
    entityType: "EvacuationSite",
    entityId: id,
    reason: "ลบจุดสำคัญออกจากแผนที่",
    changes: { type: existing.type, communityId: existing.communityId },
  });
  return { ok: true as const };
}
