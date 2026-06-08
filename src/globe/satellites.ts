import * as Cesium from "cesium";
import type { SatelliteRecord } from "../types";
import { CATEGORY_BY_KEY } from "../categories";

export interface PointLike {
  position: unknown;
  show: boolean;
}
export interface CollectionLike {
  get(i: number): PointLike;
  readonly length: number;
}

/** positions(=[x,y,z,...] メートル ECEF) を点群へ反映。
 *  NaN（計算不能）や enabled=false の点は非表示にする。 */
export function applyPositions(
  collection: CollectionLike,
  positions: Float64Array,
  makeCartesian: (x: number, y: number, z: number) => unknown,
  enabled?: (i: number) => boolean,
): void {
  const n = collection.length;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = positions[o], y = positions[o + 1], z = positions[o + 2];
    const p = collection.get(i);
    const on = enabled ? enabled(i) : true;
    if (Number.isNaN(x) || !on) { p.show = false; continue; }
    p.position = makeCartesian(x, y, z);
    p.show = true;
  }
}

function colorFor(record: SatelliteRecord, isReentry: boolean): Cesium.Color {
  if (isReentry) return Cesium.Color.fromCssColorString("#ff3b30");
  const hex = CATEGORY_BY_KEY[record.category ?? "satellite"]?.colorHex ?? "#ffa94d";
  return Cesium.Color.fromCssColorString(hex);
}

/** 衛星 1 つにつき 1 点を追加（id=noradId、カテゴリ色、再突入は赤＋大きめ）。 */
export function createSatellitePoints(
  viewer: Cesium.Viewer,
  records: SatelliteRecord[],
  reentry: Set<number>,
): Cesium.PointPrimitiveCollection {
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  for (const r of records) {
    const isReentry = reentry.has(r.noradId);
    points.add({
      position: new Cesium.Cartesian3(0, 0, 0),
      color: colorFor(r, isReentry),
      pixelSize: isReentry ? 6 : r.category === "debris" ? 2 : 3,
      id: r.noradId,
      show: false,
    });
  }
  return points;
}

/** Cesium 点群へ positions を反映。enabledCategories に含まれるカテゴリだけ表示。 */
export function updateSatellitePoints(
  points: Cesium.PointPrimitiveCollection,
  positions: Float64Array,
  records: SatelliteRecord[],
  enabledCategories: Set<string>,
): void {
  applyPositions(
    { get: (i) => points.get(i) as unknown as PointLike, length: points.length },
    positions,
    (x, y, z) => new Cesium.Cartesian3(x, y, z),
    (i) => enabledCategories.has(records[i].category ?? "satellite"),
  );
}
