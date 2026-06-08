import * as Cesium from "cesium";
import type { SatelliteRecord } from "../types";

export interface PointLike {
  position: unknown;
  show: boolean;
}
export interface CollectionLike {
  get(i: number): PointLike;
  readonly length: number;
}

/** positions(=[x,y,z,...] メートル ECEF) を点群へ反映。NaN は非表示に。 */
export function applyPositions(
  collection: CollectionLike,
  positions: Float64Array,
  makeCartesian: (x: number, y: number, z: number) => unknown,
): void {
  const n = collection.length;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = positions[o], y = positions[o + 1], z = positions[o + 2];
    const p = collection.get(i);
    if (Number.isNaN(x)) { p.show = false; continue; }
    p.position = makeCartesian(x, y, z);
    p.show = true;
  }
}

/** Cesium の点群コレクションを作り、衛星 1 つにつき 1 点を追加（id=noradId）。 */
export function createSatellitePoints(
  viewer: Cesium.Viewer,
  records: SatelliteRecord[],
): Cesium.PointPrimitiveCollection {
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  for (const r of records) {
    points.add({
      position: new Cesium.Cartesian3(0, 0, 0),
      color: Cesium.Color.fromCssColorString("#ffd36b"),
      pixelSize: 3,
      id: r.noradId,
      show: false,
    });
  }
  return points;
}

/** Cesium 点群へ positions を反映する薄いラッパ。 */
export function updateSatellitePoints(
  points: Cesium.PointPrimitiveCollection,
  positions: Float64Array,
): void {
  applyPositions(
    { get: (i) => points.get(i) as unknown as PointLike, length: points.length },
    positions,
    (x, y, z) => new Cesium.Cartesian3(x, y, z),
  );
}
