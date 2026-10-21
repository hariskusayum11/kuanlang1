// กฎการจัดลำดับแบบมีเวอร์ชัน (Owner Decision 2026-10-19 · docs/40)
// ---------------------------------------------------------------------------
// - ดูกฎ: dashboard.view (ทุกฝ่ายที่เห็นตัวเลขความเสี่ยง/สุขภาพ/แดชบอร์ด ต้องเห็นกฎปัจจุบันก่อนมีคนแก้)
// - แก้กฎ: priority-rules.manage (ADMIN) — ตรวจฝั่ง server ทุกครั้ง
// - ไม่เขียนทับ: บันทึก = เพิ่มแถว versionNo ถัดไป + Audit Log old → new ใน transaction เดียวกัน
// - ความเร่งด่วนรายบุคคลใช้งานจริงจาก VulnerabilityType.basePriority (หน้าตรวจใบ/รายงานอ่านจากที่นี่)
//   บันทึกเวอร์ชันใหม่จึงอัปเดต basePriority + ระดับที่บันทึกไว้ของบุคคล (กติกาใน domain/rules/impact.ts)

import { AuditAction, Prisma, TriageLevel } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { DRAFT_RISK_CONFIG_V1, type RiskWeightConfig } from "../../domain/risk/weights";
import type { TriageCode } from "../../domain/triage";
import {
  applyRiskEdit,
  diffRules,
  type ActiveRuleSet,
  type RuleChange,
  type TriageMap,
} from "../../domain/rules/priority-rules";
import { computeRuleImpact, storedTriageAfterMapChange, type RuleImpact } from "../../domain/rules/impact";
import { loadRiskHouseholds } from "../risk/household-risk";
import {
  ruleEditSchema,
  rulePreviewSchema,
  storedRiskConfigSchema,
  storedTriageMapSchema,
} from "./validation";

export function canViewRules(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW) || hasPermission(ctx, PERMISSIONS.PRIORITY_RULES_MANAGE);
}

export function canManageRules(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.PRIORITY_RULES_MANAGE);
}

export interface VulnerabilityTypeRule {
  code: string;
  nameTh: string;
  level: TriageCode;
  isActive: boolean;
}

type Db = Prisma.TransactionClient | typeof prisma;

