import { describe, it, expect } from "vitest";
import { buildSatrec, computeEcefMeters, computeInstantState, computeOrbitalElements } from "../src/propagation/propagator";

const L1 = "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998";
const L2 = "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299";

describe("propagator (ISS)", () => {
  const satrec = buildSatrec(L1, L2);

  it("derives orbital elements from TLE invariants", () => {
    const e = computeOrbitalElements(satrec);
    expect(e.inclinationDeg).toBeCloseTo(51.6339, 2);
    expect(e.eccentricity).toBeCloseTo(0.0006971, 5);
    expect(e.periodMin).toBeGreaterThan(90);
    expect(e.periodMin).toBeLessThan(95);
    expect(e.apogeeAltKm).toBeGreaterThan(380);
    expect(e.apogeeAltKm).toBeLessThan(450);
    expect(e.perigeeAltKm).toBeGreaterThan(380);
  });

  it("computes a plausible LEO position at epoch", () => {
    const at = new Date(Date.UTC(2026, 5, 7, 18, 32, 0));
    const ecef = computeEcefMeters(satrec, at);
    expect(ecef).not.toBeNull();
    const r = Math.hypot(ecef!.x, ecef!.y, ecef!.z) / 1000;
    expect(r).toBeGreaterThan(6378 + 300);
    expect(r).toBeLessThan(6378 + 500);

    const st = computeInstantState(satrec, at)!;
    expect(Math.abs(st.latitudeDeg)).toBeLessThanOrEqual(52);
    expect(st.speedKmS).toBeGreaterThan(7);
    expect(st.speedKmS).toBeLessThan(8);
  });

  it("returns null for an invalid satrec gracefully", () => {
    const bad = buildSatrec(
      "1 00000U 00000A   00000.00000000  .00000000  00000+0  00000+0 0  0000",
      "2 00000   0.0000   0.0000 0000000   0.0000   0.0000  0.00000000000000",
    );
    expect(computeEcefMeters(bad, new Date(Date.UTC(2026, 5, 7, 0, 0, 0)))).toBeNull();
  });
});
