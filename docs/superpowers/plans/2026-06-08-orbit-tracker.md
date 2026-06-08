# orbit-tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 宇宙から地球を見る 3D 地球儀の上で、稼働中の人工衛星（数千）の現在位置をリアルタイム表示し、クリックで詳細・名前/番号で検索追従・時間スクラブができる Web アプリを作る。

**Architecture:** Vite + TypeScript の SPA。CesiumJS が 3D 地球儀・時計/タイムライン・クリック判定・カメラを担当。satellite.js(SGP4) を Web Worker で回して全衛星位置を一括計算。データは Celestrak の無認証 API（TLE + SATCAT、CORS 許可済み）。純粋ロジック（パース・軌道計算・検索・キャッシュ）は Vitest で TDD、描画系は dev サーバ＋Playwright スモークで動作確認。

**Tech Stack:** Vite 7 / TypeScript 5.9 / Vitest 3 (+@vitest/web-worker) / CesiumJS 1.13x / satellite.js (latest) / vite-plugin-cesium

---

## 検証済み API メモ（実装の根拠・2026-06-08 リサーチ確定）

これらは実装中の参照用。記憶で書き換えないこと。

**satellite.js（最新 = v7 系。失敗時の戻り値が v5 と異なる）**
- `twoline2satrec(l1, l2) -> satrec`（不正でも例外を投げず `satrec.error` が非0）
- `propagate(satrec, date) -> { position, velocity } | null`。**v6/v7 は失敗時 `null`**、v4/v5 は `position === false`。両対応の防御ガード `if (!pv || pv.position === false)` を使う。位置/速度は **ECI(TEME)・km / km/s**。
- `gstime(date) -> GMST(rad)`、`eciToEcf(posEci, gmst) -> {x,y,z} km`、`eciToGeodetic(posEci, gmst) -> { longitude, latitude(rad), height(km) }`
- `degreesLong(rad)` `degreesLat(rad)`（範囲外で `RangeError`）、`radiansToDegrees(rad)`（検証なし）
- satrec: `inclo`(rad) `ecco` `no`(**rad/min**) `nodeo` `argpo` `mo` `satnum`。周期 `periodMin = 2π / no`。a は `mu/(no/60)^2` の立方根（mu=398600.5, Re=6378.135 km、WGS-72）。

**CesiumJS（無トークン構成）**
- `Cesium.Ion.defaultAccessToken = ""` で ion 無効化。
- `new Cesium.Viewer(id, { baseLayer: new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({url:"https://tile.openstreetmap.org/"})), baseLayerPicker:false, geocoder:false, animation:true, timeline:true })`。terrain は渡さなければ ellipsoid（オフ）。
- 点群: `scene.primitives.add(new Cesium.PointPrimitiveCollection())` → `.add({position, color, pixelSize, id})` が `PointPrimitive` を返す。`p.position = new Cesium.Cartesian3(x,y,z)`（**メートル・ECEF**）で移動。
- ピック: `new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)` + `setInputAction(cb, Cesium.ScreenSpaceEventType.LEFT_CLICK)`、`viewer.scene.pick(movement.position)` → `picked.id`（無ければ `picked.primitive.id`）。
- 時計: `viewer.clock`（`currentTime` JulianDate, `multiplier`, `shouldAnimate`, `onTick.addEventListener(cb)`）。`Cesium.JulianDate.toDate(jd)` で JS Date 化。
- カメラ: `viewer.camera.flyTo({destination, duration})`。**raw PointPrimitive は `trackedEntity`/`viewer.flyTo` の対象にできない** → `viewer.camera.flyTo({destination: 点のECEF位置})` で寄せる。
- 軌道線: `viewer.entities.add({ polyline: { positions: Cartesian3[], width, material: Cesium.Color.CYAN, arcType: Cesium.ArcType.NONE } })`。
- Vite 連携: `vite-plugin-cesium`（`plugins:[cesium()]`）が Workers/Assets と `CESIUM_BASE_URL` を処理。

**Celestrak（CORS `*` 確認済み、GET/HEAD のみ）**
- TLE: `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE`（**FORMAT を必ず明示**、既定は CSV）。3 行（名前/L1/L2）単位。
- JSON/OMM: `...&FORMAT=JSON`。フィールド `OBJECT_NAME, OBJECT_ID, NORAD_CAT_ID, EPOCH, MEAN_MOTION, ...`。
- SATCAT: `https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON`（個別は `?CATNR=25544`）。フィールド `OBJECT_NAME, OBJECT_ID, NORAD_CAT_ID, OBJECT_TYPE(PAY/R/B/DEB/UNK), OWNER, LAUNCH_DATE(YYYY-MM-DD), APOGEE, PERIGEE, INCLINATION, PERIOD, ...`。
- バルク取得はレート制限あり（403 の可能性）→ localStorage に数時間キャッシュ、過剰ポーリング禁止。

**テスト固定 TLE（ISS、2026-158 epoch・リサーチで実取得）**
```
ISS (ZARYA)
1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998
2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299
```
TLE から決まる不変量: 軌道傾斜角 ≈ 51.6339°、離心率 ≈ 0.0006971、平均運動 ≈ 15.4966 rev/day → 周期 ≈ 92.93 分、高度 ≈ 400km 帯。

---

## ファイル構成（責務マップ）

```
orbit-tracker/
  index.html                     全画面 Cesium コンテナ
  package.json / tsconfig.json
  vite.config.ts / vitest.config.ts
  src/
    main.ts                      起動フロー・全配線
    types.ts                     共通型
    config.ts                    エンドポイントURL・定数
    data/celestrak.ts            TLE 取得・パース・キャッシュ
    data/satcat.ts               SATCAT 取得・突合
    propagation/propagator.ts    satrec生成・ECEF/測地座標・軌道要素
    propagation/protocol.ts      Worker メッセージ型
    propagation/worker.ts        SGP4 一括計算(別スレッド)
    globe/viewer.ts              Cesium Viewer 初期化(無トークン)
    globe/satellites.ts          点群描画・位置更新
    globe/orbitPath.ts           選択物体の軌道線
    ui/detailPanel.ts            クリック詳細パネル
    ui/search.ts                 検索→カメラ追従
    ui/loading.ts                読み込み/エラー表示
  tests/fixtures/                サンプル TLE / SATCAT JSON
  e2e/smoke.spec.ts              Playwright スモーク(任意)
```

依存方向: `data/*` と `propagation/*` は Cesium 非依存（純粋・テスト容易）。`globe/*` `ui/*` が Cesium に依存。`main.ts` が全部を配線。

---

## Task 1: プロジェクト雛形とツールチェーン

**Files:**
- Create: `orbit-tracker/package.json`
- Create: `orbit-tracker/tsconfig.json`
- Create: `orbit-tracker/vite.config.ts`
- Create: `orbit-tracker/vitest.config.ts`
- Create: `orbit-tracker/index.html`
- Create: `orbit-tracker/src/main.ts`
- Create: `orbit-tracker/.gitignore`
- Test: `orbit-tracker/tests/smoke.test.ts`

- [ ] **Step 1: リポジトリ初期化**

Run（`orbit-tracker/` 直下で）:
```bash
git init
```

- [ ] **Step 2: `.gitignore` を作成**

```
node_modules/
dist/
.superpowers/
*.local
```

- [ ] **Step 3: `package.json` を作成**

