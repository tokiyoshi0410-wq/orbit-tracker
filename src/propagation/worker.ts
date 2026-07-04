import { gstime } from "satellite.js";
import { buildSatrec, propagateEciKm, eciKmToEcefMeters, type SatRec } from "./propagator";
import { sunEciKm, isInEarthShadow } from "../astro/sun";
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
    const gmst = gstime(date); // 全衛星共通なので 1 回だけ
    const sun = sunEciKm(date);
    const positions = new Float64Array(satrecs.length * 3);
    const shadows = new Uint8Array(satrecs.length);
    for (let i = 0; i < satrecs.length; i++) {
      const eci = propagateEciKm(satrecs[i], date);
      const o = i * 3;
      if (eci) {
        const ecef = eciKmToEcefMeters(eci, gmst);
        positions[o] = ecef.x;
        positions[o + 1] = ecef.y;
        positions[o + 2] = ecef.z;
        shadows[i] = isInEarthShadow(eci, sun) ? 1 : 0;
      } else {
        positions[o] = NaN;
        positions[o + 1] = NaN;
        positions[o + 2] = NaN;
      }
    }
    const out: PositionsMessage = { type: "positions", timeMs: msg.timeMs, positions, shadows };
    ctx.postMessage(out, [positions.buffer, shadows.buffer]);
  }
};
