import * as Cesium from "cesium";
import { computeEcefMeters, type SatRec } from "../propagation/propagator";
import type { EcefMeters } from "../types";

/** start から1周期ぶんを steps 等分でサンプルした ECEF 点列（計算不能点は除外） */
export function sampleOrbitEcef(satrec: SatRec, start: Date, periodMin: number, steps: number): EcefMeters[] {
  const out: EcefMeters[] = [];
  const dtMs = (periodMin * 60_000) / steps;
  for (let i = 0; i < steps; i++) {
    const d = new Date(start.getTime() + i * dtMs);
    const p = computeEcefMeters(satrec, d);
    if (p) out.push(p);
  }
  return out;
}

let orbitEntity: Cesium.Entity | undefined;

/** 軌道線エンティティを描画。既存があれば差し替え。 */
export function drawOrbit(viewer: Cesium.Viewer, pts: EcefMeters[]): void {
  clearOrbit(viewer);
  if (pts.length < 2) return;
  const positions = pts.map((p) => new Cesium.Cartesian3(p.x, p.y, p.z));
  orbitEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 2,
      material: Cesium.Color.CYAN.withAlpha(0.8),
      arcType: Cesium.ArcType.NONE,
    },
  });
}

export function clearOrbit(viewer: Cesium.Viewer): void {
  if (orbitEntity) {
    viewer.entities.remove(orbitEntity);
    orbitEntity = undefined;
  }
}
