import { requirePermission } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getHouseholdLayerMap, type HouseholdMapFilters } from "@/lib/geo/household-layer-map";
import { MapWorkspace } from "@/components/geo/map-workspace";
import { getSystemPreferences } from "@/lib/settings/core";
import { canManageImportantSites, getImportantSites, IMPORTANT_SITE_TYPES } from "@/lib/geo/important-sites";
import { parseMapViewState, type RawSearchParams } from "@/lib/geo/map-view-state";
import { dateRangeError } from "@/lib/household/trusted-where";

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
  const [householdMap, preferences, sites] = await Promise.all([
    getHouseholdLayerMap(ctx, filters),
    getSystemPreferences(),
    getImportantSites(filters.communityId),
  ]);
  const center = householdMap.points.length
    ? householdMap.center
    : sites.length
      ? { lat: sites.reduce((sum, site) => sum + site.lat, 0) / sites.length, lng: sites.reduce((sum, site) => sum + site.lng, 0) / sites.length }
      : { lat: preferences.mapDefaultLat, lng: preferences.mapDefaultLng };

  return (
    <MapWorkspace
      view={view}
      siteTypeOptions={IMPORTANT_SITE_TYPES}
      points={householdMap.points}
      sites={sites}
      volunteerSkills={householdMap.options.volunteerSkills}
      communities={householdMap.options.communities}
      tambons={householdMap.options.tambons}
      totals={householdMap.totals}
      missingCoordinates={householdMap.missingCoordinates}
      center={center}
      defaultZoom={preferences.mapDefaultZoom}
      filterError={filterError}
      canManageSites={canManageImportantSites(ctx)}
    />
  );
}
