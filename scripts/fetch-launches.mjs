#!/usr/bin/env node
/**
 * Launch Library 2 から直近の打ち上げ予定を取得し、必要フィールドだけに削って
 * public/data/launches.json に書き出す。GitHub Actions の cron から実行される。
 * 無料枠は 15 req/h。cron は 4 時間ごとに 1 req なので余裕がある。
 * 失敗しても既存ファイルを残して終了する (打ち上げ予定は補足情報)。
 */
import fs from "node:fs/promises";

const URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=25&mode=normal";
const OUT = "public/data/launches.json";

async function main() {
  const res = await fetch(URL, {
    headers: { "User-Agent": "orbit-tracker-fetcher/1.0 (+https://github.com/tokiyoshi0410-wq/orbit-tracker)" },
  });
  if (!res.ok) {
    console.log(`[skip] launches: HTTP ${res.status}`);
    return;
  }
  const data = await res.json();
  const nowMs = Date.now();
  const launches = (data.results ?? [])
    .map((r) => ({
      name: r.name ?? "",
      netMs: Date.parse(r.net ?? "") || 0,
      status: r.status?.abbrev ?? "",
      provider: r.launch_service_provider?.name ?? "",
      pad: r.pad?.name ?? "",
      site: r.pad?.location?.name ?? "",
      lat: Number(r.pad?.latitude),
      lon: Number(r.pad?.longitude),
    }))
    // upcoming には直近の実施済みも混ざるため、過去 1 時間より前のものは落とす
    .filter((l) => l.netMs > nowMs - 3600_000)
    .slice(0, 15);
  await fs.writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), launches }, null, 1));
  console.log(`[ok]   launches: ${launches.length} entries`);
}

main().catch((e) => {
  console.log(`[skip] launches: ${e.message ?? e}`);
});
