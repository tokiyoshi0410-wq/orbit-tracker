import { describe, it, expect } from "vitest";
import { parseSatParam, writeSatParam } from "../src/ui/deepLink";

const exists = (id: number) => id === 25544 || id === 20580;

describe("parseSatParam", () => {
  it("カタログに実在する NORAD 番号を返す", () => {
    expect(parseSatParam("?sat=25544", exists)).toBe(25544);
  });
  it("パラメータ無し・空は null", () => {
    expect(parseSatParam("", exists)).toBeNull();
    expect(parseSatParam("?sat=", exists)).toBeNull();
  });
  it("数値でない・実在しない番号は null", () => {
    expect(parseSatParam("?sat=abc", exists)).toBeNull();
    expect(parseSatParam("?sat=25544x", exists)).toBeNull();
    expect(parseSatParam("?sat=99999", exists)).toBeNull();
  });
  it("他のパラメータが混ざっていても sat だけ読む", () => {
    expect(parseSatParam("?foo=1&sat=20580", exists)).toBe(20580);
  });
});

describe("writeSatParam", () => {
  it("URL に sat を書き、null で削除する", () => {
    writeSatParam(25544);
    expect(window.location.search).toBe("?sat=25544");
    writeSatParam(null);
    expect(window.location.search).toBe("");
  });
});
