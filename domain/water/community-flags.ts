// เกณฑ์ธงเตือนภัยของกลุ่มสองคลองควนลัง + "ธงโดยประมาณ" (หน้าต้นแบบ /lab/song-khlong) — Pure Function
// -----------------------------------------------------------------------------
// เกณฑ์: "แนวปฏิบัติระดับชุมชนเพื่อรับมืออุทกภัย กลุ่มสองคลองควนลัง" ข้อ 5 และรูปความหมายของธง
// ที่ https://hatyaicityclimate.org/zone/kuanlang (CC BY-SA 3.0) · คัดลอกเมื่อ 2026-11-02
// ต้นฉบับระบุว่า "อาจมีการปรับเปลี่ยนในแต่ละปี" — ถ้านำไปใช้จริงควรย้ายไปเก็บในฐานข้อมูลพร้อมปีที่ใช้
//
// ⚠️ ธงที่คำนวณที่นี่เป็น "ค่าประมาณ" ไม่ใช่ธงที่ประกาศ:
//   เกณฑ์วัดจาก "ท้องสะพาน" แต่ยังไม่มีค่าท้องสะพานทางการ จึงใช้ "ระดับคอสะพานล่าง (ฝั่งซ้าย)" จาก
//   รูปตัดขวางลำน้ำประจำปี 2569 ของกรมชลประทานแทน (Owner Decision 2026-11-02) — ได้ค่าทางการเมื่อไร แก้ที่ BRIDGE_REFERENCES จุดเดียว
//   จุดตรวจสอบ: เกณฑ์ธงแดงบางศาลาที่คำนวณได้ (~7.93) ใกล้กับเกณฑ์เฝ้าระวัง X.90 = 8.00 ม.รทก. ที่ Hatyai City Climate ใช้

export type FlagLevel = "GREEN" | "YELLOW" | "RED" | "RED_SIREN";
/** ธงโดยประมาณ — ไม่มี RED_SIREN เพราะต้นฉบับไม่มีเกณฑ์เป็นตัวเลข */
export type EstimatedFlag = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export const COMMUNITY_FLAG_SOURCE = {
  publisher: "กลุ่มสองคลองควนลัง · Hatyai City Climate",
  url: "https://hatyaicityclimate.org/zone/kuanlang",
  license: "CC BY-SA 3.0",
  copiedOn: "2026-11-02",
} as const;

export const COMMUNITY_FLAGS: ReadonlyArray<{ level: FlagLevel; title: string; action: string }> = [
  { level: "GREEN", title: "สถานการณ์ปกติ", action: "ยังไม่มีผลกระทบในพื้นที่ ติดตามข้อมูลต่อเนื่อง" },
  { level: "YELLOW", title: "เฝ้าระวัง", action: "ติดตามข้อมูลอย่างใกล้ชิด เตรียมพร้อม 100% อพยพผู้ป่วยติดเตียงและผู้ฟอกไต" },
  { level: "RED", title: "ฝนตกหนัก เกิดอุทกภัย", action: "อพยพประชาชนกลุ่มเปราะบางและกลุ่มเสี่ยง" },
  { level: "RED_SIREN", title: "เกิดอุทกภัย", action: "ประชาชนอยู่ในที่สูง ไม่ควรออกจากพื้นที่" },
];

/** เกณฑ์หนึ่งข้อ: ผิวน้ำต่ำกว่าท้องสะพาน x ม. · หรือ "จมสะพาน" (น้ำถึงพื้นสะพาน) */
export type FlagThreshold = { belowSoffitM: number } | { deck: true };

export interface BridgeCriterion {
  bridge: string;
  /** ลำน้ำที่สะพานนี้ข้าม */
  canal: string;
  /** สถานีโทรมาตรของกรมชลประทาน (ThaiWater) ที่ตั้งอยู่ที่สะพานนี้ */
  stationCode: string;
  yellow: FlagThreshold;
  red: FlagThreshold;
}

export const FLAG_BRIDGE_CRITERIA: readonly BridgeCriterion[] = [
  { bridge: "สะพานบ้านคลองหวะ", canal: "คลองหวะ", stationCode: "X.174", yellow: { belowSoffitM: 4 }, red: { belowSoffitM: 3 } },
  { bridge: "สะพานม่วงก็อง", canal: "คลองอู่ตะเภา (ต้นน้ำ)", stationCode: "X.173A", yellow: { belowSoffitM: 1 }, red: { deck: true } },
  { bridge: "สะพานบางศาลา", canal: "คลองอู่ตะเภา", stationCode: "X.90", yellow: { belowSoffitM: 3 }, red: { belowSoffitM: 2 } },
];

