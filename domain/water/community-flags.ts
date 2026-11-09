// เกณฑ์ธงเตือนภัยของกลุ่มสองคลองควนลัง + "ธงโดยประมาณ" (หน้าแรก) — Pure Function
// -----------------------------------------------------------------------------
// เกณฑ์ตั้งต้น: "แนวปฏิบัติระดับชุมชนเพื่อรับมืออุทกภัย กลุ่มสองคลองควนลัง" ข้อ 5 และรูปความหมายของธง
// ที่ https://hatyaicityclimate.org/zone/kuanlang (CC BY-SA 3.0) · คัดลอกเมื่อ 2026-11-02
//
// Owner Decision 2026-11-09 (docs/44): เกณฑ์แก้ได้ในระบบโดย ADMIN — เพิ่มระดับธง (เช่น ธงส้ม)
// ปรับเกณฑ์ของแต่ละสะพาน และปรับระดับท้องสะพาน/พื้นสะพาน · เก็บเป็นเวอร์ชันใน flag_criteria_version
// ค่าในไฟล์นี้ (DEFAULT_FLAG_CRITERIA) ใช้เมื่อยังไม่มีเวอร์ชันในฐานข้อมูล
//
// ⚠️ ธงที่คำนวณที่นี่เป็น "ค่าประมาณ" ไม่ใช่ธงที่ประกาศ — ระดับท้องสะพานตั้งต้นใช้ "ระดับคอสะพานล่าง (ฝั่งซ้าย)"
//   จากรูปตัดขวางลำน้ำประจำปี 2569 ของกรมชลประทานแทนค่าทางการ (Owner Decision 2026-11-02)

/** สีธง — จำกัดชุดเพื่อให้ตรงกับความหมายสีของระบบ (green = ปกติ · yellow = เฝ้าระวัง · orange = ต้องลงมือ · red = วิกฤต) */
export type FlagColor = "green" | "yellow" | "orange" | "red";
export const FLAG_COLORS: readonly FlagColor[] = ["green", "yellow", "orange", "red"];
export const FLAG_COLOR_LABEL: Record<FlagColor, string> = { green: "เขียว", yellow: "เหลือง", orange: "ส้ม", red: "แดง" };

export interface FlagLevelDef {
  /** รหัสระดับ (ตัวพิมพ์ใหญ่) — อ้างจากเกณฑ์ของสะพาน */
  key: string;
  /** ชื่อธง เช่น "ธงเหลือง" */
  label: string;
  /** สถานการณ์ เช่น "เฝ้าระวัง" */
  title: string;
  /** ข้อความสั้นบนหน้าแรกใต้ชื่อธง */
  headline: string;
  /** สิ่งที่ต้องทำ (เต็ม) */
  action: string;
  color: FlagColor;
  /** มีเสียงไซเรนร่วม (วาดไอคอนไซเรนบนธง) */
  siren: boolean;
}

/** เกณฑ์ยกธงหนึ่งระดับของสะพานหนึ่ง */
export type FlagThreshold =
  | { type: "belowSoffit"; meters: number } // ผิวน้ำต่ำกว่าท้องสะพาน x ม.
  | { type: "deck" } // น้ำถึงพื้นสะพาน (จมสะพาน)
  | { type: "msl"; value: number }; // ระดับน้ำถึง x ม.รทก.

export interface FlagBridgeDef {
  /** รหัสสถานีโทรมาตร (ThaiWater) ที่ตั้งอยู่ที่สะพานนี้ */
  stationCode: string;
  bridge: string;
  canal: string;
  /** ระดับท้องสะพาน (พื้นล่างสะพาน) ม.รทก. · null = ยังไม่ทราบ */
  soffitMsl: number | null;
  /** ระดับพื้นสะพาน ม.รทก. · null = ยังไม่ทราบ */
  deckMsl: number | null;
  /** ที่มาของระดับสะพาน */
  sourceNote: string;
  sourceUrl: string | null;
  /** เกณฑ์ตามรหัสระดับ (ไม่ใส่ = สะพานนี้ไม่ใช้ระดับนั้น) · ระดับแรก (ปกติ) ไม่มีเกณฑ์ */
  thresholds: Record<string, FlagThreshold>;
}

