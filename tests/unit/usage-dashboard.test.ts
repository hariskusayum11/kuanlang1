import { describe, expect, it } from "vitest";
import {
  OTHER_PAGE_PATH,
  PAGE_ROUTES,
  isLikelyBot,
  normalisePagePath,
  pagePathLabel,
} from "../../domain/usage/page-path";
import {
  bangkokDayKey,
  buildDailySeries,
  groupSensitiveAccess,
  percentOf,
  summariseRegistrations,
  summariseSeries,
  topPages,
  usageWindow,
} from "../../domain/usage/aggregate";

describe("normalisePagePath — ไม่มีตัวระบุบุคคลหลุดลงฐานข้อมูล", () => {
  it("หน้าคงที่คืนตัวเอง และตัด query / fragment / / ท้าย", () => {
    expect(normalisePagePath("/")).toBe("/");
    expect(normalisePagePath("/dashboard")).toBe("/dashboard");
    expect(normalisePagePath("/households?q=สมชาย&phone=0812345678")).toBe("/households");
    expect(normalisePagePath("/map#layer")).toBe("/map");
    expect(normalisePagePath("/admin/users/")).toBe("/admin/users");
  });

  it("segment ที่เป็นรหัสถูกแทนด้วยชื่อรูปแบบ", () => {
    expect(normalisePagePath("/verification/cm1abc2def3ghi")).toBe("/verification/[householdId]");
    expect(normalisePagePath("/surveys/entry/SK-000123")).toBe("/surveys/entry/[sheetId]");
  });

  it("เส้นทางที่ไม่รู้จัก → หน้าอื่น ๆ (ไม่เก็บข้อความดิบ)", () => {
    expect(normalisePagePath("/households/นายสมชาย")).toBe(OTHER_PAGE_PATH);
    expect(normalisePagePath("/something-new")).toBe(OTHER_PAGE_PATH);
    // segment dynamic ที่มีอักขระแปลกไม่ถือว่าเข้ารูปแบบ
    expect(normalisePagePath("/verification/a b")).toBe(OTHER_PAGE_PATH);
  });

  it("ไม่นับ API, ไฟล์ static, ค่าที่ไม่ใช่ path", () => {
    expect(normalisePagePath("/api/auth/session")).toBeNull();
    expect(normalisePagePath("/_next/static/chunk.js")).toBeNull();
    expect(normalisePagePath("/favicon.ico")).toBeNull();
    expect(normalisePagePath("/robots.txt")).toBeNull();
    expect(normalisePagePath("https://evil.example/x")).toBeNull();
    expect(normalisePagePath("//evil.example")).toBeNull();
    expect(normalisePagePath("")).toBeNull();
    expect(normalisePagePath(42)).toBeNull();
    expect(normalisePagePath(`/${"a".repeat(600)}`)).toBeNull();
  });

  it("ทุกรูปแบบผ่าน CHECK ของตาราง และยาวไม่เกิน 80", () => {
    for (const route of [...PAGE_ROUTES.map((r) => r.pattern), OTHER_PAGE_PATH]) {
      expect(route).toMatch(/^\/[A-Za-z0-9/_\[\]-]*$/);
      expect(route.length).toBeLessThanOrEqual(80);
    }
  });

  it("มีชื่อไทยทุกหน้า", () => {
    expect(pagePathLabel("/settings")).toBe("ตั้งค่าระบบ");
    expect(pagePathLabel(OTHER_PAGE_PATH)).toBe("หน้าอื่น ๆ");
  });
});

