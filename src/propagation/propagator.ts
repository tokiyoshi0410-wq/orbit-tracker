import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  eciToGeodetic,
  radiansToDegrees,
} from "satellite.js";
import type { EcefMeters, InstantState, OrbitalElements } from "../types";
import { EARTH } from "../config";

/** satellite.js の版差を避けるため satrec 型はローカルに導出する */
export type SatRec = ReturnType<typeof twoline2satrec>;

interface Vec3 { x: number; y: number; z: number; }

export function buildSatrec(tle1: string, tle2: string): SatRec {
  return twoline2satrec(tle1, tle2);
}

/** propagate して失敗（v6/v7=null, v5=false）なら null。成功なら ECI(km) の位置・速度。 */
function propagateSafe(satrec: SatRec, date: Date): { position: Vec3; velocity: Vec3 } | null {
  const pv = propagate(satrec, date) as unknown as
    | { position: Vec3 | false | null; velocity: Vec3 | false | null }
    | null
    | false;
  if (!pv || !pv.position || !pv.velocity) return null;
  return { position: pv.position as Vec3, velocity: pv.velocity as Vec3 };
}

/** ECEF メートル座標（Cesium Cartesian3 にそのまま渡せる） */
export function computeEcefMeters(satrec: SatRec, date: Date): EcefMeters | null {
  const pv = propagateSafe(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position as never, gmst) as Vec3; // km
  return { x: ecf.x * 1000, y: ecf.y * 1000, z: ecf.z * 1000 };
}

function normalizeLonToDeg(rad: number): number {
  let lon = rad;
  while (lon > Math.PI) lon -= 2 * Math.PI;
  while (lon < -Math.PI) lon += 2 * Math.PI;
  return radiansToDegrees(lon);
}

/** 緯度経度高度・速度 */
export function computeInstantState(satrec: SatRec, date: Date): InstantState | null {
  const pv = propagateSafe(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const gd = eciToGeodetic(pv.position as never, gmst) as {
    longitude: number;
    latitude: number;
    height: number;
  };
  const v = pv.velocity;
  return {
    latitudeDeg: radiansToDegrees(gd.latitude),
    longitudeDeg: normalizeLonToDeg(gd.longitude),
    altitudeKm: gd.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
  };
}

/** TLE 不変量から軌道要素を算出 */
export function computeOrbitalElements(satrec: SatRec): OrbitalElements {
  const ecc = satrec.ecco;
  const inclinationDeg = radiansToDegrees(satrec.inclo);
  const periodMin = (2 * Math.PI) / satrec.no; // no は rad/min
  const noRadPerSec = satrec.no / 60;
  const a = Math.cbrt(EARTH.muKm3S2 / (noRadPerSec * noRadPerSec)); // km
  return {
    periodMin,
    inclinationDeg,
    eccentricity: ecc,
    semiMajorAxisKm: a,
    apogeeAltKm: a * (1 + ecc) - EARTH.radiusKm,
    perigeeAltKm: a * (1 - ecc) - EARTH.radiusKm,
  };
}
