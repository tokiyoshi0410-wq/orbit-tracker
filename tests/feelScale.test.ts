import { describe, it, expect } from "vitest";
import { speedFeel, periodFeel, altitudeFeel } from "../src/ui/feelScale";

describe("speedFeel", () => {
  it("ISS の速度を新幹線比と東京→大阪の所要時間に翻訳する", () => {
    // 7.66 km/s = 27,576 km/h → 新幹線(285km/h)の約97倍、東京→大阪(400km)を約52秒
    const s = speedFeel(7.66);
    expect(s).toContain("新幹線の約97倍");
    expect(s).toContain("東京→大阪を約52秒");
  });
  it("静止衛星級の速度では所要時間が分単位になる", () => {
    // 3.07 km/s = 11,052 km/h → 400km は約 2.2 分
    const s = speedFeel(3.07);
    expect(s).toContain("新幹線の約39倍");
    expect(s).toContain("分");
  });
});

describe("periodFeel", () => {
  it("低軌道の周期を 1 日あたりの周回数に翻訳する", () => {
    expect(periodFeel(92.9)).toBe("1日で地球を約15.5周");
  });
  it("静止軌道 (周期≈1日) は専用の文言にする", () => {
    expect(periodFeel(1436)).toContain("静止軌道");
  });
});

describe("altitudeFeel", () => {
  it("高度を旅客機の巡航高度比に翻訳する", () => {
    expect(altitudeFeel(417)).toBe("旅客機の巡航高度の約42倍");
  });
  it("静止軌道の高度は桁区切りで読みやすくする", () => {
    expect(altitudeFeel(35786)).toBe("旅客機の巡航高度の約3,579倍");
  });
});
