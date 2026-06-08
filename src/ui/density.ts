export interface DensityBand {
  label: string;
  min: number;
  max: number;
  count: number;
}

const BANDS: { label: string; min: number; max: number }[] = [
  { label: "LEO低 (<600km)", min: 0, max: 600 },
  { label: "LEO高 (600-2000)", min: 600, max: 2000 },
  { label: "MEO (2000-35000)", min: 2000, max: 35000 },
  { label: "GEO (~35786)", min: 35000, max: 40000 },
  { label: "高軌道 (>40000)", min: 40000, max: Infinity },
];

/** 平均高度(km)の配列を高度帯ごとに集計（純粋）。 */
export function binByAltitude(altitudesKm: number[]): DensityBand[] {
  const bands: DensityBand[] = BANDS.map((b) => ({ ...b, count: 0 }));
  for (const alt of altitudesKm) {
    if (!Number.isFinite(alt)) continue;
    for (const b of bands) {
      if (alt >= b.min && alt < b.max) { b.count++; break; }
    }
  }
  return bands;
}

/** 高度帯ごとの本数バー（簡易ヒートマップ）を左下に表示。 */
export function renderDensityPanel(bands: DensityBand[]): void {
  const max = Math.max(1, ...bands.map((b) => b.count));
  let el = document.getElementById("ot-density");
  if (!el) {
    el = document.createElement("div");
    el.id = "ot-density";
    el.style.cssText =
      "position:fixed;bottom:130px;left:12px;z-index:9999;width:240px;color:#dfe7f5;" +
      "background:rgba(10,18,32,.9);border:1px solid #2d4a72;border-radius:10px;padding:10px 12px;" +
      "font-size:11px;line-height:1.5;font-family:system-ui,sans-serif";
    document.body.appendChild(el);
  }
  const rows = bands
    .map((b) => {
      const pct = Math.round((b.count / max) * 100);
      return (
        `<div style="margin:3px 0">${b.label} <span style="float:right">${b.count}</span>` +
        `<div style="height:6px;background:#1c2c44;border-radius:3px;overflow:hidden">` +
        `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#3a6bb0,#ff6b6b)"></div></div></div>`
      );
    })
    .join("");
  el.innerHTML = `<div style="font-weight:600;margin-bottom:4px">軌道密度（高度帯別）</div>${rows}`;
}
