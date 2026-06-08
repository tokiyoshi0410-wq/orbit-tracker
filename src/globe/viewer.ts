import * as Cesium from "cesium";

/** 公開向け：NASA 一本足の堅牢な構成。
 *  - 昼: NASA Blue Marble Next Generation（GIBS、公開ドメイン、CDN 配信）
 *  - 夜: NASA VIIRS City Lights（街明かり）
 *  - 大気と昼夜境界つき
 *  Esri は無料無認証だが大量アクセスでブロックされるリスクがあるため避ける。 */
export function createViewer(containerId: string): Cesium.Viewer {
  Cesium.Ion.defaultAccessToken = "";

  const dayProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    maximumLevel: 8,
    credit: new Cesium.Credit("Imagery © NASA Earth Observatory (Blue Marble Next Generation, VIIRS)", true),
  });
  const dayBase = new Cesium.ImageryLayer(dayProvider);
  dayBase.dayAlpha = 1.0;
  dayBase.nightAlpha = 0.0;

  const nightProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    maximumLevel: 8,
  });
  const nightLayer = new Cesium.ImageryLayer(nightProvider);
  nightLayer.dayAlpha = 0.0;
  nightLayer.nightAlpha = 1.0;

  const viewer = new Cesium.Viewer(containerId, {
    baseLayer: dayBase,
    baseLayerPicker: false,
    geocoder: false,
    animation: true,
    timeline: true,
    sceneModePicker: true,
    navigationHelpButton: false,
  });
  viewer.imageryLayers.add(nightLayer);

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

  const now = Cesium.JulianDate.now();
  viewer.clock.startTime = Cesium.JulianDate.addSeconds(now, -86400, new Cesium.JulianDate());
  viewer.clock.stopTime = Cesium.JulianDate.addSeconds(now, 86400, new Cesium.JulianDate());
  viewer.clock.currentTime = now.clone();
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  viewer.clock.multiplier = 60;
  viewer.clock.shouldAnimate = true;

  return viewer;
}
