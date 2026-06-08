import { describe, it, expect } from "vitest";
import { classifyByName, CATEGORIES } from "../src/categories";

describe("classifyByName", () => {
  it("classifies known names", () => {
    expect(classifyByName("ISS (ZARYA)")).toBe("station");
    expect(classifyByName("STARLINK-1234")).toBe("starlink");
    expect(classifyByName("ONEWEB-0345")).toBe("oneweb");
    expect(classifyByName("NAVSTAR 80 (USA 309)")).toBe("nav");
    expect(classifyByName("NOAA 19")).toBe("weather");
    expect(classifyByName("GOES 16")).toBe("weather");
  });

  it("falls back to satellite for unknown names", () => {
    expect(classifyByName("SOME RANDOM SAT")).toBe("satellite");
  });

  it("every category has a unique key and color", () => {
    const keys = new Set(CATEGORIES.map((c) => c.key));
    expect(keys.size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) expect(c.colorHex).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
