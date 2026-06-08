# orbit-tracker 設計書

- 日付: 2026-06-08
- ステータス: 設計確定（実装計画はこの後 writing-plans で作成）
- 仮プロジェクト名: `orbit-tracker`

## 1. 目的

宇宙空間にある人工衛星などを、宇宙から地球を見る視点の **3D 地球儀** 上でリアルタイムに俯瞰できる Web アプリを作る。稼働中の衛星を中心に、現在位置を眺めつつ、個別の物体を調べたり、時間を進めて軌道の動きを確認できる。

## 2. ブレインストーミングで確定した方針

| 項目 | 決定 |
| --- | --- |
| 中心用途 | 全体俯瞰ビュー（全衛星をリアルタイム表示） |
| 描き方 | 3D 地球儀ビュー（宇宙視点・回転/ズーム自由） |
| プラットフォーム | Web アプリ（ブラウザ、PC 主軸） |
| 対象範囲 | 有名どころ・稼働中衛星中心（数千。Celestrak の無認証データで完結） |
| v1 機能 | ①クリックで詳細パネル ②名前/番号で検索→追従 ③時間コントロール |
| v2 候補 | ④上空通過予報（位置情報＋別計算が必要なため後回し） |
| 技術 | CesiumJS + satellite.js（SGP4）、Vite + TypeScript |

## 3. スコープ

### やること（v1）
- 3D 地球儀に稼働中衛星（数千）を点群でリアルタイム描画
- 物体クリックで詳細パネル表示（機能①）
- 名前 / NORAD カタログ番号で検索し、カメラを寄せて追従・ハイライト（機能②）
- 時間コントロール：再生・一時停止・速度変更・過去/未来へのスクラブ（機能③）

### やらないこと（v1 では）
- 上空通過予報・可視パス通知（v2）
- ロケット体・デブリ全部（約 2.5 万個）の描画（将来拡張。範囲を「稼働中」に限定）
- Space-Track ログインを要する完全カタログ
- モバイルネイティブアプリ化（将来検討）
- ユーザーアカウント / 保存機能

## 4. アーキテクチャ

- ビルド: Vite + TypeScript、UI フレームワークなし（軽量・依存最小）
- 描画/操作: **CesiumJS**（3D 地球儀、時計＋タイムライン、クリック判定、カメラ追従、昼夜境界線）
- 軌道計算: **satellite.js**（SGP4）を **Web Worker** 上で実行し、描画ループを止めない
- データ: Celestrak 無認証 API（TLE）＋ SATCAT（補足メタデータ）

### モジュール分割（各々が単一責務）
```
orbit-tracker/
  index.html
  vite.config.ts
  package.json
  src/
    main.ts                    … 全体の配線・起動フロー
    types.ts                   … 共通型（SatelliteRecord, OrbitalElements 等）
    data/celestrak.ts          … TLE 取得 + localStorage キャッシュ(TTL)
    data/satcat.ts             … 国/打ち上げ日/種別の補足取得・NORAD番号で突合
    propagation/worker.ts      … SGP4 一括計算（別スレッド）
    propagation/propagator.ts  … satrec生成・座標変換・軌道要素算出
    globe/viewer.ts            … Cesium Viewer 初期化
    globe/satellites.ts        … PointPrimitiveCollection で全衛星を描画・位置更新
    globe/orbitPath.ts         … 選択中物体の軌道ライン（1周ぶん）
    ui/detailPanel.ts          … クリック詳細パネル（機能①）
    ui/search.ts               … 名前/番号検索→カメラ追従（機能②）
    ui/loading.ts              … 読み込み/エラー表示
  tests/                       … Vitest 単体・結合テスト
```

各モジュールの責務・入出力:
- `data/celestrak.ts`: 入力=なし／出力=`SatelliteRecord[]`（name, noradId, intlDesignator, tleLine1, tleLine2）。Celestrak から TLE 取得、localStorage に TTL 付きキャッシュ。
- `data/satcat.ts`: 入力=NORAD 番号集合／出力=`Map<noradId, SatcatMeta>`（国・打ち上げ日・物体種別）。
- `propagation/propagator.ts`: 入力=TLE 2 行／出力=satrec、および任意時刻の ECEF 位置・地理座標・軌道要素。座標変換は satellite.js（`propagate` → ECI → `gstime`/`eciToEcf` → ECEF、`eciToGeodetic` で緯度経度高度）。
- `propagation/worker.ts`: 入力=全 satrec ＋ 対象時刻／出力=全 ECEF 位置の TypedArray（postMessage）。固定周期で計算。
- `globe/satellites.ts`: Worker 出力を受けて `PointPrimitiveCollection` の位置を更新。更新間の補間で滑らかに。
- `globe/orbitPath.ts`: 選択物体について 1 軌道周期ぶんの位置をサンプルして Polyline 描画。
- `ui/detailPanel.ts` / `ui/search.ts`: DOM を直接操作する軽量 UI。

