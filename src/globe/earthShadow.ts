import * as Cesium from "cesium";
import { gstime, eciToEcf } from "satellite.js";
import { sunEciKm } from "../astro/sun";

/** 影の円筒の長さ (m)。静止軌道 (~42,000 km) を覆う長さにする。
 *  実際の本影は ~140万 km だが、可視化にはこれで十分。 */
const SHADOW_LENGTH_M = 60_000_000;
const EARTH_RADIUS_M = 6_378_137;

/** その時刻の反太陽方向 (ECEF 単位ベクトル) */
function antiSunEcef(date: Date): Cesium.Cartesian3 {
  const sun = sunEciKm(date);
  const ecf = eciToEcf(sun as never, gstime(date)) as { x: number; y: number; z: number };
  const v = new Cesium.Cartesian3(-ecf.x, -ecf.y, -ecf.z);
  return Cesium.Cartesian3.normalize(v, v);
}

/** 単位 Z を dir へ回すモデル行列 (平行移動 = dir * L/2) */
function shadowModelMatrix(dir: Cesium.Cartesian3): Cesium.Matrix4 {
  const z = Cesium.Cartesian3.UNIT_Z;
  const dot = Cesium.Cartesian3.dot(z, dir);
  let q: Cesium.Quaternion;
  if (dot > 0.99999) {
    q = Cesium.Quaternion.IDENTITY;
  } else if (dot < -0.99999) {
    q = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, Math.PI);
  } else {
    const axis = Cesium.Cartesian3.cross(z, dir, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(axis, axis);
    q = Cesium.Quaternion.fromAxisAngle(axis, Math.acos(dot));
  }
  const translation = Cesium.Cartesian3.multiplyByScalar(dir, SHADOW_LENGTH_M / 2, new Cesium.Cartesian3());
  return Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(q), translation);
}

/** 地球の影 (円筒近似) を半透明プリミティブで描く。
 *  Entity ではなく allowPicking:false の Primitive を使い、影の奥にある衛星の
 *  クリック/ホバー pick を邪魔しない。時刻連動は preUpdate で modelMatrix を更新。 */
export function mountEarthShadow(viewer: Cesium.Viewer, initialVisible: boolean): { setVisible: (on: boolean) => void } {
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CylinderGeometry({
        length: SHADOW_LENGTH_M,
        topRadius: EARTH_RADIUS_M,
        bottomRadius: EARTH_RADIUS_M,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.BLACK.withAlpha(0.28)),
      },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
    allowPicking: false,
    asynchronous: false,
  });
  primitive.show = initialVisible;
  viewer.scene.primitives.add(primitive);

  viewer.scene.preUpdate.addEventListener(() => {
    if (!primitive.show) return;
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    primitive.modelMatrix = shadowModelMatrix(antiSunEcef(date));
  });

  return {
    setVisible: (on: boolean) => {
      primitive.show = on;
    },
  };
}
