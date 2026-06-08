import { CATEGORIES } from "../categories";

/** カテゴリのオン/オフ切替パネルを右下に表示。
 *  counts: カテゴリ別の物体数。enabled: 表示中カテゴリ集合（呼び出し側が保持）。
 *  チェック変更で enabled を更新し onChange() を呼ぶ。 */
export function mountTabs(
  counts: Map<string, number>,
  enabled: Set<string>,
  onChange: () => void,
): void {
  const box = document.createElement("div");
  box.id = "ot-tabs";
  box.style.cssText =
    "position:fixed;bottom:130px;right:12px;z-index:9999;width:210px;color:#dfe7f5;" +
    "background:rgba(10,18,32,.9);border:1px solid #2d4a72;border-radius:10px;padding:10px 12px;" +
    "font-size:12px;font-family:system-ui,sans-serif";

  const header = `<div style="font-weight:600;margin-bottom:6px">カテゴリ</div>`;
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

  box.innerHTML = header + rows;
  document.body.appendChild(box);

  box.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.key!;
      if (cb.checked) enabled.add(key);
      else enabled.delete(key);
      onChange();
    });
  });
}
