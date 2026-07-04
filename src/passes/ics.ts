/** 通過予報を iCalendar (.ics) 文字列にする (純粋関数)。
 *  プッシュ通知インフラなしでリマインドを実現する手段。 */
import type { PassEvent } from "./predict";

/** RFC 5545 の TEXT エスケープ */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC の YYYYMMDDTHHMMSSZ */
export function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface IcsPassOptions {
  satName: string;
  noradId: number;
  /** DTSTAMP に使う現在時刻 (純粋性のため引数で渡す) */
  nowMs: number;
  lang: "ja" | "en";
}

export function buildPassIcs(passes: PassEvent[], opts: IcsPassOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//orbit-tracker//passes//JA",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`${opts.satName} passes`)}`,
  ];
  for (const p of passes) {
    const summary =
      opts.lang === "ja"
        ? `${opts.satName} が上空を通過 (最大仰角 ${p.maxElevationDeg.toFixed(0)}°)`
        : `${opts.satName} pass (max elev ${p.maxElevationDeg.toFixed(0)}°)`;
    const desc =
      opts.lang === "ja"
        ? `${p.visible ? "肉眼で見えるチャンスがあります。" : "日照条件により肉眼では見えない見込みです。"}\nhttps://orbit-tracker.pages.dev/?sat=${opts.noradId}`
        : `${p.visible ? "Naked-eye visibility likely." : "Probably not visible to the naked eye."}\nhttps://orbit-tracker.pages.dev/?sat=${opts.noradId}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${opts.noradId}-${p.startMs}@orbit-tracker.pages.dev`,
      `DTSTAMP:${icsUtc(opts.nowMs)}`,
      `DTSTART:${icsUtc(p.startMs)}`,
      `DTEND:${icsUtc(p.endMs)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** ブラウザで .ics をダウンロードさせる */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
