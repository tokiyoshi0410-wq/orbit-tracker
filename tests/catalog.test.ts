import { describe, it, expect, vi } from "vitest";
import { buildCatalog, fetchCatalog } from "../src/data/catalog";

const ACTIVE = `ISS (ZARYA)
1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998
2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299
STARLINK-1234
1 44820U 19074A   26158.50000000  .00001000  00000+0  10000-3 0  9991
2 44820  53.0000 100.0000 0001000  90.0000 270.0000 15.06000000123456`;

const DEBRIS = `FENGYUN 1C DEB
1 30000U 99025AAA 26158.50000000  .00002000  00000+0  20000-3 0  9992
2 30000  98.6000 200.0000 0050000 120.0000 240.0000 14.20000000123450`;

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

function okResponse(text: string) { return { ok: true, status: 200, text: async () => text } as any; }
function failResponse(status: number, text = "") { return { ok: false, status, text: async () => text } as any; }

describe("buildCatalog", () => {
  it("classifies active by name and debris by group, dedupes by noradId", () => {
    const recs = buildCatalog([
      { spec: { group: "active" }, text: ACTIVE },
      { spec: { group: "fengyun-1c-debris", category: "debris" }, text: DEBRIS },
      { spec: { group: "active" }, text: ACTIVE },
    ]);
    expect(recs).toHaveLength(3);
    const byId = new Map(recs.map((r) => [r.noradId, r]));
    expect(byId.get(25544)?.category).toBe("station");
    expect(byId.get(44820)?.category).toBe("starlink");
    expect(byId.get(30000)?.category).toBe("debris");
  });
});

describe("fetchCatalog", () => {
  it("tolerates a failing debris group and still returns active", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("GROUP=active")) return okResponse(ACTIVE);
      return failResponse(404);
    });
    const recs = await fetchCatalog({ storage, now: () => 1000, fetchFn: fetchFn as any, delayMs: 0 });
    expect(recs.length).toBe(2);
    expect(recs.some((r) => r.category === "starlink")).toBe(true);
  });

  it("does not cache when active not loaded", async () => {
    const storage = memStorage();
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("GROUP=active")) return failResponse(500);
      return okResponse(DEBRIS);
    });
    const recs = await fetchCatalog({ storage, now: () => 1000, fetchFn: fetchFn as any, delayMs: 0 });
    expect(recs.length).toBe(1);
    expect(storage.getItem("orbit-tracker.catalog.v2")).toBeNull();
  });
});
