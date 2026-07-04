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

/** 食 (地球の影) 中の見た目: カテゴリ色を落として薄暗くする */
function dimColor(base: Cesium.Color): Cesium.Color {
  return new Cesium.Color(base.red * 0.3, base.green * 0.3, base.blue * 0.4, 0.85);
}

/** 点群と色テーブル・食状態をまとめたハンドル */
export interface SatPoints {
  collection: Cesium.PointPrimitiveCollection;
  baseColors: Cesium.Color[];
  dimColors: Cesium.Color[];
  /** 現在 dim 色が適用されているか (色の書き換えを差分だけにするため) */
  dimApplied: Uint8Array;
}

/** 衛星 1 つにつき 1 点を追加（id=noradId、カテゴリ色、再突入は赤＋大きめ）。 */
export function createSatellitePoints(
  viewer: Cesium.Viewer,
  records: SatelliteRecord[],
  reentry: Set<number>,
): SatPoints {
  const collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const baseColors: Cesium.Color[] = [];
  const dimColors: Cesium.Color[] = [];
  for (const r of records) {
    const isReentry = reentry.has(r.noradId);
    const color = colorFor(r, isReentry);
    baseColors.push(color);
    dimColors.push(dimColor(color));
    collection.add({
      position: new Cesium.Cartesian3(0, 0, 0),
      color,
      pixelSize: isReentry ? 6 : r.category === "debris" ? 2 : 3,
      id: r.noradId,
      show: false,
    });
  }
  return { collection, baseColors, dimColors, dimApplied: new Uint8Array(records.length) };
}

/** ハンドルを破棄 (全カタログモード切替でシーンを作り直す時に使う) */
export function destroySatellitePoints(viewer: Cesium.Viewer, sat: SatPoints): void {
  viewer.scene.primitives.remove(sat.collection);
}

/** Cesium 点群へ positions を反映。enabledCategories に含まれるカテゴリだけ表示。
 *  shadows があり dimEclipsed が真なら、食中の点を暗色にする (変化した点のみ書換)。 */
export function updateSatellitePoints(
  sat: SatPoints,
  positions: Float64Array,
  records: SatelliteRecord[],
  enabledCategories: Set<string>,
  shadows?: Uint8Array | null,
  dimEclipsed = true,
): void {
  const points = sat.collection;
  applyPositions(
    { get: (i) => points.get(i) as unknown as PointLike, length: points.length },
    positions,
    (x, y, z) => new Cesium.Cartesian3(x, y, z),
    (i) => enabledCategories.has(records[i].category ?? "satellite"),
  );
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const want = dimEclipsed && shadows ? shadows[i] : 0;
    if (want !== sat.dimApplied[i]) {
      (points.get(i) as unknown as { color: Cesium.Color }).color = want ? sat.dimColors[i] : sat.baseColors[i];
      sat.dimApplied[i] = want;
    }
  }
}
