import * as Cesium from "cesium";

export function createViewer(containerId: string): Cesium.Viewer {
  Cesium.Ion.defaultAccessToken = "";

  // 昼の基盤：ESRI World Imagery（Google Earth 級の衛星写真）
  const esriProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 18,
    credit: new Cesium.Credit("Imagery © Esri, Maxar, Earthstar Geographics", true),
  });
  const dayBase = new Cesium.ImageryLayer(esriProvider);
  dayBase.dayAlpha = 1.0;
  dayBase.nightAlpha = 0.0;

  // 夜：NASA VIIRS City Lights（街明かり）
  const nightProvider = new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
    maximumLevel: 8,
    credit: new Cesium.Credit("Night Lights © NASA Earth Observatory (VIIRS)", true),
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

  // 昼夜境界（太陽光による陰影）を有効化
  viewer.scene.globe.enableLighting = true;
  // 太陽位置に基づいた大気の発光（地平線がリアルに光る）
  viewer.scene.globe.showGroundAtmosphere = true;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

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