## 5. データの流れ

1. 起動 → `data/celestrak.ts` が TLE 取得（失敗時はキャッシュ使用）
2. `data/satcat.ts` が NORAD 番号で補足メタを突合
3. `globe/viewer.ts` が Cesium を初期化し、時計を現在時刻で開始
4. 全 TLE から satrec を生成し Worker へ送る
5. Worker が現在の時計時刻で全位置を計算 → メインが点群位置を更新（補間で滑らか）
6. **時間スクラブ/早送り**：時計が変わると新時刻を Worker へ → 再計算（過去・未来も同じ仕組み）
7. **クリック**：Cesium の pick で物体特定 → 軌道要素を算出してパネル表示 ＋ 1 周ぶんの軌道ライン描画
8. **検索**：メモリ上の一覧を name/NORAD で絞り込み → 選択でカメラが寄って追従・ハイライト

## 6. データソースの詳細

- **TLE**: Celestrak の GP データ（稼働中衛星グループ、TLE フォーマット）。3 行（名前＋2 行）単位で取得し、satellite.js `twoline2satrec` で satrec 化。無認証。
- **SATCAT**: Celestrak の衛星カタログ（国コード・打ち上げ日・物体種別など）を NORAD 番号で突合し、詳細パネルを充実させる。
- **エンドポイントとパラメータ（URL・クエリ）は実装時に Celestrak 公式ドキュメントで実物確認してから確定する**（記憶での断定をしない）。CORS が許可されない場合は軽量プロキシ経由にフォールバック。
- **キャッシュ**: TLE は更新頻度がおおよそ日次のため、localStorage に数時間 TTL で保存。オフライン/失敗時は期限切れキャッシュを注意表示つきで使用。

## 7. 詳細パネルの表示項目（機能①）

- 名前、NORAD カタログ番号、国際識別符号
- 物体種別 / 国 / 打ち上げ日（SATCAT 突合。無ければ非表示）
- 現在の緯度・経度・高度
- 速度、軌道周期、軌道傾斜角、離心率、遠地点高度・近地点高度（算出値）

## 8. 性能方針

- 対象は数千個。SGP4 計算は Worker で一括実行し、描画スレッドを塞がない。
- 衛星は単一の `PointPrimitiveCollection` で描画（個別 Entity より高速）。
- Worker は固定周期（例: 数 Hz）で位置を返し、メインは更新間を線形補間して滑らかに動かす。早送り時は周期を時計倍率に追従。
- SGP4 は元期から離れるほど誤差が増えるため、時間スクラブの範囲は常識的な幅（数日程度）に制限。

## 9. エラー処理

- ネットワーク失敗 → キャッシュ TLE で継続＋再試行ボタン（無ければエラー表示）
- 一部の不正 TLE / 計算エラー → その物体だけスキップし、件数をログ
- Celestrak の CORS 拒否 → プロキシ経由にフォールバック
- WebGL 非対応ブラウザ → 案内メッセージ

## 10. テスト

- **単体（Vitest）**: TLE パース、既知衛星の位置計算の正しさ（基準値と照合）、キャッシュ TTL ロジック、検索フィルタ、軌道要素の算出。
- **結合**: Celestrak をモックし、取得 → 物体一覧 → 位置計算の一連を検証。
- **動作確認**: 起動して地球儀描画／クリックでパネル／検索でカメラ移動／時間スクラブで衛星が動く（Playwright で簡易スモークも可）。

## 11. 将来拡張（v2 以降）

- ④上空通過予報・可視パス通知（位置情報を使用）
- カテゴリ切替（ロケット体・デブリ・Starlink・GPS 等のオン/オフ）
- 対象を完全カタログ（約 2.5 万個）へ拡大（描画は deck.gl 等の GPU 構成を検討）
- モバイルアプリ化（Expo 等）

## 12. 未確定事項

- プロジェクト正式名称（現状は仮 `orbit-tracker`）
- 既定の地球画像（Cesium ion 無料枠トークン or OSM 等の無料画像）の最終選択
