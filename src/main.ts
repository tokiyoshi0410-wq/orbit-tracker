import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { createViewer } from "./globe/viewer";
import {
  createSatellitePoints,
  destroySatellitePoints,
  updateSatellitePoints,
  type SatPoints,
} from "./globe/satellites";
import { mountEarthShadow } from "./globe/earthShadow";
import { createSatView } from "./globe/satView";
import { fetchCatalog } from "./data/catalog";
import { fetchFullCatalog } from "./data/fullCatalog";
import { fetchSatcat } from "./data/satcat";
import { showLoading, hideLoading, showError } from "./ui/loading";
import { buildSatrec, computeInstantState, computeOrbitalElements, type SatRec } from "./propagation/propagator";
import { renderDetailHtml, showDetailPanel, hideDetailPanel, detailExtraSlot } from "./ui/detailPanel";
import { mountSearchBox } from "./ui/search";
import { sampleOrbitEcef, drawOrbit, clearOrbit } from "./globe/orbitPath";
import { mountTabs, type TabExtraToggle } from "./ui/tabs";
import { mountQuickAccess } from "./ui/quickAccess";
import { mountPassSection } from "./ui/passPanel";
import { mountOverheadCounter } from "./ui/overhead";
import { mountLaunchPanel } from "./ui/launchPanel";
import { parseSatParam, writeSatParam } from "./ui/deepLink";
import { CATEGORIES } from "./categories";
import { REENTRY_PERIGEE_KM, WEB_ANALYTICS_TOKEN } from "./config";
import { mountLangToggle, t } from "./i18n";
import { loadStoredObserver, countOverhead } from "./observer";
import { observerEcfMeters } from "./astro/sun";
import type { WorkerRequest, PositionsMessage } from "./propagation/protocol";
import type { SatelliteRecord } from "./types";

const SHADOW_KEY = "orbit-tracker.shadow.v1";
const FULLCAT_KEY = "orbit-tracker.fullcat.v1";

function pickedId(picked: unknown): number | null {
  const p = picked as { id?: unknown; primitive?: { id?: unknown } } | undefined;
  if (!p) return null;
  if (typeof p.id === "number") return p.id;
  if (p.primitive && typeof p.primitive.id === "number") return p.primitive.id;
  return null;
}

function makeTooltip(): HTMLElement {
  const t = document.createElement("div");
  t.id = "ot-tooltip";
  t.style.cssText =
    "position:fixed;z-index:10000;pointer-events:none;display:none;background:rgba(0,0,0,.8);" +
    "color:#fff;padding:5px 8px;border-radius:6px;font-size:12px;font-family:system-ui,sans-serif";
  document.body.appendChild(t);
  return t;
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* skip */
  }
}

/** Cloudflare Web Analytics (トークン設定時のみ) */
function mountAnalytics(): void {
  if (!WEB_ANALYTICS_TOKEN) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: WEB_ANALYTICS_TOKEN }));
  document.head.appendChild(s);
}

