/** main -> worker: 初期化（全衛星の TLE を渡す） */
export interface InitMessage {
  type: "init";
  sats: { noradId: number; tle1: string; tle2: string }[];
}
/** main -> worker: ある時刻の全位置を要求 */
export interface TickMessage {
  type: "tick";
  timeMs: number;
}
export type WorkerRequest = InitMessage | TickMessage;

/** worker -> main: 位置結果。positions は [x0,y0,z0, x1,y1,z1, ...] のメートル ECEF。
 *  計算不能だった衛星は x,y,z すべて NaN。順序は init の sats と同じ。 */
export interface PositionsMessage {
  type: "positions";
  timeMs: number;
  positions: Float64Array;
}
