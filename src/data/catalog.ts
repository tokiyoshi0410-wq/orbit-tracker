import type { SatelliteRecord } from "../types";
import { parseTle } from "./tleParse";
import { classifyByName } from "../categories";
import { STORAGE_KEYS, TLE_CACHE_TTL_MS } from "../config";

export interface GroupSpec {
  group: string;
  /** 指定すればそのカテゴリに固定。未指定なら名前で分類（active 群）。 */
  category?: string;
}

/** 無料で取得できる Celestrak の群。active は名前分類、デブリ群はカテゴリ固定。 */
export const CATALOG_GROUPS: GroupSpec[] = [
  { group: "active" },
  { group: "cosmos-1408-debris", category: "debris" },
  { group: "fengyun-1c-debris", category: "debris" },
  { group: "cosmos-2251-debris", category: "debris" },
  { group: "iridium-33-debris", category: "debris" },
];

/** 公開ビルドに同梱した静的 TLE ファイルへのパス。GitHub Actions の cron が最新化する。 */
export function localGroupUrl(group: string): string {
  return `${import.meta.env?.BASE_URL ?? "/"}data/tle/${group}.tle`;
}

export function groupUrl(group: string): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=TLE`;
}

/** 取得済みの (spec, tleText) からカテゴリ付与＋NORAD重複排除した records を作る（純粋）。 */
export function buildCatalog(parts: { spec: GroupSpec; text: string }[]): SatelliteRecord[] {
  const byId = new Map<number, SatelliteRecord>();
  for (const { spec, text } of parts) {
    for (const r of parseTle(text)) {
      if (byId.has(r.noradId)) continue;
      const category = spec.category ?? classifyByName(r.name);
      byId.set(r.noradId, { ...r, category });
    }
  }
  return [...byId.values()];
}

export interface FetchCatalogOptions {
  storage?: Storage;
  now?: () => number;
  fetchFn?: typeof fetch;
  ttlMs?: number;
  /** 群取得の間に空けるミリ秒（レート制限回避）。テストでは 0。 */
  delayMs?: number;
}

function loadCache(storage: Storage, nowMs: number, ttlMs: number): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.catalog);
  const at = storage.getItem(STORAGE_KEYS.catalogFetchedAt);
  if (!raw || !at) return null;
  if (nowMs - Number(at) > ttlMs) return null;
  try { return JSON.parse(raw) as SatelliteRecord[]; } catch { return null; }
}

function loadStale(storage: Storage): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.catalog);
  if (!raw) return null;
  try { return JSON.parse(raw) as SatelliteRecord[]; } catch { return null; }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Celestrak は未更新だと 403 ＋ 「has not updated since...」を返す。これは無視（=既存利用）扱い。 */
function isNotUpdatedNotice(status: number, body: string): boolean {
  return status === 403 && /has not updated/i.test(body);
}

export type GroupFetchOutcome =
  | { kind: "ok"; spec: GroupSpec; text: string }
  | { kind: "not-updated" }
  | { kind: "fail" };

async function tryFetch(fetchFn: typeof fetch, url: string): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetchFn(url);
    const text = await res.text();
    return { status: res.status, text };
  } catch {
    return null;
  }
}

async function fetchGroup(fetchFn: typeof fetch, spec: GroupSpec): Promise<GroupFetchOutcome> {
  // ローカルのプリビルド TLE があれば最優先（CDN 配信・レート制限なし）
  const local = await tryFetch(fetchFn, localGroupUrl(spec.group));
  if (local && local.status >= 200 && local.status < 300 && local.text.length > 100) {
    return { kind: "ok", spec, text: local.text };
  }

  // ローカルが無い（dev 起動初回など）場合は Celestrak へ直接
  const r = await tryFetch(fetchFn, groupUrl(spec.group));
  if (!r) return { kind: "fail" };
  if (r.status >= 200 && r.status < 300 && r.text.length > 0) return { kind: "ok", spec, text: r.text };
  if (isNotUpdatedNotice(r.status, r.text)) return { kind: "not-updated" };
  return { kind: "fail" };
}


/** 複数群を逐次取得（レート制限回避）。active は最重要なので 1 回リトライ。
 *  active が取れた時だけキャッシュし、取れなければ次回再取得を促す。 */
export async function fetchCatalog(opts: FetchCatalogOptions = {}): Promise<SatelliteRecord[]> {
  const storage = opts.storage ?? localStorage;
  const now = opts.now ?? Date.now;
  const fetchFn = opts.fetchFn ?? fetch;
  const ttl = opts.ttlMs ?? TLE_CACHE_TTL_MS;
  const delayMs = opts.delayMs ?? 300;

  const cached = loadCache(storage, now(), ttl);
  if (cached) return cached;

  const parts: { spec: GroupSpec; text: string }[] = [];
  let activeNotUpdated = false;
  for (let i = 0; i < CATALOG_GROUPS.length; i++) {
    const spec = CATALOG_GROUPS[i];
    const got = await fetchGroup(fetchFn, spec);
    if (got.kind === "ok") parts.push({ spec: got.spec, text: got.text });
    if (got.kind === "not-updated" && spec.category === undefined) activeNotUpdated = true;
    if (i < CATALOG_GROUPS.length - 1) await sleep(delayMs);
  }

  // active が取れなかった場合は前回キャッシュ（あれば）にフォールバック。
  // ミラー API への重いフォールバックはモバイルを止めるので使わない。
  const activeLoaded = parts.some((p) => p.spec.category === undefined);
  if (!activeLoaded && activeNotUpdated) {
    const stale = loadStale(storage);
    if (stale && stale.length > 0) return stale;
  }

  const records = buildCatalog(parts);
  if (records.length === 0) {
    const stale = loadStale(storage);
    if (stale && stale.length > 0) return stale;
    throw new Error("カタログ取得に失敗しました");
  }

  const finalActiveLoaded = parts.some((p) => p.spec.category === undefined);
  if (finalActiveLoaded) {
    storage.setItem(STORAGE_KEYS.catalog, JSON.stringify(records));
    storage.setItem(STORAGE_KEYS.catalogFetchedAt, String(now()));
  }
  return records;
}
