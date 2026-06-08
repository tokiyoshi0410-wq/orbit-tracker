export const CELESTRAK = {
  activeTleUrl: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE",
  satcatActiveUrl: "https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON",
} as const;

/** TLE キャッシュ有効期間（ミリ秒）: 6 時間 */
export const TLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  tle: "orbit-tracker.tle.v1",
  tleFetchedAt: "orbit-tracker.tle.fetchedAt.v1",
  satcat: "orbit-tracker.satcat.v1",
  satcatFetchedAt: "orbit-tracker.satcat.fetchedAt.v1",
  catalog: "orbit-tracker.catalog.v2",
  catalogFetchedAt: "orbit-tracker.catalog.fetchedAt.v2",
} as const;

/** 再突入間近とみなす近地点高度のしきい値 (km) */
export const REENTRY_PERIGEE_KM = 200;

/** WGS-72 定数（SGP4/satellite.js 準拠） */
export const EARTH = { muKm3S2: 398600.5, radiusKm: 6378.135 } as const;
