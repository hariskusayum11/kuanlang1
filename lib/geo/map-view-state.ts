/**
 * สถานะมุมมองหน้าแผนที่ `/map` ที่เก็บใน URL query — Pure Function ล้วน (ไม่แตะ DB/DOM)
 *
 * เหตุผลที่เก็บใน URL: ผู้ใช้หลายหน่วยงานส่งลิงก์ต่อกัน ("ดูบ้านเปราะบางชุมชนนี้บนดาวเทียม")
 * แล้วต้องเห็นมุมมองเดียวกันทันที โดยไม่ต้องอธิบายว่าต้องติ๊กอะไรบ้าง
 *
 * ใช้ได้ทั้งฝั่ง server (page อ่านค่า) และ client (เขียน URL เมื่อติ๊กชั้นข้อมูล)
 * จึงห้าม import อะไรที่ดึง Prisma เข้ามา — รายการประเภทจุดสำคัญส่งเข้ามาเป็นพารามิเตอร์
 *
 * ค่าที่เป็นค่าเริ่มต้นจะไม่ถูกเขียนลง URL เพื่อให้ลิงก์สั้นและอ่านออก
 */

export const HOUSEHOLD_LAYER_KEYS = ["vulnerable", "volunteer", "host", "heat"] as const;
export type HouseholdLayerKey = (typeof HOUSEHOLD_LAYER_KEYS)[number];

/** ค่าเริ่มต้นตามพฤติกรรมเดิม: จุดบ้านเปิดทั้งสามกลุ่ม ฮีตแมปปิด (ทับจุดจนอ่านยาก) */
export const DEFAULT_HOUSEHOLD_LAYERS: readonly HouseholdLayerKey[] = ["vulnerable", "volunteer", "host"];

export const BASE_MAP_KEYS = ["street", "satellite"] as const;
export type BaseMapKey = (typeof BASE_MAP_KEYS)[number];

/** ค่าพิเศษใน URL หมายถึง "ปิดทั้งกลุ่ม" (ต่างจากไม่มีพารามิเตอร์ = ค่าเริ่มต้น) */
export const NONE_TOKEN = "none";

export interface MapViewState {
  communityId?: string;
  tambonId?: string;
  dateFrom?: string;
  dateTo?: string;
  base: BaseMapKey;
  layers: HouseholdLayerKey[];
  /** รหัสทักษะอาสาที่เลือก ไม่ระบุ = ทุกทักษะ */
  skill?: string;
  /** ประเภทจุดสำคัญที่แสดง (ค่าเริ่มต้น = ทุกประเภท) */
  siteTypes: string[];
  /** ชั้นเส้นขอบชุมชน (ค่าเริ่มต้น = เปิด · ปิดเขียนเป็น `boundary=off`) */
  boundaries: boolean;
  /** ชั้น "ลำดับการช่วยเหลือ" (ค่าเริ่มต้น = ปิด · เปิดเขียนเป็น `help=on`) — docs/40 */
  help: boolean;
}

/** ค่าที่หมายถึง "ปิดชั้นเส้นขอบชุมชน" ใน URL — เขียนออกเป็น `off` เสมอ */
const BOUNDARY_OFF_VALUES = new Set(["off", NONE_TOKEN, "0", "false"]);
/** ค่าที่หมายถึง "เปิดลำดับการช่วยเหลือ" — เขียนออกเป็น `on` เสมอ */
const HELP_ON_VALUES = new Set(["on", "1", "true"]);

export type RawSearchParams = Record<string, string | string[] | undefined>;

// id ของ Prisma (cuid) และรหัสทักษะเป็นตัวอักษร/ตัวเลขเท่านั้น — ตัดค่าแปลกปลอมทิ้งก่อนส่งต่อ
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function cleanId(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && ID_PATTERN.test(text) ? text : undefined;
}

/** วันที่ส่งต่อแบบรูปแบบ YYYY-MM-DD เท่านั้น ส่วนความถูกต้องของช่วงให้ dateRangeError ตัดสิน */
function cleanDate(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && DATE_PATTERN.test(text) ? text : undefined;
}

