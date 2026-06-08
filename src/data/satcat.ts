import type { SatcatMeta } from "../types";
import { CELESTRAK } from "../config";

interface SatcatRaw {
  NORAD_CAT_ID: number;
  OBJECT_TYPE?: string;
  OWNER?: string;
  LAUNCH_DATE?: string;
}

export function parseSatcat(rows: SatcatRaw[]): Map<number, SatcatMeta> {
  const map = new Map<number, SatcatMeta>();
  for (const r of rows) {
    if (typeof r.NORAD_CAT_ID !== "number") continue;
    map.set(r.NORAD_CAT_ID, {
      noradId: r.NORAD_CAT_ID,
      objectType: r.OBJECT_TYPE ?? "UNK",
      owner: r.OWNER ?? "",
      launchDate: r.LAUNCH_DATE ?? "",
    });
  }
  return map;
}

export interface FetchSatcatOptions {
  fetchFn?: typeof fetch;
  /** 上限ミリ秒。これを超えたら空 Map を返す。既定 8 秒。 */
  timeoutMs?: number;
}

function localSatcatUrl(): string {
  return `${import.meta.env?.BASE_URL ?? "/"}data/satcat-active.json`;
}

async function tryJson(fetchFn: typeof fetch, url: string, signal: AbortSignal): Promise<SatcatRaw[] | null> {
  try {
    const res = await fetchFn(url, { signal });
    if (!("ok" in res) || !res.ok) return null;
    return (await res.json()) as SatcatRaw[];
  } catch {
    return null;
  }
}

/** SATCAT は補足情報。失敗・遅延しても致命傷にせず空 Map を返す。
 *  ローカル静的ファイル優先 → なければ Celestrak（タイムアウト付き）。 */
export async function fetchSatcat(opts: FetchSatcatOptions = {}): Promise<Map<number, SatcatMeta>> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const localRows = await tryJson(fetchFn, localSatcatUrl(), ctrl.signal);
    if (localRows && localRows.length > 0) return parseSatcat(localRows);
    const remoteRows = await tryJson(fetchFn, CELESTRAK.satcatActiveUrl, ctrl.signal);
    if (remoteRows && remoteRows.length > 0) return parseSatcat(remoteRows);
  } finally {
    clearTimeout(t);
  }
  return new Map();
}
