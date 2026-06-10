import { describe, it, expect } from "vitest";
import { renderDetailHtml } from "../src/ui/detailPanel";
import type { SatelliteRecord, SatcatMeta, OrbitalElements, InstantState } from "../src/types";

const rec: SatelliteRecord = { noradId: 25544, name: "ISS (ZARYA)", intlDesignator: "98067A", tle1: "", tle2: "" };
const meta: SatcatMeta = { noradId: 25544, objectType: "PAY", owner: "ISS", launchDate: "1998-11-20" };
const el: OrbitalElements = { periodMin: 92.9, inclinationDeg: 51.6, eccentricity: 0.0007, apogeeAltKm: 421, perigeeAltKm: 412, semiMajorAxisKm: 6794 };
const st: InstantState = { latitudeDeg: 12.3, longitudeDeg: -45.6, altitudeKm: 417, speedKmS: 7.66 };

describe("renderDetailHtml", () => {
  it("includes name, norad id, owner, launch date, and key elements", () => {
    const html = renderDetailHtml(rec, meta, el, st);
    expect(html).toContain("ISS (ZARYA)");
    expect(html).toContain("25544");
    expect(html).toContain("1998-11-20");
    expect(html).toContain("51.6");
    expect(html).toContain("92.9");
    // 速度は一般の人に分かりやすい時速を主表示、km/s を併記
    expect(html).toContain("時速 27,576 km");
    expect(html).toContain("7.66 km/s");
    // 数値の下に体感比較の注釈を添える
    expect(html).toContain("新幹線の約");
    expect(html).toContain("1日で地球を約15.5周");
    expect(html).toContain("旅客機の巡航高度の約42倍");
  });

  it("omits SATCAT rows when meta is undefined", () => {
    const html = renderDetailHtml(rec, undefined, el, st);
    expect(html).not.toContain("打ち上げ");
  });
});
