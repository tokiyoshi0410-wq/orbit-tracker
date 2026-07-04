import { describe, expect, it } from "vitest";
import { sunEciKm, sunElevationDeg, isInEarthShadow } from "../src/astro/sun";

describe("sunEciKm", () => {
  it("春分の頃は赤緯がほぼ 0 (z 成分が小さい)", () => {
    const s = sunEciKm(new Date(Date.UTC(2026, 2, 20, 12)));
    const r = Math.hypot(s.x, s.y, s.z);
    expect(Math.abs(s.z) / r).toBeLessThan(0.02);
  });

  it("夏至の頃は赤緯 ≈ +23.4°", () => {
    const s = sunEciKm(new Date(Date.UTC(2026, 5, 21, 12)));
    const r = Math.hypot(s.x, s.y, s.z);
    expect(Math.asin(s.z / r) * (180 / Math.PI)).toBeGreaterThan(23);
    expect(Math.asin(s.z / r) * (180 / Math.PI)).toBeLessThan(23.8);
  });

  it("距離はほぼ 1 AU", () => {
    const s = sunEciKm(new Date(Date.UTC(2026, 0, 4)));
    const r = Math.hypot(s.x, s.y, s.z);
    expect(r).toBeGreaterThan(1.45e8);
    expect(r).toBeLessThan(1.53e8);
  });
});

describe("sunElevationDeg", () => {
  it("春分の正午 (UTC)・赤道・経度0 では太陽がほぼ天頂", () => {
    const el = sunElevationDeg(new Date(Date.UTC(2026, 2, 20, 12)), 0, 0);
    expect(el).toBeGreaterThan(80);
  });

  it("同時刻の裏側 (経度180) では地平線下", () => {
    const el = sunElevationDeg(new Date(Date.UTC(2026, 2, 20, 12)), 0, 180);
    expect(el).toBeLessThan(-80);
  });
});

describe("isInEarthShadow", () => {
  const sun = { x: 1.496e8, y: 0, z: 0 };
  it("反太陽側で軸に近ければ影の中", () => {
    expect(isInEarthShadow({ x: -7000, y: 0, z: 0 }, sun)).toBe(true);
  });
  it("太陽側なら影ではない", () => {
    expect(isInEarthShadow({ x: 7000, y: 0, z: 0 }, sun)).toBe(false);
  });
  it("反太陽側でも軸から地球半径より離れていれば日照", () => {
    expect(isInEarthShadow({ x: -7000, y: 7000, z: 0 }, sun)).toBe(false);
  });
  it("横 (proj=0) は日照扱い", () => {
    expect(isInEarthShadow({ x: 0, y: 7000, z: 0 }, sun)).toBe(false);
  });
});