```json
{
  "name": "orbit-tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "cesium": "^1.135.0",
    "satellite.js": "^6.0.0"
  },
  "devDependencies": {
    "@vitest/web-worker": "^3.2.4",
    "jsdom": "^26.1.0",
    "typescript": "^5.9.0",
    "vite": "^7.1.0",
    "vite-plugin-cesium": "^1.2.23",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 4: `tsconfig.json` を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["vite/client", "vitest/globals"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: `vite.config.ts` を作成**

```ts
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
});
```

- [ ] **Step 6: `vitest.config.ts` を作成**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["@vitest/web-worker"],
  },
});
```

- [ ] **Step 7: `index.html` を作成**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>orbit-tracker</title>
    <style>
      html, body, #cesiumContainer { width:100%; height:100%; margin:0; padding:0; overflow:hidden; }
      body { background:#000; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="cesiumContainer"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: 最小 `src/main.ts` を作成（地球儀だけ）**

```ts
import { Viewer, Ion } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

Ion.defaultAccessToken = "";
new Viewer("cesiumContainer");
```

- [ ] **Step 9: 依存をインストール**

Run: `npm install`
Expected: `node_modules/` が作られ、エラーなく終了。`npm ls satellite.js cesium` で解決版を確認（satellite.js が v5 系に解決された場合は `npm i satellite.js@latest` で最新化し、本計画の `null` ガードに合わせる）。

- [ ] **Step 10: 失敗するスモークテストを書く**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 11: テスト実行**

Run: `npm test`
Expected: PASS（ツールチェーン疎通）。

- [ ] **Step 12: dev サーバで地球儀を目視確認**

Run: `npm run dev`
Expected: 表示された localhost URL をブラウザで開くと、OSM タイルの 3D 地球儀が表示（ion トークン警告なし）。確認後 Ctrl+C。

- [ ] **Step 13: コミット**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html src/main.ts .gitignore tests/smoke.test.ts
git commit -m "chore: scaffold Vite+TS+Cesium app with empty globe"
```

---

## Task 2: 共通型と設定

**Files:**
- Create: `orbit-tracker/src/types.ts`
- Create: `orbit-tracker/src/config.ts`

- [ ] **Step 1: `src/types.ts` を作成**

```ts
/** TLE から得る衛星の基本レコード */
export interface SatelliteRecord {
  noradId: number;
  name: string;
  intlDesignator: string; // OBJECT_ID 相当 (TLE 由来)
  tle1: string;
  tle2: string;
}

/** SATCAT 由来のメタ情報 */
export interface SatcatMeta {
  noradId: number;
  objectType: string;  // PAY / R/B / DEB / UNK
  owner: string;       // US, PRC, CIS, ESA ...
  launchDate: string;  // YYYY-MM-DD
}

/** クリック時に算出する軌道要素 */
export interface OrbitalElements {
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeAltKm: number;
  perigeeAltKm: number;
  semiMajorAxisKm: number;
}

/** ある時刻の瞬時状態 */
export interface InstantState {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  speedKmS: number;
}

/** ECEF メートル座標 */
export interface EcefMeters {
  x: number;
  y: number;
  z: number;
}
```

- [ ] **Step 2: `src/config.ts` を作成**

```ts
export const CELESTRAK = {
  activeTleUrl: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE",
  satcatActiveUrl: "https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=JSON",
} as const;

/** TLE キャッシュ有効期間（ミリ秒）: 6 時間 */
export const TLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  tle: "orbit-tracker.tle.v1",
  tleFetchedAt: "orbit-tracker.tle.fetchedAt.v1",
  satcat: "orbit-tracker.satcat.v1",
  satcatFetchedAt: "orbit-tracker.satcat.fetchedAt.v1",
} as const;

/** WGS-72 定数（SGP4/satellite.js 準拠） */
export const EARTH = { muKm3S2: 398600.5, radiusKm: 6378.135 } as const;
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 4: コミット**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add shared types and config constants"
```

---

## Task 3: TLE のパース

**Files:**
- Create: `orbit-tracker/src/data/tleParse.ts`
- Test: `orbit-tracker/tests/tleParse.test.ts`
- Create: `orbit-tracker/tests/fixtures/active-sample.tle`

- [ ] **Step 1: フィクスチャを作成 `tests/fixtures/active-sample.tle`**

```
ISS (ZARYA)
1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998
2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299
NOAA 19
1 33591U 09005A   26158.50000000  .00000100  00000+0  10000-3 0  9991
2 33591  99.0000 200.0000 0013000 100.0000 260.0000 14.13000000123456
```

- [ ] **Step 2: 失敗するテストを書く `tests/tleParse.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTle } from "../src/data/tleParse";

const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/active-sample.tle", import.meta.url)),
  "utf8",
);

describe("parseTle", () => {
  it("parses 3-line sets into records", () => {
    const records = parseTle(fixture);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      noradId: 25544,
      name: "ISS (ZARYA)",
      intlDesignator: "98067A",
    });
    expect(records[0].tle1.startsWith("1 25544U")).toBe(true);
    expect(records[0].tle2.startsWith("2 25544")).toBe(true);
    expect(records[1].noradId).toBe(33591);
  });

  it("ignores trailing blank lines / CRLF", () => {
    const records = parseTle(fixture.replace(/\n/g, "\r\n") + "\r\n\r\n");
    expect(records).toHaveLength(2);
  });
});
```

- [ ] **Step 3: テストが失敗するのを確認**

Run: `npx vitest run tests/tleParse.test.ts`
Expected: FAIL（`parseTle` 未定義）。

- [ ] **Step 4: 実装 `src/data/tleParse.ts`**

```ts
import type { SatelliteRecord } from "../types";

/** Celestrak の TLE テキスト（名前/L1/L2 の3行単位）を配列へ */
export function parseTle(text: string): SatelliteRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);

  const records: SatelliteRecord[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];
    if (!name || !tle1?.startsWith("1 ") || !tle2?.startsWith("2 ")) continue;
    const noradId = parseInt(tle1.substring(2, 7), 10);
    const intlDesignator = tle1.substring(9, 17).trim();
    records.push({ noradId, name: name.trim(), intlDesignator, tle1, tle2 });
  }
  return records;
}
```

- [ ] **Step 5: テストが通るのを確認**

Run: `npx vitest run tests/tleParse.test.ts`
Expected: PASS（2件）。

- [ ] **Step 6: コミット**

```bash
git add src/data/tleParse.ts tests/tleParse.test.ts tests/fixtures/active-sample.tle
git commit -m "feat: parse Celestrak TLE text into satellite records"
```

---

## Task 4: TLE キャッシュ（TTL）ロジック

**Files:**
- Create: `orbit-tracker/src/data/tleCache.ts`
- Test: `orbit-tracker/tests/tleCache.test.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/tleCache.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadCachedTle, saveCachedTle } from "../src/data/tleCache";
import type { SatelliteRecord } from "../src/types";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const sample: SatelliteRecord[] = [
  { noradId: 1, name: "A", intlDesignator: "00001A", tle1: "1 ...", tle2: "2 ..." },
];

