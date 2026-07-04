import type { Lang } from "../i18n";

/** 軌道の数値を「体感できる比較」に翻訳する (一般の人向けの付加情報・すべて純粋関数)。 */

// 新幹線の営業最高速度 (N700S, km/h)
const SHINKANSEN_KMH = 285;
// 旅客機の巡航高度 (km)
const AIRLINER_ALT_KM = 10;
// 東京→大阪の直線距離 (km)
const TOKYO_OSAKA_KM = 400;

/** 速度 (km/s) → 「新幹線の約97倍・東京→大阪を約52秒」 */
export function speedFeel(speedKmS: number, lang: Lang = "ja"): string {
  const kmh = speedKmS * 3600;
  const shinkansen = Math.round(kmh / SHINKANSEN_KMH);
  const sec = (TOKYO_OSAKA_KM / kmh) * 3600;
  if (lang === "en") {
    const tokyoOsaka = sec < 90 ? `~${Math.round(sec)} s` : `~${(sec / 60).toFixed(1)} min`;
    return `~${shinkansen}× a bullet train · Tokyo→Osaka in ${tokyoOsaka}`;
  }
  const tokyoOsaka = sec < 90 ? `約${Math.round(sec)}秒` : `約${(sec / 60).toFixed(1)}分`;
  return `新幹線の約${shinkansen}倍・東京→大阪を${tokyoOsaka}`;
}

/** 軌道周期 (分) → 「1日で地球を約15.5周」。周期がほぼ 1 日なら静止軌道の文言。 */
export function periodFeel(periodMin: number, lang: Lang = "ja"): string {
  const perDay = 1440 / periodMin;
  if (Math.abs(perDay - 1) < 0.05) {
    return lang === "en" ? "Matches Earth's rotation (geostationary)" : "地球の自転と同じ速さ (静止軌道)";
  }
  return lang === "en" ? `Circles Earth ~${perDay.toFixed(1)}×/day` : `1日で地球を約${perDay.toFixed(1)}周`;
}

/** 高度 (km) → 「旅客機の巡航高度の約42倍」 */
export function altitudeFeel(altKm: number, lang: Lang = "ja"): string {
  const ratio = Math.round(altKm / AIRLINER_ALT_KM);
  if (lang === "en") return `~${ratio.toLocaleString("en-US")}× airliner cruising altitude`;
  return `旅客機の巡航高度の約${ratio.toLocaleString("ja-JP")}倍`;
}
