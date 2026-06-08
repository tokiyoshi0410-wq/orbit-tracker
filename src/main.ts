import "cesium/Build/Cesium/Widgets/widgets.css";
import { createViewer } from "./globe/viewer";

const viewer = createViewer("cesiumContainer");
// 以降のタスクで衛星描画・UI を配線する
void viewer;
