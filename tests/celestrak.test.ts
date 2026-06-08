import { describe, it, expect, vi } from "vitest";
import { fetchActiveTle } from "../src/data/celestrak";
import { STORAGE_KEYS } from "../src/config";

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

const TLE = `ISS (ZARYA)
1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998
2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299`;

describe("fetchActiveTle", () => {
  it("fetches and caches when cache empty", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    const recs = await fetchActiveTle({ storage, now: () => 1000, fetchFn: fetchFn as any });
    expect(recs[0].noradId).toBe(25544);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(storage.getItem(STORAGE_KEYS.tle)).not.toBeNull();
  });

  it("uses fresh cache without fetching", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    await fetchActiveTle({ storage, now: () => 1000, fetchFn: fetchFn as any });
    fetchFn.mockClear();
    const recs = await fetchActiveTle({ storage, now: () => 2000, fetchFn: fetchFn as any });
    expect(recs[0].noradId).toBe(25544);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("falls back to stale cache on fetch error", async () => {
    const storage = memStorage();
    const ok = vi.fn().mockResolvedValue({ ok: true, text: async () => TLE });
    await fetchActiveTle({ storage, now: () => 1000, fetchFn: ok as any });
    const fail = vi.fn().mockRejectedValue(new Error("network"));
    const recs = await fetchActiveTle({
      storage, now: () => 9_999_999_999, fetchFn: fail as any,
    });
    expect(recs[0].noradId).toBe(25544);
  });
});
