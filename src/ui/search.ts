import type { SatelliteRecord } from "../types";

/** 名前部分一致(大小無視) または NORAD 番号一致で絞り込み。上限 limit 件。 */
export function filterRecords(records: SatelliteRecord[], query: string, limit = 20): SatelliteRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SatelliteRecord[] = [];
  for (const r of records) {
    if (r.name.toLowerCase().includes(q) || String(r.noradId).includes(q)) {
      out.push(r);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** 検索ボックス＋候補リストを生成。選択時 onSelect(noradId)。 */
export function mountSearchBox(records: SatelliteRecord[], onSelect: (noradId: number) => void): void {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;top:12px;left:12px;z-index:9999;width:240px;font-family:system-ui,sans-serif";
  box.innerHTML =
    `<input id="ot-search" placeholder="衛星名 / NORAD番号で検索" autocomplete="off" ` +
    `style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #2d4a72;background:rgba(10,18,32,.92);color:#eee">` +
    `<div id="ot-search-list"></div>`;
  document.body.appendChild(box);

  const input = box.querySelector<HTMLInputElement>("#ot-search")!;
  const list = box.querySelector<HTMLDivElement>("#ot-search-list")!;
  input.addEventListener("input", () => {
    const matches = filterRecords(records, input.value);
    list.innerHTML = matches
      .map(
        (r) =>
          `<div class="ot-item" data-id="${r.noradId}" style="padding:6px 8px;cursor:pointer;color:#cfe0ff;background:rgba(10,18,32,.92);border-bottom:1px solid #1c2c44">${r.name} <span style="opacity:.6">(${r.noradId})</span></div>`,
      )
      .join("");
    list.querySelectorAll<HTMLElement>(".ot-item").forEach((item) => {
      item.addEventListener("click", () => {
        onSelect(Number(item.dataset.id));
        list.innerHTML = "";
        input.value = item.textContent ?? "";
      });
    });
  });
}
