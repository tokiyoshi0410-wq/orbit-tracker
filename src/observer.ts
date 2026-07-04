/** 観測地 (ユーザーの現在地)。通過予報と頭上カウンターが共用する。
 *  一度許可されたら localStorage に保存し、次回以降はプロンプトなしで使う。 */

export interface ObserverLocation {
  latDeg: number;
  lonDeg: number;
}

const STORAGE_KEY = "orbit-tracker.observer.v1";

export function loadStoredObserver(storage: Storage = localStorage): ObserverLocation | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as ObserverLocation;
    if (typeof o.latDeg !== "number" || typeof o.lonDeg !== "number") return null;
    return o;
  } catch {
    return null;
  }
}

export function saveObserver(loc: ObserverLocation, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    /* 保存失敗は無視 (次回また許可を求めるだけ) */
  }
}

/** geolocation を Promise 化。成功時は保存もする。 */
export function requestObserver(): Promise<ObserverLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latDeg: pos.coords.latitude, lonDeg: pos.coords.longitude };
        saveObserver(loc);
        resolve(loc);
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}

/** 地平線より上 (仰角 > 0°) にある物体数を数える (純粋)。
 *  positions は worker が返す ECEF メートル列。up は観測者位置の正規化ベクトルで
 *  地心天頂近似 (測地天頂との差 < 0.2° はこの用途では無視できる)。 */
export function countOverhead(
  positions: Float64Array,
  obsEcfMeters: { x: number; y: number; z: number },
  visible?: (i: number) => boolean,
): number {
  const r = Math.hypot(obsEcfMeters.x, obsEcfMeters.y, obsEcfMeters.z);
  if (r === 0) return 0;
  const ux = obsEcfMeters.x / r,
    uy = obsEcfMeters.y / r,
    uz = obsEcfMeters.z / r;
  let count = 0;
  const n = Math.floor(positions.length / 3);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = positions[o];
    if (Number.isNaN(x)) continue;
    if (visible && !visible(i)) continue;
    const dx = x - obsEcfMeters.x;
    const dy = positions[o + 1] - obsEcfMeters.y;
    const dz = positions[o + 2] - obsEcfMeters.z;
    if (dx * ux + dy * uy + dz * uz > 0) count++;
  }
  return count;
}