export interface FlagCriteriaConfig {
  /** เรียงจากปกติ → รุนแรงที่สุด · ระดับแรก = ปกติ (ไม่มีเกณฑ์) */
  levels: FlagLevelDef[];
  bridges: FlagBridgeDef[];
  source: { publisher: string; url: string; license: string; note: string };
}

export const DEFAULT_FLAG_CRITERIA: FlagCriteriaConfig = {
  levels: [
    { key: "GREEN", label: "ธงเขียว", title: "สถานการณ์ปกติ", headline: "สถานการณ์ปกติ · ยังไม่ต้องอพยพ", action: "ยังไม่มีผลกระทบในพื้นที่ ติดตามข้อมูลต่อเนื่อง", color: "green", siren: false },
    { key: "YELLOW", label: "ธงเหลือง", title: "เฝ้าระวัง", headline: "เฝ้าระวัง · อพยพผู้ป่วยติดเตียงและผู้ฟอกไตก่อน", action: "ติดตามข้อมูลอย่างใกล้ชิด เตรียมพร้อม 100% อพยพผู้ป่วยติดเตียงและผู้ฟอกไต", color: "yellow", siren: false },
    { key: "RED", label: "ธงแดง", title: "ฝนตกหนัก เกิดอุทกภัย", headline: "เกิดอุทกภัย · อพยพกลุ่มเปราะบางและกลุ่มเสี่ยง", action: "อพยพประชาชนกลุ่มเปราะบางและกลุ่มเสี่ยง", color: "red", siren: false },
    { key: "RED_SIREN", label: "ธงแดง + ไซเรน", title: "เกิดอุทกภัย", headline: "เกิดอุทกภัย · อยู่ในที่สูง ไม่ออกจากพื้นที่", action: "ประชาชนอยู่ในที่สูง ไม่ควรออกจากพื้นที่", color: "red", siren: true },
  ],
  bridges: [
    {
      stationCode: "X.174", bridge: "สะพานบ้านคลองหวะ", canal: "คลองหวะ", soffitMsl: 10.019, deckMsl: 11.222,
      sourceNote: "คอสะพานล่าง (ฝั่งซ้าย) — รูปตัดขวางลำน้ำ กรมชลประทาน ม.ค. 2569",
      sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X174.pdf",
      thresholds: { YELLOW: { type: "belowSoffit", meters: 4 }, RED: { type: "belowSoffit", meters: 3 } },
    },
    {
      stationCode: "X.173A", bridge: "สะพานม่วงก็อง", canal: "คลองอู่ตะเภา (ต้นน้ำ)", soffitMsl: 15.315, deckMsl: 16.963,
      sourceNote: "คอสะพานล่าง (ฝั่งซ้าย) — รูปตัดขวางลำน้ำ กรมชลประทาน ม.ค. 2569",
      sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X173A.pdf",
      thresholds: { YELLOW: { type: "belowSoffit", meters: 1 }, RED: { type: "deck" } },
    },
    {
      stationCode: "X.90", bridge: "สะพานบางศาลา", canal: "คลองอู่ตะเภา", soffitMsl: 9.93, deckMsl: 11.254,
      sourceNote: "คอสะพานล่าง (ฝั่งซ้าย) — รูปตัดขวางลำน้ำ กรมชลประทาน ม.ค. 2569",
      sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X90.pdf",
      thresholds: { YELLOW: { type: "belowSoffit", meters: 3 }, RED: { type: "belowSoffit", meters: 2 } },
    },
  ],
  source: {
    publisher: "กลุ่มสองคลองควนลัง · Hatyai City Climate",
    url: "https://hatyaicityclimate.org/zone/kuanlang",
    license: "CC BY-SA 3.0",
    note: "เกณฑ์อาจปรับเปลี่ยนในแต่ละปี",
  },
};

