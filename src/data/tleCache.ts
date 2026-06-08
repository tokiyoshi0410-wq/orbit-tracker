import type { SatelliteRecord } from "../types";
import { STORAGE_KEYS } from "../config";

export function saveCachedTle(storage: Storage, records: SatelliteRecord[], nowMs: number): void {
  storage.setItem(STORAGE_KEYS.tle, JSON.stringify(records));
  storage.setItem(STORAGE_KEYS.tleFetchedAt, String(nowMs));
}

/** TTL 内ならレコード、無い/期限切れなら null */
export function loadCachedTle(storage: Storage, nowMs: number, ttlMs: number): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.tle);
  const at = storage.getItem(STORAGE_KEYS.tleFetchedAt);
  if (!raw || !at) return null;
  if (nowMs - Number(at) > ttlMs) return null;
  try {
    return JSON.parse(raw) as SatelliteRecord[];
  } catch {
    return null;
  }
}

/** 期限切れでも残っていれば返す（オフライン時のフォールバック用） */
export function loadStaleTle(storage: Storage): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.tle);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SatelliteRecord[];
  } catch {
    return null;
  }
}
