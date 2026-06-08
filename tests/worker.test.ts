import { describe, it, expect } from "vitest";
import type { PositionsMessage, WorkerRequest } from "../src/propagation/protocol";

describe("propagation worker", () => {
  it("returns ECEF positions for given TLEs at a time", async () => {
    const worker = new Worker(new URL("../src/propagation/worker.ts", import.meta.url), { type: "module" });

    const result = await new Promise<PositionsMessage>((resolve) => {
      worker.onmessage = (e: MessageEvent<PositionsMessage>) => {
        if (e.data.type === "positions") resolve(e.data);
      };
      const init: WorkerRequest = {
        type: "init",
        sats: [{
          noradId: 25544,
          tle1: "1 25544U 98067A   26158.77231137  .00008050  00000+0  15059-3 0  9998",
          tle2: "2 25544  51.6339 346.6979 0006971 145.1134 215.0313 15.49658440570299",
        }],
      };
      worker.postMessage(init);
      const tick: WorkerRequest = { type: "tick", timeMs: Date.UTC(2026, 5, 7, 18, 32, 0) };
      worker.postMessage(tick);
    });

    expect(result.positions.length).toBe(3);
    const r = Math.hypot(result.positions[0], result.positions[1], result.positions[2]) / 1000;
    expect(r).toBeGreaterThan(6378 + 300);
    expect(r).toBeLessThan(6378 + 500);
    worker.terminate();
  });
});
