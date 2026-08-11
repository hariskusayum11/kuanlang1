import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import {
  buildWaitingVerificationWhere,
  canVerify,
  householdCommunityFilter,
  verificationRowActions,
} from "../../lib/verification/queue";
import { normalizeValue } from "../../lib/verification/edit";
import { EDITABLE_BY_KEY, EDITABLE_FIELDS } from "../../lib/verification/editable-fields";
import { buildAuthorization } from "../../lib/authz/access";
import type { AuthorizationContext } from "../../lib/authz/types";

function ctxWith(
  roles: UserRoleEnum[],
  scope: { isGlobalScope?: boolean; communityIds?: string[] } = {},
): AuthorizationContext {
  const { permissions } = buildAuthorization(roles);
  return {
    userId: "u1",
    name: "ทดสอบ",
    email: "t@test.invalid",
    roles,
    permissions,
    isGlobalScope: scope.isGlobalScope ?? false,
    communityIds: scope.communityIds ?? [],
  };
}

describe("canVerify — ต้องมี verification.view", () => {
  it("VERIFIER / OFFICER / ADMIN ตรวจได้", () => {
    expect(canVerify(ctxWith([UserRoleEnum.VERIFIER]))).toBe(true);
    expect(canVerify(ctxWith([UserRoleEnum.OFFICER]))).toBe(true);
    expect(canVerify(ctxWith([UserRoleEnum.ADMIN]))).toBe(true);
  });

  it("DATA_ENTRY / EXECUTIVE ตรวจไม่ได้", () => {
    expect(canVerify(ctxWith([UserRoleEnum.DATA_ENTRY]))).toBe(false);
    expect(canVerify(ctxWith([UserRoleEnum.EXECUTIVE]))).toBe(false);
  });
});

describe("verificationRowActions", () => {
  it("ADMIN แก้/ลบใบตัวเองได้ แต่ยืนยันใบตัวเองไม่ได้", () => {
    expect(verificationRowActions({ isAdmin: true, enteredByMe: true })).toEqual({
      canView: true,
      canConfirm: false,
      canEdit: true,
      canDelete: true,
    });
  });

  it("ผู้ตรวจทั่วไปทำงานใบคนอื่นได้ แต่ลบไม่ได้", () => {
    expect(verificationRowActions({ isAdmin: false, enteredByMe: false })).toEqual({
      canView: true,
      canConfirm: true,
      canEdit: true,
      canDelete: false,
    });
  });

  it("ผู้ตรวจทั่วไปดูใบตัวเองได้อย่างเดียว", () => {
    expect(verificationRowActions({ isAdmin: false, enteredByMe: true })).toEqual({
      canView: true,
      canConfirm: false,
      canEdit: false,
      canDelete: false,
    });
  });
});

describe("householdCommunityFilter — บังคับ scope (ห้าม fallback ทั้งระบบ)", () => {
  it("global scope → ไม่กรอง ({})", () => {
    expect(
      householdCommunityFilter(ctxWith([UserRoleEnum.ADMIN], { isGlobalScope: true })),
    ).toEqual({});
  });

  it("scope ว่าง → null (ไม่เห็นงานใดเลย)", () => {
    expect(
      householdCommunityFilter(ctxWith([UserRoleEnum.VERIFIER], { communityIds: [] })),
    ).toBeNull();
  });

  it("มี scope → กรองเฉพาะชุมชนที่รับผิดชอบ", () => {
    expect(
      householdCommunityFilter(
        ctxWith([UserRoleEnum.VERIFIER], { communityIds: ["c1", "c2"] }),
      ),
    ).toEqual({ communityId: { in: ["c1", "c2"] } });
  });
});

describe("buildWaitingVerificationWhere — badge ใช้เงื่อนไขเดียวกับคิว", () => {
  it("ผู้ไม่มีสิทธิ์ตรวจไม่สร้าง query สำหรับ badge", () => {
    expect(buildWaitingVerificationWhere(ctxWith([UserRoleEnum.DATA_ENTRY]))).toBeNull();
  });

  it("นับเฉพาะ ENTERED_1 ที่ไม่ถูกลบและไม่ตัดสินว่าซ้ำจริง", () => {
    expect(
      buildWaitingVerificationWhere(
        ctxWith([UserRoleEnum.ADMIN], { isGlobalScope: true }),
      ),
    ).toMatchObject({
      deletedAt: null,
      sheet: { status: "ENTERED_1" },
      AND: [{ OR: [{ duplicateResolution: null }, { duplicateResolution: "NOT_DUPLICATE" }] }],
    });
  });
});