describe("tleCache", () => {
  it("returns null when nothing cached", () => {
    expect(loadCachedTle(memStorage(), 1000, 5000)).toBeNull();
  });

  it("returns records within TTL", () => {
    const s = memStorage();
    saveCachedTle(s, sample, 1000);
    expect(loadCachedTle(s, 5000, 1000)).toEqual(sample); // age 4000 < ttl? no -> below
  });

  it("returns records when age < ttl, null when expired", () => {
    const s = memStorage();
    saveCachedTle(s, sample, 1000);     // fetchedAt=1000
    expect(loadCachedTle(s, 3000, 5000)).toEqual(sample); // age 2000 < 5000 -> hit
    expect(loadCachedTle(s, 9000, 5000)).toBeNull();      // age 8000 > 5000 -> miss
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/tleCache.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/data/tleCache.ts`**

```ts
import type { SatelliteRecord } from "../types";
import { STORAGE_KEYS } from "../config";

export function saveCachedTle(storage: Storage, records: SatelliteRecord[], nowMs: number): void {
  storage.setItem(STORAGE_KEYS.tle, JSON.stringify(records));
  storage.setItem(STORAGE_KEYS.tleFetchedAt, String(nowMs));
}

/** TTL 内ならレコード、無い/期限切れなら null */
export function loadCachedTle(storage: Storage, nowMs: number, ttlMs: number): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.tle);
  const at = storage.getItem(STORAGE_KEYS.tleFetchedAt);
  if (!raw || !at) return null;
  if (nowMs - Number(at) > ttlMs) return null;
  try {
    return JSON.parse(raw) as SatelliteRecord[];
  } catch {
    return null;
  }
}

/** 期限切れでも残っていれば返す（オフライン時のフォールバック用） */
export function loadStaleTle(storage: Storage): SatelliteRecord[] | null {
  const raw = storage.getItem(STORAGE_KEYS.tle);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SatelliteRecord[];
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 2番目のテストの期待値を実挙動に合わせる**

Step 1 の 2 番目テスト `it("returns records within TTL")` のコメントは紛らわしいので、本実装に合わせて次へ置換：
```ts
  it("returns records within TTL", () => {
    const s = memStorage();
    saveCachedTle(s, sample, 1000);     // fetchedAt = 1000
    expect(loadCachedTle(s, 2000, 5000)).toEqual(sample); // age 1000 < ttl 5000
  });
```

- [ ] **Step 5: テストが通るのを確認**

Run: `npx vitest run tests/tleCache.test.ts`
Expected: PASS（3件）。

- [ ] **Step 6: コミット**

```bash
git add src/data/tleCache.ts tests/tleCache.test.ts
git commit -m "feat: TTL-based localStorage cache for TLE data"
```

---

## Task 5: TLE 取得オーケストレーション（fetch + cache + フォールバック）

**Files:**
- Create: `orbit-tracker/src/data/celestrak.ts`
- Test: `orbit-tracker/tests/celestrak.test.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/celestrak.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchActiveTle } from "../src/data/celestrak";
import { STORAGE_KEYS } from "../src/config";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const TLE = `ISS (ZARYA)
1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998
2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299`;

describe("fetchActiveTle", () => {
  it("fetches and caches when cache empty", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    const recs = await fetchActiveTle({ storage, now: () => 1000, fetchFn: fetchFn as any });
    expect(recs[0].noradId).toBe(25544);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(storage.getItem(STORAGE_KEYS.tle)).not.toBeNull();
  });

  it("uses fresh cache without fetching", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    await fetchActiveTle({ storage, now: () => 1000, fetchFn: fetchFn as any });
    fetchFn.mockClear();
    const recs = await fetchActiveTle({ storage, now: () => 2000, fetchFn: fetchFn as any });
    expect(recs[0].noradId).toBe(25544);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("falls back to stale cache on fetch error", async () => {
    const storage = memStorage();
    const ok = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    await fetchActiveTle({ storage, now: () => 1000, fetchFn: ok as any });
    const fail = vi.fn().mockRejectedValue(new Error("network"));
    const recs = await fetchActiveTle({
      storage, now: () => 9_999_999_999, fetchFn: fail as any, // cache expired
    });
    expect(recs[0].noradId).toBe(25544); // stale fallback
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/celestrak.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/data/celestrak.ts`**

```ts
import type { SatelliteRecord } from "../types";
import { CELESTRAK, TLE_CACHE_TTL_MS } from "../config";
import { parseTle } from "./tleParse";
import { loadCachedTle, saveCachedTle, loadStaleTle } from "./tleCache";

export interface FetchTleOptions {
  storage?: Storage;
  now?: () => number;
  fetchFn?: typeof fetch;
  ttlMs?: number;
}

/** TLE をキャッシュ優先で取得。失敗時は期限切れキャッシュにフォールバック。 */
export async function fetchActiveTle(opts: FetchTleOptions = {}): Promise<SatelliteRecord[]> {
  const storage = opts.storage ?? localStorage;
  const now = opts.now ?? Date.now;
  const fetchFn = opts.fetchFn ?? fetch;
  const ttl = opts.ttlMs ?? TLE_CACHE_TTL_MS;

  const cached = loadCachedTle(storage, now(), ttl);
  if (cached) return cached;

  try {
    const res = await fetchFn(CELESTRAK.activeTleUrl);
    if (!("ok" in res) || !res.ok) throw new Error(`HTTP ${(res as Response).status}`);
    const text = await res.text();
    const records = parseTle(text);
    if (records.length === 0) throw new Error("empty TLE response");
    saveCachedTle(storage, records, now());
    return records;
  } catch (err) {
    const stale = loadStaleTle(storage);
    if (stale && stale.length > 0) return stale;
    throw err;
  }
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/celestrak.test.ts`
Expected: PASS（3件）。

- [ ] **Step 5: コミット**

```bash
git add src/data/celestrak.ts tests/celestrak.test.ts
git commit -m "feat: fetch active TLE with cache and stale fallback"
```

---

## Task 6: SATCAT メタ取得・突合

**Files:**
- Create: `orbit-tracker/src/data/satcat.ts`
- Test: `orbit-tracker/tests/satcat.test.ts`
- Create: `orbit-tracker/tests/fixtures/satcat-sample.json`

- [ ] **Step 1: フィクスチャ `tests/fixtures/satcat-sample.json`**

```json
[
  {
    "OBJECT_NAME": "ISS (ZARYA)",
    "OBJECT_ID": "1998-067A",
    "NORAD_CAT_ID": 25544,
    "OBJECT_TYPE": "PAY",
    "OWNER": "ISS",
    "LAUNCH_DATE": "1998-11-20",
    "APOGEE": 421,
    "PERIGEE": 412
  },
  {
    "OBJECT_NAME": "NOAA 19",
    "OBJECT_ID": "2009-005A",
    "NORAD_CAT_ID": 33591,
    "OBJECT_TYPE": "PAY",
    "OWNER": "US",
    "LAUNCH_DATE": "2009-02-06",
    "APOGEE": 870,
    "PERIGEE": 846
  }
]
```

- [ ] **Step 2: 失敗するテストを書く `tests/satcat.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSatcat, fetchSatcat } from "../src/data/satcat";

const sample = readFileSync(
  fileURLToPath(new URL("./fixtures/satcat-sample.json", import.meta.url)),
  "utf8",
);

describe("parseSatcat", () => {
  it("builds a map keyed by noradId", () => {
    const map = parseSatcat(JSON.parse(sample));
    expect(map.get(25544)).toMatchObject({
      noradId: 25544, objectType: "PAY", owner: "ISS", launchDate: "1998-11-20",
    });
    expect(map.get(33591)?.owner).toBe("US");
  });
});

describe("fetchSatcat", () => {
  it("returns empty map on error (non-blocking)", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("network"));
    const map = await fetchSatcat({ fetchFn: fail as any });
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 3: テストが失敗するのを確認**

Run: `npx vitest run tests/satcat.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 4: 実装 `src/data/satcat.ts`**

```ts
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
```

- [ ] **Step 5: テストが通るのを確認**

Run: `npx vitest run tests/satcat.test.ts`
Expected: PASS（2件）。

- [ ] **Step 6: コミット**

```bash
git add src/data/satcat.ts tests/satcat.test.ts tests/fixtures/satcat-sample.json
git commit -m "feat: fetch and join SATCAT metadata by NORAD id"
```

---

## Task 7: 軌道計算（propagator）

**Files:**
- Create: `orbit-tracker/src/propagation/propagator.ts`
- Test: `orbit-tracker/tests/propagator.test.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/propagator.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSatrec, computeEcefMeters, computeInstantState, computeOrbitalElements } from "../src/propagation/propagator";

const L1 = "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998";
const L2 = "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299";

describe("propagator (ISS)", () => {
  const satrec = buildSatrec(L1, L2);

  it("derives orbital elements from TLE invariants", () => {
    const e = computeOrbitalElements(satrec);
    expect(e.inclinationDeg).toBeCloseTo(51.6339, 2);
    expect(e.eccentricity).toBeCloseTo(0.0006971, 5);
    expect(e.periodMin).toBeGreaterThan(90);
    expect(e.periodMin).toBeLessThan(95);
    // ISS apogee/perigee altitude ~ 400-430 km band
    expect(e.apogeeAltKm).toBeGreaterThan(380);
    expect(e.apogeeAltKm).toBeLessThan(450);
    expect(e.perigeeAltKm).toBeGreaterThan(380);
  });

  it("computes a plausible LEO position at epoch", () => {
    const at = new Date(Date.UTC(2026, 5, 7, 18, 32, 0)); // 近い時刻で十分
    const ecef = computeEcefMeters(satrec, at);
    expect(ecef).not.toBeNull();
    const r = Math.hypot(ecef!.x, ecef!.y, ecef!.z) / 1000; // km
    expect(r).toBeGreaterThan(6378 + 300);
    expect(r).toBeLessThan(6378 + 500);

    const st = computeInstantState(satrec, at)!;
    expect(Math.abs(st.latitudeDeg)).toBeLessThanOrEqual(52); // |lat| <= inclination
    expect(st.speedKmS).toBeGreaterThan(7);
    expect(st.speedKmS).toBeLessThan(8);
  });

  it("returns null for a decayed/invalid satrec gracefully", () => {
    // 不正な行 -> satrec.error が立ち、computeEcefMeters は null
    const bad = buildSatrec("1 00000U 00000A   00000.00000000  .00000000  00000+0  00000+0 0  0000",
                            "2 00000   0.0000   0.0000 0000000   0.0000   0.0000  0.00000000000000");
    expect(computeEcefMeters(bad, new Date())).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/propagator.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/propagation/propagator.ts`**

```ts
import {
  twoline2satrec, propagate, gstime,
  eciToEcf, eciToGeodetic, degreesLat, degreesLong, radiansToDegrees,
  type SatRec,
} from "satellite.js";
import type { EcefMeters, InstantState, OrbitalElements } from "../types";
import { EARTH } from "../config";

export function buildSatrec(tle1: string, tle2: string): SatRec {
  return twoline2satrec(tle1, tle2);
}

/** propagate して失敗（v6/v7=null, v5=false）なら null。成功なら {position, velocity}(km)。 */
function propagateSafe(satrec: SatRec, date: Date): { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } } | null {
  const pv = propagate(satrec, date) as any;
  if (!pv || pv.position === false || pv.position == null) return null;
  return pv;
}

/** ECEF メートル座標（Cesium Cartesian3 にそのまま渡せる） */
export function computeEcefMeters(satrec: SatRec, date: Date): EcefMeters | null {
  const pv = propagateSafe(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position, gmst); // km
  return { x: ecf.x * 1000, y: ecf.y * 1000, z: ecf.z * 1000 };
}

/** 緯度経度高度・速度 */
export function computeInstantState(satrec: SatRec, date: Date): InstantState | null {
  const pv = propagateSafe(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const gd = eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    latitudeDeg: degreesLat(gd.latitude),
    longitudeDeg: degreesLong(gd.longitude),
    altitudeKm: gd.height,
    speedKmS: Math.hypot(v.x, v.y, v.z),
  };
}

/** TLE 不変量から軌道要素を算出 */
export function computeOrbitalElements(satrec: SatRec): OrbitalElements {
  const ecc = satrec.ecco;
  const inclinationDeg = radiansToDegrees(satrec.inclo);
  const periodMin = (2 * Math.PI) / satrec.no; // no は rad/min
  const noRadPerSec = satrec.no / 60;
  const a = Math.cbrt(EARTH.muKm3S2 / (noRadPerSec * noRadPerSec)); // km
  return {
    periodMin,
    inclinationDeg,
    eccentricity: ecc,
    semiMajorAxisKm: a,
    apogeeAltKm: a * (1 + ecc) - EARTH.radiusKm,
    perigeeAltKm: a * (1 - ecc) - EARTH.radiusKm,
  };
}
```

> 注: `satellite.js` の型名が版で異なる場合（`SatRec` が見つからない等）は `import type { SatRec }` を外し、`type SatRec = ReturnType<typeof twoline2satrec>` をローカル定義する。

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/propagator.test.ts`
Expected: PASS（3件）。万一 `degreesLat` が範囲外で `RangeError` を投げる版なら、`computeInstantState` 内で try/catch して null を返すよう調整。

- [ ] **Step 5: コミット**

```bash
git add src/propagation/propagator.ts tests/propagator.test.ts
git commit -m "feat: SGP4 propagation to ECEF/geodetic and orbital elements"
```

---

## Task 8: Worker プロトコルと一括計算

**Files:**
- Create: `orbit-tracker/src/propagation/protocol.ts`
- Create: `orbit-tracker/src/propagation/worker.ts`
- Test: `orbit-tracker/tests/worker.test.ts`

- [ ] **Step 1: プロトコル型 `src/propagation/protocol.ts`**

```ts
/** main -> worker: 初期化（全衛星の TLE を渡す） */
export interface InitMessage {
  type: "init";
  sats: { noradId: number; tle1: string; tle2: string }[];
}
/** main -> worker: ある時刻の全位置を要求 */
export interface TickMessage {
  type: "tick";
  timeMs: number;
}
export type WorkerRequest = InitMessage | TickMessage;

/** worker -> main: 位置結果。positions は [x0,y0,z0, x1,y1,z1, ...] のメートル ECEF。
 *  計算不能だった衛星は x,y,z すべて NaN。順序は init の sats と同じ。 */
export interface PositionsMessage {
  type: "positions";
  timeMs: number;
  positions: Float64Array;
}
```

- [ ] **Step 2: 失敗するテストを書く `tests/worker.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { PositionsMessage, WorkerRequest } from "../src/propagation/protocol";

describe("propagation worker", () => {
  it("returns ECEF positions for given TLEs at a time", async () => {
    const worker = new Worker(new URL("../src/propagation/worker.ts", import.meta.url), { type: "module" });

    const result = await new Promise<PositionsMessage>((resolve) => {
      worker.onmessage = (e: MessageEvent<PositionsMessage>) => {
        if (e.data.type === "positions") resolve(e.data);
      };
      const init: WorkerRequest = {
        type: "init",
        sats: [{
          noradId: 25544,
          tle1: "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998",
          tle2: "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299",
        }],
      };
      worker.postMessage(init);
      const tick: WorkerRequest = { type: "tick", timeMs: Date.UTC(2026, 5, 7, 18, 32, 0) };
      worker.postMessage(tick);
    });

    expect(result.positions.length).toBe(3);
    const r = Math.hypot(result.positions[0], result.positions[1], result.positions[2]) / 1000;
    expect(r).toBeGreaterThan(6378 + 300);
    expect(r).toBeLessThan(6378 + 500);
    worker.terminate();
  });
});
```

- [ ] **Step 3: テストが失敗するのを確認**

Run: `npx vitest run tests/worker.test.ts`
Expected: FAIL（worker 未実装）。

- [ ] **Step 4: 実装 `src/propagation/worker.ts`**

```ts
import { buildSatrec, computeEcefMeters } from "./propagator";
import type { WorkerRequest, PositionsMessage } from "./protocol";
import type { SatRec } from "satellite.js";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let satrecs: SatRec[] = [];

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    satrecs = msg.sats.map((s) => buildSatrec(s.tle1, s.tle2));
    return;
  }
  if (msg.type === "tick") {
    const date = new Date(msg.timeMs);
    const positions = new Float64Array(satrecs.length * 3);
    for (let i = 0; i < satrecs.length; i++) {
      const ecef = computeEcefMeters(satrecs[i], date);
      const o = i * 3;
      if (ecef) {
        positions[o] = ecef.x; positions[o + 1] = ecef.y; positions[o + 2] = ecef.z;
      } else {
        positions[o] = NaN; positions[o + 1] = NaN; positions[o + 2] = NaN;
      }
    }
    const out: PositionsMessage = { type: "positions", timeMs: msg.timeMs, positions };
    ctx.postMessage(out, [positions.buffer]); // transferable
  }
};
```

> 注: `import type { SatRec }` が解決できない版では Task 7 同様にローカル型へ差し替え。

- [ ] **Step 5: テストが通るのを確認**

Run: `npx vitest run tests/worker.test.ts`
Expected: PASS。失敗する場合、`@vitest/web-worker` が `setupFiles` に入っているか（Task 1 Step 6）を確認。

- [ ] **Step 6: コミット**

```bash
git add src/propagation/protocol.ts src/propagation/worker.ts tests/worker.test.ts
git commit -m "feat: web worker batch-computes ECEF positions via SGP4"
```

---

## Task 9: Cesium Viewer 初期化（無トークン）

**Files:**
- Create: `orbit-tracker/src/globe/viewer.ts`
- Modify: `orbit-tracker/src/main.ts`

- [ ] **Step 1: 実装 `src/globe/viewer.ts`**

```ts
import * as Cesium from "cesium";

/** ion 不要・OSM 画像・terrain オフ・時計と各ウィジェット有効の Viewer を作る */
export function createViewer(containerId: string): Cesium.Viewer {
  Cesium.Ion.defaultAccessToken = "";

  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
    ),
    baseLayerPicker: false,
    geocoder: false,
    animation: true,   // 再生/速度ウィジェット
    timeline: true,    // 時間スクラブ
    sceneModePicker: true,
    navigationHelpButton: false,
  });

  // 時計: 現在時刻を中心に前後 1 日、ループ
  const now = Cesium.JulianDate.now();
  viewer.clock.startTime = Cesium.JulianDate.addSeconds(now, -86400, new Cesium.JulianDate());
  viewer.clock.stopTime = Cesium.JulianDate.addSeconds(now, 86400, new Cesium.JulianDate());
  viewer.clock.currentTime = now.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 60;
  viewer.clock.shouldAnimate = true;

  return viewer;
}
```

- [ ] **Step 2: `src/main.ts` を差し替え**

```ts
import "cesium/Build/Cesium/Widgets/widgets.css";
import { createViewer } from "./globe/viewer";

