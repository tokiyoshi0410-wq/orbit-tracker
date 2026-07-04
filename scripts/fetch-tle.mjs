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

// 全カタログ (軌道上の全物体 ~3万件、3LE)。「デブリ全部盛り」モード用。
// IP 単位のレート制限が厳しいため、失敗したらスキップして従来分だけで続行する。
const FULL_CATALOG_URL = "https://celestrak.org/pub/TLE/catalog.txt";

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

async function fetchSatcat() {
  const url = "https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "orbit-tracker-fetcher/1.0 (+https://github.com/tokiyoshi0410-wq/orbit-tracker)" },
    });
    if (!res.ok) {
      console.log(`[skip] satcat: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.length < 100) return null;
    return text;
  } catch (e) {
    console.log(`[skip] satcat: ${e.message ?? e}`);
    return null;
  }
}

/** 3LE テキストから NORAD番号 → 名前 を収集 (動的 OGP 用) */
function collectNames(text, map) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.length > 0);
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1?.startsWith("1 ") || !l2?.startsWith("2 ")) continue;
    const id = parseInt(l1.substring(2, 7), 10);
    if (Number.isFinite(id) && !map[id]) map[id] = name.trim();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest = { fetchedAt: new Date().toISOString(), groups: {} };
  const names = {};
  for (const group of GROUPS) {
    const text = await fetchGroup(group);
    if (text) {
      await fs.writeFile(path.join(OUT_DIR, `${group}.tle`), text);
      collectNames(text, names);
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0).length;
      manifest.groups[group] = { lines, objects: Math.floor(lines / 3) };
      console.log(`[ok]   ${group}: ${manifest.groups[group].objects} objects`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // 全カタログ (public/data/tle/catalog-full.tle)
  try {
    const res = await fetch(FULL_CATALOG_URL, {
      headers: { "User-Agent": "orbit-tracker-fetcher/1.0 (+https://github.com/tokiyoshi0410-wq/orbit-tracker)" },
    });
    const text = await res.text();
    if (res.ok && text.length > 100000) {
      await fs.writeFile(path.join(OUT_DIR, "catalog-full.tle"), text);
      collectNames(text, names);
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0).length;
      manifest.groups["catalog-full"] = { lines, objects: Math.floor(lines / 3) };
      console.log(`[ok]   catalog-full: ${manifest.groups["catalog-full"].objects} objects`);
    } else {
      console.log(`[skip] catalog-full: HTTP ${res.status} (${text.slice(0, 60).replace(/\s+/g, " ")})`);
    }
  } catch (e) {
    console.log(`[skip] catalog-full: ${e.message ?? e}`);
  }

  await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  // NORAD番号 → 名前 の索引 (Pages Functions の動的 OGP が参照)
  if (Object.keys(names).length > 0) {
    await fs.writeFile("public/data/satnames.json", JSON.stringify(names));
    console.log(`[ok]   satnames: ${Object.keys(names).length} entries`);
  }

  // SATCAT メタ情報も静的化（モバイルで Celestrak 直接アクセスを避けるため）
  const satcatText = await fetchSatcat();
  if (satcatText) {
    await fs.writeFile("public/data/satcat-active.json", satcatText);
    console.log(`[ok]   satcat: ${satcatText.length} bytes`);
  }

  const total = Object.values(manifest.groups).reduce((a, b) => a + b.objects, 0);
  console.log(`Done: ${total} objects across ${Object.keys(manifest.groups).length} groups.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
