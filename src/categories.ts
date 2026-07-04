/** 表示カテゴリの定義。色とタブ表示名、active 群を名前で分類するための判定を持つ。 */
export interface Category {
  key: string;
  label: string;
  labelEn: string;
  colorHex: string;
  /** active 群を名前で分類するための判定（debris は群由来なので持たない） */
  match?: (name: string) => boolean;
}

/** 名前分類は上から順に評価し、最初に一致したカテゴリに割り当てる。 */
export const CATEGORIES: Category[] = [
  {
    key: "station",
    label: "宇宙ステーション",
    labelEn: "Space stations",
    colorHex: "#ff5da2",
    match: (n) => /ISS|ZARYA|CSS|TIANHE|TIANZHOU|PROGRESS|SOYUZ|CREW DRAGON|DRAGON|CYGNUS/i.test(n),
  },
  { key: "starlink", label: "Starlink", labelEn: "Starlink", colorHex: "#7fe0ff", match: (n) => /STARLINK/i.test(n) },
  { key: "oneweb", label: "OneWeb", labelEn: "OneWeb", colorHex: "#9d7bff", match: (n) => /ONEWEB/i.test(n) },
  {
    key: "nav",
    label: "測位(GPS等)",
    labelEn: "Navigation (GPS etc.)",
    colorHex: "#b6ff8f",
    match: (n) => /NAVSTAR|GPS|GALILEO|GLONASS|BEIDOU|QZS|NAVIC|IRNSS|GSAT/i.test(n),
  },
  {
    key: "weather",
    label: "気象",
    labelEn: "Weather",
    colorHex: "#ffd36b",
    match: (n) => /NOAA|GOES|METEOR|FENGYUN|FY-|HIMAWARI|METOP|DMSP|ELEKTRO|INSAT/i.test(n),
  },
  { key: "satellite", label: "その他衛星", labelEn: "Other satellites", colorHex: "#ffa94d" },
  { key: "rocketbody", label: "ロケット体", labelEn: "Rocket bodies", colorHex: "#b7c3d6" },
  { key: "debris", label: "デブリ", labelEn: "Debris", colorHex: "#ff6b6b" },
];

/** 全カタログの名前分類で最優先に判定するパターン。
 *  「FENGYUN 1C DEB」等が weather に化けないよう、DEB/R/B は他カテゴリより先に見る。 */
const DEBRIS_NAME = /\bDEB\b|DEBRIS|COOLANT|WESTFORD NEEDLES/i;
const ROCKET_BODY_NAME = /\bR\/B\b|\bAKM\b|\bPKM\b/i;

/** 現在言語でのカテゴリ表示名 */
export function categoryLabel(c: Category, lang: "ja" | "en"): string {
  return lang === "ja" ? c.label : c.labelEn;
}

export const CATEGORY_BY_KEY: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
);

/** 衛星名から最初に一致したカテゴリ key を返す（未一致は satellite）。
 *  デブリ/ロケット体の判定を最優先にする (親衛星名の一致より強い)。 */
export function classifyByName(name: string): string {
  if (DEBRIS_NAME.test(name)) return "debris";
  if (ROCKET_BODY_NAME.test(name)) return "rocketbody";
  for (const c of CATEGORIES) {
    if (c.key === "debris" || c.key === "satellite" || c.key === "rocketbody") continue;
    if (c.match && c.match(name)) return c.key;
  }
  return "satellite";
}
