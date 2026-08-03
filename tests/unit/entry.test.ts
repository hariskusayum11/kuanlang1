import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import {
  LOCK_DURATION_MS,
  isLockExpired,
  lockExpiryFrom,
  lockRemainingMs,
} from "../../lib/entry/lock";
import { ENTRY_STEPS, visibleSteps, type MasterKey } from "../../lib/entry/steps";
import { buildAuthorization } from "../../lib/authz/access";
import { defaultLandingPath } from "../../lib/navigation";
import {
  PUBLIC_MIN_AGGREGATE,
  formatSensitiveAggregate,
} from "../../lib/public/stats";

describe("lock helpers", () => {
  const now = new Date("2026-07-22T10:00:00Z");

  it("lockExpiryFrom = now + 10 นาที", () => {
    expect(lockExpiryFrom(now).getTime()).toBe(now.getTime() + LOCK_DURATION_MS);
    expect(LOCK_DURATION_MS).toBe(10 * 60 * 1000);
  });

  it("isLockExpired: null = หมดอายุ, อนาคต = ยังไม่หมด, อดีต/พอดี = หมด", () => {
    expect(isLockExpired(null, now)).toBe(true);
    expect(isLockExpired(new Date(now.getTime() + 1000), now)).toBe(false);
    expect(isLockExpired(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isLockExpired(now, now)).toBe(true);
  });

  it("lockRemainingMs ไม่ติดลบ", () => {
    expect(lockRemainingMs(new Date(now.getTime() + 5000), now)).toBe(5000);
    expect(lockRemainingMs(new Date(now.getTime() - 5000), now)).toBe(0);
    expect(lockRemainingMs(null, now)).toBe(0);
  });
});

describe("wizard step config (ยึด Data Dictionary)", () => {
  const allFields = ENTRY_STEPS.flatMap((s) => s.fields);

  it("ไม่มีฟิลด์ต้องห้าม: lastFloodYear (QM-11) และ lineUserId", () => {
    const names = allFields.map((f) => f.name);
    expect(names).not.toContain("lastFloodYear");
    expect(names).not.toContain("lineUserId");
  });

  it("ชื่อฟิลด์ไม่ซ้ำกันทั้ง wizard", () => {
    const names = allFields.map((f) => f.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("masterKey ทุกตัวถูกต้องตาม EntryMasterData", () => {
    const valid: MasterKey[] = [
      "namePrefixes",
      "buildingTypes",
      "ownershipTypes",
      "tambons",
      "moos",
      "vulnerabilityTypes",
      "assistanceNeedTypes",
      "resourceTypes",
      "alertChannels",
      "volunteerSkillTypes",
    ];
    for (const f of allFields) {
      if (f.masterKey) expect(valid).toContain(f.masterKey);
      // ต้องมีแหล่งตัวเลือกทางเดียว: masterKey หรือ options ไม่ใช่ทั้งคู่
      if (f.masterKey) expect(f.options).toBeUndefined();
    }
  });

  it("radio/checkbox ทุกฟิลด์มีแหล่งตัวเลือก", () => {
    for (const f of allFields) {
      if (f.type === "radio" || f.type === "checkbox-group") {
        expect(Boolean(f.masterKey) || (f.options?.length ?? 0) > 0).toBe(true);
      }
    }
  });

  it("Critical fields ⭐ ตาม docs/03 ครบ", () => {
    const critical = allFields.filter((f) => f.critical).map((f) => f.name);
    for (const expected of [
      "respondentPhone",
      "houseNo",
      "mooId",
      "latitudeText", // พิกัดแยกเป็นสองช่อง ละติจูด(primary)/ลองจิจูด(pair)
      "floodDepthMetersRaw", // measure-pair — คำถามเดียวคุมทั้งเมตร+ซม.
    ]) {
      expect(critical).toContain(expected);
    }
  });

  it("ระดับน้ำท่วมเป็น 2 ช่องดิบตามกระดาษ (QM-08) — คำถามเดียว measure-pair, ไม่มีช่องรวม cm", () => {
    const names = allFields.map((f) => f.name);
    const depth = allFields.find((f) => f.name === "floodDepthMetersRaw");
    // คำถามเดียวชนิด measure-pair ที่มีช่องที่สอง floodDepthCmRaw (ตรงกระดาษ 2 ช่อง)
    expect(depth?.type).toBe("measure-pair");
    expect(depth?.pair?.name).toBe("floodDepthCmRaw");
    // ช่องที่สองไม่ใช่ field แยก (ผูกใน pair) และไม่มีช่องรวม cm ที่ให้คีย์เอง
    expect(names).not.toContain("floodDepthCmRaw");
    expect(names).not.toContain("maxFloodDepthCm");
  });

  it("skip logic (FR-ENT-13): ไม่มีเปราะบาง → ข้ามตารางและความต้องการช่วยเหลือ", () => {
    const whenNo = visibleSteps(false).map((s) => s.id);
    expect(whenNo).not.toContain("vulnerable-persons");
    expect(whenNo).not.toContain("assistance");

    const whenYes = visibleSteps(true).map((s) => s.id);
    const whenUnknown = visibleSteps(null).map((s) => s.id);
    for (const ids of [whenYes, whenUnknown]) {
      expect(ids).toContain("vulnerable-persons");
      expect(ids).toContain("assistance");
    }
  });

  it("riskLevelSurveyor มี 3 ตัวเลือกตามกระดาษ (AMB-05)", () => {
    const field = allFields.find((f) => f.name === "riskLevelSurveyor");
    expect(field?.options?.map((o) => o.value)).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });
});

describe("defaultLandingPath — ครบทุก role ใน UserRoleEnum", () => {
  // ตาราง landing ตาม docs/26 §6 — permission เป็น source of truth (ไม่เช็ค role string ในโค้ดจริง)
  const EXPECTED_LANDING: Record<UserRoleEnum, string | null> = {
    [UserRoleEnum.ADMIN]: "/dashboard",
    [UserRoleEnum.EXECUTIVE]: "/dashboard",
    [UserRoleEnum.OFFICER]: "/dashboard",
    [UserRoleEnum.COORDINATOR]: "/dashboard",
    [UserRoleEnum.VOLUNTEER]: "/dashboard",
    [UserRoleEnum.RESEARCHER]: "/dashboard",
    [UserRoleEnum.DATA_ENTRY]: "/surveys",
    [UserRoleEnum.VERIFIER]: "/verification",
    // ยังไม่มีหน้า implemented ในสิทธิ์ → null (ผู้เรียกส่งไป /access-denied — ไม่เกิด loop)
    [UserRoleEnum.FIELD_SURVEYOR]: null,
  };

  for (const role of Object.values(UserRoleEnum)) {
    it(`${role} → ${EXPECTED_LANDING[role] ?? "null (access-denied)"}`, () => {
      const { permissions } = buildAuthorization([role]);
      expect(defaultLandingPath(permissions)).toBe(EXPECTED_LANDING[role]);
    });
  }

  it("ไม่มีสิทธิ์ → null", () => {
    expect(defaultLandingPath([])).toBeNull();
  });
});

describe("formatSensitiveAggregate — k-anonymity suppression (public)", () => {
  it("ค่า 0 ถึง threshold-1 ถูก suppress ทั้งหมด (รวม 0 — ไม่ยืนยันว่ามี/ไม่มี)", () => {
    for (const n of [0, 1, 2, 3, PUBLIC_MIN_AGGREGATE - 1]) {
      expect(formatSensitiveAggregate(n)).toBe(`น้อยกว่า ${PUBLIC_MIN_AGGREGATE}`);
    }
  });

  it("ค่าตั้งแต่ threshold ขึ้นไปแสดงตรง (รูปแบบเลขไทย)", () => {
    expect(formatSensitiveAggregate(PUBLIC_MIN_AGGREGATE)).toBe(
      PUBLIC_MIN_AGGREGATE.toLocaleString("th-TH"),
    );
    expect(formatSensitiveAggregate(1234)).toBe((1234).toLocaleString("th-TH"));
  });

  it("input ผิดปกติ (ลบ/ทศนิยม) ไม่ทำให้เกิดการรั่ว — ปัดเข้ากรอบ suppress", () => {
    expect(formatSensitiveAggregate(-3)).toBe(`น้อยกว่า ${PUBLIC_MIN_AGGREGATE}`);
    expect(formatSensitiveAggregate(4.9)).toBe(`น้อยกว่า ${PUBLIC_MIN_AGGREGATE}`);
  });
});