async function main() {
  const viewer = createViewer("cesiumContainer");
  const initialSearch = window.location.search; // buildScene が ?sat= を消す前に確保
  mountLangToggle();
  mountAnalytics();

  showLoading(t("loading.fetching"));
  let baseRecords: SatelliteRecord[];
  try {
    baseRecords = await fetchCatalog();
  } catch {
    showError(t("error.fetchFailed"));
    return;
  }
  // SATCAT は補足情報なので、起動を待たせず背景で取得する。
  // 取得完了時、選択中のパネルがあれば再描画して種別・運用者を補完する。
  let satcat: Map<number, import("./types").SatcatMeta> = new Map();
  void fetchSatcat().then((m) => {
    satcat = m;
    if (selectedId != null) select(selectedId);
  });

  // ---- 表示設定 ----
  const enabled = new Set<string>(CATEGORIES.map((c) => c.key));
  let shadowEnabled = readFlag(SHADOW_KEY, true);
  let fullEnabled = readFlag(FULLCAT_KEY, false);

  // ---- シーン状態 (全カタログ切替で丸ごと作り直す) ----
  let records: SatelliteRecord[] = [];
  let satrecById = new Map<number, SatRec>();
  let recById = new Map<number, SatelliteRecord>();
  let indexById = new Map<number, number>();
  let points: SatPoints | null = null;
  let lastPositions: Float64Array | null = null;
  let lastShadows: Uint8Array | null = null;

  const reapply = () => {
    if (points && lastPositions) {
      updateSatellitePoints(points, lastPositions, records, enabled, lastShadows, shadowEnabled);
    }
  };

  // ---- 地球の影 ----
  const shadowCtl = mountEarthShadow(viewer, shadowEnabled);

  // ---- ロックオン追従 ----
  let selectedId: number | null = null;
  let trackedId: number | null = null;
  let trackedPos: Cesium.Cartesian3 | undefined;
  const trackEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty(() => trackedPos, false) as unknown as Cesium.PositionProperty,
    point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT },
  });
  const updateTracked = () => {
    if (trackedId == null || !lastPositions) return;
    const i = indexById.get(trackedId);
    if (i == null) return;
    const o = i * 3;
    if (Number.isNaN(lastPositions[o])) return;
    trackedPos = new Cesium.Cartesian3(lastPositions[o], lastPositions[o + 1], lastPositions[o + 2]);
  };
  const lockOn = (id: number) => {
    trackedId = id;
    updateTracked();
    viewer.trackedEntity = trackEntity;
  };
  const unlock = () => {
    trackedId = null;
    viewer.trackedEntity = undefined;
  };

  // ---- 衛星視点モード ----
  let satViewBtn: HTMLButtonElement | null = null;
  function refreshSatViewBtn(): void {
    if (satViewBtn) satViewBtn.textContent = satView.isActive() ? t("satview.exit") : t("satview.enter");
  }
  const satView = createSatView(viewer, () => {
    if (selectedId != null) lockOn(selectedId);
    refreshSatViewBtn();
  });

  // ---- 頭上カウンター ----
  let obsEcf = (() => {
    const o = loadStoredObserver();
    return o ? observerEcfMeters(o.latDeg, o.lonDeg) : null;
  })();
  const overhead = mountOverheadCounter(
    () => (obsEcf && lastPositions ? countOverhead(lastPositions, obsEcf) : null),
    (loc) => {
      obsEcf = observerEcfMeters(loc.latDeg, loc.lonDeg);
    },
  );
  let lastOverheadMs = 0;

  // ---- worker ----
  const worker = new Worker(new URL("./propagation/worker.ts", import.meta.url), { type: "module" });
  let deepLinkApplied = false;
  worker.onmessage = (e: MessageEvent<PositionsMessage>) => {
    if (e.data.type !== "positions") return;
    // データセット切替直後に届く旧データセットぶんの応答は捨てる
    if (e.data.positions.length !== records.length * 3) return;
    lastPositions = e.data.positions;
    lastShadows = e.data.shadows;
    reapply();
    updateTracked();
    hideLoading();
    const nowMs = Date.now();
    if (nowMs - lastOverheadMs > 1000) {
      lastOverheadMs = nowMs;
      overhead.refresh();
    }
    // クイックアクセスと ?sat= 共有リンクの適用は初回の位置計算後に行う
    // (それより前に select すると追従カメラの位置が決まらないため)。
    if (!deepLinkApplied) {
      deepLinkApplied = true;
      mountQuickAccess(records, select);
      const linked = parseSatParam(initialSearch, (id) => recById.has(id));
      if (linked != null) select(linked);
    }
  };

  let lastSentMs = 0;
  viewer.clock.onTick.addEventListener((clock) => {
    const ms = Cesium.JulianDate.toDate(clock.currentTime).getTime();
    if (Math.abs(ms - lastSentMs) < 200) return;
    lastSentMs = ms;
    worker.postMessage({ type: "tick", timeMs: ms } as WorkerRequest);
  });

  // ---- タブの追加トグル (影 / 全カタログ) ----
  function tabExtras(): TabExtraToggle[] {
    return [
      {
        id: "shadow",
        label: t("tabs.shadow"),
        initial: shadowEnabled,
        onChange: (on) => {
          shadowEnabled = on;
          writeFlag(SHADOW_KEY, on);
          shadowCtl.setVisible(on);
          reapply();
        },
      },
      {
        id: "fullcat",
        label: t("tabs.fullCatalog"),
        initial: fullEnabled,
        onChange: (on) => void switchFullCatalog(on),
      },
    ];
  }

  // ---- シーン構築 (初回と全カタログ切替) ----
  function buildScene(newRecords: SatelliteRecord[]): void {
    selectedId = null;
    if (satView.isActive()) satView.exit();
    hideDetailPanel();
    clearOrbit(viewer);
    unlock();
    writeSatParam(null);
    if (points) destroySatellitePoints(viewer, points);
    lastPositions = null;
    lastShadows = null;

    records = newRecords;
    satrecById = new Map<number, SatRec>();
    const reentry = new Set<number>();
    const counts = new Map<string, number>();
    for (const r of records) {
      const satrec = buildSatrec(r.tle1, r.tle2);
      satrecById.set(r.noradId, satrec);
      const el = computeOrbitalElements(satrec);
      if (Number.isFinite(el.perigeeAltKm) && el.perigeeAltKm > 0 && el.perigeeAltKm < REENTRY_PERIGEE_KM) {
        reentry.add(r.noradId);
      }
      const cat = r.category ?? "satellite";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    points = createSatellitePoints(viewer, records, reentry);
    indexById = new Map<number, number>(records.map((r, i) => [r.noradId, i]));
    recById = new Map(records.map((r) => [r.noradId, r]));
    mountTabs(counts, enabled, reapply, tabExtras());
    // 初回マウント済みなら、クイックアクセスも新データセットで作り直す
    if (deepLinkApplied) mountQuickAccess(records, select);
    worker.postMessage({
      type: "init",
      sats: records.map((r) => ({ noradId: r.noradId, tle1: r.tle1, tle2: r.tle2 })),
    } as WorkerRequest);
    showLoading(t("loading.preparing", { n: records.length }));
  }

  async function switchFullCatalog(on: boolean): Promise<void> {
    if (!on) {
      fullEnabled = false;
      writeFlag(FULLCAT_KEY, false);
      buildScene(baseRecords);
      return;
    }
    showLoading(t("tabs.fullCatalogLoading"));
    try {
      const full = await fetchFullCatalog();
      fullEnabled = true;
      writeFlag(FULLCAT_KEY, true);
      buildScene(full);
    } catch {
      fullEnabled = false;
      writeFlag(FULLCAT_KEY, false);
      showError(t("error.fetchFailed"));
      setTimeout(hideLoading, 3000);
      const cb = document.querySelector<HTMLInputElement>('input[data-extra="fullcat"]');
      if (cb) cb.checked = false;
    }
  }

  // ---- 選択（クリック/検索）共通処理 ----
  function select(id: number): void {
    const rec = recById.get(id);
    const satrec = satrecById.get(id);
    if (!rec || !satrec) return;
    selectedId = id;
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const st = computeInstantState(satrec, date);
    const el = computeOrbitalElements(satrec);
    if (st) {
      showDetailPanel(renderDetailHtml(rec, satcat.get(id), el, st), () => {
        selectedId = null;
        satViewBtn = null;
        if (satView.isActive()) satView.exit();
        clearOrbit(viewer);
        unlock();
        writeSatParam(null);
      });
      const extra = detailExtraSlot();
      if (extra) {
        satViewBtn = document.createElement("button");
        satViewBtn.type = "button";
        satViewBtn.style.cssText =
          "all:unset;cursor:pointer;display:block;margin-top:8px;padding:5px 10px;border-radius:8px;" +
          "font-size:12px;color:#cfe0ff;border:1px solid #2d4a72;text-align:center";
        refreshSatViewBtn();
        satViewBtn.addEventListener("click", () => {
          if (satView.isActive()) satView.exit();
          else satView.enter(satrec);
          refreshSatViewBtn();
        });
        extra.appendChild(satViewBtn);
        mountPassSection(extra, { satName: rec.name, noradId: id, satrec, nowMs: date.getTime() });
      }
    }
    drawOrbit(viewer, sampleOrbitEcef(satrec, date, el.periodMin, 120));
    if (satView.isActive()) satView.enter(satrec);
    else lockOn(id);
    writeSatParam(id);
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const id = pickedId(viewer.scene.pick(m.position));
    if (id == null) {
      hideDetailPanel();
      clearOrbit(viewer);
      unlock();
      writeSatParam(null);
      selectedId = null;
      return;
    }
    select(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // ---- ホバー → ツールチップ ----
  const tooltip = makeTooltip();
  handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    const id = pickedId(viewer.scene.pick(m.endPosition));
    const rec = id != null ? recById.get(id) : undefined;
    const satrec = id != null ? satrecById.get(id) : undefined;
    if (!rec || !satrec) {
      tooltip.style.display = "none";
      return;
    }
    const st = computeInstantState(satrec, Cesium.JulianDate.toDate(viewer.clock.currentTime));
    if (!st) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.innerHTML = `<b>${rec.name}</b><br>${t("tooltip.line", {
      alt: st.altitudeKm.toFixed(0),
      kmh: Math.round(st.speedKmS * 3600).toLocaleString("ja-JP"),
    })}`;
    tooltip.style.left = `${m.endPosition.x + 14}px`;
    tooltip.style.top = `${m.endPosition.y + 14}px`;
    tooltip.style.display = "block";
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ---- 初期データセット (前回が全カタログなら復元を試みる) ----
  if (fullEnabled) {
    try {
      buildScene(await fetchFullCatalog());
    } catch {
      fullEnabled = false;
      writeFlag(FULLCAT_KEY, false);
      buildScene(baseRecords);
    }
  } else {
    buildScene(baseRecords);
  }

  mountSearchBox(() => records, select);
  void mountLaunchPanel(viewer);
}

void main();
