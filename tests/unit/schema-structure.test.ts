import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const models = Prisma.dmmf.datamodel.models;
const enums = Prisma.dmmf.datamodel.enums;
const model = (n: string) => models.find((m) => m.name === n)!;
const fieldNames = (n: string) => model(n).fields.map((f) => f.name);

const sqlDir = join(process.cwd(), "database", "migrations-draft");
const sql = (f: string) => readFileSync(join(sqlDir, f), "utf8");

describe("Schema structure (DMMF — ไม่ต้องมี DB)", () => {
  // ข้อ 1: Community หนึ่งแห่งมีหลายตำบล
  it("ข้อ1: Community–Tambon เป็น M:N ผ่าน CommunityTambon", () => {
    expect(model("CommunityTambon")).toBeTruthy();
    const ct = fieldNames("CommunityTambon");
    expect(ct).toContain("communityId");
    expect(ct).toContain("tambonId");
    expect(ct).toContain("isPrimary");
    // Community ต้องไม่มี tambonId เดี่ยวแล้ว
    expect(fieldNames("Community")).not.toContain("tambonId");
  });

  // ข้อ 2: Community ไม่มีตำบลหลักได้ (isPrimary default false → 0 primary ได้)
  it("ข้อ2: isPrimary มี default false (รองรับกรณีไม่มีตำบลหลัก)", () => {
    const f = model("CommunityTambon").fields.find((x) => x.name === "isPrimary")!;
    expect(f.type).toBe("Boolean");
    expect(f.hasDefaultValue).toBe(true);
    expect(f.default).toBe(false);
  });

  // ข้อ 3: Partial Unique Index บังคับตำบลหลัก ≤1 (อนุญาต 0)
  it("ข้อ3: มี Partial Unique Index ux_community_primary_tambon (WHERE isPrimary=true)", () => {
    const s = sql("30_constraints.sql");
    expect(s).toMatch(/ux_community_primary_tambon/);
    expect(s).toMatch(/community_tambon"\s*\(\s*"communityId"\s*\)\s*[\s\S]*WHERE\s+"isPrimary"\s*=\s*true/i);
  });

  // ข้อ 8: Trigger ป้องกันคนเดียวกันคีย์ Entry 1 และ 2
  it("ข้อ8: มี Trigger check_different_entry_person", () => {
    const s = sql("20_functions_triggers.sql");
    expect(s).toMatch(/check_different_entry_person/);
    expect(s).toMatch(/trg_entry_different_person[\s\S]*BEFORE INSERT ON "entry_attempt"/);
    expect(s).toMatch(/attemptNo"\s*<>\s*NEW\."attemptNo"/);
  });

  // ข้อ 11: Risk 3 คอลัมน์เก็บได้ แต่ไม่มีการกำหนดระดับ Risk Final
  it("ข้อ11: FloodRiskProfile มี 3 คะแนน แต่ไม่มี Risk Level/Final", () => {
    const f = fieldNames("FloodRiskProfile");
    expect(f).toContain("rawScore");
    expect(f).toContain("maximumPossibleScore");
    expect(f).toContain("normalizedScore");
    // ต้องไม่มี logic/คอลัมน์จัดระดับ Final (WAITING_FOR_BUSINESS_RULE)
    expect(f).not.toContain("riskLevelAuto");
    expect(f).not.toContain("riskLevelFinal");
    expect(f).not.toContain("riskScoreAuto");
    expect(f).not.toContain("absoluteScore");
  });

  // เพิ่มเติม: VOLUNTEER (ไม่ใช่ RESCUE_VOLUNTEER)
  it("Role: มี VOLUNTEER ไม่มี RESCUE_VOLUNTEER", () => {
    const role = enums.find((e) => e.name === "UserRoleEnum")!;
    const vals = role.values.map((v) => v.name);
    expect(vals).toContain("VOLUNTEER");
    expect(vals).not.toContain("RESCUE_VOLUNTEER");
  });

  // เพิ่มเติม: Coverage fields + ไม่มี targetHouseholds
  it("Community: มี Coverage fields ไม่มี targetHouseholds", () => {
    const f = fieldNames("Community");
    expect(f).toContain("totalHouseholds");
    expect(f).toContain("targetCoveragePercent");
    expect(f).not.toContain("targetHouseholds");
  });

  // เพิ่มเติม: ลบ @@unique([houseNo,mooId,tambonId]) → ไม่มี unique นี้
  it("Household: ไม่มี unique [houseNo,mooId,tambonId] (เป็น index แทน)", () => {
    const uniq = model("Household").uniqueIndexes.map((u) => u.fields.join(","));
    expect(uniq).not.toContain("houseNo,mooId,tambonId");
  });

  // เพิ่มเติม: ฟิลด์ดิบจากกระดาษที่อนุมัติ
  it("ฟิลด์ดิบจากกระดาษ: communityNameOnPaper, coordinateRawText, ฯลฯ", () => {
    const h = fieldNames("Household");
    expect(h).toContain("communityNameOnPaper");
    expect(h).toContain("coordinateRawText");
    expect(h).toContain("hasNoResources");
    expect(h).toContain("volunteerNotAvailable");
    expect(h).toContain("assistanceTotalPersonCount");
    const pv = fieldNames("PersonVulnerability");
    expect(pv).toContain("pregnancyRawText");
    expect(pv).toContain("pregnancyUnit");
    const frp = fieldNames("FloodRiskProfile");
    expect(frp).toContain("floodDepthMetersRaw");
    expect(frp).toContain("floodDepthCmRaw");
    // SurveyorRiskLevel enum 3 ค่า
    const sr = enums.find((e) => e.name === "SurveyorRiskLevel")!;
    expect(sr.values.map((v) => v.name)).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });

  // ข้อ 10 (structural): Seed กำหนดควนสันติ (KS01) เชื่อม 2 ตำบล
  it("ข้อ10(structural): seed.ts กำหนด KS01 เชื่อม 2 ตำบล (isPrimary=false ทั้งคู่)", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
    // หา definition จริง (code: "KS01") ไม่ใช่คอมเมนต์หัวไฟล์
    const defStart = seed.indexOf('code: "KS01"');
    expect(defStart).toBeGreaterThan(0);
    const ksBlock = seed.slice(defStart, defStart + 400);
    expect(ksBlock).toMatch(/ควนสันติ/);
    // ควนสันติมี 2 tambons (khuanLang + hatyaiTambon), isPrimary:false ทั้งคู่
    expect(ksBlock).toMatch(/khuanLang\.id, isPrimary: false/);
    expect(ksBlock).toMatch(/hatyaiTambon\.id, isPrimary: false/);
  });
});
