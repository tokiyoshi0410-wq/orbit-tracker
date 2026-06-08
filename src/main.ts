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

  let lastSentMs = 0;
  viewer.clock.onTick.addEventListener((clock) => {
    const date = Cesium.JulianDate.toDate(clock.currentTime);
    const ms = date.getTime();
    if (Math.abs(ms - lastSentMs) < 200) return; // 約5Hz
    lastSentMs = ms;
    const tick: WorkerRequest = { type: "tick", timeMs: ms };
    worker.postMessage(tick);
  });

  (window as unknown as { __orbitTracker: unknown }).__orbitTracker = {
    viewer, points, records, satcat, worker,
  };
}

void main();