/**
 * อ่านรายการคั่นด้วยจุลภาค
 * - ไม่มีพารามิเตอร์ → ค่าเริ่มต้น
 * - `none` หรือค่าว่าง → ปิดทั้งหมด
 * - ค่าที่ไม่รู้จักถูกทิ้ง และเรียงตามลำดับของ `allowed` เพื่อให้ URL คงรูปเสมอ
 */
function parseList<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  if (raw === undefined) return [...fallback];
  const text = raw.trim();
  if (!text || text === NONE_TOKEN) return [];
  const wanted = new Set(text.split(",").map((item) => item.trim()));
  return allowed.filter((item) => wanted.has(item));
}

export function parseMapViewState(
  params: RawSearchParams,
  allSiteTypes: readonly string[],
): MapViewState {
  const base = first(params.base);
  return {
    communityId: cleanId(first(params.community)),
    tambonId: cleanId(first(params.tambon)),
    dateFrom: cleanDate(first(params.from)),
    dateTo: cleanDate(first(params.to)),
    base: base === "satellite" ? "satellite" : "street",
    layers: parseList(first(params.layers), HOUSEHOLD_LAYER_KEYS, DEFAULT_HOUSEHOLD_LAYERS),
    skill: cleanId(first(params.skill)),
    siteTypes: parseList(first(params.sites), allSiteTypes, allSiteTypes),
    boundaries: !BOUNDARY_OFF_VALUES.has(first(params.boundary)?.trim().toLowerCase() ?? ""),
    help: HELP_ON_VALUES.has(first(params.help)?.trim().toLowerCase() ?? ""),
  };
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function listValue(values: readonly string[], ordered: readonly string[]): string {
  const sorted = ordered.filter((item) => values.includes(item));
  return sorted.length ? sorted.join(",") : NONE_TOKEN;
}

/** แปลงสถานะเป็น query string (ไม่มี `?` นำหน้า) — ละค่าเริ่มต้นทั้งหมด */
export function serializeMapViewState(
  state: MapViewState,
  allSiteTypes: readonly string[],
): string {
  const params = new URLSearchParams();
  if (state.communityId) params.set("community", state.communityId);
  if (state.tambonId) params.set("tambon", state.tambonId);
  if (state.dateFrom) params.set("from", state.dateFrom);
  if (state.dateTo) params.set("to", state.dateTo);
  if (state.base !== "street") params.set("base", state.base);
  if (!sameMembers(state.layers, DEFAULT_HOUSEHOLD_LAYERS)) {
    params.set("layers", listValue(state.layers, HOUSEHOLD_LAYER_KEYS));
  }
  if (state.skill) params.set("skill", state.skill);
  if (!sameMembers(state.siteTypes, allSiteTypes)) {
    params.set("sites", listValue(state.siteTypes, allSiteTypes));
  }
  if (!state.boundaries) params.set("boundary", "off");
  if (state.help) params.set("help", "on");
  // จุลภาคใช้ใน query ได้ตามมาตรฐาน — ไม่ encode เป็น %2C เพื่อให้ลิงก์ที่ส่งต่อกันอ่านออก
  return params.toString().replace(/%2C/gi, ",");
}

export function mapViewHref(state: MapViewState, allSiteTypes: readonly string[]): string {
  const query = serializeMapViewState(state, allSiteTypes);
  return query ? `/map?${query}` : "/map";
}

/**
 * จำนวนชั้นที่เปิดอยู่ / ทั้งหมด (แผนที่พื้นฐานไม่นับ เพราะต้องมีหนึ่งชั้นเสมอ)
 * เส้นขอบชุมชนนับเป็น 1 ชั้น
 */
export function countActiveLayers(
  state: Pick<MapViewState, "layers" | "siteTypes" | "boundaries">,
  allSiteTypes: readonly string[],
): { active: number; total: number } {
  return {
    active: (state.boundaries ? 1 : 0) + state.layers.length + state.siteTypes.filter((type) => allSiteTypes.includes(type)).length,
    total: 1 + HOUSEHOLD_LAYER_KEYS.length + allSiteTypes.length,
  };
}
