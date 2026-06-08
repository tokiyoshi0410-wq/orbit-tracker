import type { SatelliteRecord } from "../types";
import { parseTle } from "./tleParse";
import { classifyByName } from "../categories";
import { STORAGE_KEYS, TLE_CACHE_TTL_MS } from "../config";
import { fetchActiveTleFallback } from "./altSource";

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
  const r = await tryFetch(fetchFn, groupUrl(spec.group));
  if (!r) return { kind: "fail" };
  if (r.status >= 200 && r.status < 300 && r.text.length > 0) return { kind: "ok", spec, text: r.text };
  if (!isNotUpdatedNotice(r.status, r.text)) return { kind: "fail" };

  // Celestrak の「未更新」403。FORMAT=JSON で実 URL を変えてもう一度試す。
  const altUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${spec.group}&FORMAT=JSON`;
  const alt = await tryFetch(fetchFn, altUrl);
  if (alt && alt.status >= 200 && alt.status < 300 && alt.text.length > 0) {
    return { kind: "ok", spec, text: jsonOmmToTle(alt.text) };
  }
  return { kind: "not-updated" };
}

interface OmmRecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number | string;
  TLE_LINE1?: string;
  TLE_LINE2?: string;
}

/** OMM JSON のうち TLE_LINE1/2 を含むものを TLE 3 行形式に整形。
 *  含まない場合は名前のみ拾えるよう空行を出さない安全な選択をする。 */
function jsonOmmToTle(jsonText: string): string {
  let rows: OmmRecord[] = [];
  try { rows = JSON.parse(jsonText) as OmmRecord[]; } catch { return ""; }
  const lines: string[] = [];
  for (const r of rows) {
    if (!r.TLE_LINE1 || !r.TLE_LINE2) continue;
    lines.push(r.OBJECT_NAME ?? "");
    lines.push(r.TLE_LINE1);
    lines.push(r.TLE_LINE2);
  }
  return lines.join("\n");
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

  // active が "未更新" 扱いで取れなかった場合、まずは前回キャッシュを使い、
  // それも無ければ鍵不要のミラー API でフォールバック取得する。
  const activeLoaded = parts.some((p) => p.spec.category === undefined);
  if (!activeLoaded && activeNotUpdated) {
    const stale = loadStale(storage);
    if (stale && stale.length > 0) return stale;
    try {
      const text = await fetchActiveTleFallback({ fetchFn });
      if (text && text.length > 0) parts.push({ spec: { group: "active" }, text });
    } catch {
      /* スキップ */
    }
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
