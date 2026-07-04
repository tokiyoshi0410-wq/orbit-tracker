/** 最小 i18n。フラット辞書 + {name} プレースホルダ置換のみ (フレームワーク不要)。
 *  言語切替は localStorage 保存後にリロードする前提なので、実行中の言語は不変。 */

export type Lang = "ja" | "en";

const STORAGE_KEY = "orbit-tracker.lang";

const DICT: Record<string, { ja: string; en: string }> = {
  "loading.fetching": { ja: "衛星データを取得中…", en: "Fetching satellite data…" },
  "loading.preparing": { ja: "{n} 個を準備中…", en: "Preparing {n} objects…" },
  "error.fetchFailed": {
    ja: "データ取得に失敗しました（オフライン/レート制限）。再読み込みしてください。",
    en: "Failed to fetch data (offline / rate limited). Please reload.",
  },
  "tooltip.line": { ja: "高度 {alt} km / 時速 {kmh} km", en: "Alt {alt} km / {kmh} km/h" },

  "detail.norad": { ja: "NORAD番号", en: "NORAD ID" },
  "detail.intl": { ja: "国際識別符号", en: "Int'l designator" },
  "detail.type": { ja: "種別", en: "Type" },
  "detail.owner": { ja: "運用者", en: "Owner" },
  "detail.launchDate": { ja: "打ち上げ日", en: "Launched" },
  "detail.lat": { ja: "緯度", en: "Latitude" },
  "detail.lon": { ja: "経度", en: "Longitude" },
  "detail.alt": { ja: "高度", en: "Altitude" },
  "detail.speed": { ja: "速度", en: "Speed" },
  "detail.speedVal": { ja: "時速 {kmh} km ({kms} km/s)", en: "{kmh} km/h ({kms} km/s)" },
  "detail.period": { ja: "軌道周期", en: "Orbital period" },
  "detail.periodVal": { ja: "{min} 分", en: "{min} min" },
  "detail.incl": { ja: "軌道傾斜角", en: "Inclination" },
  "detail.ecc": { ja: "離心率", en: "Eccentricity" },
  "detail.apogee": { ja: "遠地点高度", en: "Apogee" },
  "detail.perigee": { ja: "近地点高度", en: "Perigee" },

  "type.PAY": { ja: "ペイロード", en: "Payload" },
  "type.R/B": { ja: "ロケット体", en: "Rocket body" },
  "type.DEB": { ja: "デブリ", en: "Debris" },
  "type.UNK": { ja: "不明", en: "Unknown" },

  "tabs.header": { ja: "カテゴリ", en: "Categories" },
  "tabs.shadow": { ja: "地球の影を表示", en: "Show Earth shadow" },
  "tabs.fullCatalog": { ja: "全カタログ (約3万件)", en: "Full catalog (~30k objects)" },
  "tabs.fullCatalogLoading": { ja: "全カタログを読込中…", en: "Loading full catalog…" },

  "search.placeholder": { ja: "衛星名 / NORAD番号で検索", en: "Search by name / NORAD ID" },

  "passes.title": { ja: "上空通過予報", en: "Upcoming passes" },
  "passes.needLocation": { ja: "📍 現在地から予報を計算", en: "📍 Predict from my location" },
  "passes.locating": { ja: "現在地を取得中…", en: "Getting your location…" },
  "passes.locationDenied": {
    ja: "位置情報が使えません (ブラウザの許可が必要です)",
    en: "Location unavailable (browser permission required)",
  },
  "passes.none": {
    ja: "48時間以内に仰角10°を超える通過はありません",
    en: "No passes above 10° elevation in the next 48 h",
  },
  "passes.visible": { ja: "🌟 肉眼チャンス", en: "🌟 Naked-eye chance" },
  "passes.notVisible": { ja: "日照/食のため不可視", en: "Not visible (daylight / eclipse)" },
  "passes.maxEl": { ja: "最大仰角 {el}°", en: "Max elev. {el}°" },
  "passes.duration": { ja: "{sec}秒間", en: "{sec}s" },
  "passes.durationMin": { ja: "{min}分間", en: "{min} min" },
  "passes.ics": { ja: "📅 カレンダーに追加 (.ics)", en: "📅 Add to calendar (.ics)" },

  "overhead.label": { ja: "上空の物体: {n}", en: "Overhead now: {n}" },
  "overhead.enable": { ja: "📍 いま上空にある物体数を表示", en: "📍 Count objects overhead now" },

  "satview.enter": { ja: "🛰 この衛星から見る", en: "🛰 View from this satellite" },
  "satview.exit": { ja: "🌍 通常視点に戻る", en: "🌍 Back to normal view" },

  "launches.title": { ja: "🚀 打ち上げ予定", en: "🚀 Upcoming launches" },

  "lang.toggle": { ja: "EN", en: "日本語" },
};

let cached: Lang | null = null;

export function detectLang(navLang: string | undefined, stored: string | null): Lang {
  if (stored === "ja" || stored === "en") return stored;
  return (navLang ?? "ja").toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function getLang(): Lang {
  if (cached) return cached;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* localStorage 不可なら自動判定のみ */
  }
  cached = detectLang(typeof navigator !== "undefined" ? navigator.language : undefined, stored);
  return cached;
}

/** テスト用: 言語キャッシュを固定/解除する */
export function setLangForTest(lang: Lang | null): void {
  cached = lang;
}

/** 言語を保存してリロード (全 UI は起動時構築のため再描画はリロードで行う) */
export function switchLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 保存できなくても切替自体は次のリロードで反映されない、が致命ではない */
  }
  location.reload();
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = DICT[key];
  let s = entry ? entry[getLang()] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** 言語切替ボタンを左下 (Cesium アニメーションウィジェットの上) に置く */
export function mountLangToggle(): void {
  const btn = document.createElement("button");
  btn.id = "ot-lang";
  btn.type = "button";
  btn.textContent = t("lang.toggle");
  btn.style.cssText =
    "position:fixed;right:12px;bottom:96px;z-index:9999;cursor:pointer;padding:4px 10px;" +
    "border-radius:999px;font-size:11px;color:#cfe0ff;background:rgba(10,18,32,.92);" +
    "border:1px solid #2d4a72;font-family:system-ui,sans-serif";
  btn.addEventListener("click", () => switchLang(getLang() === "ja" ? "en" : "ja"));
  document.body.appendChild(btn);
}
