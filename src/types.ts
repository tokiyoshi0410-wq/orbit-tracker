/** TLE から得る衛星の基本レコード */
export interface SatelliteRecord {
  noradId: number;
  name: string;
  intlDesignator: string; // OBJECT_ID 相当 (TLE 由来)
  tle1: string;
  tle2: string;
  category?: string;      // categories.ts の key（catalog 取得時に付与）
}

/** SATCAT 由来のメタ情報 */
export interface SatcatMeta {
  noradId: number;
  objectType: string;  // PAY / R/B / DEB / UNK
  owner: string;       // US, PRC, CIS, ESA ...
  launchDate: string;  // YYYY-MM-DD
}

/** クリック時に算出する軌道要素 */
export interface OrbitalElements {
  periodMin: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeAltKm: number;
  perigeeAltKm: number;
  semiMajorAxisKm: number;
}

/** ある時刻の瞬時状態 */
export interface InstantState {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  speedKmS: number;
}

/** ECEF メートル座標 */
export interface EcefMeters {
  x: number;
  y: number;
  z: number;
}
