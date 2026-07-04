# orbit-tracker v2 機能群 設計 (2026-07-04)

前セッションで提案した全アイデアを導入する。対象は 11 機能。

## 方針

- 既存アーキテクチャ（静的配信・バックエンドなし・Web Worker で SGP4）を維持する
- 新機能もすべて純粋関数 + 薄い UI 層に分け、vitest でテスト可能にする
- 唯一の例外は動的 OGP で、Cloudflare Pages Functions（エッジ）を初導入する

## 1. i18n（日英 UI）

- `src/i18n.ts`: フラットな辞書 `{ key: { ja, en } }` と `t(key)`。言語は
  localStorage `orbit-tracker.lang` → なければ `navigator.language`（ja 以外は en）
- 切替ボタン（画面左下）。切替時は localStorage 保存後 `location.reload()`
  （全 UI が起動時に構築されるため再レンダリング機構を作らない — YAGNI）
- `Category` に `labelEn` を追加。feelScale の各関数は `lang` 引数を取る
- index.html の title/OGP は日本語のまま（サイトの一次言語）

## 2. 太陽・食 (`src/astro/sun.ts`)

- 低精度太陽位置（Astronomical Almanac 準拠、精度 ~0.01°）で太陽 ECI (km) を返す
- `sunElevationDeg(date, latDeg, lonDeg)`: 観測者から見た太陽仰角
- `isInEarthShadow(satEciKm, sunEciKm)`: 円筒影近似
  （反太陽側 かつ 軸からの垂直距離 < 地球半径）

## 3. 観測地 (`src/observer.ts`) + 頭上カウンター

- geolocation を Promise 化し、成功したら localStorage に保存（次回から即利用）
- 頭上カウンター: worker の positions（ECEF）と観測者 ECEF から
  `dot(sat - obs, up) > 0` で地平線上の物体数を数え、左上バッジに表示
- 位置未許可時はバッジがボタンになり、クリックで許可を要求

## 4. 上空通過予報 + 肉眼可視 + .ics

- `src/passes/predict.ts`（純粋）: 48h を 30 秒刻みで走査し仰角 > 10° の窓を検出、
  境界は二分法で ~1 秒へ詰める。各パスに開始/最大/終了時刻・最大仰角・方位を記録
- 可視判定: 最大仰角時刻に (a) 衛星が日照中（影でない）かつ
  (b) 観測者の太陽仰角 < -6°（市民薄明終了後）なら「肉眼チャンス」
- `src/passes/ics.ts`（純粋）: VCALENDAR 文字列生成。UI からは Blob ダウンロード
- UI: 詳細パネル下部に「上空通過予報」セクション。位置許可済みなら自動計算
  （1 衛星 48h ≈ 5,800 回 propagate ≈ 数十 ms なので同期でよい）

## 5. 地球の影 + 食で減光

- worker の tick 応答に `shadows: Uint8Array` を追加（太陽 ECI は worker 内で計算）
- 点の減光: 影フラグが変化した点のみ color を暗色に差し替え（全点毎回はしない）
- 影の円筒: 反太陽方向に伸びる半透明 Cylinder エンティティ（長さ 45,000 km ≈ GEO 超、
  向きは 10 秒ごとに更新）。タブパネルに表示トグル（既定 ON）

## 6. 衛星視点モード

- 詳細パネルに「🛰 この衛星から見る」ボタン。ON の間は毎フレーム、選択衛星を
  main スレッドで propagate（1 個なので軽い）してカメラを衛星位置に置き、地心方向を見る
- OFF・選択解除・パネル閉で通常追従へ復帰

## 7. 全カタログモード

- fetch-tle.mjs が `https://celestrak.org/pub/TLE/catalog.txt`（全カタログ ~27k、3LE）
  も取得し `catalog-full.tle` として書き出す（失敗したらスキップ = 従来通り）
- クライアント: タブパネルに「全カタログ」トグル。ON で lazy fetch → parseTle →
  名前分類（`DEB` を含む名前は debris へ）→ シーン再構築
- main.ts を「データセットを受け取ってシーンを構築する関数」に再構成し、
  トグルで points/worker/maps を作り直す。localStorage キャッシュは使わない（5MB 超のため）

## 8. 打ち上げ予定

- `scripts/fetch-launches.mjs`: Launch Library 2 `launch/upcoming` から
  必要フィールドのみ抽出して `public/data/launches.json` へ（cron ワークフローに追加。
  無料枠 15req/h に対し 4h ごと 1 req で余裕）
- UI: 左下「🚀 打ち上げ予定」折りたたみパネル。T- カウントダウン（1 秒更新）、
  クリックで発射場へカメラ移動 + マーカー

## 9. 動的 OGP（Pages Functions）

- fetch-tle.mjs が `public/data/satnames.json`（noradId → name）も生成
- `functions/_middleware.ts`: `?sat=` 付きの HTML リクエストのみ、ASSETS から
  index.html を取り satnames.json の名前で og:title/og:description/title を
  HTMLRewriter で書換。文字列組み立ては `functions/_ogText.ts` に分離してテスト
- 静的ビルドには影響なし（Functions が無い環境ではそのまま従来動作）

## 10. Web Analytics

- wrangler の資格情報で RUM API を試行。権限がなければ beacon スニペットを
  トークン設定可能な形（空なら無効）で組み込み、ダッシュボードでの発行手順を報告

## テスト方針

- 新規純粋関数（sun / predict / ics / i18n / ogText / observer 幾何）に単体テスト
- 既存 44 件 + 新規で全件 green を維持。`tsc && vite build` 成功を確認
- Playwright でローカル dev を開き主要 UI の動作を目視相当で確認してから push
