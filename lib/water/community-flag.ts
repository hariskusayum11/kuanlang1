// ธงเตือนภัยโดยประมาณ — ใช้ร่วมระหว่างหน้าแรก (/) และหน้าต้นแบบ /lab/song-khlong
// ข้อมูลสาธารณะล้วน: ระดับน้ำสถานีของรัฐ × เกณฑ์ธงของชุมชน (ไม่มีข้อมูลรายบ้าน)
import {
  closestToNextFlag,
  estimateBridgeFlag,
  estimateCommunityFlag,
  FLAG_BRIDGE_CRITERIA,
  type BridgeFlagEstimate,
  type EstimatedFlag,
} from "../../domain/water/community-flags";
import type { StationReading } from "../../domain/water/station-status";
import { getSongKhlongStations } from "./thaiwater";

export interface CommunityFlagStatus {
  flag: EstimatedFlag;
  bridges: BridgeFlagEstimate[];
  /** เวลาวัดล่าสุดของแต่ละสถานี (เวลาไทย "YYYY-MM-DD HH:mm") ตามรหัสสถานี */
  measuredAt: Record<string, string | null>;
  closest: ReturnType<typeof closestToNextFlag>;
}

export function flagStatusFromReadings(readings: readonly StationReading[]): CommunityFlagStatus {
  const reading = (code: string) => readings.find((r) => r.code === code) ?? null;
  const bridges = FLAG_BRIDGE_CRITERIA.map((c) => estimateBridgeFlag(c, reading(c.stationCode)?.levelMsl ?? null));
  return {
    flag: estimateCommunityFlag(bridges),
    bridges,
    measuredAt: Object.fromEntries(FLAG_BRIDGE_CRITERIA.map((c) => [c.stationCode, reading(c.stationCode)?.measuredAt ?? null])),
    closest: closestToNextFlag(bridges),
  };
}

/** ดึงระดับน้ำ (แคช 10 นาที) แล้วประเมินธง · ดึงไม่ได้ = ธง UNKNOWN (ไม่ throw) */
export async function getCommunityFlagStatus(): Promise<CommunityFlagStatus> {
  const feed = await getSongKhlongStations();
  return flagStatusFromReadings(feed.readings);
}