/** ระดับอ้างอิงของสะพาน (ม.รทก.) — กรมชลประทาน รูปตัดขวางลำน้ำประจำปี 2569 (สำรวจ ม.ค. 2569) */
export const BRIDGE_REFERENCES: Readonly<Record<string, { soffitMsl: number; deckMsl: number; sourceUrl: string }>> = {
  // soffitMsl = "ระดับคอสะพานล่าง (L.B.)" ใช้แทนท้องสะพานชั่วคราว · deckMsl = "ระดับคอสะพานบน" (ค่าต่ำกว่าของสองฝั่ง)
  "X.174": { soffitMsl: 10.019, deckMsl: 11.222, sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X174.pdf" },
  "X.173A": { soffitMsl: 15.315, deckMsl: 16.963, sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X173A.pdf" },
  "X.90": { soffitMsl: 9.93, deckMsl: 11.254, sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X90.pdf" },
};

/** เกณฑ์ → ระดับน้ำ (ม.รทก.) ที่ทำให้ยกธง */
export function thresholdMsl(t: FlagThreshold, ref: { soffitMsl: number; deckMsl: number }): number {
  return "deck" in t ? ref.deckMsl : ref.soffitMsl - t.belowSoffitM;
}

export interface BridgeFlagEstimate {
  criterion: BridgeCriterion;
  levelMsl: number | null;
  yellowMsl: number | null;
  redMsl: number | null;
  flag: EstimatedFlag;
}

/** ธงโดยประมาณของสะพานหนึ่ง · ไม่มีระดับน้ำ/ค่าอ้างอิง หรือค่าเพี้ยน = UNKNOWN (ห้ามเดาว่าปกติ) */
export function estimateBridgeFlag(criterion: BridgeCriterion, levelMsl: number | null): BridgeFlagEstimate {
  const ref = BRIDGE_REFERENCES[criterion.stationCode];
  const yellowMsl = ref ? thresholdMsl(criterion.yellow, ref) : null;
  const redMsl = ref ? thresholdMsl(criterion.red, ref) : null;
  let flag: EstimatedFlag = "UNKNOWN";
  if (levelMsl !== null && Number.isFinite(levelMsl) && yellowMsl !== null && redMsl !== null) {
    flag = levelMsl >= redMsl ? "RED" : levelMsl >= yellowMsl ? "YELLOW" : "GREEN";
  }
  return { criterion, levelMsl, yellowMsl, redMsl, flag };
}

const RANK: Record<EstimatedFlag, number> = { UNKNOWN: -1, GREEN: 0, YELLOW: 1, RED: 2 };

/**
 * ธงโดยประมาณของกลุ่ม = ธงสูงสุดของทุกสะพาน (สะพานใดถึงเกณฑ์ก็ยกธง — ระวังไว้ก่อน)
 * สะพานที่ไม่มีข้อมูลไม่นับ · ไม่มีข้อมูลเลย = UNKNOWN
 */
export function estimateCommunityFlag(bridges: readonly BridgeFlagEstimate[]): EstimatedFlag {
  return bridges.reduce<EstimatedFlag>((best, b) => (RANK[b.flag] > RANK[best] ? b.flag : best), "UNKNOWN");
}

/** สะพานที่ใกล้ธงระดับถัดไปที่สุด (ระยะ ม.) — ใช้บอกว่า "อีกเท่าไรจะยกธง" · ไม่มีข้อมูลหรือถึงธงแดงแล้ว = null */
export function closestToNextFlag(bridges: readonly BridgeFlagEstimate[]): { bridge: string; next: "YELLOW" | "RED"; meters: number } | null {
  let best: { bridge: string; next: "YELLOW" | "RED"; meters: number } | null = null;
  for (const b of bridges) {
    if (b.levelMsl === null || b.yellowMsl === null || b.redMsl === null) continue;
    const next = b.flag === "GREEN" ? ("YELLOW" as const) : b.flag === "YELLOW" ? ("RED" as const) : null;
    if (!next) continue;
    const meters = (next === "YELLOW" ? b.yellowMsl : b.redMsl) - b.levelMsl;
    if (!best || meters < best.meters) best = { bridge: b.criterion.bridge, next, meters };
  }
  return best;
}

/**
 * มาตราส่วนแถบธงของสะพานหนึ่ง (ใช้วาดแถบ เขียว → เหลือง → แดง พร้อมหมุดระดับน้ำ) — ค่าเป็น % ของความกว้างแถบ
 * ช่วงแถบ: ต่ำกว่าเกณฑ์เหลือง 3 ม. (หรือต่ำกว่าระดับน้ำ ถ้าน้ำต่ำกว่านั้น) ถึงเหนือเกณฑ์แดง 1 ม.
 * ไม่มีระดับน้ำ/เกณฑ์ = null (ห้ามวาดหมุดจากข้อมูลที่ไม่มี)
 */
export function flagBarScale(b: BridgeFlagEstimate): { yellowPct: number; redPct: number; levelPct: number } | null {
  if (b.levelMsl === null || !Number.isFinite(b.levelMsl) || b.yellowMsl === null || b.redMsl === null) return null;
  const lo = Math.min(b.yellowMsl - 3, b.levelMsl - 0.5);
  const hi = Math.max(b.redMsl + 1, b.levelMsl + 0.5);
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  return { yellowPct: pct(b.yellowMsl), redPct: pct(b.redMsl), levelPct: pct(b.levelMsl) };
}
