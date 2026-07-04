import * as Cesium from "cesium";
import { computeEcefMeters, type SatRec } from "../propagation/propagator";

/** 衛星視点モード: カメラを衛星の位置に置き、地心 (直下) を見る。
 *  worker の 200ms 間隔ではカクつくため、選択中の 1 機だけ毎フレーム
 *  main スレッドで propagate する (1 機なら十分軽い)。 */
export interface SatView {
  enter(satrec: SatRec): void;
  exit(): void;
  isActive(): boolean;
}

export function createSatView(viewer: Cesium.Viewer, onExit: () => void): SatView {
  let satrec: SatRec | null = null;
  let removeListener: (() => void) | null = null;

  const updateCamera = () => {
    if (!satrec) return;
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const p = computeEcefMeters(satrec, date);
    if (!p) return;
    const pos = new Cesium.Cartesian3(p.x, p.y, p.z);
    // 直下 (地心方向) を見る。up は北極方向を direction に直交化して安定させる
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.negate(pos, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const north = Cesium.Cartesian3.UNIT_Z;
    const dot = Cesium.Cartesian3.dot(north, direction);
    let up = Cesium.Cartesian3.subtract(
      north,
      Cesium.Cartesian3.multiplyByScalar(direction, dot, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    if (Cesium.Cartesian3.magnitude(up) < 1e-6) up = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X);
    Cesium.Cartesian3.normalize(up, up);
    viewer.camera.setView({ destination: pos, orientation: { direction, up } });
  };

  const enter = (s: SatRec) => {
    satrec = s;
    if (removeListener) return; // 既にアクティブなら対象だけ差し替え
    viewer.trackedEntity = undefined;
    // ユーザーのカメラ操作と競合しないよう入力を止める
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    removeListener = viewer.scene.preRender.addEventListener(updateCamera);
  };

  const exit = () => {
    if (!removeListener) return;
    removeListener();
    removeListener = null;
    satrec = null;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    onExit();
  };

  return { enter, exit, isActive: () => removeListener != null };
}
