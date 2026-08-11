import { describe, expect, it } from "vitest";
import { getSystemPreferences } from "../../lib/settings/core";

describe("Integration: system settings", () => {
  it("อ่านค่าจาก SystemSetting และ fallback ได้", async () => {
    const settings = await getSystemPreferences();
    expect(["VERIFIED", "PENDING", "ALL"]).toContain(settings.dashboardDefaultStatus);
    expect(settings.mapDefaultLat).toBeGreaterThanOrEqual(-90);
    expect(settings.mapDefaultLat).toBeLessThanOrEqual(90);
    expect(settings.mapDefaultZoom).toBeGreaterThanOrEqual(5);
    expect(settings.mapDefaultZoom).toBeLessThanOrEqual(19);
  });
});

