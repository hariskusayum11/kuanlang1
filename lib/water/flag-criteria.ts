// เกณฑ์ธงเตือนภัยชุมชนแบบมีเวอร์ชัน (Owner Decision 2026-11-09 · docs/44)
// ---------------------------------------------------------------------------
// - อ่าน: สาธารณะ (หน้าแรกแสดงเกณฑ์และธงโดยประมาณ) — ไม่มีข้อมูลอ่อนไหว
// - แก้: flag-criteria.manage (ADMIN) — ตรวจฝั่ง server ทุกครั้ง
// - ไม่เขียนทับ: บันทึก = เพิ่มแถว versionNo ถัดไป + Audit Log รายการที่เปลี่ยน ใน transaction เดียวกัน
// - ไม่มีแถว หรือค่าที่เก็บอ่านไม่ได้ → ใช้ DEFAULT_FLAG_CRITERIA (หน้าแรกต้องแสดงได้เสมอ)

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import {
  DEFAULT_FLAG_CRITERIA,
  diffFlagCriteria,
  validateFlagCriteria,
  type FlagCriteriaConfig,
} from "../../domain/water/community-flags";
import { flagCriteriaSaveSchema, flagCriteriaSchema } from "./flag-criteria-schema";

type Db = Prisma.TransactionClient | typeof prisma;

export interface ActiveFlagCriteria {
  /** 0 = ยังไม่มีเวอร์ชันในฐานข้อมูล (ใช้ค่าตั้งต้นในโค้ด) */
  versionNo: number;
  config: FlagCriteriaConfig;
  reason: string | null;
  createdAt: string | null;
  createdByName: string | null;
}

export function canManageFlagCriteria(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.FLAG_CRITERIA_MANAGE);
}

/** ค่าที่เก็บไว้ → ชุดเกณฑ์ · อ่านไม่ได้หรือไม่สมเหตุสมผล = null */
export function parseStoredCriteria(raw: unknown): FlagCriteriaConfig | null {
  const parsed = flagCriteriaSchema.safeParse(raw);
  if (!parsed.success) return null;
  return validateFlagCriteria(parsed.data) === null ? parsed.data : null;
}

async function readActive(db: Db): Promise<ActiveFlagCriteria> {
  const latest = await db.flagCriteriaVersion.findFirst({
    orderBy: { versionNo: "desc" },
    select: { versionNo: true, config: true, reason: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  const config = latest ? parseStoredCriteria(latest.config) : null;
  if (latest && config) {
    return { versionNo: latest.versionNo, config, reason: latest.reason, createdAt: latest.createdAt.toISOString(), createdByName: latest.createdBy?.name ?? null };
  }
  if (latest) console.warn(`[flag-criteria] flag_criteria_version ${latest.versionNo} อ่านไม่ได้ — ใช้ค่าตั้งต้นในโค้ดแทน`);
  return { versionNo: latest?.versionNo ?? 0, config: DEFAULT_FLAG_CRITERIA, reason: null, createdAt: null, createdByName: null };
}

/** เกณฑ์ที่ใช้งานอยู่ — ใช้บนหน้าแรก (ไม่มี RBAC: ค่าเกณฑ์เป็นข้อมูลสาธารณะ) · ฐานข้อมูลล่ม = ค่าตั้งต้น */
export async function getActiveFlagCriteria(): Promise<ActiveFlagCriteria> {
  try {
    return await readActive(prisma);
  } catch {
    return { versionNo: 0, config: DEFAULT_FLAG_CRITERIA, reason: null, createdAt: null, createdByName: null };
  }
}

export interface FlagCriteriaVersionSummary {
  versionNo: number;
  reason: string;
  createdAt: string;
  createdByName: string | null;
  changes: string[];
  config: FlagCriteriaConfig | null;
}

export interface FlagCriteriaPageData {
  active: ActiveFlagCriteria;
  history: FlagCriteriaVersionSummary[];
}

/** ข้อมูลหน้าแก้เกณฑ์ — null เมื่อไม่มีสิทธิ์ */
export async function getFlagCriteriaPageData(ctx: AuthorizationContext): Promise<FlagCriteriaPageData | null> {
  if (!canManageFlagCriteria(ctx)) return null;
  const [active, versions] = await Promise.all([
    readActive(prisma),
    prisma.flagCriteriaVersion.findMany({
      orderBy: { versionNo: "desc" },
      take: 30,
      select: { versionNo: true, config: true, reason: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
  ]);
  const parsed = versions.map((v) => parseStoredCriteria(v.config));
  const history = versions.map((v, i): FlagCriteriaVersionSummary => {
    const config = parsed[i] ?? null;
    // เวอร์ชันแรกเทียบกับค่าตั้งต้นในโค้ด
    const prev = i + 1 < versions.length ? parsed[i + 1] ?? null : DEFAULT_FLAG_CRITERIA;
    return {
      versionNo: v.versionNo,
      reason: v.reason,
      createdAt: v.createdAt.toISOString(),
      createdByName: v.createdBy?.name ?? null,
      changes: config && prev ? diffFlagCriteria(prev, config) : [],
      config,
    };
  });
  return { active, history };
}

export type FlagCriteriaSaveResult =
  | { ok: true; versionNo: number; changes: string[] }
  | { ok: false; reason: "FORBIDDEN" | "CONFLICT" | "NO_CHANGE" | "ERROR" }
  | { ok: false; reason: "INVALID"; message: string };

/** บันทึกเกณฑ์เวอร์ชันใหม่ (ADMIN) — เพิ่มแถวใหม่เสมอ ไม่แก้แถวเดิม */
export async function saveFlagCriteria(ctx: AuthorizationContext, raw: unknown): Promise<FlagCriteriaSaveResult> {
  if (!canManageFlagCriteria(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = flagCriteriaSaveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const { baseVersionNo, reason, config } = parsed.data;
  const invalid = validateFlagCriteria(config);
  if (invalid) return { ok: false, reason: "INVALID", message: invalid };

  try {
    return await prisma.$transaction(async (tx): Promise<FlagCriteriaSaveResult> => {
      const before = await readActive(tx);
      // มีคนบันทึกเวอร์ชันใหม่ระหว่างที่หน้านี้เปิดอยู่ → ห้ามทับโดยไม่เห็นค่าล่าสุด
      if (before.versionNo !== baseVersionNo) return { ok: false, reason: "CONFLICT" };
      const changes = diffFlagCriteria(before.config, config);
      // เวอร์ชัน 0 = ยังไม่มีแถว → บันทึกครั้งแรกแม้ค่าไม่เปลี่ยนก็ได้ (ตั้งฐานประวัติ)
      if (changes.length === 0 && before.versionNo > 0) return { ok: false, reason: "NO_CHANGE" };
      const versionNo = before.versionNo + 1;
      const created = await tx.flagCriteriaVersion.create({
        data: { versionNo, config: config as unknown as Prisma.InputJsonValue, reason, createdById: ctx.userId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: ctx.userId,
          action: AuditAction.UPDATE,
          entityType: "FlagCriteriaVersion",
          entityId: created.id,
          reason,
          changes: { versionNo: { old: before.versionNo, new: versionNo }, items: changes },
        },
      });
      return { ok: true, versionNo, changes };
    });
  } catch (error) {
    // สองคนบันทึกพร้อมกัน → versionNo ชน unique
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "CONFLICT" };
    console.error("[flag-criteria] save failed");
    return { ok: false, reason: "ERROR" };
  }
}
