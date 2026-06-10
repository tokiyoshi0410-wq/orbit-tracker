import { describe, it, expect } from "vitest";
import { pickQuickSats, mountQuickAccess, QUICK_SATS } from "../src/ui/quickAccess";
import type { SatelliteRecord } from "../src/types";

const rec = (noradId: number, name: string): SatelliteRecord => ({
  noradId,
  name,
  intlDesignator: "",
  tle1: "",
  tle2: "",
});

describe("pickQuickSats", () => {
  it("カタログに実在する候補だけ返す", () => {
    const records = [rec(25544, "ISS (ZARYA)"), rec(99999, "OTHER")];
    expect(pickQuickSats(records, QUICK_SATS).map((s) => s.noradId)).toEqual([25544]);
  });
  it("1 件も無ければ空配列", () => {
    expect(pickQuickSats([rec(11111, "X")], QUICK_SATS)).toEqual([]);
  });
});

describe("mountQuickAccess", () => {
  it("チップを描画しクリックで onSelect が呼ばれる。候補ゼロなら何も描画しない", () => {
    document.body.innerHTML = "";
    const picked: number[] = [];
    mountQuickAccess([rec(25544, "ISS (ZARYA)")], (id) => picked.push(id));
    const chips = document.querySelectorAll<HTMLButtonElement>(".ot-quick-chip");
    expect(chips.length).toBe(1);
    chips[0].click();
    expect(picked).toEqual([25544]);

    document.body.innerHTML = "";
    mountQuickAccess([rec(11111, "X")], (id) => picked.push(id));
    expect(document.getElementById("ot-quick")).toBeNull();
  });
});
