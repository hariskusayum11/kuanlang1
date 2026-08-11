export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export function normalizePage(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function normalizePageSize(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PAGE_SIZE;
}
