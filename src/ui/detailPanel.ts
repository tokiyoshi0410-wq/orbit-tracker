import type { SatelliteRecord, SatcatMeta, OrbitalElements, InstantState } from "../types";
import { speedFeel, periodFeel, altitudeFeel } from "./feelScale";
import { getLang, t } from "../i18n";

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px"><span style="opacity:.7">${label}</span><span>${value}</span></div>`;
}

/** 数値行の直下に添える体感比較の注釈 */
function feel(text: string): string {
  return `<div style="opacity:.6;font-size:11px;text-align:right;margin:-3px 0 2px">${text}</div>`;
}

/** 詳細パネルの HTML を組み立てる（純粋関数・テスト可能） */
export function renderDetailHtml(
  rec: SatelliteRecord,
  meta: SatcatMeta | undefined,
  el: OrbitalElements,
  st: InstantState,
): string {
  const lang = getLang();
  const num = lang === "ja" ? "ja-JP" : "en-US";
  const lines: string[] = [];
  lines.push(`<h3 style="margin:0 0 8px">${rec.name}</h3>`);
  lines.push(row(t("detail.norad"), String(rec.noradId)));
  lines.push(row(t("detail.intl"), rec.intlDesignator || "—"));
  if (meta) {
    // 未知の OBJECT_TYPE (TBA 等) は辞書キーをそのまま出さず生値で表示する
    const typeKey = `type.${meta.objectType}`;
    const typeLabel = t(typeKey);
    lines.push(row(t("detail.type"), typeLabel === typeKey ? meta.objectType : typeLabel));
    if (meta.owner) lines.push(row(t("detail.owner"), meta.owner));
    if (meta.launchDate) lines.push(row(t("detail.launchDate"), meta.launchDate));
  }
  lines.push(`<hr style="border-color:#333;margin:8px 0">`);
  lines.push(row(t("detail.lat"), `${st.latitudeDeg.toFixed(2)}°`));
  lines.push(row(t("detail.lon"), `${st.longitudeDeg.toFixed(2)}°`));
  lines.push(row(t("detail.alt"), `${st.altitudeKm.toFixed(1)} km`));
  lines.push(feel(altitudeFeel(st.altitudeKm, lang)));
  // 秒速だと一般の人に速さが伝わらないため時速を主表示にする (ISS ≈ 時速 27,500 km)
  lines.push(
    row(
      t("detail.speed"),
      t("detail.speedVal", {
        kmh: Math.round(st.speedKmS * 3600).toLocaleString(num),
        kms: st.speedKmS.toFixed(2),
      }),
    ),
  );
  lines.push(feel(speedFeel(st.speedKmS, lang)));
  lines.push(`<hr style="border-color:#333;margin:8px 0">`);
  lines.push(row(t("detail.period"), t("detail.periodVal", { min: el.periodMin.toFixed(1) })));
  lines.push(feel(periodFeel(el.periodMin, lang)));
  lines.push(row(t("detail.incl"), `${el.inclinationDeg.toFixed(1)}°`));
  lines.push(row(t("detail.ecc"), el.eccentricity.toFixed(4)));
  lines.push(row(t("detail.apogee"), `${el.apogeeAltKm.toFixed(0)} km`));
  lines.push(row(t("detail.perigee"), `${el.perigeeAltKm.toFixed(0)} km`));
  return lines.join("");
}

/** パネル DOM を表示。閉じるボタン付き。
 *  本文の後ろに拡張スロット (#ot-detail-extra) を置き、
 *  衛星視点ボタンや通過予報などの動的セクションは呼び出し側がそこへ差し込む。 */
export function showDetailPanel(html: string, onClose: () => void): void {
  let el = document.getElementById("ot-detail");
  if (!el) {
    el = document.createElement("div");
    el.id = "ot-detail";
    el.style.cssText =
      "position:fixed;top:12px;right:12px;width:280px;z-index:10000;color:#eee;" +
      "background:rgba(10,18,32,.97);border:1px solid #2d4a72;border-radius:10px;padding:14px;" +
      "font-size:13px;line-height:1.7;font-family:system-ui,sans-serif;max-height:calc(100vh - 60px);overflow-y:auto";
    document.body.appendChild(el);
  }
  el.innerHTML =
    `<button id="ot-detail-close" style="float:right;background:none;border:none;color:#9fb4d8;cursor:pointer;font-size:16px">×</button>` +
    html +
    `<div id="ot-detail-extra"></div>`;
  el.style.display = "block";
  document.getElementById("ot-detail-close")?.addEventListener("click", () => {
    el!.style.display = "none";
    onClose();
  });
}

/** 拡張スロット (存在すれば) を返す */
export function detailExtraSlot(): HTMLElement | null {
  return document.getElementById("ot-detail-extra");
}

export function hideDetailPanel(): void {
  const el = document.getElementById("ot-detail");
  if (el) el.style.display = "none";
}
