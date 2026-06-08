import { describe, it, expect } from "vitest";
import { filterRecords } from "../src/ui/search";
import type { SatelliteRecord } from "../src/types";

const recs: SatelliteRecord[] = [
  { noradId: 25544, name: "ISS (ZARYA)", intlDesignator: "98067A", tle1: "", tle2: "" },
  { noradId: 33591, name: "NOAA 19", intlDesignator: "09005A", tle1: "", tle2: "" },
  { noradId: 48274, name: "STARLINK-1234", intlDesignator: "21035A", tle1: "", tle2: "" },
];

describe("filterRecords", () => {
  it("matches by case-insensitive name substring", () => {
    expect(filterRecords(recs, "iss").map((r) => r.noradId)).toEqual([25544]);
    expect(filterRecords(recs, "starlink").map((r) => r.noradId)).toEqual([48274]);
  });
  it("matches by NORAD id", () => {
    expect(filterRecords(recs, "33591").map((r) => r.noradId)).toEqual([33591]);
  });
  it("returns empty for blank query and caps results", () => {
    expect(filterRecords(recs, "")).toEqual([]);
    expect(filterRecords(recs, "a", 2).length).toBeLessThanOrEqual(2);
  });
});
