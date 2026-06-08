/** 表示カテゴリの定義。色とタブ表示名、active 群を名前で分類するための判定を持つ。 */
export interface Category {
  key: string;
  label: string;
  colorHex: string;
  /** active 群を名前で分類するための判定（debris は群由来なので持たない） */
  match?: (name: string) => boolean;
}

/** 名前分類は上から順に評価し、最初に一致したカテゴリに割り当てる。 */
export const CATEGORIES: Category[] = [
  {
    key: "station",
    label: "宇宙ステーション",
    colorHex: "#ff5da2",
    match: (n) => /ISS|ZARYA|CSS|TIANHE|TIANZHOU|PROGRESS|SOYUZ|CREW DRAGON|DRAGON|CYGNUS/i.test(n),
  },
  { key: "starlink", label: "Starlink", colorHex: "#7fe0ff", match: (n) => /STARLINK/i.test(n) },
  { key: "oneweb", label: "OneWeb", colorHex: "#9d7bff", match: (n) => /ONEWEB/i.test(n) },
  {
    key: "nav",
    label: "測位(GPS等)",
    colorHex: "#b6ff8f",
    match: (n) => /NAVSTAR|GPS|GALILEO|GLONASS|BEIDOU|QZS|NAVIC|IRNSS|GSAT/i.test(n),
  },
  {
    key: "weather",
    label: "気象",
    colorHex: "#ffd36b",
    match: (n) => /NOAA|GOES|METEOR|FENGYUN|FY-|HIMAWARI|METOP|DMSP|ELEKTRO|INSAT/i.test(n),
  },
  { key: "satellite", label: "その他衛星", colorHex: "#ffa94d" },
  { key: "debris", label: "デブリ", colorHex: "#ff6b6b" },
];

export const CATEGORY_BY_KEY: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
);

/** active 群の衛星名から最初に一致したカテゴリ key を返す（未一致は satellite）。 */
export function classifyByName(name: string): string {
  for (const c of CATEGORIES) {
    if (c.key === "debris" || c.key === "satellite") continue;
    if (c.match && c.match(name)) return c.key;
  }
  return "satellite";
}
