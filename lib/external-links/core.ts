import { AuditAction, Prisma } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { prisma } from "../prisma";
import {
  EXTERNAL_LINK_CATEGORIES,
  externalLinkInputSchema,
  type ExternalLinkCategory,
} from "./validation";

// ลิงก์ระบบภายนอก (docs/37) — ข้อมูลสาธารณะ ไม่มี PII · จัดการโดยผู้มีสิทธิ์ตั้งค่าระบบ

export interface ExternalLinkRow {
  id: string;
  title: string;
  description: string | null;
  url: string;
  category: ExternalLinkCategory;
  sortOrder: number;
  isActive: boolean;
}

function toCategory(value: string): ExternalLinkCategory {
  return (EXTERNAL_LINK_CATEGORIES as readonly string[]).includes(value) ? (value as ExternalLinkCategory) : "OTHER";
}

const SELECT = { id: true, title: true, description: true, url: true, category: true, sortOrder: true, isActive: true } as const;

/** ลิงก์ที่เปิดใช้ — หน้าสาธารณะ (ไม่ต้องเข้าสู่ระบบ) · เรียงตามลำดับที่แอดมินกำหนด */
export async function listPublicExternalLinks(): Promise<ExternalLinkRow[]> {
  const rows = await prisma.externalLink.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: SELECT,
  });
  return rows.map((row) => ({ ...row, category: toCategory(row.category) }));
}

export function canManageExternalLinks(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.SETTINGS_VIEW);
}

/** ทุกลิงก์ รวมที่ปิดอยู่ — หน้าจัดการ · null = ไม่มีสิทธิ์ */
export async function listAllExternalLinks(ctx: AuthorizationContext): Promise<ExternalLinkRow[] | null> {
  if (!canManageExternalLinks(ctx)) return null;
  const rows = await prisma.externalLink.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: SELECT,
  });
  return rows.map((row) => ({ ...row, category: toCategory(row.category) }));
}

export type SaveExternalLinkResult =
  | { ok: true; id: string }
  | { ok: false; reason: "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "ERROR"; message?: string };

/** เพิ่ม (ไม่มี id) หรือแก้ (มี id) · Audit ค่าก่อน/หลัง */
export async function saveExternalLink(ctx: AuthorizationContext, raw: unknown): Promise<SaveExternalLinkResult> {
  if (!canManageExternalLinks(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = externalLinkInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message };
  const { id, ...input } = parsed.data;
  const data = { ...input, description: input.description || null, updatedById: ctx.userId };

  try {
    if (id) {
      const before = await prisma.externalLink.findUnique({ where: { id }, select: SELECT });
      if (!before) return { ok: false, reason: "NOT_FOUND" };
      await prisma.externalLink.update({ where: { id }, data });
      await writeAuditLog({
        userId: ctx.userId,
        action: AuditAction.UPDATE,
        entityType: "ExternalLink",
        entityId: id,
        changes: { before, after: input },
      });
      return { ok: true, id };
    }
    const created = await prisma.externalLink.create({ data, select: { id: true } });
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entityType: "ExternalLink",
      entityId: created.id,
      changes: { after: input },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, reason: "ERROR" };
    throw error;
  }
}

export type SetExternalLinkActiveResult = { ok: true } | { ok: false; reason: "FORBIDDEN" | "NOT_FOUND" };

/** เปิด/ปิดการแสดงผล — ไม่ลบจริง (Soft Delete เป็นค่าเริ่มต้นของระบบ) */
export async function setExternalLinkActive(
  ctx: AuthorizationContext,
  id: string,
  isActive: boolean,
): Promise<SetExternalLinkActiveResult> {
  if (!canManageExternalLinks(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const updated = await prisma.externalLink.updateMany({ where: { id }, data: { isActive, updatedById: ctx.userId } });
  if (updated.count !== 1) return { ok: false, reason: "NOT_FOUND" };
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "ExternalLink",
    entityId: id,
    changes: { isActive: { new: isActive } },
  });
  return { ok: true };
}
