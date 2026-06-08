/** 画面上部のローディング/エラー表示を最小実装で。 */
export function showLoading(message: string): HTMLElement {
  let el = document.getElementById("ot-loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "ot-loading";
    el.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
      "background:rgba(0,0,0,.7);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  return el;
}

export function hideLoading(): void {
  const el = document.getElementById("ot-loading");
  if (el) el.style.display = "none";
}

export function showError(message: string): void {
  const el = showLoading(message);
  el.style.background = "rgba(140,0,0,.85)";
}
