import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { scopedCommunityIds } from "@/lib/authz/access";
import { getHouseholdLayerMap, type HouseholdMapFilters } from "@/lib/geo/household-layer-map";
import { MapWorkspace } from "@/components/geo/map-workspace";
import { getSystemPreferences } from "@/lib/settings/core";
import { canManageImportantSites, getImportantSites, IMPORTANT_SITE_TYPES } from "@/lib/geo/important-sites";
import { parseMapViewState, type RawSearchParams } from "@/lib/geo/map-view-state";
import { dateRangeError } from "@/lib/household/trusted-where";
import { getCurrentCommunityBoundaries } from "@/lib/geo/community-boundaries";
import { getCommunityMapSummaries } from "@/lib/geo/community-map-summary";
import { getHelpPriority } from "@/lib/risk/help-priority";

export const metadata = { title: "แผนที่ข้อมูลพื้นที่" };
export const dynamic = "force-dynamic";

const SITE_TYPE_VALUES = IMPORTANT_SITE_TYPES.map((type) => type.value);

/**
 * แผนที่ข้อมูลพื้นที่ — แผนที่เต็มความสูงจอ + แผงชั้นข้อมูล (Owner Decision 2026-10-18)
 *
 * ไม่ใช้ PageHero/การ์ดตัวเลขเหมือนหน้าอื่นโดยตั้งใจ: แผนที่คือเนื้อหาหลัก และเดิมต้องเลื่อนลง
 * ผ่าน hero + ตัวกรอง + ตัวเลข 6 ช่องกว่าจะเห็น · ตัวเลขสำคัญย้ายไปอยู่ในคำอธิบายสัญลักษณ์
 * ชื่อหน้าแสดงอยู่แล้วที่ AppHeader
 *
 * สิทธิ์ตรวจฝั่ง server (MAP_VIEW) · ตัวกรองทั้งหมดอยู่ใน URL (lib/geo/map-view-state.ts)
 */
export default async function SurveyMapPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = await requirePermission(PERMISSIONS.MAP_VIEW);
  const view = parseMapViewState(await searchParams, SITE_TYPE_VALUES);
  const filters: HouseholdMapFilters = {
    communityId: view.communityId,
    tambonId: view.tambonId,
    dateFrom: view.dateFrom,
    dateTo: view.dateTo,
  };
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  const [householdMap, preferences, sites, boundaries, communitySummary, helpPriority] = await Promise.all([
    getHouseholdLayerMap(ctx, filters),
    getSystemPreferences(),
    getImportantSites(ctx, filters.communityId),
    // ขอบเขตทุกชุมชนเป็นบริบทเสมอ (ชุมชนที่เลือกถูกเน้นฝั่ง client) — ระดับชุมชน ไม่ใช่รายบ้าน
    // หัวหน้าชุมชนเห็นเฉพาะขอบเขตชุมชนของตน (docs/41)
    getCurrentCommunityBoundaries({ communityIds: scopedCommunityIds(ctx) }),
    // กล่องข้อมูลเมื่อกดชุมชน — ตัวเลขรวมระดับชุมชน (docs/35)
    getCommunityMapSummaries(ctx),
    // ลำดับการช่วยเหลือ (docs/40) — ทุกบ้านที่ตรวจแล้วตามตัวกรองเดียวกัน · null = ไม่มีสิทธิ์ household.view
    getHelpPriority(ctx, filters),
  ]);
  const labelPoints = boundaries.flatMap((boundary) => (boundary.labelPoint ? [boundary.labelPoint] : []));
  const average = (items: { lat: number; lng: number }[]) => ({
    lat: items.reduce((sum, item) => sum + item.lat, 0) / items.length,
    lng: items.reduce((sum, item) => sum + item.lng, 0) / items.length,
  });
  const center = householdMap.points.length
    ? householdMap.center
    : sites.length
      ? average(sites)
      : labelPoints.length
        ? average(labelPoints)
        : { lat: preferences.mapDefaultLat, lng: preferences.mapDefaultLng };

  return (
    <MapWorkspace
      view={view}
      siteTypeOptions={IMPORTANT_SITE_TYPES}
      points={householdMap.points}
      sites={sites}
      boundaries={boundaries}
      communitySummaries={communitySummary.summaries}
      summaryGeneratedAt={communitySummary.generatedAt}
      volunteerSkills={householdMap.options.volunteerSkills}
      communities={householdMap.options.communities}
      tambons={householdMap.options.tambons}
      totals={householdMap.totals}
      missingCoordinates={householdMap.missingCoordinates}
      center={center}
      defaultZoom={preferences.mapDefaultZoom}
      filterError={filterError}
      canManageSites={canManageImportantSites(ctx)}
      helpPriority={helpPriority}
    />
  );
}
