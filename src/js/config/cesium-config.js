import { SceneMode } from 'cesium';

export const cesiumViewerConfig = {
  sceneMode: SceneMode.SCENE3D,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  navigationInstructionsInitiallyVisible: false,
  requestRenderMode: true,
  maximumRenderTimeChange: Infinity,
  targetFrameRate: 60,
  contextOptions: {
    webgl: {
      alpha: true,
      depth: true,
      stencil: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false
    }
  }
};

export const performanceConfig = {
  globeLighting: false,
  maximumScreenSpaceError: 2,
  tileCacheSize: 1000,
  enableFxaa: true
}; 