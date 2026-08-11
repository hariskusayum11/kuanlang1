import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";

export interface EntrySuggestion {
  value: string;
  label: string;
  fill: Record<string, string>;
}

export type EntrySuggestions = Record<string, EntrySuggestion[]>;

export interface SurveyorHistoryRow {
  surveyorPrefixId: string | null;
  surveyorPrefixOther: string | null;
  surveyorFirstNameOnPaper: string | null;
  surveyorLastNameOnPaper: string | null;
  surveyorPhoneOnPaper: string | null;
}

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

/** สร้างคำแนะนำแบบไม่ซ้ำ โดยคงรายการล่าสุดไว้ก่อน */
export function buildSurveyorSuggestions(rows: SurveyorHistoryRow[]): EntrySuggestions {
  const result: EntrySuggestions = {
    surveyorFirstNameOnPaper: [],
    surveyorLastNameOnPaper: [],
  };
  const seen = new Set<string>();

  for (const row of rows) {
    const first = clean(row.surveyorFirstNameOnPaper);
    const last = clean(row.surveyorLastNameOnPaper);
    const phone = clean(row.surveyorPhoneOnPaper);
    const prefixOther = clean(row.surveyorPrefixOther);
    if (!first && !last) continue;

    const identity = [row.surveyorPrefixId ?? "", prefixOther, first, last, phone].join("|");
    if (seen.has(identity)) continue;
    seen.add(identity);

    const fill = Object.fromEntries(
      [
        ["surveyorPrefix", row.surveyorPrefixId ?? ""],
        ["surveyorPrefixOther", prefixOther],
        ["surveyorFirstNameOnPaper", first],
        ["surveyorLastNameOnPaper", last],
        ["surveyorPhoneOnPaper", phone],
      ].filter(([, value]) => value !== ""),
    );
    const label = `${[first, last].filter(Boolean).join(" ")}${phone ? ` · ${phone}` : ""}`;

    if (first) result.surveyorFirstNameOnPaper.push({ value: first, label, fill });
    if (last) result.surveyorLastNameOnPaper.push({ value: last, label, fill });
  }

  return result;
}

/** ประวัติเฉพาะใบที่ผู้ใช้คนปัจจุบันเป็นผู้กรอก ป้องกันการเสนอชื่อข้ามบัญชี */
export async function getEntrySuggestions(
  ctx: AuthorizationContext,
): Promise<EntrySuggestions> {
  if (!hasPermission(ctx, PERMISSIONS.SURVEY_ENTRY)) return {};
  const rows = await prisma.household.findMany({
    where: { enteredById: ctx.userId, deletedAt: null },
    select: {
      surveyorPrefixId: true,
      surveyorPrefixOther: true,
      surveyorFirstNameOnPaper: true,
      surveyorLastNameOnPaper: true,
      surveyorPhoneOnPaper: true,
    },
    orderBy: { enteredAt: "desc" },
    take: 100,
  });
  return buildSurveyorSuggestions(rows);
}
