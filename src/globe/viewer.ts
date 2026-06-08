import * as Cesium from "cesium";

/** ion 不要・OSM 画像・terrain オフ・時計と各ウィジェット有効の Viewer を作る */
export function createViewer(containerId: string): Cesium.Viewer {
  Cesium.Ion.defaultAccessToken = "";

  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
    ),
    baseLayerPicker: false,
    geocoder: false,
    animation: true,
    timeline: true,
    sceneModePicker: true,
    navigationHelpButton: false,
  });

  // 昼夜境界（太陽光による陰影）を有効化
  viewer.scene.globe.enableLighting = true;

  // 時計: 現在時刻を中心に前後 1 日、ループ
  const now = Cesium.JulianDate.now();
  viewer.clock.startTime = Cesium.JulianDate.addSeconds(now, -86400, new Cesium.JulianDate());
  viewer.clock.stopTime = Cesium.JulianDate.addSeconds(now, 86400, new Cesium.JulianDate());
  viewer.clock.currentTime = now.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 60;
  viewer.clock.shouldAnimate = true;

  return viewer;
}
