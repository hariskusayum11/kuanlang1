// ธงเตือนภัยโดยประมาณ — หน้าแรก (ส่วนหัว + ส่วนธงเตือนภัย + แผนที่)
// ข้อมูลสาธารณะล้วน: ระดับน้ำสถานีของรัฐ × เกณฑ์ธงของชุมชน (เกณฑ์แก้ได้ในระบบ — docs/44) · ไม่มีข้อมูลรายบ้าน
import {
  closestToNextFlag,
  estimateBridgeFlag,
  estimateCommunityFlag,
  type BridgeFlagEstimate,
  type FlagCriteriaConfig,
  type FlagLevelDef,
} from "../../domain/water/community-flags";
import type { StationReading } from "../../domain/water/station-status";

export interface CommunityFlagStatus {
  /** ธงของกลุ่ม · null = ไม่ทราบ */
  flag: FlagLevelDef | null;
  /** ระดับธงทั้งหมดตามเกณฑ์ที่ใช้ (ปกติ → รุนแรง) */
  levels: FlagLevelDef[];
  bridges: BridgeFlagEstimate[];
  /** เวลาวัดล่าสุดของแต่ละสถานี (เวลาไทย "YYYY-MM-DD HH:mm") ตามรหัสสถานี */
  measuredAt: Record<string, string | null>;
  closest: ReturnType<typeof closestToNextFlag>;
  source: FlagCriteriaConfig["source"];
  /** เวอร์ชันของเกณฑ์ (0 = ค่าตั้งต้น) */
  versionNo: number;
}

export function flagStatusFromReadings(config: FlagCriteriaConfig, readings: readonly StationReading[], versionNo = 0): CommunityFlagStatus {
  const reading = (code: string) => readings.find((r) => r.code === code) ?? null;
  const bridges = config.bridges.map((b) => estimateBridgeFlag(config, b, reading(b.stationCode)?.levelMsl ?? null));
  return {
    flag: estimateCommunityFlag(config, bridges),
    levels: config.levels,
    bridges,
    measuredAt: Object.fromEntries(config.bridges.map((b) => [b.stationCode, reading(b.stationCode)?.measuredAt ?? null])),
    closest: closestToNextFlag(bridges),
    source: config.source,
    versionNo,
  };
}
