import { describe, it, expect } from "vitest";
import { loadCachedTle, saveCachedTle } from "../src/data/tleCache";
import type { SatelliteRecord } from "../src/types";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const sample: SatelliteRecord[] = [
  { noradId: 1, name: "A", intlDesignator: "00001A", tle1: "1 ...", tle2: "2 ..." },
];

describe("tleCache", () => {
  it("returns null when nothing cached", () => {
    expect(loadCachedTle(memStorage(), 1000, 5000)).toBeNull();
  });

  it("returns records within TTL", () => {
    const s = memStorage();
    saveCachedTle(s, sample, 1000);
    expect(loadCachedTle(s, 2000, 5000)).toEqual(sample);
  });

  it("returns records when age < ttl, null when expired", () => {
    const s = memStorage();
    saveCachedTle(s, sample, 1000);
    expect(loadCachedTle(s, 3000, 5000)).toEqual(sample);
    expect(loadCachedTle(s, 9000, 5000)).toBeNull();
  });
});
