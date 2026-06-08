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
