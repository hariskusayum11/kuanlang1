import { describe, expect, it } from "vitest";
import {
  boundaryBounds,
  communityMarkerPosition,
  parseBoundaryGeometry,
  validLatLng,
  type BoundaryMultiPolygon,
} from "../../domain/geo/community-boundary";

const SQUARE = [[100.4, 7.0], [100.41, 7.0], [100.41, 7.01], [100.4, 7.01], [100.4, 7.0]];
const HOLE = [[100.402, 7.002], [100.404, 7.002], [100.404, 7.004], [100.402, 7.002]];

describe("parseBoundaryGeometry (ข้อความจาก ST_AsGeoJSON)", () => {
  it("รับ MultiPolygon ตามเดิม", () => {
    const geometry = parseBoundaryGeometry(JSON.stringify({ type: "MultiPolygon", coordinates: [[SQUARE, HOLE]] }));
    expect(geometry).toEqual({ type: "MultiPolygon", coordinates: [[SQUARE, HOLE]] });
  });

  it("ห่อ Polygon เป็น MultiPolygon (simplify แล้วอาจเหลือชิ้นเดียว)", () => {
    expect(parseBoundaryGeometry(JSON.stringify({ type: "Polygon", coordinates: [SQUARE] }))).toEqual({
      type: "MultiPolygon",
      coordinates: [[SQUARE]],
    });
  });

  it("ค่าว่าง / JSON พัง / ชนิดอื่น → null (ไม่วาดดีกว่าวาดผิดที่)", () => {
    expect(parseBoundaryGeometry(null)).toBeNull();
    expect(parseBoundaryGeometry("")).toBeNull();
    expect(parseBoundaryGeometry("{not json")).toBeNull();
    expect(parseBoundaryGeometry(JSON.stringify({ type: "Point", coordinates: [100.4, 7] }))).toBeNull();
    expect(parseBoundaryGeometry(JSON.stringify({ type: "MultiPolygon" }))).toBeNull();
    expect(parseBoundaryGeometry("null")).toBeNull();
  });

  it("ทิ้ง polygon ที่วงนอกพัง แต่คงชิ้นที่ดี · ทิ้งรูที่พังเฉพาะรู", () => {
    const broken = [[100.4, 7.0], [Number.NaN, 7.0], [100.41, 7.01], [100.4, 7.0]];
    const raw = JSON.stringify({ type: "MultiPolygon", coordinates: [[SQUARE, [[1, 2]]], [broken]] }).replace("null", '"x"');
    expect(parseBoundaryGeometry(raw)).toEqual({ type: "MultiPolygon", coordinates: [[SQUARE]] });
  });

  it("ring ที่จุดน้อยกว่า 4 หรือพิกัดนอกช่วงโลก → ไม่ผ่าน", () => {
    expect(parseBoundaryGeometry(JSON.stringify({ type: "Polygon", coordinates: [[[100, 7], [101, 7], [100, 7]]] }))).toBeNull();
    expect(parseBoundaryGeometry(JSON.stringify({ type: "Polygon", coordinates: [[[200, 7], [101, 7], [101, 8], [200, 7]]] }))).toBeNull();
  });
});

describe("communityMarkerPosition", () => {
  const centroid = { lat: 7.0075, lng: 100.418 };
  const label = { lat: 6.997, lng: 100.4556 };

  it("มีขอบเขต → ใช้จุดภายในขอบเขต (ไม่ใช่ centroid เดิมที่คลาดหลายกิโลเมตร)", () => {
    expect(communityMarkerPosition(label, centroid)).toEqual({ ...label, source: "BOUNDARY" });
  });

  it("ไม่มีขอบเขต → ใช้ centroid โดยประมาณ", () => {
    expect(communityMarkerPosition(null, centroid)).toEqual({ ...centroid, source: "CENTROID" });
    expect(communityMarkerPosition(undefined, centroid)).toEqual({ ...centroid, source: "CENTROID" });
  });

  it("จุดขอบเขตเพี้ยน → ตกไปใช้ centroid · ไม่มีทั้งคู่ → null (ไม่เดาตำแหน่ง)", () => {
    expect(communityMarkerPosition({ lat: Number.NaN, lng: 100 }, centroid)?.source).toBe("CENTROID");
    expect(communityMarkerPosition(null, null)).toBeNull();
    expect(communityMarkerPosition(null, { lat: 95, lng: 100 })).toBeNull();
  });
});

describe("validLatLng", () => {
  it("ตรวจ null / Infinity / นอกช่วง", () => {
    expect(validLatLng(7, 100)).toEqual({ lat: 7, lng: 100 });
    expect(validLatLng(null, 100)).toBeNull();
    expect(validLatLng(7, Number.POSITIVE_INFINITY)).toBeNull();
    expect(validLatLng(-91, 0)).toBeNull();
  });
});

describe("boundaryBounds", () => {
  it("ครอบทุก polygon ของทุกชุมชน", () => {
    const a: BoundaryMultiPolygon = { type: "MultiPolygon", coordinates: [[SQUARE as [number, number][]]] };
    const b: BoundaryMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[[[100.45, 6.98], [100.46, 6.98], [100.46, 6.99], [100.45, 6.98]]]],
    };
    expect(boundaryBounds([a, b])).toEqual({ south: 6.98, west: 100.4, north: 7.01, east: 100.46 });
  });

  it("ไม่มีรูปทรง → null", () => {
    expect(boundaryBounds([])).toBeNull();
  });
});
