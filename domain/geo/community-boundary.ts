// Community Boundary — Pure Functions (tests/unit/community-boundary.test.ts)
// ---------------------------------------------------------------------------
// ขอบเขตชุมชนเก็บใน `community_boundary.geom` (geography MultiPolygon 4326) และอ่านผ่าน
// ST_AsGeoJSON ฝั่ง server (lib/geo/community-boundaries.ts) — ไฟล์นี้รับข้อความ GeoJSON
// ที่ได้มา ตรวจรูปทรงให้แน่ใจก่อนส่งถึง Leaflet และเลือกตำแหน่งหมุดชุมชน
//
// ไม่แตะ DB/DOM จึงใช้ได้ทั้ง server และ client
// ข้อมูลระดับชุมชนเท่านั้น (ไม่ใช่พิกัดรายบ้าน) — เผยแพร่บนแผนที่สาธารณะได้

/** ตำแหน่ง [ลองจิจูด, ละติจูด] ตามมาตรฐาน GeoJSON */
export type LngLat = [number, number];

/** GeoJSON MultiPolygon: polygon → ring → position */
export interface BoundaryMultiPolygon {
  type: "MultiPolygon";
  coordinates: LngLat[][][];
}

export interface LatLng {
  lat: number;
  lng: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toPosition(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

/** ring ต้องมีอย่างน้อย 4 จุด (ปิดวง) ตาม GeoJSON — ring ที่พังทั้งวงถือว่าใช้ไม่ได้ */
function toRing(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring: LngLat[] = [];
  for (const item of value) {
    const position = toPosition(item);
    if (!position) return null;
    ring.push(position);
  }
  return ring;
}

/** polygon = วงนอก + รู (ถ้ามี) — วงนอกพัง = ทิ้งทั้ง polygon · รูที่พังทิ้งเฉพาะรู */
function toPolygon(value: unknown): LngLat[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const outer = toRing(value[0]);
  if (!outer) return null;
  const holes = value.slice(1).map(toRing).filter((ring): ring is LngLat[] => ring !== null);
  return [outer, ...holes];
}

/**
 * แปลงข้อความ GeoJSON จาก ST_AsGeoJSON เป็น MultiPolygon ที่ตรวจแล้ว
 * - รับ Polygon ได้ด้วย (ห่อเป็น MultiPolygon) เผื่อ simplify แล้วเหลือชิ้นเดียว
 * - ค่าเพี้ยน/ชนิดอื่น → null (ไม่วาดดีกว่าวาดผิดที่)
 */
export function parseBoundaryGeometry(raw: string | null | undefined): BoundaryMultiPolygon | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(coordinates)) return null;
  const rawPolygons = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : null;
  if (!rawPolygons) return null;
  const polygons = rawPolygons.map(toPolygon).filter((polygon): polygon is LngLat[][] => polygon !== null);
  return polygons.length ? { type: "MultiPolygon", coordinates: polygons } : null;
}

/** พิกัดจุดเดียวใช้ได้ไหม (ไม่ null, เป็นตัวเลขจริง, อยู่ในช่วงโลก) */
export function validLatLng(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * ตำแหน่งหมุดชุมชน: ใช้จุดในขอบเขตจริง (ST_PointOnSurface) ก่อน — รับประกันว่าตกอยู่ในพื้นที่
 * ต่างจาก centroid ที่อาจหลุดออกนอกรูปทรงเว้า · ไม่มีขอบเขต → ใช้ centroid โดยประมาณเดิม
 * ไม่มีทั้งคู่ → null (ไม่วางหมุด ห้ามเดาตำแหน่ง)
 */
export function communityMarkerPosition(
  labelPoint: LatLng | null | undefined,
  centroid: LatLng | null | undefined,
): (LatLng & { source: "BOUNDARY" | "CENTROID" }) | null {
  const fromBoundary = labelPoint ? validLatLng(labelPoint.lat, labelPoint.lng) : null;
  if (fromBoundary) return { ...fromBoundary, source: "BOUNDARY" };
  const fromCentroid = centroid ? validLatLng(centroid.lat, centroid.lng) : null;
  return fromCentroid ? { ...fromCentroid, source: "CENTROID" } : null;
}

/** กรอบสี่เหลี่ยมที่ครอบขอบเขต (ใช้จัดมุมกล้อง) — วงนอกพอ เพราะรูอยู่ข้างในเสมอ */
export function boundaryBounds(
  geometries: readonly BoundaryMultiPolygon[],
): { south: number; west: number; north: number; east: number } | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const geometry of geometries) {
    for (const polygon of geometry.coordinates) {
      for (const [lng, lat] of polygon[0] ?? []) {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
  }
  return Number.isFinite(south) ? { south, west, north, east } : null;
}