const viewer = createViewer("cesiumContainer");
// 以降のタスクで衛星描画・UI を配線する
void viewer;
```

- [ ] **Step 3: 目視確認**

Run: `npm run dev`
Expected: OSM の地球儀＋下部にタイムライン、左下に再生/速度ウィジェットが表示。ion 警告なし。Ctrl+C で終了。

- [ ] **Step 4: コミット**

```bash
git add src/globe/viewer.ts src/main.ts
git commit -m "feat: token-free Cesium viewer with OSM imagery and clock"
```

---

## Task 10: 衛星の点群描画と位置更新

**Files:**
- Create: `orbit-tracker/src/globe/satellites.ts`
- Test: `orbit-tracker/tests/satellites.test.ts`

純粋部分（位置配列→点更新）をテスト可能にするため、PointPrimitiveCollection を最小インターフェースで抽象化する。

- [ ] **Step 1: 失敗するテストを書く `tests/satellites.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applyPositions, type PointLike, type CollectionLike } from "../src/globe/satellites";

class FakePoint implements PointLike {
  position = { x: 0, y: 0, z: 0 };
  show = true;
}
class FakeCollection implements CollectionLike {
  points: FakePoint[] = [];
  get(i: number) { return this.points[i]; }
  get length() { return this.points.length; }
}

