import { t } from "../i18n";
import { loadStoredObserver, requestObserver, type ObserverLocation } from "../observer";

/** 左上 (クイックアクセスの下) の「いま上空にある物体数」バッジ。
 *  位置未許可のうちはボタンとして表示し、クリックで許可を求める。 */
export function mountOverheadCounter(
  getCount: () => number | null,
  onLocation: (loc: ObserverLocation) => void,
): { refresh: () => void } {
  const box = document.createElement("div");
  box.id = "ot-overhead";
  // クイックアクセスは 4 チップが 2 行に折り返すため、その下に置く
  box.style.cssText =
    "position:fixed;top:132px;left:12px;z-index:9997;font-family:system-ui,sans-serif;" +
    "font-size:12px;color:#cfe0ff";
  document.body.appendChild(box);

  let hasLocation = loadStoredObserver() != null;

  const badgeHtml = (n: number | null) =>
    `<span style="display:inline-block;padding:5px 10px;border-radius:999px;background:rgba(10,18,32,.92);border:1px solid #2d4a72">` +
    `${t("overhead.label", { n: n == null ? "…" : n })}</span>`;

  const refresh = () => {
    if (!hasLocation) return;
    box.innerHTML = badgeHtml(getCount());
  };

  if (hasLocation) {
    refresh();
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t("overhead.enable");
    btn.style.cssText =
      "all:unset;cursor:pointer;padding:5px 10px;border-radius:999px;font-size:12px;color:#cfe0ff;" +
      "background:rgba(10,18,32,.92);border:1px solid #2d4a72";
    btn.addEventListener("click", () => {
      btn.textContent = t("passes.locating");
      requestObserver()
        .then((loc) => {
          hasLocation = true;
          onLocation(loc);
          refresh();
        })
        .catch(() => {
          btn.textContent = t("passes.locationDenied");
          setTimeout(() => (btn.textContent = t("overhead.enable")), 3000);
        });
    });
    box.appendChild(btn);
  }

  return { refresh };
}
