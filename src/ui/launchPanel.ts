import * as Cesium from "cesium";
import { t } from "../i18n";
import { fetchLaunches, formatCountdown, type LaunchEntry } from "../data/launches";

const STORAGE_KEY = "orbit-tracker.launches.collapsed.v1";

/** 左下の「🚀 打ち上げ予定」パネル。行クリックで発射場へカメラ移動。
 *  データが無ければ何も表示しない (打ち上げ予定は補足情報)。 */
export async function mountLaunchPanel(viewer: Cesium.Viewer): Promise<void> {
  const launches = await fetchLaunches();
  if (launches.length === 0) return;

  const box = document.createElement("div");
  box.id = "ot-launches";
  box.style.cssText =
    "position:fixed;left:12px;bottom:190px;z-index:9999;width:250px;color:#dfe7f5;" +
    "background:rgba(10,18,32,.9);border:1px solid #2d4a72;border-radius:10px;" +
    "font-size:12px;font-family:system-ui,sans-serif;overflow:hidden";

  const rows = launches
    .slice(0, 8)
    .map(
      (l, i) =>
        `<div class="ot-launch-row" data-i="${i}" style="padding:6px 8px;border-top:1px solid #1c2c44;cursor:pointer">` +
        `<div style="display:flex;justify-content:space-between;gap:6px">` +
        `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.name}</span>` +
        `<b class="ot-launch-cd" data-net="${l.netMs}" style="color:#ffd36b;white-space:nowrap">${formatCountdown(l.netMs, Date.now())}</b></div>` +
        `<div style="opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.site}</div></div>`,
    )
    .join("");

  box.innerHTML =
    `<button id="ot-launches-header" type="button" style="all:unset;display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;font-weight:600">` +
    `<span>${t("launches.title")}</span><span id="ot-launches-chevron" style="opacity:.7">▶</span></button>` +
    `<div id="ot-launches-body" style="display:none;max-height:40vh;overflow-y:auto">${rows}</div>`;
  document.body.appendChild(box);

  const body = box.querySelector<HTMLDivElement>("#ot-launches-body")!;
  const chevron = box.querySelector<HTMLSpanElement>("#ot-launches-chevron")!;
  const setCollapsed = (collapsed: boolean) => {
    body.style.display = collapsed ? "none" : "block";
    chevron.textContent = collapsed ? "▶" : "▼";
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* skip */
    }
  };
  let initialCollapsed = true;
  try {
    initialCollapsed = localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    /* skip */
  }
  setCollapsed(initialCollapsed);
  box.querySelector("#ot-launches-header")!.addEventListener("click", () => {
    setCollapsed(body.style.display !== "none");
  });

  // カウントダウンを 1 秒ごとに更新
  const cds = [...box.querySelectorAll<HTMLElement>(".ot-launch-cd")];
  setInterval(() => {
    const now = Date.now();
    for (const el of cds) el.textContent = formatCountdown(Number(el.dataset.net), now);
  }, 1000);

  // 行クリック → 発射場へ飛んでマーカーを置く
  let marker: Cesium.Entity | undefined;
  const flyTo = (l: LaunchEntry) => {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;
    if (marker) viewer.entities.remove(marker);
    marker = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(l.lon, l.lat),
      point: { pixelSize: 10, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: {
        text: `🚀 ${l.pad}`,
        font: "13px system-ui",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
      },
    });
    viewer.trackedEntity = undefined;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(l.lon, l.lat, 900_000) });
  };
  box.querySelectorAll<HTMLElement>(".ot-launch-row").forEach((row) => {
    row.addEventListener("click", () => flyTo(launches[Number(row.dataset.i)]));
  });
}
