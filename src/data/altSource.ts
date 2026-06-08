import type { SatelliteRecord } from "../types";

/**
 * 鍵不要のミラー API (tle.ivanstanojevic.me) から TLE を取得して
 * Celestrak の TLE テキスト形式 (名前/L1/L2 の 3 行) に変換する。
 * Celestrak が "has not updated" 403 を返す時のフォールバック。
 * 注意: このミラーはやや古いことがある (SGP4 精度低下) ことを呼び出し側で覚えておく。
 */
export interface AltFetchOptions {
  fetchFn?: typeof fetch;
  /** 取得する最大件数（API は page-size 最大 100、ページネーション必要） */
  limit?: number;
}

const BASE = "https://tle.ivanstanojevic.me/api/tle/";

interface TleRow { name: string; line1: string; line2: string }
interface TlePage { totalItems: number; member: TleRow[] }

export async function fetchActiveTleFallback(opts: AltFetchOptions = {}): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const limit = opts.limit ?? 4000;
  const pageSize = 100;
  const lines: string[] = [];
  let page = 1;
  let got = 0;
  while (got < limit) {
    const url = `${BASE}?page=${page}&page-size=${pageSize}`;
    const res = await fetchFn(url);
    if (!res.ok) break;
    const body = (await res.json()) as TlePage;
    if (!body.member || body.member.length === 0) break;
    for (const m of body.member) {
      if (!m.line1 || !m.line2) continue;
      lines.push(m.name ?? "");
      lines.push(m.line1);
      lines.push(m.line2);
      got++;
      if (got >= limit) break;
    }
    if (body.member.length < pageSize) break;
    page++;
  }
  return lines.join("\n");
}

/** 同 API は宇宙ステーションも返すが少数。Starlink は名前検索で取れる。 */
export async function fetchByNameFallback(query: string, opts: AltFetchOptions = {}): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const limit = opts.limit ?? 1500;
  const pageSize = 100;
  const lines: string[] = [];
  let page = 1;
  let got = 0;
  while (got < limit) {
    const url = `${BASE}?search=${encodeURIComponent(query)}&page=${page}&page-size=${pageSize}`;
    const res = await fetchFn(url);
    if (!res.ok) break;
    const body = (await res.json()) as TlePage;
    if (!body.member || body.member.length === 0) break;
    for (const m of body.member) {
      if (!m.line1 || !m.line2) continue;
      lines.push(m.name ?? "");
      lines.push(m.line1);
      lines.push(m.line2);
      got++;
      if (got >= limit) break;
    }
    if (body.member.length < pageSize) break;
    page++;
  }
  return lines.join("\n");
}
