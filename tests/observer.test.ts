import { describe, expect, it } from "vitest";
import { countOverhead, loadStoredObserver, saveObserver } from "../src/observer";
import { detectLang } from "../src/i18n";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe("countOverhead", () => {
  // 観測者を赤道・経度0 (ECEF ≈ +X) に置く
  const obs = { x: 6378137, y: 0, z: 0 };

  it("観測者の真上にある物体を数える", () => {
    const positions = new Float64Array([
      7000e3, 0, 0,        // 真上 (X 方向でさらに外) → 上
      -7000e3, 0, 0,       // 地球の裏側 → 下
      0, 7000e3, 0,        // 横 (dot ≈ -obs·up < 0) → 下
      6500e3, 1000e3, 0,   // 斜め上 → 上
    ]);
    expect(countOverhead(positions, obs)).toBe(2);
  });

  it("NaN (計算不能) はスキップ", () => {
    const positions = new Float64Array([NaN, NaN, NaN, 7000e3, 0, 0]);
    expect(countOverhead(positions, obs)).toBe(1);
  });

  it("visible フィルタで除外できる", () => {
    const positions = new Float64Array([7000e3, 0, 0, 8000e3, 0, 0]);
    expect(countOverhead(positions, obs, (i) => i === 0)).toBe(1);
  });
});

describe("observer storage", () => {
  it("保存して読み戻せる", () => {
    const s = memStorage();
    saveObserver({ latDeg: 35.68, lonDeg: 139.76 }, s);
    expect(loadStoredObserver(s)).toEqual({ latDeg: 35.68, lonDeg: 139.76 });
  });
  it("壊れた JSON は null", () => {
    const s = memStorage();
    s.setItem("orbit-tracker.observer.v1", "{broken");
    expect(loadStoredObserver(s)).toBeNull();
  });
});

describe("detectLang", () => {
  it("保存値が最優先", () => {
    expect(detectLang("ja-JP", "en")).toBe("en");
  });
  it("ブラウザ言語 ja → ja", () => {
    expect(detectLang("ja", null)).toBe("ja");
  });
  it("ブラウザ言語 en-US → en", () => {
    expect(detectLang("en-US", null)).toBe("en");
  });
  it("不明なら ja", () => {
    expect(detectLang(undefined, null)).toBe("ja");
  });
});
