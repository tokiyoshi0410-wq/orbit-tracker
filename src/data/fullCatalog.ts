import type { SatelliteRecord } from "../types";
import { parseTle } from "./tleParse";
import { classifyByName } from "../categories";

/** 全カタログ (軌道上の全物体 ~3万件)。cron がビルドに同梱する静的ファイルから読む。
 *  JSON 化すると localStorage の 5MB 制限を超えるためキャッシュしない
 *  (CDN 側のキャッシュに任せる)。 */
export function fullCatalogUrl(): string {
  return `${import.meta.env?.BASE_URL ?? "/"}data/tle/catalog-full.tle`;
}

/** 取得済みテキストから records を作る (純粋)。名前でカテゴリ分類し NORAD 重複を排除。 */
export function buildFullCatalog(text: string): SatelliteRecord[] {
  const byId = new Map<number, SatelliteRecord>();
  for (const r of parseTle(text)) {
    if (byId.has(r.noradId)) continue;
    byId.set(r.noradId, { ...r, category: classifyByName(r.name) });
  }
  return [...byId.values()];
}

export async function fetchFullCatalog(fetchFn: typeof fetch = fetch): Promise<SatelliteRecord[]> {
  const res = await fetchFn(fullCatalogUrl());
  if (!res.ok) throw new Error(`full catalog HTTP ${res.status}`);
  const text = await res.text();
  const records = buildFullCatalog(text);
  if (records.length < 1000) throw new Error("full catalog too small");
  return records;
}
