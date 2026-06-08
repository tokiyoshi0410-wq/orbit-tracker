import { describe, it, expect } from "vitest";
import { buildSatrec, computeOrbitalElements } from "../src/propagation/propagator";
import { sampleOrbitEcef } from "../src/globe/orbitPath";

const L1 = "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998";
const L2 = "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299";

describe("sampleOrbitEcef", () => {
  it("returns one period of finite ECEF points in LEO range", () => {
    const satrec = buildSatrec(L1, L2);
    const periodMin = computeOrbitalElements(satrec).periodMin;
    const pts = sampleOrbitEcef(satrec, new Date(Date.UTC(2026, 5, 7, 18, 0, 0)), periodMin, 90);
    expect(pts.length).toBe(90);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y, p.z) / 1000;
      expect(r).toBeGreaterThan(6378 + 300);
      expect(r).toBeLessThan(6378 + 500);
    }
  });
});
