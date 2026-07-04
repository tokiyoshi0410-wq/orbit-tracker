/** 太陽位置 (低精度・Astronomical Almanac 準拠 ~0.01°) と地球影の判定。
 *  可視判定・影描画用途にはこの精度で十分。座標系は satellite.js と同じ
 *  TEME 近似 (平均赤道・平均春分点) として扱う。 */
import { gstime, eciToEcf, ecfToLookAngles, geodeticToEcf, degreesToRadians, radiansToDegrees } from "satellite.js";

export interface Vec3Km {
  x: number;
  y: number;
  z: number;
}

const AU_KM = 149597870.7;
/** 影判定に使う地球半径 (km)。大気減光ぶんを見ず幾何影のみ。 */
export const SHADOW_EARTH_RADIUS_KM = 6378.137;

/** 日付 → J2000.0 からの経過日数 */
function daysSinceJ2000(date: Date): number {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
}

/** 太陽の地心 ECI 位置 (km)。 */
export function sunEciKm(date: Date): Vec3Km {
  const n = daysSinceJ2000(date);
  const L = degreesToRadians((280.46 + 0.9856474 * n) % 360); // 平均黄経
  const g = degreesToRadians((357.528 + 0.9856003 * n) % 360); // 平均近点角
  const lambda = L + degreesToRadians(1.915) * Math.sin(g) + degreesToRadians(0.02) * Math.sin(2 * g); // 黄経
  const eps = degreesToRadians(23.439 - 0.0000004 * n); // 黄道傾斜
  const rAu = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  const rKm = rAu * AU_KM;
  return {
    x: rKm * Math.cos(lambda),
    y: rKm * Math.cos(eps) * Math.sin(lambda),
    z: rKm * Math.sin(eps) * Math.sin(lambda),
  };
}

/** 観測者 (緯度経度・地表) から見た太陽仰角 (deg)。薄明判定に使う。 */
export function sunElevationDeg(date: Date, latDeg: number, lonDeg: number): number {
  const sun = sunEciKm(date);
  const gmst = gstime(date);
  const sunEcf = eciToEcf(sun as never, gmst) as Vec3Km;
  const observerGd = {
    latitude: degreesToRadians(latDeg),
    longitude: degreesToRadians(lonDeg),
    height: 0,
  };
  const look = ecfToLookAngles(observerGd as never, sunEcf as never) as { elevation: number };
  return radiansToDegrees(look.elevation);
}

/** 衛星 (ECI km) が地球の影 (円筒近似) の中にいるか。
 *  反太陽側 かつ 影軸からの垂直距離 < 地球半径 で真。 */
export function isInEarthShadow(satEciKm: Vec3Km, sunEci: Vec3Km): boolean {
  const sunR = Math.hypot(sunEci.x, sunEci.y, sunEci.z);
  if (sunR === 0) return false;
  const sx = sunEci.x / sunR,
    sy = sunEci.y / sunR,
    sz = sunEci.z / sunR;
  const proj = satEciKm.x * sx + satEciKm.y * sy + satEciKm.z * sz;
  if (proj >= 0) return false; // 太陽側にいる
  const px = satEciKm.x - proj * sx;
  const py = satEciKm.y - proj * sy;
  const pz = satEciKm.z - proj * sz;
  return Math.hypot(px, py, pz) < SHADOW_EARTH_RADIUS_KM;
}

/** 観測者の ECF 位置 (メートル)。頭上判定に使う。 */
export function observerEcfMeters(latDeg: number, lonDeg: number): Vec3Km {
  const gd = { latitude: degreesToRadians(latDeg), longitude: degreesToRadians(lonDeg), height: 0 };
  const p = geodeticToEcf(gd as never) as Vec3Km; // km
  return { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000 };
}
