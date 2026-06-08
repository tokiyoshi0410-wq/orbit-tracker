import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTle } from "../src/data/tleParse";

const fixture = readFileSync("tests/fixtures/active-sample.tle", "utf8");

describe("parseTle", () => {
  it("parses 3-line sets into records", () => {
    const records = parseTle(fixture);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      noradId: 25544,
      name: "ISS (ZARYA)",
      intlDesignator: "98067A",
    });
    expect(records[0].tle1.startsWith("1 25544U")).toBe(true);
    expect(records[0].tle2.startsWith("2 25544")).toBe(true);
    expect(records[1].noradId).toBe(33591);
  });

  it("ignores trailing blank lines / CRLF", () => {
    const records = parseTle(fixture.replace(/\n/g, "\r\n") + "\r\n\r\n");
    expect(records).toHaveLength(2);
  });
});
