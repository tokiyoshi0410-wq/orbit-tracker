import { describe, expect, it } from "vitest";
import { buildSatrec } from "../src/propagation/propagator";
import { predictPasses, compassLabel } from "../src/passes/predict";
import { buildPassIcs, escapeIcsText, icsUtc } from "../src/passes/ics";

// ISS (fixtures/active-sample.tle と同一、epoch 2026-06-07 前後)
const L1 = "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998";
const L2 = "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299";
const START_MS = Date.UTC(2026, 5, 8, 0, 0, 0); // epoch 直後

const tokyo = { latDeg: 35.68, lonDeg: 139.76 };

describe("predictPasses", () => {
  const satrec = buildSatrec(L1, L2);
  const passes = predictPasses(satrec, tokyo, START_MS);

  it("東京から 48h 以内に ISS のパスが複数見つかる", () => {
    expect(passes.length).toBeGreaterThanOrEqual(2);
  });

  it("各パスは start < max < end で仰角しきい値を満たす", () => {
    for (const p of passes) {
      expect(p.startMs).toBeLessThan(p.endMs);
      expect(p.maxMs).toBeGreaterThanOrEqual(p.startMs);
      expect(p.maxMs).toBeLessThanOrEqual(p.endMs);
      expect(p.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(p.maxElevationDeg).toBeLessThanOrEqual(90);
    }
  });

  it("パスの長さは常識的な範囲 (10 秒〜15 分)", () => {
    for (const p of passes) {
      const durS = (p.endMs - p.startMs) / 1000;
      expect(durS).toBeGreaterThan(10);
      expect(durS).toBeLessThan(15 * 60);
    }
  });

  it("時刻順に並び、期間内に収まる", () => {
    for (let i = 1; i < passes.length; i++) {
      expect(passes[i].startMs).toBeGreaterThan(passes[i - 1].endMs);
    }
    expect(passes[0].startMs).toBeGreaterThanOrEqual(START_MS);
    expect(passes[passes.length - 1].endMs).toBeLessThanOrEqual(START_MS + 48 * 3600_000 + 60_000);
  });

  it("北緯 89° からは ISS (傾斜 51.6°) は見えない", () => {
    const polar = predictPasses(satrec, { latDeg: 89, lonDeg: 0 }, START_MS);
    expect(polar.length).toBe(0);
  });
});

describe("compassLabel", () => {
  it("8 方位に丸める", () => {
    expect(compassLabel(0, "en")).toBe("N");
    expect(compassLabel(44, "en")).toBe("NE");
    expect(compassLabel(180, "ja")).toBe("南");
    expect(compassLabel(359, "ja")).toBe("北");
  });
});

describe("ics", () => {
  it("エスケープ", () => {
    expect(escapeIcsText("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e");
  });
  it("UTC 形式", () => {
    expect(icsUtc(Date.UTC(2026, 5, 8, 1, 2, 3))).toBe("20260608T010203Z");
  });
  it("VCALENDAR 構造と CRLF", () => {
    const ics = buildPassIcs(
      [
        {
          startMs: Date.UTC(2026, 5, 8, 10, 0, 0),
          maxMs: Date.UTC(2026, 5, 8, 10, 3, 0),
          endMs: Date.UTC(2026, 5, 8, 10, 6, 0),
          maxElevationDeg: 45,
          startAzimuthDeg: 300,
          endAzimuthDeg: 120,
          visible: true,
        },
      ],
      { satName: "ISS (ZARYA)", noradId: 25544, nowMs: Date.UTC(2026, 5, 7), lang: "ja" },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260608T100000Z");
    expect(ics).toContain("UID:25544-");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});
