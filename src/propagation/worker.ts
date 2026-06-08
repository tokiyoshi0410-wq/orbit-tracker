import { buildSatrec, computeEcefMeters, type SatRec } from "./propagator";
import type { WorkerRequest, PositionsMessage } from "./protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let satrecs: SatRec[] = [];

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    satrecs = msg.sats.map((s) => buildSatrec(s.tle1, s.tle2));
    return;
  }
  if (msg.type === "tick") {
    const date = new Date(msg.timeMs);
    const positions = new Float64Array(satrecs.length * 3);
    for (let i = 0; i < satrecs.length; i++) {
      const ecef = computeEcefMeters(satrecs[i], date);
      const o = i * 3;
      if (ecef) {
        positions[o] = ecef.x;
        positions[o + 1] = ecef.y;
        positions[o + 2] = ecef.z;
      } else {
        positions[o] = NaN;
        positions[o + 1] = NaN;
        positions[o + 2] = NaN;
      }
    }
    const out: PositionsMessage = { type: "positions", timeMs: msg.timeMs, positions };
    ctx.postMessage(out, [positions.buffer]);
  }
};
