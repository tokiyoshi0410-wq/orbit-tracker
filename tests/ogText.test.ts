import { describe, expect, it } from "vitest";
import { buildOgStrings, escapeHtmlAttr, isValidSatParam } from "../functions/_ogText";

describe("buildOgStrings", () => {
  it("衛星名と NORAD 番号を含む", () => {
    const og = buildOgStrings("ISS (ZARYA)", "25544");
    expect(og.title).toContain("ISS (ZARYA)");
    expect(og.description).toContain("NORAD 25544");
    expect(og.url).toBe("https://orbit-tracker.pages.dev/?sat=25544");
  });
});

describe("isValidSatParam", () => {
  it("数字のみ許可", () => {
    expect(isValidSatParam("25544")).toBe(true);
    expect(isValidSatParam("25544x")).toBe(false);
    expect(isValidSatParam("")).toBe(false);
    expect(isValidSatParam(null)).toBe(false);
    expect(isValidSatParam("1234567890")).toBe(false); // 10 桁は不可
  });
});

describe("escapeHtmlAttr", () => {
  it("引用符とタグをエスケープ", () => {
    expect(escapeHtmlAttr(`a"b<c>&d`)).toBe("a&quot;b&lt;c&gt;&amp;d");
  });
});
