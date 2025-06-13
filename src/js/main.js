import { Cartesian3, createOsmBuildingsAsync, Ion, Math, Terrain, Viewer, Color, PolylineMaterialAppearance, PolylineCollection, PolylineDashMaterialProperty, Entity, HeadingPitchRoll, Cartographic, PolylineGlowMaterialProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, HeadingPitchRange, HeightReference, PointPrimitiveCollection, PointPrimitive, BillboardCollection, Billboard, LabelCollection, Label, VerticalOrigin, HorizontalOrigin, DistanceDisplayCondition, NearFarScalar, SceneMode, IonImageryProvider } from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { cesiumViewerConfig, performanceConfig } from './config/cesium-config.js';
import { VoiceGuidance } from './features/VoiceGuidance.js';
import { NavigationManager } from './features/NavigationManager.js';
import { RouteManager } from './features/RouteManager.js';

// Use environment variables for API keys
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ACCESS_TOKEN;
const OPENROUTE_API_KEY = import.meta.env.VITE_OPENROUTE_API_KEY;

// Initialize Cesium
console.log('Initializing Cesium...');
let viewer;

try {
  // Initialize the Cesium Viewer
  viewer = new Viewer('cesiumContainer', {
    imageryProvider: new IonImageryProvider({ assetId: 2 }), // Cesium World Imagery
    terrainProvider: Terrain.fromWorldTerrain(),
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
  });

  // Log imagery and terrain providers
  console.log('Imagery provider:', viewer.imageryLayers.get(0).imageryProvider);
  console.log('Terrain provider:', viewer.terrainProvider);

  // Performance optimizations
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.maximumScreenSpaceError = 2;
  viewer.scene.globe.tileCacheSize = 1000;
  viewer.scene.fxaa = true;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // Add OSM Buildings
  console.log('Adding OSM Buildings...');
  createOsmBuildingsAsync().then(buildingTileset => {
    viewer.scene.primitives.add(buildingTileset);
    console.log('OSM Buildings added successfully');
  }).catch(error => {
    console.error('Error adding OSM Buildings:', error);
  });

  // Set initial camera position
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(0, 0, 20000000),
    orientation: {
      heading: Math.toRadians(0.0),
      pitch: Math.toRadians(-90.0),
      roll: 0.0
    },
    duration: 0
  });

  console.log('Cesium initialized successfully');
} catch (error) {
  console.error('Error initializing Cesium:', error);
}

// Initialize features
const voiceGuidance = new VoiceGuidance();
const navigationManager = new NavigationManager(viewer, voiceGuidance);
const routeManager = new RouteManager(viewer);

// Event Listeners
document.getElementById('findRoute').addEventListener('click', async () => {
  if (!routeManager.fromLocation || !routeManager.toLocation) {
    alert('Please select both starting point and destination');
    return;
  }

  const route = await routeManager.createRoute(
    routeManager.fromLocation,
    routeManager.toLocation
  );

  if (route) {
    document.getElementById('startNavigation').disabled = false;
  }
});

document.getElementById('startNavigation').addEventListener('click', () => {
  navigationManager.startNavigation(routeManager.currentRoute);
});

document.getElementById('stopNavigation').addEventListener('click', () => {
  navigationManager.stopNavigation();
});

document.getElementById('toggleView').addEventListener('click', () => {
  navigationManager.toggleView();
});

// Handle geocoding
async function handleGeocoding(input, suggestionsContainer, isFrom) {
  const query = input.value.trim();
  if (query.length < 3) {
    suggestionsContainer.style.display = 'none';
    return;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': '3DNavigationApp/1.0',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding service error: ${response.status}`);
    }

    const results = await response.json();
    suggestionsContainer.innerHTML = '';
    
    if (results && results.length > 0) {
      results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = result.display_name;
        
        div.onclick = () => {
          input.value = result.display_name;
          input.dataset.selectedLocation = result.display_name;
          suggestionsContainer.style.display = 'none';
          
          const location = Cartesian3.fromDegrees(
            parseFloat(result.lon),
            parseFloat(result.lat),
            2
          );
          
          if (isFrom) {
            routeManager.fromLocation = location;
          } else {
            routeManager.toLocation = location;
          }
          
          document.getElementById('findRoute').disabled = !(routeManager.fromLocation && routeManager.toLocation);
          
          viewer.camera.flyTo({
            destination: location,
            orientation: {
              heading: Math.toRadians(0.0),
              pitch: Math.toRadians(-45.0),
              roll: 0.0
            },
            duration: 2
          });
        };
        
        suggestionsContainer.appendChild(div);
      });
      
      suggestionsContainer.style.display = 'block';
    } else {
      document.getElementById('findRoute').disabled = true;
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    document.getElementById('findRoute').disabled = true;
    suggestionsContainer.style.display = 'none';
  }
}

// Add input event listeners
const fromInput = document.getElementById('fromLocation');
const toInput = document.getElementById('toLocation');
const fromSuggestions = document.getElementById('fromSuggestions');
const toSuggestions = document.getElementById('toSuggestions');

if (fromInput && toInput) {
  fromInput.addEventListener('input', () => {
    console.log('From input changed:', fromInput.value);
    handleGeocoding(fromInput, fromSuggestions, true);
  });

  toInput.addEventListener('input', () => {
    console.log('To input changed:', toInput.value);
    handleGeocoding(toInput, toSuggestions, false);
  });
} else {
  console.error('Input elements not found');
}

// Handle "Use My Location" button
document.getElementById('useMyLocation').addEventListener('click', async () => {
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
    
    const location = Cartesian3.fromDegrees(
      position.coords.longitude,
      position.coords.latitude,
      2
    );
    
    routeManager.fromLocation = location;
    fromInput.value = 'My Location';
    document.getElementById('findRoute').disabled = !routeManager.toLocation;
  } catch (error) {
    console.error('Error getting location:', error);
    alert('Could not get your location. Please make sure location services are enabled.');
  }
});

// Reset function to return to initial state
function resetToInitialState() {
  // Clear any existing routes
  if (routeManager) {
    routeManager.clearRoute();
  }
  
  // Reset navigation if active
  if (navigationManager) {
    navigationManager.stopNavigation();
  }
  
  // Clear input fields
  document.getElementById('fromLocation').value = '';
  document.getElementById('toLocation').value = '';
  document.getElementById('fromLocation').dataset.selectedLocation = '';
  document.getElementById('toLocation').dataset.selectedLocation = '';
  
  // Hide suggestions
  document.getElementById('fromSuggestions').style.display = 'none';
  document.getElementById('toSuggestions').style.display = 'none';
  
  // Hide directions panel
  document.getElementById('directionsPanel').style.display = 'none';
  
  // Hide navigation mode
  document.getElementById('navigationMode').style.display = 'none';
  
  // Reset camera to default view
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(0, 0, 20000000),
    orientation: {
      heading: Math.toRadians(0.0),
      pitch: Math.toRadians(-90.0),
      roll: 0.0
    },
    duration: 2
  });
  
  // Disable find route button
  document.getElementById('findRoute').disabled = true;
}

// Add click event listener to app title
document.querySelector('.app-title').addEventListener('click', resetToInitialState); 