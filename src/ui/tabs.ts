import { CATEGORIES } from "../categories";

const STORAGE_KEY = "orbit-tracker.tabs.collapsed.v1";

/** カテゴリのオン/オフ切替パネルを右下に表示。
 *  ヘッダクリックでパネルを開閉できる（状態は localStorage に保存）。 */
export function mountTabs(
  counts: Map<string, number>,
  enabled: Set<string>,
  onChange: () => void,
): void {
  const box = document.createElement("div");
  box.id = "ot-tabs";
  box.style.cssText =
    "position:fixed;bottom:130px;right:12px;z-index:9999;width:210px;color:#dfe7f5;" +
    "background:rgba(10,18,32,.9);border:1px solid #2d4a72;border-radius:10px;" +
    "font-size:12px;font-family:system-ui,sans-serif;overflow:hidden";

  const rows = CATEGORIES.map((c) => {
    const n = counts.get(c.key) ?? 0;
    const checked = enabled.has(c.key) ? "checked" : "";
    return (
      `<label style="display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer">` +
      `<input type="checkbox" data-key="${c.key}" ${checked}>` +
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.colorHex}"></span>` +
      `<span style="flex:1">${c.label}</span>` +
      `<span style="opacity:.6">${n}</span></label>`
    );
  }).join("");

  box.innerHTML =
    `<button id="ot-tabs-header" type="button" style="all:unset;display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;font-weight:600">` +
    `<span>カテゴリ</span><span id="ot-tabs-chevron" style="opacity:.7">▼</span></button>` +
    `<div id="ot-tabs-body" style="padding:0 12px 10px">${rows}</div>`;

  document.body.appendChild(box);

  const body = box.querySelector<HTMLDivElement>("#ot-tabs-body")!;
  const chevron = box.querySelector<HTMLSpanElement>("#ot-tabs-chevron")!;
  const header = box.querySelector<HTMLButtonElement>("#ot-tabs-header")!;

  const setCollapsed = (collapsed: boolean) => {
    body.style.display = collapsed ? "none" : "block";
    chevron.textContent = collapsed ? "▶" : "▼";
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* localStorage 失敗時はスキップ */
    }
  };

  // 初期状態: localStorage、無ければモバイル幅では折り畳み、PC では展開
  let initialCollapsed = false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") initialCollapsed = true;
    else if (saved === null) initialCollapsed = window.innerWidth <= 768;
  } catch {
    initialCollapsed = window.innerWidth <= 768;
  }
  setCollapsed(initialCollapsed);

  header.addEventListener("click", () => {
    const isCollapsed = body.style.display === "none";
    setCollapsed(!isCollapsed);
  });

  box.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.key!;
      if (cb.checked) enabled.add(key);
      else enabled.delete(key);
      onChange();
    });
  });
}
