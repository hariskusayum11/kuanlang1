// =============================================================================
// Risk Model — Public API
// -----------------------------------------------------------------------------
// จุดเข้าถึงเดียวของโมดูลคำนวณความเสี่ยง — re-export ตรรกะ + config
// ตัวห่อ computeRiskProfile() ใช้ config เริ่มต้น (v1.0-draft) ถ้าไม่ระบุ
// ⚠️ ค่ายังไม่รับรอง — ดู docs/29-risk-values-for-approval.md
// =============================================================================

export * from "./weights";
export * from "./score";
export * from "./factors";

import { DRAFT_RISK_CONFIG_V1, type RiskWeightConfig } from "./weights";
import {
  computeRisk,
  type RiskComputationInput,
  type RiskComputationResult,
} from "./score";

/** คำนวณด้วย config เริ่มต้น (v1.0-draft) เว้นแต่ส่ง config มาแทน */
export function computeRiskProfile(
  input: RiskComputationInput,
  config: RiskWeightConfig = DRAFT_RISK_CONFIG_V1,
): RiskComputationResult {
  return computeRisk(input, config);
}
