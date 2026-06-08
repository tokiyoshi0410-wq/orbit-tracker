import type { SatelliteRecord } from "../types";
import { CELESTRAK, TLE_CACHE_TTL_MS } from "../config";
import { parseTle } from "./tleParse";
import { loadCachedTle, saveCachedTle, loadStaleTle } from "./tleCache";

export interface FetchTleOptions {
  storage?: Storage;
  now?: () => number;
  fetchFn?: typeof fetch;
  ttlMs?: number;
}

/** TLE をキャッシュ優先で取得。失敗時は期限切れキャッシュにフォールバック。 */
export async function fetchActiveTle(opts: FetchTleOptions = {}): Promise<SatelliteRecord[]> {
  const storage = opts.storage ?? localStorage;
  const now = opts.now ?? Date.now;
  const fetchFn = opts.fetchFn ?? fetch;
  const ttl = opts.ttlMs ?? TLE_CACHE_TTL_MS;

  const cached = loadCachedTle(storage, now(), ttl);
  if (cached) return cached;

  try {
    const res = await fetchFn(CELESTRAK.activeTleUrl);
    if (!("ok" in res) || !res.ok) throw new Error(`HTTP ${(res as Response).status}`);
    const text = await res.text();
    const records = parseTle(text);
    if (records.length === 0) throw new Error("empty TLE response");
    saveCachedTle(storage, records, now());
    return records;
  } catch (err) {
    const stale = loadStaleTle(storage);
    if (stale && stale.length > 0) return stale;
    throw err;
  }
}
