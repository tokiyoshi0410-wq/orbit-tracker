import type { SatelliteRecord } from "../types";

/** 初見ユーザー向けのワンタップ導線。検索を使わなくても有名どころに飛べる。 */
export interface QuickSat {
  noradId: number;
  label: string;
}

export const QUICK_SATS: QuickSat[] = [
  { noradId: 25544, label: "🛰 ISS" },
  { noradId: 48274, label: "🇨🇳 天宮" },
  { noradId: 20580, label: "🔭 ハッブル" },
  { noradId: 41836, label: "🌀 ひまわり9号" },
];

/** カタログに実在するものだけ返す（TLE 構成が変わってもボタンが壊れない・純粋関数）。 */
export function pickQuickSats(records: SatelliteRecord[], candidates: QuickSat[] = QUICK_SATS): QuickSat[] {
  const ids = new Set(records.map((r) => r.noradId));
  return candidates.filter((s) => ids.has(s.noradId));
}

/** 検索ボックスの下にチップ型ボタンを並べる。クリックで onSelect(noradId)。 */
export function mountQuickAccess(records: SatelliteRecord[], onSelect: (noradId: number) => void): void {
  const sats = pickQuickSats(records);
  if (sats.length === 0) return;

  const box = document.createElement("div");
  box.id = "ot-quick";
  // 検索ボックス (top:12px, 高さ約38px) の直下。候補リストが上に被さるよう z-index は検索より下げる。
  box.style.cssText =
    "position:fixed;top:56px;left:12px;z-index:9998;display:flex;gap:6px;flex-wrap:wrap;" +
    "max-width:280px;font-family:system-ui,sans-serif";
  box.innerHTML = sats
    .map(
      (s) =>
        `<button type="button" class="ot-quick-chip" data-id="${s.noradId}" ` +
        `style="all:unset;cursor:pointer;padding:5px 10px;border-radius:999px;font-size:12px;color:#cfe0ff;` +
        `background:rgba(10,18,32,.92);border:1px solid #2d4a72">${s.label}</button>`,
    )
    .join("");
  document.body.appendChild(box);

  box.querySelectorAll<HTMLButtonElement>(".ot-quick-chip").forEach((chip) => {
    chip.addEventListener("click", () => onSelect(Number(chip.dataset.id)));
  });
}
