import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseSatcat, fetchSatcat } from "../src/data/satcat";

const sample = readFileSync("tests/fixtures/satcat-sample.json", "utf8");

describe("parseSatcat", () => {
  it("builds a map keyed by noradId", () => {
    const map = parseSatcat(JSON.parse(sample));
    expect(map.get(25544)).toMatchObject({
      noradId: 25544, objectType: "PAY", owner: "ISS", launchDate: "1998-11-20",
    });
    expect(map.get(33591)?.owner).toBe("US");
  });
});

describe("fetchSatcat", () => {
  it("returns empty map on error (non-blocking)", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("network"));
    const map = await fetchSatcat({ fetchFn: fail as any });
    expect(map.size).toBe(0);
  });
});
