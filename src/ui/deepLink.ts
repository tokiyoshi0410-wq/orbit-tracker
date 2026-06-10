/** URL クエリ ?sat=<noradId> で特定の衛星を選択した状態で共有できるようにする。 */

/** location.search から sat パラメータを解釈。数値でない・カタログに無い場合は null（純粋関数・テスト可能）。 */
export function parseSatParam(search: string, exists: (noradId: number) => boolean): number | null {
  const raw = new URLSearchParams(search).get("sat");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return exists(id) ? id : null;
}

/** 選択中の衛星を URL に反映する（null で削除）。履歴は汚さず replaceState のみ。 */
export function writeSatParam(id: number | null): void {
  const url = new URL(window.location.href);
  if (id == null) url.searchParams.delete("sat");
  else url.searchParams.set("sat", String(id));
  window.history.replaceState(null, "", url);
}
