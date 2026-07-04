/** 動的 OGP の文言組み立て (純粋関数・テスト可能)。
 *  ファイル名が _ で始まるので Pages Functions のルートにはならない。 */

export interface OgStrings {
  title: string;
  description: string;
  url: string;
}

/** HTML 属性値に安全に埋め込むための最小エスケープ */
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOgStrings(satName: string, noradId: string): OgStrings {
  return {
    title: `${satName} をリアルタイム3D追跡 — orbit-tracker`,
    description: `${satName} (NORAD ${noradId}) の現在位置・高度・速度・軌道を 3D 地球儀で追跡。上空通過予報つき。`,
    url: `https://orbit-tracker.pages.dev/?sat=${noradId}`,
  };
}

/** ?sat= の値として妥当か (NORAD 番号は数字のみ) */
export function isValidSatParam(sat: string | null): sat is string {
  return sat != null && /^\d{1,9}$/.test(sat);
}
