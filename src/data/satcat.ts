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
}

/** SATCAT は補足情報。失敗しても致命傷にせず空 Map を返す。 */
export async function fetchSatcat(opts: FetchSatcatOptions = {}): Promise<Map<number, SatcatMeta>> {
  const fetchFn = opts.fetchFn ?? fetch;
  try {
    const res = await fetchFn(CELESTRAK.satcatActiveUrl);
    if (!("ok" in res) || !res.ok) throw new Error(`HTTP ${(res as Response).status}`);
    const rows = (await res.json()) as SatcatRaw[];
    return parseSatcat(rows);
  } catch {
    return new Map();
  }
}