/** คำอธิบายเกณฑ์เป็นภาษาคน */
export function thresholdText(t: FlagThreshold): string {
  if (t.type === "deck") return "น้ำถึงพื้นสะพาน (จมสะพาน)";
  if (t.type === "msl") return `ระดับน้ำ ${t.value} ม.รทก.`;
  return `ต่ำกว่าท้องสะพาน ${t.meters} ม.`;
}

/** เกณฑ์ → ระดับน้ำ (ม.รทก.) ที่ทำให้ยกธง · ขาดค่าสะพานที่ต้องใช้ = null */
export function thresholdMsl(t: FlagThreshold, bridge: Pick<FlagBridgeDef, "soffitMsl" | "deckMsl">): number | null {
  if (t.type === "msl") return Number.isFinite(t.value) ? t.value : null;
  if (t.type === "deck") return bridge.deckMsl !== null && Number.isFinite(bridge.deckMsl) ? bridge.deckMsl : null;
  return bridge.soffitMsl !== null && Number.isFinite(bridge.soffitMsl) ? bridge.soffitMsl - t.meters : null;
}

/** เส้นเกณฑ์หนึ่งระดับของสะพาน (คำนวณแล้ว) */
export interface FlagLine {
  level: FlagLevelDef;
  msl: number;
  rule: string;
  viaDeck: boolean;
}

export interface BridgeFlagEstimate {
  bridge: FlagBridgeDef;
  levelMsl: number | null;
  /** เส้นเกณฑ์ที่คำนวณได้ เรียงจากระดับต่ำ → สูง */
  lines: FlagLine[];
  /** ธงโดยประมาณ · null = ไม่ทราบ (ไม่มีระดับน้ำหรือไม่มีเกณฑ์ที่คำนวณได้) */
  flag: FlagLevelDef | null;
  /** เส้นถัดไปที่น้ำยังไม่ถึง และระยะ (ม.) · ถึงเส้นสูงสุดแล้ว = null */
  next: { line: FlagLine; meters: number } | null;
}

const finite = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);

/** ธงโดยประมาณของสะพานหนึ่ง · ไม่มีระดับน้ำ/เกณฑ์ หรือค่าเพี้ยน = ไม่ทราบ (ห้ามเดาว่าปกติ) */
export function estimateBridgeFlag(config: FlagCriteriaConfig, bridge: FlagBridgeDef, levelMsl: number | null): BridgeFlagEstimate {
  const lines: FlagLine[] = [];
  for (const level of config.levels.slice(1)) {
    const t = bridge.thresholds[level.key];
    if (!t) continue;
    const msl = thresholdMsl(t, bridge);
    if (msl !== null) lines.push({ level, msl, rule: thresholdText(t), viaDeck: t.type === "deck" });
  }
  const water = finite(levelMsl) ? levelMsl : null;
  if (water === null || lines.length === 0) return { bridge, levelMsl: water, lines, flag: null, next: null };
  const reached = lines.filter((l) => water >= l.msl);
  const flag = reached.at(-1)?.level ?? config.levels[0] ?? null;
  const nextLine = lines.find((l) => water < l.msl);
  return { bridge, levelMsl: water, lines, flag, next: nextLine ? { line: nextLine, meters: nextLine.msl - water } : null };
}

const rank = (config: FlagCriteriaConfig, level: FlagLevelDef | null) => (level ? config.levels.findIndex((l) => l.key === level.key) : -1);

/** ธงของกลุ่ม = ธงสูงสุดของทุกสะพาน (สะพานใดถึงเกณฑ์ก็ยกธง — ระวังไว้ก่อน) · สะพานที่ไม่ทราบไม่นับ · ไม่ทราบทั้งหมด = null */
export function estimateCommunityFlag(config: FlagCriteriaConfig, bridges: readonly BridgeFlagEstimate[]): FlagLevelDef | null {
  return bridges.reduce<FlagLevelDef | null>((best, b) => (rank(config, b.flag) > rank(config, best) ? b.flag : best), null);
}

