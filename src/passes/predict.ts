/** 上空通過予報。観測地から見て仰角がしきい値を超える時間窓を探す (全て純粋関数)。
 *  1 衛星 48h ≈ 5,800 回の propagate は数十 ms なので同期実行でよい。 */
import { propagate, gstime, eciToEcf, ecfToLookAngles, degreesToRadians, radiansToDegrees } from "satellite.js";
import type { SatRec } from "../propagation/propagator";
import type { ObserverLocation } from "../observer";
import { sunEciKm, sunElevationDeg, isInEarthShadow, type Vec3Km } from "../astro/sun";

export interface PassEvent {
  startMs: number;
  maxMs: number;
  endMs: number;
  maxElevationDeg: number;
  startAzimuthDeg: number;
  endAzimuthDeg: number;
  /** 肉眼チャンス: 最大仰角時に衛星が日照中 かつ 観測者が薄明終了後 */
  visible: boolean;
}

export interface PredictOptions {
  spanHours?: number;
  coarseStepS?: number;
  minElevationDeg?: number;
  maxPasses?: number;
  /** 観測者の太陽仰角がこの値未満なら「空が暗い」(市民薄明終了)。既定 -6° */
  darkSunElevationDeg?: number;
}

interface LookAngle {
  elevationDeg: number;
  azimuthDeg: number;
  eciKm: Vec3Km;
}

function lookAt(satrec: SatRec, observer: ObserverLocation, tMs: number): LookAngle | null {
  const date = new Date(tMs);
  const pv = propagate(satrec, date) as unknown as { position: Vec3Km | false | null } | null | false;
  if (!pv || !pv.position) return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position as never, gmst);
  const gd = {
    latitude: degreesToRadians(observer.latDeg),
    longitude: degreesToRadians(observer.lonDeg),
    height: 0,
  };
  const look = ecfToLookAngles(gd as never, ecf as never) as { elevation: number; azimuth: number };
  return {
    elevationDeg: radiansToDegrees(look.elevation),
    azimuthDeg: (radiansToDegrees(look.azimuth) + 360) % 360,
    eciKm: pv.position as Vec3Km,
  };
}

/** 仰角がしきい値と一致する時刻を二分法で ~1 秒まで詰める。
 *  lowMs は below (または境界)、highMs は above を仮定。rising=true なら上昇側。 */
function refineCrossing(
  satrec: SatRec,
  observer: ObserverLocation,
  belowMs: number,
  aboveMs: number,
  minEl: number,
): number {
  let lo = belowMs;
  let hi = aboveMs;
  for (let iter = 0; iter < 24 && Math.abs(hi - lo) > 1000; iter++) {
    const mid = (lo + hi) / 2;
    const la = lookAt(satrec, observer, mid);
    if (la && la.elevationDeg >= minEl) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** 観測地からの通過予報。startMs から spanHours ぶんを走査する。 */
export function predictPasses(
  satrec: SatRec,
  observer: ObserverLocation,
  startMs: number,
  opts: PredictOptions = {},
): PassEvent[] {
  const spanMs = (opts.spanHours ?? 48) * 3600_000;
  const stepMs = (opts.coarseStepS ?? 30) * 1000;
  const minEl = opts.minElevationDeg ?? 10;
  const maxPasses = opts.maxPasses ?? 10;
  const darkEl = opts.darkSunElevationDeg ?? -6;

  const passes: PassEvent[] = [];
  let above = false;
  let passStartMs = 0;
  let prevMs = startMs;

  for (let tMs = startMs; tMs <= startMs + spanMs; tMs += stepMs) {
    const la = lookAt(satrec, observer, tMs);
    const isAbove = la != null && la.elevationDeg >= minEl;
    if (isAbove && !above) {
      // 上昇: 直前ステップとの間に境界がある (走査開始時から上なら開始時刻を使う)
      passStartMs = tMs === startMs ? startMs : refineCrossing(satrec, observer, prevMs, tMs, minEl);
      above = true;
    } else if (!isAbove && above) {
      const passEndMs = refineCrossing(satrec, observer, tMs, prevMs, minEl);
      const ev = summarizePass(satrec, observer, passStartMs, passEndMs, darkEl);
      if (ev) passes.push(ev);
      above = false;
      if (passes.length >= maxPasses) break;
    }
    prevMs = tMs;
  }
  // 走査終了時にまだ上空なら、そこまでをパスとして打ち切る
  if (above && passes.length < maxPasses) {
    const ev = summarizePass(satrec, observer, passStartMs, prevMs, darkEl);
    if (ev) passes.push(ev);
  }
  return passes;
}

function summarizePass(
  satrec: SatRec,
  observer: ObserverLocation,
  startMs: number,
  endMs: number,
  darkEl: number,
): PassEvent | null {
  if (endMs <= startMs) return null;
  // 窓内を 40 分割して最大仰角を探す
  const n = 40;
  let maxEl = -90;
  let maxMs = startMs;
  for (let i = 0; i <= n; i++) {
    const tMs = startMs + ((endMs - startMs) * i) / n;
    const la = lookAt(satrec, observer, tMs);
    if (la && la.elevationDeg > maxEl) {
      maxEl = la.elevationDeg;
      maxMs = tMs;
    }
  }
  const startLa = lookAt(satrec, observer, startMs);
  const endLa = lookAt(satrec, observer, endMs);
  const maxLa = lookAt(satrec, observer, maxMs);
  if (!startLa || !endLa || !maxLa) return null;

  const sun = sunEciKm(new Date(maxMs));
  const sunlit = !isInEarthShadow(maxLa.eciKm, sun);
  const skyDark = sunElevationDeg(new Date(maxMs), observer.latDeg, observer.lonDeg) < darkEl;

  return {
    startMs,
    maxMs,
    endMs,
    maxElevationDeg: maxEl,
    startAzimuthDeg: startLa.azimuthDeg,
    endAzimuthDeg: endLa.azimuthDeg,
    visible: sunlit && skyDark,
  };
}

const COMPASS_JA = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"] as const;
const COMPASS_EN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 方位角 (deg) → 8 方位の表示名 */
export function compassLabel(azDeg: number, lang: "ja" | "en"): string {
  const idx = Math.round(((azDeg % 360) + 360) % 360 / 45) % 8;
  return (lang === "ja" ? COMPASS_JA : COMPASS_EN)[idx];
}
