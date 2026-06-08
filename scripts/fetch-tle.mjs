#!/usr/bin/env node
/**
 * Celestrak から TLE を取得し public/data/ に静的ファイルとして書き出す。
 * GitHub Actions の cron から定期実行され、ビルドに同梱される。
 * これによりクライアントは Celestrak を直接叩かず CDN から TLE を取得する。
 */
import fs from "node:fs/promises";
import path from "node:path";

const GROUPS = [
  "active",
  "stations",
  "starlink",
  "oneweb",
  "gps-ops",
  "weather",
  "science",
  "cosmos-1408-debris",
  "fengyun-1c-debris",
  "cosmos-2251-debris",
  "iridium-33-debris",
];

const OUT_DIR = "public/data/tle";

async function fetchGroup(group) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=TLE`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "orbit-tracker-fetcher/1.0 (+https://github.com/tokiyoshi0410-wq/orbit-tracker)" },
    });
    const text = await res.text();
    if (res.ok && text.length > 100) return text;
    console.log(`[skip] ${group}: HTTP ${res.status} (${text.slice(0, 60).replace(/\s+/g, " ")})`);
    return null;
  } catch (e) {
    console.log(`[skip] ${group}: ${e.message ?? e}`);
    return null;
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest = { fetchedAt: new Date().toISOString(), groups: {} };
  for (const group of GROUPS) {
    const text = await fetchGroup(group);
    if (text) {
      await fs.writeFile(path.join(OUT_DIR, `${group}.tle`), text);
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0).length;
      manifest.groups[group] = { lines, objects: Math.floor(lines / 3) };
      console.log(`[ok]   ${group}: ${manifest.groups[group].objects} objects`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest.groups).reduce((a, b) => a + b.objects, 0);
  console.log(`Done: ${total} objects across ${Object.keys(manifest.groups).length} groups.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
