import type { SatelliteRecord } from "../types";

/** Celestrak の TLE テキスト（名前/L1/L2 の3行単位）を配列へ */
export function parseTle(text: string): SatelliteRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);

  const records: SatelliteRecord[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];
    if (!name || !tle1?.startsWith("1 ") || !tle2?.startsWith("2 ")) continue;
    const noradId = parseInt(tle1.substring(2, 7), 10);
    const intlDesignator = tle1.substring(9, 17).trim();
    records.push({ noradId, name: name.trim(), intlDesignator, tle1, tle2 });
  }
  return records;
}