describe("applyPositions", () => {
  it("writes ECEF positions onto points and hides NaN ones", () => {
    const col = new FakeCollection();
    col.points.push(new FakePoint(), new FakePoint());
    const positions = new Float64Array([100, 200, 300, NaN, NaN, NaN]);

    applyPositions(col, positions, (x, y, z) => ({ x, y, z }));

    expect(col.points[0].position).toEqual({ x: 100, y: 200, z: 300 });
    expect(col.points[0].show).toBe(true);
    expect(col.points[1].show).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/satellites.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/globe/satellites.ts`**

```ts
import * as Cesium from "cesium";
import type { SatelliteRecord } from "../types";

export interface PointLike {
  position: unknown;
  show: boolean;
}
export interface CollectionLike {
  get(i: number): PointLike;
  readonly length: number;
}

/** positions(=[x,y,z,...] メートル ECEF) を点群へ反映。NaN は非表示に。 */
export function applyPositions(
  collection: CollectionLike,
  positions: Float64Array,
  makeCartesian: (x: number, y: number, z: number) => unknown,
): void {
  const n = collection.length;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = positions[o], y = positions[o + 1], z = positions[o + 2];
    const p = collection.get(i);
    if (Number.isNaN(x)) { p.show = false; continue; }
    p.position = makeCartesian(x, y, z);
    p.show = true;
  }
}

/** Cesium の点群コレクションを作り、衛星 1 つにつき 1 点を追加（id=noradId）。 */
export function createSatellitePoints(
  viewer: Cesium.Viewer,
  records: SatelliteRecord[],
): Cesium.PointPrimitiveCollection {
  const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  for (const r of records) {
    points.add({
      position: new Cesium.Cartesian3(0, 0, 0),
      color: Cesium.Color.fromCssColorString("#ffd36b"),
      pixelSize: 3,
      id: r.noradId,
      show: false,
    });
  }
  return points;
}

/** Cesium 点群へ positions を反映する薄いラッパ。 */
export function updateSatellitePoints(
  points: Cesium.PointPrimitiveCollection,
  positions: Float64Array,
): void {
  applyPositions(
    { get: (i) => points.get(i) as unknown as PointLike, length: points.length },
    positions,
    (x, y, z) => new Cesium.Cartesian3(x, y, z),
  );
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/satellites.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/globe/satellites.ts tests/satellites.test.ts
git commit -m "feat: render satellites as point primitives and update positions"
```

---

## Task 11: データ→Worker→描画の配線（リアルタイム表示）

**Files:**
- Modify: `orbit-tracker/src/main.ts`
- Create: `orbit-tracker/src/ui/loading.ts`

- [ ] **Step 1: 実装 `src/ui/loading.ts`**

```ts
/** 画面中央のローディング/エラー表示を最小実装で。 */
export function showLoading(message: string): HTMLElement {
  let el = document.getElementById("ot-loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "ot-loading";
    el.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
      "background:rgba(0,0,0,.7);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  return el;
}

export function hideLoading(): void {
  const el = document.getElementById("ot-loading");
  if (el) el.style.display = "none";
}

export function showError(message: string): void {
  const el = showLoading(message);
  el.style.background = "rgba(140,0,0,.85)";
}
```

- [ ] **Step 2: `src/main.ts` を更新（配線）**

```ts
import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { createViewer } from "./globe/viewer";
import { createSatellitePoints, updateSatellitePoints } from "./globe/satellites";
import { fetchActiveTle } from "./data/celestrak";
import { fetchSatcat } from "./data/satcat";
import { showLoading, hideLoading, showError } from "./ui/loading";
import type { WorkerRequest, PositionsMessage } from "./propagation/protocol";
import type { SatelliteRecord, SatcatMeta } from "./types";

async function main() {
  const viewer = createViewer("cesiumContainer");

  showLoading("衛星データを取得中…");
  let records: SatelliteRecord[];
  try {
    records = await fetchActiveTle();
  } catch {
    showError("TLE の取得に失敗しました（オフライン/レート制限）。再読み込みしてください。");
    return;
  }
  const satcat: Map<number, SatcatMeta> = await fetchSatcat();
  showLoading(`${records.length} 個の物体を描画中…`);

  const points = createSatellitePoints(viewer, records);

  const worker = new Worker(new URL("./propagation/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<PositionsMessage>) => {
    if (e.data.type === "positions") {
      updateSatellitePoints(points, e.data.positions);
      hideLoading();
    }
  };
  const init: WorkerRequest = {
    type: "init",
    sats: records.map((r) => ({ noradId: r.noradId, tle1: r.tle1, tle2: r.tle2 })),
  };
  worker.postMessage(init);

  // 時計の tick ごとに、その時刻の全位置を要求（過剰要求を避けるため間引き）
  let lastSentMs = 0;
  viewer.clock.onTick.addEventListener((clock) => {
    const date = Cesium.JulianDate.toDate(clock.currentTime);
    const ms = date.getTime();
    if (Math.abs(ms - lastSentMs) < 200) return; // 約5Hz
    lastSentMs = ms;
    const tick: WorkerRequest = { type: "tick", timeMs: ms };
    worker.postMessage(tick);
  });

  // 後続タスクで使うため公開
  (window as any).__orbitTracker = { viewer, points, records, satcat, worker };
}

main();
```

- [ ] **Step 3: 目視確認**

Run: `npm run dev`
Expected: 数千の黄点が地球儀上に現れ、再生に合わせて移動する。早送り/スクラブで点が動く。FPS が落ちる場合は `onTick` の間引き間隔を広げる。

- [ ] **Step 4: コミット**

```bash
git add src/main.ts src/ui/loading.ts
git commit -m "feat: wire data->worker->render for live satellite positions"
```

---

## Task 12: クリックで詳細パネル（機能①）

**Files:**
- Create: `orbit-tracker/src/ui/detailPanel.ts`
- Test: `orbit-tracker/tests/detailPanel.test.ts`
- Modify: `orbit-tracker/src/main.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/detailPanel.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderDetailHtml } from "../src/ui/detailPanel";
import type { SatelliteRecord, SatcatMeta, OrbitalElements, InstantState } from "../src/types";

const rec: SatelliteRecord = { noradId: 25544, name: "ISS (ZARYA)", intlDesignator: "98067A", tle1: "", tle2: "" };
const meta: SatcatMeta = { noradId: 25544, objectType: "PAY", owner: "ISS", launchDate: "1998-11-20" };
const el: OrbitalElements = { periodMin: 92.9, inclinationDeg: 51.6, eccentricity: 0.0007, apogeeAltKm: 421, perigeeAltKm: 412, semiMajorAxisKm: 6794 };
const st: InstantState = { latitudeDeg: 12.3, longitudeDeg: -45.6, altitudeKm: 417, speedKmS: 7.66 };

describe("renderDetailHtml", () => {
  it("includes name, norad id, owner, launch date, and key elements", () => {
    const html = renderDetailHtml(rec, meta, el, st);
    expect(html).toContain("ISS (ZARYA)");
    expect(html).toContain("25544");
    expect(html).toContain("1998-11-20");
    expect(html).toContain("51.6"); // inclination
    expect(html).toContain("92.9"); // period
  });

  it("omits SATCAT rows when meta is undefined", () => {
    const html = renderDetailHtml(rec, undefined, el, st);
    expect(html).not.toContain("打ち上げ");
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/detailPanel.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/ui/detailPanel.ts`**

```ts
import type { SatelliteRecord, SatcatMeta, OrbitalElements, InstantState } from "../types";

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px"><span style="opacity:.7">${label}</span><span>${value}</span></div>`;
}

const TYPE_JA: Record<string, string> = { PAY: "ペイロード", "R/B": "ロケット体", DEB: "デブリ", UNK: "不明" };

/** 詳細パネルの HTML を組み立てる（純粋関数・テスト可能） */
export function renderDetailHtml(
  rec: SatelliteRecord,
  meta: SatcatMeta | undefined,
  el: OrbitalElements,
  st: InstantState,
): string {
  const lines: string[] = [];
  lines.push(`<h3 style="margin:0 0 8px">${rec.name}</h3>`);
  lines.push(row("NORAD番号", String(rec.noradId)));
  lines.push(row("国際識別符号", rec.intlDesignator || "—"));
  if (meta) {
    lines.push(row("種別", TYPE_JA[meta.objectType] ?? meta.objectType));
    if (meta.owner) lines.push(row("運用者", meta.owner));
    if (meta.launchDate) lines.push(row("打ち上げ日", meta.launchDate));
  }
  lines.push(`<hr style="border-color:#333;margin:8px 0">`);
  lines.push(row("緯度", `${st.latitudeDeg.toFixed(2)}°`));
  lines.push(row("経度", `${st.longitudeDeg.toFixed(2)}°`));
  lines.push(row("高度", `${st.altitudeKm.toFixed(1)} km`));
  lines.push(row("速度", `${st.speedKmS.toFixed(2)} km/s`));
  lines.push(`<hr style="border-color:#333;margin:8px 0">`);
  lines.push(row("軌道周期", `${el.periodMin.toFixed(1)} 分`));
  lines.push(row("軌道傾斜角", `${el.inclinationDeg.toFixed(1)}°`));
  lines.push(row("離心率", el.eccentricity.toFixed(4)));
  lines.push(row("遠地点高度", `${el.apogeeAltKm.toFixed(0)} km`));
  lines.push(row("近地点高度", `${el.perigeeAltKm.toFixed(0)} km`));
  return lines.join("");
}

/** パネル DOM を表示。閉じるボタン付き。 */
export function showDetailPanel(html: string, onClose: () => void): void {
  let el = document.getElementById("ot-detail");
  if (!el) {
    el = document.createElement("div");
    el.id = "ot-detail";
    el.style.cssText =
      "position:fixed;top:12px;right:12px;width:280px;z-index:9999;color:#eee;" +
      "background:rgba(10,18,32,.92);border:1px solid #2d4a72;border-radius:10px;padding:14px;" +
      "font-size:13px;line-height:1.7;font-family:system-ui,sans-serif";
    document.body.appendChild(el);
  }
  el.innerHTML =
    `<button id="ot-detail-close" style="float:right;background:none;border:none;color:#9fb4d8;cursor:pointer;font-size:16px">×</button>` +
    html;
  el.style.display = "block";
  document.getElementById("ot-detail-close")?.addEventListener("click", () => {
    el!.style.display = "none";
    onClose();
  });
}

export function hideDetailPanel(): void {
  const el = document.getElementById("ot-detail");
  if (el) el.style.display = "none";
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/detailPanel.test.ts`
Expected: PASS（2件）。

- [ ] **Step 5: `main.ts` にピックハンドラを追加**

`main()` 内、`onTick` 登録の後に追記:
```ts
  // --- クリックで詳細パネル ---
  const { buildSatrec, computeInstantState, computeOrbitalElements } = await import("./propagation/propagator");
  const { renderDetailHtml, showDetailPanel, hideDetailPanel } = await import("./ui/detailPanel");
  const recById = new Map(records.map((r) => [r.noradId, r]));
  const satrecById = new Map(records.map((r) => [r.noradId, buildSatrec(r.tle1, r.tle2)]));

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(movement.position);
    const id: number | undefined =
      typeof picked?.id === "number" ? picked.id :
      typeof picked?.primitive?.id === "number" ? picked.primitive.id : undefined;
    if (id == null) { hideDetailPanel(); return; }
    const rec = recById.get(id);
    const satrec = satrecById.get(id);
    if (!rec || !satrec) return;
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const st = computeInstantState(satrec, date);
    if (!st) return;
    const elements = computeOrbitalElements(satrec);
    showDetailPanel(renderDetailHtml(rec, satcat.get(id), elements, st), () => {});
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
```

- [ ] **Step 6: 目視確認**

Run: `npm run dev`
Expected: 任意の点をクリックすると右上に詳細パネル（名前・番号・種別・高度・速度・軌道要素）が出る。× で閉じる。

- [ ] **Step 7: コミット**

```bash
git add src/ui/detailPanel.ts tests/detailPanel.test.ts src/main.ts
git commit -m "feat: click a satellite to show detail panel"
```

---

## Task 13: 名前/番号で検索→カメラ追従（機能②）

**Files:**
- Create: `orbit-tracker/src/ui/search.ts`
- Test: `orbit-tracker/tests/search.test.ts`
- Modify: `orbit-tracker/src/main.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/search.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { filterRecords } from "../src/ui/search";
import type { SatelliteRecord } from "../src/types";

const recs: SatelliteRecord[] = [
  { noradId: 25544, name: "ISS (ZARYA)", intlDesignator: "98067A", tle1: "", tle2: "" },
  { noradId: 33591, name: "NOAA 19", intlDesignator: "09005A", tle1: "", tle2: "" },
  { noradId: 48274, name: "STARLINK-1234", intlDesignator: "21035A", tle1: "", tle2: "" },
];

describe("filterRecords", () => {
  it("matches by case-insensitive name substring", () => {
    expect(filterRecords(recs, "iss").map((r) => r.noradId)).toEqual([25544]);
    expect(filterRecords(recs, "starlink").map((r) => r.noradId)).toEqual([48274]);
  });
  it("matches by NORAD id", () => {
    expect(filterRecords(recs, "33591").map((r) => r.noradId)).toEqual([33591]);
  });
  it("returns empty for blank query and caps results", () => {
    expect(filterRecords(recs, "")).toEqual([]);
    expect(filterRecords(recs, "a", 2).length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/search.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/ui/search.ts`**

```ts
import type { SatelliteRecord } from "../types";

/** 名前部分一致(大小無視) または NORAD 番号一致で絞り込み。上限 limit 件。 */
export function filterRecords(records: SatelliteRecord[], query: string, limit = 20): SatelliteRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SatelliteRecord[] = [];
  for (const r of records) {
    if (r.name.toLowerCase().includes(q) || String(r.noradId).includes(q)) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** 検索ボックス＋候補リストを生成。選択時 onSelect(noradId)。 */
export function mountSearchBox(records: SatelliteRecord[], onSelect: (noradId: number) => void): void {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;top:12px;left:12px;z-index:9999;width:240px;font-family:system-ui,sans-serif";
  box.innerHTML =
    `<input id="ot-search" placeholder="衛星名 / NORAD番号で検索" autocomplete="off" ` +
    `style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #2d4a72;background:rgba(10,18,32,.92);color:#eee">` +
    `<div id="ot-search-list"></div>`;
  document.body.appendChild(box);

  const input = box.querySelector<HTMLInputElement>("#ot-search")!;
  const list = box.querySelector<HTMLDivElement>("#ot-search-list")!;
  input.addEventListener("input", () => {
    const matches = filterRecords(records, input.value);
    list.innerHTML = matches
      .map((r) => `<div class="ot-item" data-id="${r.noradId}" style="padding:6px 8px;cursor:pointer;color:#cfe0ff;background:rgba(10,18,32,.92);border-bottom:1px solid #1c2c44">${r.name} <span style="opacity:.6">(${r.noradId})</span></div>`)
      .join("");
    list.querySelectorAll<HTMLElement>(".ot-item").forEach((item) => {
      item.addEventListener("click", () => {
        onSelect(Number(item.dataset.id));
        list.innerHTML = "";
        input.value = item.textContent ?? "";
      });
    });
  });
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/search.test.ts`
Expected: PASS（3件）。

- [ ] **Step 5: `main.ts` に検索→カメラ追従を配線**

`main()` 内、ピックハンドラの後に追記:
```ts
  // --- 検索→カメラ追従 ---
  const { mountSearchBox } = await import("./ui/search");
  mountSearchBox(records, (noradId) => {
    const idx = records.findIndex((r) => r.noradId === noradId);
    if (idx < 0) return;
    const p = points.get(idx);
    if (!p.show) return; // 計算不能で非表示なら何もしない
    const pos = p.position as Cesium.Cartesian3;
    // 物体の少し外側へカメラを飛ばす
    const carto = Cesium.Cartographic.fromCartesian(pos);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 2_000_000),
      duration: 2,
    });
    // ハイライト
    p.pixelSize = 10;
    p.color = Cesium.Color.CYAN;
  });
```

- [ ] **Step 6: 目視確認**

Run: `npm run dev`
Expected: 左上の検索に「ISS」や「25544」と入力→候補表示→選択でカメラがその衛星へ移動し、点が水色に拡大。

- [ ] **Step 7: コミット**

```bash
git add src/ui/search.ts tests/search.test.ts src/main.ts
git commit -m "feat: search by name/NORAD id and fly camera to satellite"
```

---

## Task 14: 選択物体の軌道線（1 周ぶん）

**Files:**
- Create: `orbit-tracker/src/globe/orbitPath.ts`
- Test: `orbit-tracker/tests/orbitPath.test.ts`
- Modify: `orbit-tracker/src/main.ts`

- [ ] **Step 1: 失敗するテストを書く `tests/orbitPath.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSatrec, computeOrbitalElements } from "../src/propagation/propagator";
import { sampleOrbitEcef } from "../src/globe/orbitPath";

const L1 = "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998";
const L2 = "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299";

describe("sampleOrbitEcef", () => {
  it("returns one period of finite ECEF points", () => {
    const satrec = buildSatrec(L1, L2);
    const periodMin = computeOrbitalElements(satrec).periodMin;
    const pts = sampleOrbitEcef(satrec, new Date(Date.UTC(2026, 5, 7, 18, 0, 0)), periodMin, 90);
    expect(pts.length).toBe(90);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y, p.z) / 1000;
      expect(r).toBeGreaterThan(6378 + 300);
      expect(r).toBeLessThan(6378 + 500);
    }
  });
});
```

- [ ] **Step 2: テストが失敗するのを確認**

Run: `npx vitest run tests/orbitPath.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装 `src/globe/orbitPath.ts`**

```ts
import * as Cesium from "cesium";
import { computeEcefMeters } from "../propagation/propagator";
import type { EcefMeters } from "../types";
import type { SatRec } from "satellite.js";

/** start から1周期ぶんを steps 等分でサンプルした ECEF 点列（計算不能点は除外） */
export function sampleOrbitEcef(satrec: SatRec, start: Date, periodMin: number, steps: number): EcefMeters[] {
  const out: EcefMeters[] = [];
  const dtMs = (periodMin * 60_000) / steps;
  for (let i = 0; i < steps; i++) {
    const d = new Date(start.getTime() + i * dtMs);
    const p = computeEcefMeters(satrec, d);
    if (p) out.push(p);
  }
  return out;
}

/** 軌道線エンティティを描画。既存があれば削除して差し替え。 */
let orbitEntity: Cesium.Entity | undefined;
export function drawOrbit(viewer: Cesium.Viewer, pts: EcefMeters[]): void {
  if (orbitEntity) { viewer.entities.remove(orbitEntity); orbitEntity = undefined; }
  if (pts.length < 2) return;
  const positions = pts.map((p) => new Cesium.Cartesian3(p.x, p.y, p.z));
  orbitEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 2,
      material: Cesium.Color.CYAN.withAlpha(0.8),
      arcType: Cesium.ArcType.NONE,
    },
  });
}

export function clearOrbit(viewer: Cesium.Viewer): void {
  if (orbitEntity) { viewer.entities.remove(orbitEntity); orbitEntity = undefined; }
}
```

- [ ] **Step 4: テストが通るのを確認**

Run: `npx vitest run tests/orbitPath.test.ts`
Expected: PASS。

- [ ] **Step 5: `main.ts` のクリックハンドラに軌道描画を追加**

Task 12 Step 5 の `showDetailPanel(...)` 呼び出しの直後に追記（同じハンドラ内）:
```ts
    const { sampleOrbitEcef, drawOrbit } = await import("./globe/orbitPath");
    const pts = sampleOrbitEcef(satrec, date, elements.periodMin, 120);
    drawOrbit(viewer, pts);
```
また、`hideDetailPanel()` を呼ぶ分岐（`id == null` のとき）で軌道も消す:
```ts
    if (id == null) {
      hideDetailPanel();
      const { clearOrbit } = await import("./globe/orbitPath");
      clearOrbit(viewer);
      return;
    }
```

- [ ] **Step 6: 目視確認**

Run: `npm run dev`
Expected: 点をクリックすると詳細パネルに加えて、その衛星の 1 周ぶんの水色の軌道線が地球儀上に描かれる。何もない所をクリックで消える。

- [ ] **Step 7: コミット**

```bash
git add src/globe/orbitPath.ts tests/orbitPath.test.ts src/main.ts
git commit -m "feat: draw one-orbit path polyline for the selected satellite"
```

---

## Task 15: 仕上げ（全テスト・ビルド・スモーク）

**Files:**
- Create: `orbit-tracker/e2e/smoke.spec.ts`（任意）
- Modify: `orbit-tracker/package.json`（任意で playwright スクリプト）
- Create: `orbit-tracker/README.md`

- [ ] **Step 1: 全単体テスト**

Run: `npm test`
Expected: 全テスト PASS（tleParse / tleCache / celestrak / satcat / propagator / worker / satellites / detailPanel / search / orbitPath / smoke）。

- [ ] **Step 2: 本番ビルド**

Run: `npm run build`
Expected: 型エラーなし、`dist/` 生成。

- [ ] **Step 3: プレビューで最終目視**

Run: `npm run preview`
Expected: ①地球儀に数千点が動く ②点クリックで詳細＋軌道線 ③検索でカメラ追従 ④タイムラインのスクラブ/早送りで全点が時刻に追従。

- [ ] **Step 4:（任意）Playwright スモーク `e2e/smoke.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("globe renders and canvas is present", async ({ page }) => {
  await page.goto("http://localhost:4173"); // npm run preview のポート
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible();
  await expect(page.locator("#ot-loading")).toBeHidden({ timeout: 30_000 });
});
```
導入する場合: `npm i -D @playwright/test && npx playwright install chromium`、`package.json` に `"e2e": "playwright test"` を追加。`npm run preview` を別ターミナルで起動してから `npm run e2e`。

- [ ] **Step 5: `README.md` を作成**

````markdown
# orbit-tracker

3D 地球儀で稼働中の人工衛星をリアルタイム表示する Web アプリ。

## 開発
```bash
npm install
npm run dev      # 開発サーバ
npm test         # 単体テスト
npm run build    # 本番ビルド
```

## 仕組み
- 描画: CesiumJS（OSM 画像・ion トークン不要）
- 軌道計算: satellite.js (SGP4) を Web Worker で実行
- データ: Celestrak GP(active) + SATCAT（無認証・CORS 許可）

## 機能
- 物体クリックで詳細パネル（種別・運用者・打ち上げ日・高度・速度・軌道要素）
- 名前 / NORAD 番号で検索しカメラ追従
- 時間コントロール（再生・早送り・過去/未来スクラブ）
````

- [ ] **Step 6: コミット**

```bash
git add README.md e2e/smoke.spec.ts package.json
git commit -m "chore: full test pass, build, smoke test, and README"
```

---

## 自己レビュー結果（spec との突合）

- **spec §3 機能①詳細パネル** → Task 12（`renderDetailHtml` + ピック）。✅
- **spec §3 機能②検索追従** → Task 13（`filterRecords` + flyTo）。✅
- **spec §3 機能③時間コントロール** → Task 9（Cesium animation/timeline 有効化＋clock 設定）＋ Task 11（onTick→worker で全点が時刻追従）。✅
- **spec §4 モジュール分割** → Task 2〜14 のファイルが spec のファイル構成に対応（`config.ts` を追加、`viewer/satellites/orbitPath/detailPanel/search/loading` 揃い）。✅
- **spec §5 データの流れ** → Task 11（取得→worker→描画）＋ Task 12/14（クリック→要素→軌道）。✅
- **spec §6 データソース** → Task 5/6（TLE active + SATCAT、URL は検証済み実値）。✅
- **spec §7 詳細項目** → Task 12 の `renderDetailHtml` が全項目を出力。✅
- **spec §8 性能** → Task 10（単一 PointPrimitiveCollection）＋ Task 11（worker・約5Hz間引き・transferable）。✅
- **spec §9 エラー処理** → Task 5（stale フォールバック）／Task 6（SATCAT 失敗は空 Map）／Task 11（取得失敗 UI）／Task 7（不正 TLE スキップ）。WebGL 非対応は Cesium 既定のエラー表示に委譲（必要なら追補）。✅(一部委譲)
- **spec §10 テスト** → 各 Task に Vitest、Task 15 に build＋Playwright スモーク。✅
- **型整合**: `SatelliteRecord/SatcatMeta/OrbitalElements/InstantState/EcefMeters` は Task 2 で定義し以降一貫使用。worker のプロトコルは `protocol.ts` に集約。`computeEcefMeters/computeInstantState/computeOrbitalElements/buildSatrec` の名称は Task 7 定義と Task 8/12/14 の参照で一致。✅
- **既知の版差リスク**: satellite.js の `null` vs `false`（両対応ガード済み）、`SatRec` 型名（解決不可時はローカル型）。Task 7/8 に注記済み。

## 未確定（実装時に確定）
- `cesium` / `satellite.js` / 各 devDep の正確なバージョン（`npm install` 後に pin）
- satellite.js が v5 に解決された場合の最新化要否（Task 1 Step 9 で判断）