describe("isLikelyBot", () => {
  it("UA ว่างและบอทถูกคัดทิ้ง เบราว์เซอร์จริงผ่าน", () => {
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1 Line/14.0")).toBe(false);
    expect(isLikelyBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36")).toBe(false);
  });
});

describe("วันตามเวลาไทย", () => {
  it("bangkokDayKey เลื่อน +7 ชั่วโมง", () => {
    expect(bangkokDayKey(new Date("2026-10-19T16:59:59Z"))).toBe("2026-10-19");
    expect(bangkokDayKey(new Date("2026-10-19T17:00:00Z"))).toBe("2026-10-20");
  });

  it("usageWindow คืน 30 วันรวมวันนี้ และเวลาเริ่มคือเที่ยงคืนไทย", () => {
    const w = usageWindow(new Date("2026-10-19T03:00:00Z"));
    expect(w.days).toHaveLength(30);
    expect(w.endDay).toBe("2026-10-19");
    expect(w.startDay).toBe("2026-09-20");
    expect(w.startInstant.toISOString()).toBe("2026-09-19T17:00:00.000Z");
  });

  it("ข้ามเดือน/ปีอธิกสุรทินได้ และค่า days ผิดใช้ค่าเริ่มต้น", () => {
    const w = usageWindow(new Date("2028-03-01T00:00:00Z"), 3);
    expect(w.days).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(usageWindow(new Date(), 0).days).toHaveLength(30);
  });
});

describe("buildDailySeries / summariseSeries", () => {
  const days = ["2026-10-17", "2026-10-18", "2026-10-19"];

  it("เติมวันที่ไม่มีข้อมูลเป็น 0 และทิ้งแถวนอกช่วง/ค่าเพี้ยน", () => {
    const series = buildDailySeries(
      [
        { day: "2026-10-17", key: "PUBLIC", count: 3 },
        { day: "2026-10-17", key: "SIGNED_IN", count: 2 },
        { day: "2026-10-19", key: "PUBLIC", count: 5 },
        { day: "2026-10-01", key: "PUBLIC", count: 99 },
        { day: "2026-10-18", key: "PUBLIC", count: Number.NaN },
        { day: "2026-10-18", key: "SIGNED_IN", count: -4 },
      ],
      days,
      ["PUBLIC", "SIGNED_IN"] as const,
    );
    expect(series.map((p) => p.total)).toEqual([5, 0, 5]);
    expect(series[0].values).toEqual({ PUBLIC: 3, SIGNED_IN: 2 });
    expect(series[1].values).toEqual({ PUBLIC: 0, SIGNED_IN: 0 });
  });

  it("รองรับ bigint จาก COUNT(*)", () => {
    const series = buildDailySeries([{ day: "2026-10-18", key: "X", count: 7n as unknown as number }], days, ["X"] as const);
    expect(series[1].total).toBe(7);
  });

  it("สรุปยอดรวม ค่าเฉลี่ยต่อวัน วันสูงสุด และจำนวนวันที่มีข้อมูล", () => {
    const series = buildDailySeries(
      [
        { day: "2026-10-17", key: "A", count: 1 },
        { day: "2026-10-19", key: "A", count: 4 },
      ],
      days,
      ["A"] as const,
    );
    expect(summariseSeries(series)).toEqual({
      total: 5,
      days: 3,
      averagePerDay: 1.7,
      peakDay: "2026-10-19",
      peakCount: 4,
      activeDays: 2,
    });
    expect(summariseSeries([])).toMatchObject({ total: 0, averagePerDay: 0, peakDay: null });
  });
});

describe("topPages", () => {
  it("รวมยอดข้ามวัน/กลุ่มผู้ชม เรียงมาก→น้อย มีสัดส่วนและตัวหาร", () => {
    const list = topPages(
      [
        { path: "/", count: 6 },
        { path: "/", count: 4 },
        { path: "/dashboard", count: 4 },
        { path: OTHER_PAGE_PATH, count: 6 },
        { path: "/map", count: 0 },
      ],
      2,
    );
    expect(list.total).toBe(20);
    expect(list.distinct).toBe(3);
    expect(list.items).toEqual([
      { key: "/", label: "หน้าแรกสาธารณะ", count: 10, share: 50 },
      { key: OTHER_PAGE_PATH, label: "หน้าอื่น ๆ", count: 6, share: 30 },
    ]);
  });

  it("ไม่มีข้อมูล → รายการว่าง ตัวหาร 0", () => {
    expect(topPages([])).toEqual({ items: [], total: 0, distinct: 0 });
  });
});

describe("groupSensitiveAccess", () => {
  it("แยก READ / EXPORT และใช้ชื่อไทยของชนิดข้อมูล", () => {
    const summary = groupSensitiveAccess([
      { action: "READ", entityType: "Household", count: 3 },
      { action: "READ", entityType: "MedicalCaseRegistry", count: 1 },
      { action: "EXPORT", entityType: "VulnerablePerson", count: 2 },
      { action: "EXPORT", entityType: "UnknownThing", count: 2 },
    ]);
    expect(summary.reads.total).toBe(4);
    expect(summary.reads.items[0]).toMatchObject({ label: "ครัวเรือนรายใบ", count: 3, share: 75 });
    expect(summary.exports.items.map((i) => i.label)).toEqual(["UnknownThing", "รายชื่อกลุ่มเปราะบาง"]);
  });
});

describe("summariseRegistrations / percentOf", () => {
  it("นับทุกสถานะและรวมเป็นตัวหาร", () => {
    expect(
      summariseRegistrations([
        { status: "PENDING", count: 2 },
        { status: "APPROVED", count: 5 },
        { status: "REJECTED", count: 1 },
      ]),
    ).toEqual({ pending: 2, approved: 5, rejected: 1, cancelled: 0, total: 8 });
  });

  it("ไม่มีตัวหาร → null (ห้ามแสดงเป็น 0%)", () => {
    expect(percentOf(3, 0)).toBeNull();
    expect(percentOf(Number.NaN, 10)).toBeNull();
    expect(percentOf(1, 3)).toBe(33.3);
  });
});
