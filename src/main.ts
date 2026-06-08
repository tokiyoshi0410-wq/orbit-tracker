import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";
import { createViewer } from "./globe/viewer";
import { createSatellitePoints, updateSatellitePoints } from "./globe/satellites";
import { fetchCatalog } from "./data/catalog";
import { fetchSatcat } from "./data/satcat";
import { showLoading, hideLoading, showError } from "./ui/loading";
import { buildSatrec, computeInstantState, computeOrbitalElements, type SatRec } from "./propagation/propagator";
import { renderDetailHtml, showDetailPanel, hideDetailPanel } from "./ui/detailPanel";
import { mountSearchBox } from "./ui/search";
import { sampleOrbitEcef, drawOrbit, clearOrbit } from "./globe/orbitPath";
import { mountTabs } from "./ui/tabs";
import { binByAltitude, renderDensityPanel } from "./ui/density";
import { CATEGORIES } from "./categories";
import { REENTRY_PERIGEE_KM } from "./config";
import type { WorkerRequest, PositionsMessage } from "./propagation/protocol";
import type { SatelliteRecord } from "./types";

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

async function main() {
  const viewer = createViewer("cesiumContainer");

  showLoading("衛星データを取得中…");
  let records: SatelliteRecord[];
  try {
    records = await fetchCatalog();
  } catch {
    showError("データ取得に失敗しました（オフライン/レート制限）。再読み込みしてください。");
    return;
  }
  // SATCAT は補足情報なので、起動を待たせず背景で取得する
  let satcat: Map<number, import("./types").SatcatMeta> = new Map();
  void fetchSatcat().then((m) => { satcat = m; });
  showLoading(`${records.length} 個を準備中…`);

  // satrec と軌道要素を一度だけ計算（詳細・軌道線・再突入判定・密度に再利用）
  const satrecById = new Map<number, SatRec>();
  const reentry = new Set<number>();
  const meanAlts: number[] = [];
  const counts = new Map<string, number>();
  for (const r of records) {
    const satrec = buildSatrec(r.tle1, r.tle2);
    satrecById.set(r.noradId, satrec);
    const el = computeOrbitalElements(satrec);
    if (Number.isFinite(el.perigeeAltKm) && el.perigeeAltKm > 0 && el.perigeeAltKm < REENTRY_PERIGEE_KM) {
      reentry.add(r.noradId);
    }
    meanAlts.push((el.apogeeAltKm + el.perigeeAltKm) / 2);
    const cat = r.category ?? "satellite";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const points = createSatellitePoints(viewer, records, reentry);
  const indexById = new Map<number, number>(records.map((r, i) => [r.noradId, i]));
  const recById = new Map(records.map((r) => [r.noradId, r]));

  const enabled = new Set<string>(CATEGORIES.map((c) => c.key));
  let lastPositions: Float64Array | null = null;
  const reapply = () => {
    if (lastPositions) updateSatellitePoints(points, lastPositions, records, enabled);
  };

  mountTabs(counts, enabled, reapply);
  renderDensityPanel(binByAltitude(meanAlts));

  // ---- ロックオン追従 ----
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

  // ---- worker ----
  const worker = new Worker(new URL("./propagation/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<PositionsMessage>) => {
    if (e.data.type === "positions") {
      lastPositions = e.data.positions;
      updateSatellitePoints(points, lastPositions, records, enabled);
      updateTracked();
      hideLoading();
    }
  };
  worker.postMessage({
    type: "init",
    sats: records.map((r) => ({ noradId: r.noradId, tle1: r.tle1, tle2: r.tle2 })),
  } as WorkerRequest);

  let lastSentMs = 0;
  viewer.clock.onTick.addEventListener((clock) => {
    const ms = Cesium.JulianDate.toDate(clock.currentTime).getTime();
    if (Math.abs(ms - lastSentMs) < 200) return;
    lastSentMs = ms;
    worker.postMessage({ type: "tick", timeMs: ms } as WorkerRequest);
  });

  // ---- 選択（クリック/検索）共通処理 ----
  const select = (id: number) => {
    const rec = recById.get(id);
    const satrec = satrecById.get(id);
    if (!rec || !satrec) return;
    const date = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    const st = computeInstantState(satrec, date);
    const el = computeOrbitalElements(satrec);
    if (st) showDetailPanel(renderDetailHtml(rec, satcat.get(id), el, st), () => { clearOrbit(viewer); unlock(); });
    drawOrbit(viewer, sampleOrbitEcef(satrec, date, el.periodMin, 120));
    lockOn(id);
  };

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const id = pickedId(viewer.scene.pick(m.position));
    if (id == null) {
      hideDetailPanel();
      clearOrbit(viewer);
      unlock();
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
    tooltip.innerHTML = `<b>${rec.name}</b><br>高度 ${st.altitudeKm.toFixed(0)} km / 速度 ${st.speedKmS.toFixed(2)} km/s`;
    tooltip.style.left = `${m.endPosition.x + 14}px`;
    tooltip.style.top = `${m.endPosition.y + 14}px`;
    tooltip.style.display = "block";
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  mountSearchBox(records, select);
}

void main();