/** สะพานที่ใกล้ธงระดับถัดไปที่สุด — ใช้บอก "อีกเท่าไรจะยกธง" */
export function closestToNextFlag(bridges: readonly BridgeFlagEstimate[]): { bridge: string; stationCode: string; next: FlagLevelDef; meters: number } | null {
  let best: { bridge: string; stationCode: string; next: FlagLevelDef; meters: number } | null = null;
  for (const b of bridges) {
    if (!b.next) continue;
    if (!best || b.next.meters < best.meters) best = { bridge: b.bridge.bridge, stationCode: b.bridge.stationCode, next: b.next.line.level, meters: b.next.meters };
  }
  return best;
}

// ---------- ตรวจความถูกต้องของชุดเกณฑ์ (ใช้ทั้งตัวแก้ฝั่ง client และ server) ----------

export const LEVEL_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,19}$/;
export const STATION_CODE_PATTERN = /^[A-Za-z0-9.\-]{1,16}$/;

/** ข้อผิดพลาดแรกที่พบ (ภาษาไทย) · ไม่มี = null */
export function validateFlagCriteria(config: FlagCriteriaConfig): string | null {
  const { levels, bridges } = config;
  if (levels.length < 2) return "ต้องมีอย่างน้อย 2 ระดับธง (ปกติ + อย่างน้อย 1 ระดับเตือน)";
  if (levels.length > 8) return "มีระดับธงได้ไม่เกิน 8 ระดับ";
  const keys = new Set<string>();
  for (const l of levels) {
    if (!LEVEL_KEY_PATTERN.test(l.key)) return `รหัสระดับ “${l.key}” ไม่ถูกต้อง`;
    if (keys.has(l.key)) return `รหัสระดับ “${l.key}” ซ้ำกัน`;
    keys.add(l.key);
    if (!l.label.trim()) return "ระดับธงต้องมีชื่อธง";
  }
  if (bridges.length === 0) return "ต้องมีอย่างน้อย 1 สะพาน";
  const codes = new Set<string>();
  for (const b of bridges) {
    const name = b.bridge.trim() || b.stationCode;
    if (!b.bridge.trim()) return "สะพานต้องมีชื่อ";
    if (!STATION_CODE_PATTERN.test(b.stationCode)) return `${name}: รหัสสถานีไม่ถูกต้อง`;
    if (codes.has(b.stationCode)) return `สถานี ${b.stationCode} ใช้ซ้ำกับสะพานอื่น`;
    codes.add(b.stationCode);
    if (finite(b.soffitMsl) && finite(b.deckMsl) && b.deckMsl < b.soffitMsl) return `${name}: ระดับพื้นสะพานต้องไม่ต่ำกว่าระดับท้องสะพาน`;
    if (levels[0] && b.thresholds[levels[0].key]) return `${name}: ระดับ “${levels[0].label}” เป็นระดับปกติ ไม่มีเกณฑ์`;
    let prev: { label: string; msl: number } | null = null;
    for (const level of levels.slice(1)) {
      const t = b.thresholds[level.key];
      if (!t) continue;
      if (t.type === "belowSoffit" && !finite(b.soffitMsl)) return `${name}: เกณฑ์ “${level.label}” อ้างท้องสะพาน แต่ยังไม่ได้ใส่ระดับท้องสะพาน`;
      if (t.type === "deck" && !finite(b.deckMsl)) return `${name}: เกณฑ์ “${level.label}” อ้างพื้นสะพาน แต่ยังไม่ได้ใส่ระดับพื้นสะพาน`;
      const msl = thresholdMsl(t, b);
      if (msl === null) return `${name}: เกณฑ์ “${level.label}” คำนวณไม่ได้`;
      if (prev && msl <= prev.msl) return `${name}: เกณฑ์ “${level.label}” (${msl.toFixed(2)} ม.รทก.) ต้องสูงกว่า “${prev.label}” (${prev.msl.toFixed(2)} ม.รทก.)`;
      prev = { label: level.label, msl };
    }
    for (const key of Object.keys(b.thresholds)) if (!keys.has(key)) return `${name}: มีเกณฑ์ของระดับที่ถูกลบไปแล้ว`;
  }
  return null;
}

// ---------- รายการที่เปลี่ยน (ประวัติ + Audit Log) ----------