describe("EDITABLE_FIELDS — descriptor คงเส้นคงวา", () => {
  it("key ไม่ซ้ำ และ select ต้องมี masterKey", () => {
    const keys = EDITABLE_FIELDS.map((f) => f.key);
    expect(keys.length).toBe(new Set(keys).size);
    for (const f of EDITABLE_FIELDS) {
      if (f.kind === "select") expect(f.masterKey).toBeTruthy();
      if (f.isPhone) expect(f.kind).toBe("phone");
    }
    expect(EDITABLE_BY_KEY.get("respondentPhone")?.isPhone).toBe(true);
    expect(EDITABLE_BY_KEY.get("respondentFirstName")?.sensitive).toBe(true);
    expect(EDITABLE_BY_KEY.get("householdResourceIds")?.exclusiveNone).toEqual({
      key: "hasNoResources",
      label: "ไม่มี",
    });
    expect(EDITABLE_BY_KEY.get("volunteerInterestIds")?.exclusiveNone).toEqual({
      key: "volunteerNotAvailable",
      label: "ไม่สะดวกเข้าร่วม",
    });
    expect(EDITABLE_BY_KEY.get("hasNoResources")?.kind).toBe("boolean");
    expect(EDITABLE_BY_KEY.get("volunteerNotAvailable")?.kind).toBe("boolean");
  });
});

describe("normalizeValue — ตรวจค่าตามชนิดฟิลด์ (pure)", () => {
  const phone = EDITABLE_BY_KEY.get("respondentPhone")!;
  const member = EDITABLE_BY_KEY.get("memberCount")!;
  const houseNo = EDITABLE_BY_KEY.get("houseNo")!;
  const hasVulnerable = EDITABLE_BY_KEY.get("hasVulnerable")!;
  const assistanceNeedIds = EDITABLE_BY_KEY.get("assistanceNeedIds")!;
  const suggestion = EDITABLE_BY_KEY.get("suggestion")!;

  it("phone: normalize +66/ขีด/เว้นวรรค → เลขล้วนขึ้นต้น 0", () => {
    expect(normalizeValue(phone, "+66 81-234 5678")).toEqual({ ok: true, value: "0812345678" });
  });

  it("number: จำนวนเต็มในกรอบผ่าน, ติดลบ/เกิน max/ทศนิยม → ไม่ผ่าน", () => {
    expect(normalizeValue(member, "4")).toEqual({ ok: true, value: "4" });
    expect(normalizeValue(member, "")).toEqual({ ok: true, value: "" }); // ว่าง = ลบค่า
    expect(normalizeValue(member, "-1")).toEqual({ ok: false });
    expect(normalizeValue(member, "9999999")).toEqual({ ok: false }); // เกิน max 5000
    expect(normalizeValue(member, "2.5")).toEqual({ ok: false });
  });

  it("boolean: รับ true/false/อันว่างได้, ค่าแปลก → ไม่ผ่าน", () => {
    expect(hasVulnerable.kind).toBe("boolean");
    expect(normalizeValue(hasVulnerable, false)).toEqual({ ok: true, value: false });
    expect(normalizeValue(hasVulnerable, "true")).toEqual({ ok: true, value: true });
    expect(normalizeValue(hasVulnerable, "")).toEqual({ ok: true, value: "" }); // ล้างค่า
    expect(normalizeValue(hasVulnerable, "ใช่")).toEqual({ ok: false });
  });

  it("checkbox-group: array ผ่าน, null → [] (ล้าง), ค่าไม่ใช่ array → ไม่ผ่าน", () => {
    expect(assistanceNeedIds.kind).toBe("checkbox-group");
    expect(normalizeValue(assistanceNeedIds, ["n1", "n2"])).toEqual({
      ok: true,
      value: ["n1", "n2"],
    });
    expect(normalizeValue(assistanceNeedIds, null)).toEqual({ ok: true, value: [] });
    expect(normalizeValue(assistanceNeedIds, "n1")).toEqual({ ok: false });
  });

  it("text/textarea: trim, ค่าอื่นถูกแปลงเป็นข้อความ, null → ว่าง", () => {
    expect(normalizeValue(houseNo, "  12/3  ")).toEqual({ ok: true, value: "12/3" });
    expect(normalizeValue(houseNo, null)).toEqual({ ok: true, value: "" });
    expect(suggestion.kind).toBe("textarea");
    expect(normalizeValue(suggestion, "  ฝากตรวจ  ")).toEqual({ ok: true, value: "ฝากตรวจ" });
  });
});
