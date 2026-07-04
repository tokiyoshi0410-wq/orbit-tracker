/** 詳細パネル下部の「上空通過予報」セクション。
 *  位置が未許可ならボタンを出し、許可済みなら自動で 48h ぶんを予報する。 */
import type { SatRec } from "../propagation/propagator";
import { getLang, t } from "../i18n";
import { loadStoredObserver, requestObserver, type ObserverLocation } from "../observer";
import { predictPasses, compassLabel, type PassEvent } from "../passes/predict";
import { buildPassIcs, downloadIcs } from "../passes/ics";

export interface PassPanelCtx {
  satName: string;
  noradId: number;
  satrec: SatRec;
  nowMs: number;
}

function fmtTime(ms: number, lang: "ja" | "en"): string {
  return new Date(ms).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 120) return t("passes.duration", { sec });
  return t("passes.durationMin", { min: (sec / 60).toFixed(1) });
}

/** パス一覧の HTML (純粋・テスト可能) */
export function passListHtml(passes: PassEvent[], lang: "ja" | "en"): string {
  if (passes.length === 0) return `<div style="opacity:.7">${t("passes.none")}</div>`;
  return passes
    .slice(0, 5)
    .map((p) => {
      const badge = p.visible
        ? `<span style="color:#ffd36b">${t("passes.visible")}</span>`
        : `<span style="opacity:.55">${t("passes.notVisible")}</span>`;
      const dir = `${compassLabel(p.startAzimuthDeg, lang)}→${compassLabel(p.endAzimuthDeg, lang)}`;
      return (
        `<div style="margin:6px 0;padding:6px 8px;border:1px solid #223a5c;border-radius:8px">` +
        `<div style="display:flex;justify-content:space-between"><b>${fmtTime(p.startMs, lang)}</b><span>${fmtDuration(p.endMs - p.startMs)}</span></div>` +
        `<div style="display:flex;justify-content:space-between;font-size:12px">` +
        `<span>${t("passes.maxEl", { el: p.maxElevationDeg.toFixed(0) })} · ${dir}</span>${badge}</div></div>`
      );
    })
    .join("");
}

export function mountPassSection(container: HTMLElement, ctx: PassPanelCtx): void {
  const lang = getLang();
  const section = document.createElement("div");
  section.style.cssText = "margin-top:8px;border-top:1px solid #333;padding-top:8px";
  section.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${t("passes.title")}</div><div class="ot-pass-body"></div>`;
  container.appendChild(section);
  const body = section.querySelector<HTMLDivElement>(".ot-pass-body")!;

  const render = (observer: ObserverLocation) => {
    body.innerHTML = `<div style="opacity:.7">…</div>`;
    // 数十 ms の同期計算で UI が固まって見えないよう、描画後に計算する
    setTimeout(() => {
      const passes = predictPasses(ctx.satrec, observer, ctx.nowMs);
      body.innerHTML = passListHtml(passes, lang);
      if (passes.length > 0) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t("passes.ics");
        btn.style.cssText =
          "all:unset;cursor:pointer;display:block;margin-top:6px;padding:5px 10px;border-radius:8px;" +
          "font-size:12px;color:#cfe0ff;border:1px solid #2d4a72;text-align:center";
        btn.addEventListener("click", () =>
          downloadIcs(
            `${ctx.satName.replace(/[^\w-]+/g, "_")}-passes.ics`,
            buildPassIcs(passes, { satName: ctx.satName, noradId: ctx.noradId, nowMs: Date.now(), lang }),
          ),
        );
        body.appendChild(btn);
      }
    }, 30);
  };

  const stored = loadStoredObserver();
  if (stored) {
    render(stored);
    return;
  }
  const askBtn = document.createElement("button");
  askBtn.type = "button";
  askBtn.textContent = t("passes.needLocation");
  askBtn.style.cssText =
    "all:unset;cursor:pointer;display:block;padding:5px 10px;border-radius:8px;font-size:12px;" +
    "color:#cfe0ff;border:1px solid #2d4a72;text-align:center";
  askBtn.addEventListener("click", () => {
    body.innerHTML = `<div style="opacity:.7">${t("passes.locating")}</div>`;
    requestObserver()
      .then((loc) => render(loc))
      .catch(() => {
        body.innerHTML = `<div style="opacity:.7">${t("passes.locationDenied")}</div>`;
      });
  });
  body.appendChild(askBtn);
}