async function readTriageTypes(db: Db): Promise<VulnerabilityTypeRule[]> {
  const types = await db.vulnerabilityType.findMany({
    select: { code: true, nameTh: true, basePriority: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return types.map((t) => ({ code: t.code, nameTh: t.nameTh, level: t.basePriority as TriageCode, isActive: t.isActive }));
}

/** ชุดกฎที่ใช้งานอยู่ — ไม่มีเวอร์ชันใน DB หรือค่าที่เก็บเสีย → ค่าร่างในโค้ด (ปลอดภัยกว่าการหยุดคำนวณ) */
async function readActiveRuleSet(db: Db): Promise<ActiveRuleSet> {
  const [latest, types] = await Promise.all([
    db.priorityRuleVersion.findFirst({
      orderBy: { versionNo: "desc" },
      select: {
        versionNo: true,
        isDraft: true,
        riskConfig: true,
        reason: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    readTriageTypes(db),
  ]);
  const triage: TriageMap = Object.fromEntries(types.map((t) => [t.code, t.level]));
  const parsed = latest ? storedRiskConfigSchema.safeParse(latest.riskConfig) : null;
  if (latest && parsed?.success) {
    return {
      versionNo: latest.versionNo,
      isDraft: latest.isDraft,
      risk: { ...parsed.data, draft: latest.isDraft },
      triage,
      createdAt: latest.createdAt.toISOString(),
      createdByName: latest.createdBy?.name ?? null,
      reason: latest.reason,
    };
  }
  if (latest) console.warn(`[rules] priority_rule_version ${latest.versionNo} อ่านไม่ได้ — ใช้ค่าร่างในโค้ดแทน`);
  return {
    versionNo: latest?.versionNo ?? 0,
    isDraft: true,
    risk: DRAFT_RISK_CONFIG_V1,
    triage,
    createdAt: null,
    createdByName: null,
    reason: null,
  };
}

/** ใช้ได้ทุกที่ที่คำนวณความเสี่ยง (ไม่มี RBAC — ค่ากฎไม่ใช่ข้อมูลอ่อนไหว ผู้เรียกตรวจสิทธิ์ของหน้าเอง) */
export function getActiveRuleSet(): Promise<ActiveRuleSet> {
  return readActiveRuleSet(prisma);
}

export interface RuleVersionSummary {
  versionNo: number;
  isDraft: boolean;
  weightVersion: string | null;
  reason: string;
  createdAt: string;
  createdByName: string | null;
  changes: RuleChange[];
}

export interface RulesPageData {
  active: ActiveRuleSet;
  types: VulnerabilityTypeRule[];
  history: RuleVersionSummary[];
  canManage: boolean;
}

/** ข้อมูลหน้า "กฎการจัดลำดับ" — null เมื่อไม่มีสิทธิ์ */
export async function getRulesPageData(ctx: AuthorizationContext): Promise<RulesPageData | null> {
  if (!canViewRules(ctx)) return null;
  const [active, types, versions] = await Promise.all([
    getActiveRuleSet(),
    readTriageTypes(prisma),
    prisma.priorityRuleVersion.findMany({
      orderBy: { versionNo: "desc" },
      take: 30,
      select: { versionNo: true, isDraft: true, riskConfig: true, triageMap: true, reason: true, createdAt: true, createdBy: { select: { name: true } } },
    }),
  ]);
  // รายการที่เปลี่ยนของแต่ละเวอร์ชัน = เทียบกับเวอร์ชันก่อนหน้า (เวอร์ชันแรกไม่มีให้เทียบ)
  const history = versions.map((v, i): RuleVersionSummary => {
    const prev = versions[i + 1];
    const risk = storedRiskConfigSchema.safeParse(v.riskConfig);
    const triage = storedTriageMapSchema.safeParse(v.triageMap);
    let changes: RuleChange[] = [];
    if (prev && risk.success && triage.success) {
      const prevRisk = storedRiskConfigSchema.safeParse(prev.riskConfig);
      const prevTriage = storedTriageMapSchema.safeParse(prev.triageMap);
      if (prevRisk.success && prevTriage.success) {
        changes = diffRules(
          { risk: prevRisk.data, triage: prevTriage.data, isDraft: prev.isDraft },
          { risk: risk.data, triage: triage.data, isDraft: v.isDraft },
        );
      }
    }
    return {
      versionNo: v.versionNo,
      isDraft: v.isDraft,
      weightVersion: risk.success ? risk.data.weightVersion : null,
      reason: v.reason,
      createdAt: v.createdAt.toISOString(),
      createdByName: v.createdBy?.name ?? null,
      changes,
    };
  });
  return { active, types, history, canManage: canManageRules(ctx) };
}

type EditFailure =
  | { ok: false; reason: "FORBIDDEN" | "CONFLICT" | "NO_CHANGE" | "ERROR" }
  | { ok: false; reason: "INVALID"; message: string };

interface BuiltEdit {
  before: ActiveRuleSet;
  afterRisk: RiskWeightConfig;
  afterTriage: TriageMap;
  isDraft: boolean;
  changes: RuleChange[];
}

/** ตรวจค่าที่ส่งมากับข้อมูลจริงใน DB แล้วสร้างชุดกฎใหม่ (ยังไม่เขียน) */
function buildEdit(
  before: ActiveRuleSet,
  types: VulnerabilityTypeRule[],
  input: { weights: Record<string, number>; thresholds: { LOW: number; MEDIUM: number; HIGH: number }; minConfidence: number; hardRules: Record<string, RiskWeightConfig["hardRules"][number]["minLevel"]>; triage: TriageMap; approved: boolean },
  versionNo: number,
): BuiltEdit | { error: string } {
  const known = new Set(types.map((t) => t.code));
  const missing = types.filter((t) => t.isActive && !input.triage[t.code]);
  if (missing.length) return { error: `ยังไม่ได้กำหนดระดับให้ “${missing[0].nameTh}”` };
  if (Object.keys(input.triage).some((code) => !known.has(code))) return { error: "มีประเภทความเปราะบางที่ไม่รู้จัก — โหลดหน้าใหม่" };
  const ruleCodes = new Set(before.risk.hardRules.map((r) => r.code));
  if (Object.keys(input.hardRules).some((code) => !ruleCodes.has(code))) return { error: "มีกฎบังคับที่ไม่รู้จัก — โหลดหน้าใหม่" };

  const afterRisk = applyRiskEdit(before.risk, input, versionNo);
  const afterTriage: TriageMap = { ...before.triage, ...input.triage };
  const isDraft = !input.approved;
  const changes = diffRules(
    { risk: before.risk, triage: before.triage, isDraft: before.isDraft },
    { risk: afterRisk, triage: afterTriage, isDraft },
  );
  return { before, afterRisk, afterTriage, isDraft, changes };
}

export type RulePreviewResult =
  | { ok: true; impact: RuleImpact; changes: RuleChange[] }
  | EditFailure;

/** ตัวอย่างผลกระทบก่อนบันทึก — คำนวณครัวเรือน VERIFIED ทุกหลังด้วยกฎเดิมและกฎใหม่ (ตัวเลขรวม ไม่มีรายบ้าน) */
export async function previewRuleChange(ctx: AuthorizationContext, raw: unknown): Promise<RulePreviewResult> {
  if (!canManageRules(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = rulePreviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const [before, types, households] = await Promise.all([getActiveRuleSet(), readTriageTypes(prisma), loadRiskHouseholds()]);
  const built = buildEdit(before, types, parsed.data, before.versionNo + 1);
  if ("error" in built) return { ok: false, reason: "INVALID", message: built.error };
  const impact = computeRuleImpact(
    households,
    { triage: before.triage, risk: before.risk },
    { triage: built.afterTriage, risk: built.afterRisk },
  );
  return { ok: true, impact, changes: built.changes };
}

export type RuleSaveResult = { ok: true; versionNo: number; triageUpdated: number } | EditFailure;

/** บันทึกกฎเวอร์ชันใหม่ (ADMIN) — เพิ่มแถวใหม่เสมอ ไม่แก้แถวเดิม */
export async function saveRuleVersion(ctx: AuthorizationContext, raw: unknown): Promise<RuleSaveResult> {
  if (!canManageRules(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = ruleEditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const input = parsed.data;

  try {
    return await prisma.$transaction(async (tx): Promise<RuleSaveResult> => {
      const before = await readActiveRuleSet(tx);
      // มีคนบันทึกเวอร์ชันใหม่ระหว่างที่หน้านี้เปิดอยู่ → ห้ามทับโดยไม่เห็นค่าล่าสุด
      if (before.versionNo !== input.baseVersionNo) return { ok: false, reason: "CONFLICT" };
      const versionNo = before.versionNo + 1;
      const built = buildEdit(before, await readTriageTypes(tx), input, versionNo);
      if ("error" in built) return { ok: false, reason: "INVALID", message: built.error };
      // เวอร์ชัน 0 = ยังไม่มีแถวใน DB → บันทึกครั้งแรกแม้ค่าไม่เปลี่ยนก็ได้ (ตั้งฐานประวัติ)
      if (built.changes.length === 0 && before.versionNo > 0) return { ok: false, reason: "NO_CHANGE" };

      const created = await tx.priorityRuleVersion.create({
        data: {
          versionNo,
          isDraft: built.isDraft,
          riskConfig: built.afterRisk as unknown as Prisma.InputJsonValue,
          triageMap: built.afterTriage,
          reason: input.reason,
          createdById: ctx.userId,
        },
        select: { id: true },
      });

      // ความเร่งด่วนรายบุคคล: อัปเดตประเภทที่เปลี่ยน แล้วย้ายระดับที่บันทึกไว้ของบุคคลที่ตั้งอัตโนมัติ
      const changedCodes = Object.keys(built.afterTriage).filter((code) => built.afterTriage[code] !== before.triage[code]);
      let triageUpdated = 0;
      if (changedCodes.length) {
        for (const code of changedCodes) {
          await tx.vulnerabilityType.update({ where: { code }, data: { basePriority: built.afterTriage[code] as TriageLevel } });
        }
        const people = await tx.vulnerablePerson.findMany({
          where: { triageLevel: { not: null }, vulnerabilities: { some: { vulnerabilityType: { code: { in: changedCodes } } } } },
          select: { id: true, triageLevel: true, vulnerabilities: { select: { vulnerabilityType: { select: { code: true } } } } },
        });
        const byLevel = new Map<TriageCode, string[]>();
        for (const person of people) {
          const current = { stored: person.triageLevel as TriageCode, typeCodes: person.vulnerabilities.map((v) => v.vulnerabilityType.code) };
          const next = storedTriageAfterMapChange(current, before.triage, built.afterTriage);
          if (next && next !== current.stored) byLevel.set(next, [...(byLevel.get(next) ?? []), person.id]);
        }
        const now = new Date();
        for (const [level, ids] of byLevel) {
          const res = await tx.vulnerablePerson.updateMany({ where: { id: { in: ids } }, data: { triageLevel: level as TriageLevel, triageComputedAt: now } });
          triageUpdated += res.count;
        }
      }

      // Audit อยู่ใน transaction เดียวกัน — กฎเปลี่ยนต้องมีร่องรอยเสมอ (ไม่ใช้แบบ best-effort)
      await tx.auditLog.create({
        data: {
          userId: ctx.userId,
          action: AuditAction.UPDATE,
          entityType: "PriorityRuleVersion",
          entityId: created.id,
          reason: input.reason,
          changes: {
            versionNo: { old: before.versionNo, new: versionNo },
            items: built.changes,
            triageRecomputedPeople: triageUpdated,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { ok: true, versionNo, triageUpdated };
    }, { timeout: 30_000 });
  } catch (error) {
    // versionNo ชน unique = มีคนบันทึกพร้อมกัน
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "CONFLICT" };
    console.error("[rules] บันทึกกฎไม่สำเร็จ", error instanceof Error ? error.name : "unknown");
    return { ok: false, reason: "ERROR" };
  }
}
