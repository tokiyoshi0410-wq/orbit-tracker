/** 打ち上げ予定 (Launch Library 2 を cron が静的化したもの) の読み込みと整形。 */

export interface LaunchEntry {
  name: string;
  netMs: number;
  status: string;
  provider: string;
  pad: string;
  site: string;
  lat: number;
  lon: number;
}

export function launchesUrl(): string {
  return `${import.meta.env?.BASE_URL ?? "/"}data/launches.json`;
}

export async function fetchLaunches(fetchFn: typeof fetch = fetch): Promise<LaunchEntry[]> {
  try {
    const res = await fetchFn(launchesUrl());
    if (!res.ok) return [];
    const data = (await res.json()) as { launches?: LaunchEntry[] };
    return (data.launches ?? []).filter((l) => Number.isFinite(l.netMs) && l.netMs > 0);
  } catch {
    return [];
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** T- カウントダウン表示 (純粋)。過去は T+。 */
export function formatCountdown(netMs: number, nowMs: number): string {
  const diff = netMs - nowMs;
  const sign = diff >= 0 ? "T-" : "T+";
  const s = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return days > 0 ? `${sign}${days}d ${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${sign}${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}
