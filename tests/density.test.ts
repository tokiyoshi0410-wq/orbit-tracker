import { describe, it, expect } from "vitest";
import { binByAltitude } from "../src/ui/density";

describe("binByAltitude", () => {
  it("counts altitudes into the correct bands", () => {
    const bands = binByAltitude([400, 550, 800, 20180, 35786, 50000, NaN]);
    const get = (label: string) => bands.find((b) => b.label.startsWith(label))!.count;
    expect(get("LEO低")).toBe(2);   // 400, 550
    expect(get("LEO高")).toBe(1);   // 800
    expect(get("MEO")).toBe(1);     // 20180
    expect(get("GEO")).toBe(1);     // 35786
    expect(get("高軌道")).toBe(1);  // 50000
  });
});
