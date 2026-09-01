import { describe, expect, it } from "vitest";
import {
  ACCOUNT_STATUS_LABELS,
  canRecover,
  canToggleActivation,
  deriveAccountStatus,
  type AccountStatus,
} from "../../domain/admin/account-status";

describe("deriveAccountStatus", () => {
  it("isActive = true → ACTIVE เสมอ ไม่ว่าคำขอจะอยู่สถานะใด", () => {
    expect(deriveAccountStatus(true, null)).toBe("ACTIVE");
    expect(deriveAccountStatus(true, "APPROVED")).toBe("ACTIVE");
    expect(deriveAccountStatus(true, "PENDING")).toBe("ACTIVE");
  });

  it("รออนุมัติต้องไม่ถูกแสดงเป็นปิดใช้งาน (คนละคำสั่งงาน)", () => {
    expect(deriveAccountStatus(false, "PENDING")).toBe("PENDING_APPROVAL");
    expect(deriveAccountStatus(false, "PENDING")).not.toBe("DEACTIVATED");
  });

  it("คำขอที่ถูกปฏิเสธ/ยกเลิก แยกออกจากบัญชีที่ถูกปิด", () => {
    expect(deriveAccountStatus(false, "REJECTED")).toBe("REJECTED");
    expect(deriveAccountStatus(false, "CANCELLED")).toBe("CANCELLED");
  });

  it("อนุมัติแล้วแต่ตอนนี้ปิดอยู่ = ถูกปิดภายหลัง", () => {
    expect(deriveAccountStatus(false, "APPROVED")).toBe("DEACTIVATED");
  });

  it("บัญชีที่ไม่เคยผ่านคิวสมัคร (script/seed) และปิดอยู่ = ปิดใช้งาน", () => {
    // สมมติฐานที่บันทึกไว้ (Owner Decision #R6-C):
    // ผู้ใช้ที่ไม่มี RegistrationRequest คือบัญชีที่ ADMIN สร้างให้ / Seed / Legacy
    // **ไม่ใช่** ผู้สมัครที่กำลังรออนุมัติ — ผู้สมัครทุกคนต้องมีคำขอเสมอ
    // (lib/registration/core.ts สร้าง User กับ RegistrationRequest คู่กัน)
    // ถ้าวันหนึ่งมีเส้นทางสมัครที่ไม่สร้างคำขอ สมมติฐานนี้จะพัง และเทสต์นี้คือจุดที่ต้องกลับมาแก้
    expect(deriveAccountStatus(false, null)).toBe("DEACTIVATED");
    expect(deriveAccountStatus(false, null)).not.toBe("PENDING_APPROVAL");
    // และต้องเปิด/ปิดได้ตามปกติ ไม่ถูกกันด้วย NOT_TOGGLEABLE
    expect(canToggleActivation(deriveAccountStatus(false, null))).toBe(true);
  });
});

describe("canToggleActivation", () => {
  it("เปิด/ปิดได้เฉพาะบัญชีที่เคยใช้งานได้", () => {
    expect(canToggleActivation("ACTIVE")).toBe(true);
    expect(canToggleActivation("DEACTIVATED")).toBe(true);
  });

  it("บัญชีที่ยังไม่ผ่านการอนุมัติต้องใช้เส้นทางอนุมัติ ไม่ใช่ปุ่มเปิดบัญชี", () => {
    // ถ้าเปิดบัญชีตรง ๆ ได้ จะข้ามการมอบ Role/Scope ที่ผูกกับการอนุมัติไป
    // ผู้ใช้จะ login ได้แต่ไม่มีสิทธิ์ใดเลย
    expect(canToggleActivation("PENDING_APPROVAL")).toBe(false);
    expect(canToggleActivation("REJECTED")).toBe(false);
    expect(canToggleActivation("CANCELLED")).toBe(false);
  });
});

describe("canRecover", () => {
  it("กู้คืนได้เฉพาะบัญชีที่ถูกปฏิเสธ/ยกเลิกคำขอ", () => {
    expect(canRecover("REJECTED")).toBe(true);
    expect(canRecover("CANCELLED")).toBe(true);
  });

  it("บัญชีที่ใช้งานได้/ปิด/รออนุมัติ ไม่ใช้ปุ่มกู้คืน", () => {
    // ACTIVE/DEACTIVATED ใช้ปุ่มเปิด-ปิด · PENDING ใช้คิวอนุมัติปกติ
    expect(canRecover("ACTIVE")).toBe(false);
    expect(canRecover("DEACTIVATED")).toBe(false);
    expect(canRecover("PENDING_APPROVAL")).toBe(false);
  });
});

describe("ACCOUNT_STATUS_LABELS", () => {
  it("ทุกสถานะต้องมีคำอธิบายภาษาไทย", () => {
    const all: AccountStatus[] = [
      "ACTIVE",
      "PENDING_APPROVAL",
      "REJECTED",
      "CANCELLED",
      "DEACTIVATED",
    ];
    for (const status of all) {
      expect(ACCOUNT_STATUS_LABELS[status]).toBeTruthy();
    }
    // ป้ายต้องไม่ซ้ำกัน มิฉะนั้นแอดมินแยกสถานะจากหน้าจอไม่ออก
    const labels = all.map((s) => ACCOUNT_STATUS_LABELS[s]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