const fmtThreshold = (t: FlagThreshold | undefined) => (t ? thresholdText(t) : "ไม่ใช้");
const fmtMsl = (n: number | null) => (n === null ? "ไม่ระบุ" : `${n} ม.รทก.`);

/** สรุปสิ่งที่เปลี่ยนระหว่างสองชุดเกณฑ์ เป็นข้อความภาษาไทย */
export function diffFlagCriteria(before: FlagCriteriaConfig, after: FlagCriteriaConfig): string[] {
  const out: string[] = [];
  const beforeLevels = new Map(before.levels.map((l) => [l.key, l]));
  const afterLevels = new Map(after.levels.map((l) => [l.key, l]));
  for (const l of after.levels) {
    const old = beforeLevels.get(l.key);
    if (!old) {
      out.push(`เพิ่มระดับ “${l.label}” (สี${FLAG_COLOR_LABEL[l.color]})`);
      continue;
    }
    for (const [field, name] of [["label", "ชื่อธง"], ["title", "สถานการณ์"], ["headline", "ข้อความบนหน้าแรก"], ["action", "สิ่งที่ต้องทำ"]] as const) {
      if (old[field] !== l[field]) out.push(`${old.label}: ${name} “${old[field]}” → “${l[field]}”`);
    }
    if (old.color !== l.color) out.push(`${l.label}: สี${FLAG_COLOR_LABEL[old.color]} → สี${FLAG_COLOR_LABEL[l.color]}`);
    if (old.siren !== l.siren) out.push(`${l.label}: ${l.siren ? "เพิ่ม" : "เอา"}ไซเรน${l.siren ? "" : "ออก"}`);
  }
  for (const l of before.levels) if (!afterLevels.has(l.key)) out.push(`ลบระดับ “${l.label}”`);
  if (before.levels.map((l) => l.key).join() !== after.levels.map((l) => l.key).join() && before.levels.length === after.levels.length) {
    out.push(`เรียงลำดับระดับใหม่: ${after.levels.map((l) => l.label).join(" → ")}`);
  }

  const beforeBridges = new Map(before.bridges.map((b) => [b.stationCode, b]));
  const afterCodes = new Set(after.bridges.map((b) => b.stationCode));
  for (const b of after.bridges) {
    const old = beforeBridges.get(b.stationCode);
    if (!old) {
      out.push(`เพิ่มสะพาน “${b.bridge}” (สถานี ${b.stationCode})`);
      continue;
    }
    if (old.bridge !== b.bridge) out.push(`สถานี ${b.stationCode}: ชื่อสะพาน “${old.bridge}” → “${b.bridge}”`);
    if (old.canal !== b.canal) out.push(`${b.bridge}: ลำน้ำ “${old.canal}” → “${b.canal}”`);
    if (old.soffitMsl !== b.soffitMsl) out.push(`${b.bridge}: ระดับท้องสะพาน ${fmtMsl(old.soffitMsl)} → ${fmtMsl(b.soffitMsl)}`);
    if (old.deckMsl !== b.deckMsl) out.push(`${b.bridge}: ระดับพื้นสะพาน ${fmtMsl(old.deckMsl)} → ${fmtMsl(b.deckMsl)}`);
    if (old.sourceNote !== b.sourceNote || old.sourceUrl !== b.sourceUrl) out.push(`${b.bridge}: แก้ที่มาของระดับสะพาน`);
    for (const level of after.levels.slice(1)) {
      const a = JSON.stringify(old.thresholds[level.key] ?? null);
      const c = JSON.stringify(b.thresholds[level.key] ?? null);
      if (a !== c) out.push(`${b.bridge}: ${level.label} ${fmtThreshold(old.thresholds[level.key])} → ${fmtThreshold(b.thresholds[level.key])}`);
    }
  }
  for (const b of before.bridges) if (!afterCodes.has(b.stationCode)) out.push(`ลบสะพาน “${b.bridge}”`);
  if (JSON.stringify(before.source) !== JSON.stringify(after.source)) out.push("แก้ที่มาของเกณฑ์");
  return out;
}
