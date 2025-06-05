import { Cartesian3, createOsmBuildingsAsync, Ion, Math as CesiumMath, Terrain, Viewer, Color, PolylineMaterialAppearance, PolylineCollection, PolylineDashMaterialProperty, Entity, HeadingPitchRoll, Cartographic, PolylineGlowMaterialProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, HeadingPitchRange, HeightReference, PointPrimitiveCollection, PointPrimitive, BillboardCollection, Billboard, LabelCollection, Label, VerticalOrigin, HorizontalOrigin, DistanceDisplayCondition, NearFarScalar, SceneMode } from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";

// Your access token can be found at: https://ion.cesium.com/tokens.
// This is the default access token from your ion account
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ACCESS_TOKEN;

const OPENROUTE_API_KEY = import.meta.env.VITE_OPENROUTE_API_KEY;

// Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
const viewer = new Viewer('cesiumContainer', {
  terrain: Terrain.fromWorldTerrain(),
});    

// Fly the camera to San Francisco at street level
viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(-122.4175, 37.655, 2), // Lower height to street level (2 meters)
  orientation: {
    heading: CesiumMath.toRadians(45.0), // Face northeast
    pitch: CesiumMath.toRadians(0.0),    // Look straight ahead
    roll: 0.0                            // Keep camera level
  }
});

// Add Cesium OSM Buildings, a global 3D buildings layer.
const buildingTileset = await createOsmBuildingsAsync();
viewer.scene.primitives.add(buildingTileset);   

// Initialize route entities
let routeEntities = [];
let fromLocation = null;
let toLocation = null;
let currentRoute = null;

// Navigation state
let isNavigating = false;
let currentStepIndex = 0;
let watchId = null;
let routeProgress = 0;
let currentPositionEntity = null;

// Premium features state
let trafficLayer = null;
let poiLayer = null;
let buildingsLayer = null;
let isDarkMode = false;

// Voice guidance system
class VoiceGuidance {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.isEnabled = true;
    this.lastAnnouncement = '';
    this.initializeVoice();
  }

  async initializeVoice() {
    // Wait for voices to be loaded
    if (this.synth.getVoices().length === 0) {
      await new Promise(resolve => {
        this.synth.addEventListener('voiceschanged', resolve, { once: true });
      });
    }
    
    // Select a navigation-appropriate voice
    const voices = this.synth.getVoices();
    this.voice = voices.find(voice => 
      voice.name.includes('Google') && voice.lang.includes('en')
    ) || voices[0];
  }

  speak(text, priority = false) {
    if (!this.isEnabled || text === this.lastAnnouncement) return;
    
    // Cancel any ongoing speech
    this.synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    this.synth.speak(utterance);
    this.lastAnnouncement = text;
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    if (!this.isEnabled) {
      this.synth.cancel();
    }
    return this.isEnabled;
  }
}

// Offline map system
class OfflineMapManager {
  constructor() {
    this.isOfflineMode = false;
    this.cachedTiles = new Map();
    this.cachedRoutes = new Map();
    this.initializeServiceWorker();
  }

  async initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('ServiceWorker registration successful');
      } catch (error) {
        console.error('ServiceWorker registration failed:', error);
      }
    }
  }

  async cacheRoute(route) {
    const key = `${route.properties.segments[0].steps[0].maneuver.location.join(',')}-${route.properties.segments[0].steps[route.properties.segments[0].steps.length - 1].maneuver.location.join(',')}`;
    this.cachedRoutes.set(key, route);
    // Store in IndexedDB for persistence
    await this.storeInIndexedDB('routes', key, route);
  }

  async getCachedRoute(from, to) {
    const key = `${from.join(',')}-${to.join(',')}`;
    return this.cachedRoutes.get(key) || await this.getFromIndexedDB('routes', key);
  }

  async storeInIndexedDB(store, key, value) {
    const db = await this.openDatabase();
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    await objectStore.put(value, key);
  }

  async getFromIndexedDB(store, key) {
    const db = await this.openDatabase();
    const tx = db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    return await objectStore.get(key);
  }

  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('NaviProOffline', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('routes')) {
          db.createObjectStore('routes');
        }
        if (!db.objectStoreNames.contains('tiles')) {
          db.createObjectStore('tiles');
        }
      };
    });
  }

  toggleOfflineMode() {
    this.isOfflineMode = !this.isOfflineMode;
    return this.isOfflineMode;
  }
}

// Initialize voice guidance and offline support
const voiceGuidance = new VoiceGuidance();
const offlineManager = new OfflineMapManager();

// Function to format duration
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

// Function to format distance
function formatDistance(meters) {
  const kilometers = meters / 1000;
  if (kilometers >= 1) {
    return `${kilometers.toFixed(1)} km`;
  }
  return `${meters.toFixed(0)} m`;
}

// Function to handle geocoding and suggestions
async function handleGeocoding(input, suggestionsContainer, isFrom) {
  const query = input.value.trim();
  
  // Clear previous suggestions
  suggestionsContainer.innerHTML = '';
  suggestionsContainer.style.display = 'none';
  
  if (query.length < 2) {
    document.getElementById('findRoute').disabled = true;
    return;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': '3DNavigationApp'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Geocoding service error');
    }

    const results = await response.json();
    
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
            fromLocation = location;
          } else {
            toLocation = location;
          }
          
          document.getElementById('findRoute').disabled = !(fromLocation && toLocation);
          
          viewer.camera.flyTo({
            destination: location,
            orientation: {
              heading: CesiumMath.toRadians(0.0),
              pitch: CesiumMath.toRadians(-45.0),
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
  }
}

// Set up input handlers
const fromInput = document.getElementById('fromLocation');
const toInput = document.getElementById('toLocation');
const fromSuggestions = document.getElementById('fromSuggestions');
const toSuggestions = document.getElementById('toSuggestions');

// Add input event listeners with validation
fromInput.addEventListener('input', () => {
  handleGeocoding(fromInput, fromSuggestions, true);
  // Clear location if input is changed
  fromLocation = null;
  document.getElementById('findRoute').disabled = true;
  // Clear the input if it doesn't match any selected location
  if (fromInput.value !== fromInput.dataset.selectedLocation) {
    fromInput.value = '';
  }
});

toInput.addEventListener('input', () => {
  handleGeocoding(toInput, toSuggestions, false);
  // Clear location if input is changed
  toLocation = null;
  document.getElementById('findRoute').disabled = true;
  // Clear the input if it doesn't match any selected location
  if (toInput.value !== toInput.dataset.selectedLocation) {
    toInput.value = '';
  }
});

// Prevent manual editing of input fields
fromInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fromSuggestions.style.display = 'none';
  }
});

toInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    toSuggestions.style.display = 'none';
  }
});

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.input-group')) {
    fromSuggestions.style.display = 'none';
    toSuggestions.style.display = 'none';
  }
});

// Handle route options
document.querySelectorAll('.route-option').forEach(option => {
  option.addEventListener('click', () => {
    document.querySelectorAll('.route-option').forEach(opt => opt.classList.remove('active'));
    option.classList.add('active');
  });
});

// Handle route button click
document.getElementById('findRoute').addEventListener('click', () => {
  if (fromLocation && toLocation) {
    const activeProfile = document.querySelector('.route-option.active').dataset.profile;
    createRoute(fromLocation, toLocation, activeProfile);
  }
});

// Function to clear the current route
function clearRoute() {
  routeEntities.forEach(entity => viewer.entities.remove(entity));
  routeEntities = [];
  fromLocation = null;
  toLocation = null;
  currentRoute = null;
  document.getElementById('fromLocation').value = '';
  document.getElementById('toLocation').value = '';
  document.getElementById('directionsPanel').style.display = 'none';
  document.getElementById('navigationMode').style.display = 'none';
  document.getElementById('findRoute').disabled = true;
}

// Add event listeners for buttons
document.getElementById('clearRoute').addEventListener('click', clearRoute);

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
    
    fromLocation = location;
    document.getElementById('fromLocation').value = 'My Location';
    document.getElementById('findRoute').disabled = !toLocation;
  } catch (error) {
    console.error('Error getting location:', error);
    alert('Could not get your location. Please make sure location services are enabled.');
  }
});

// Initialize premium features
function initializePremiumFeatures() {
  // Set up theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // Set up feature toggles
  document.getElementById('trafficToggle').addEventListener('change', toggleTraffic);
  document.getElementById('buildingsToggle').addEventListener('change', toggleBuildings);
  document.getElementById('poiToggle').addEventListener('change', togglePOI);
}

// Theme toggle
function toggleTheme() {
  const isDarkMode = document.body.classList.toggle('dark-theme');
  document.getElementById('themeToggle').innerHTML = isDarkMode ? 
    '<i class="fas fa-sun"></i>' : 
    '<i class="fas fa-moon"></i>';
  
  viewer.scene.globe.enableLighting = isDarkMode;
  viewer.scene.globe.baseColor = isDarkMode ? Color.DARKSLATEGRAY : Color.WHITE;
}

// Traffic layer toggle
function toggleTraffic(event) {
  if (event.target.checked) {
    // Simulate traffic data (in a real app, this would come from a traffic API)
    updateTrafficData();
  } else {
    trafficLayer.removeAll();
  }
}

// Buildings layer toggle
function toggleBuildings(event) {
  if (event.target.checked) {
    viewer.scene.globe.enableLighting = true;
  } else {
    viewer.scene.globe.enableLighting = false;
  }
}

// POI layer toggle
function togglePOI(event) {
  if (event.target.checked) {
    // Simulate POI data (in a real app, this would come from a POI API)
    updatePOIData();
  } else {
    poiLayer.removeAll();
  }
}

// Update traffic data
function updateTrafficData() {
  // Clear existing traffic
  trafficLayer.removeAll();
  
  // Simulate traffic points along the route
  if (currentRoute) {
    const coordinates = currentRoute.geometry.coordinates;
    coordinates.forEach((coord, index) => {
      if (index % 5 === 0) { // Add traffic point every 5 coordinates
        const trafficLevel = Math.random(); // 0 to 1
        const color = trafficLevel > 0.7 ? Color.RED :
                     trafficLevel > 0.4 ? Color.YELLOW :
                     Color.GREEN;
        
        trafficLayer.add({
          position: Cartesian3.fromDegrees(coord[0], coord[1], 2),
          color: color,
          pixelSize: 8,
          outlineColor: Color.WHITE,
          outlineWidth: 1
        });
      }
    });
  }
}

// Update POI data
function updatePOIData() {
  // Clear existing POIs
  poiLayer.removeAll();
  
  // Simulate POIs around the route
  if (currentRoute) {
    const coordinates = currentRoute.geometry.coordinates;
    coordinates.forEach((coord, index) => {
      if (index % 10 === 0) { // Add POI every 10 coordinates
        const poiTypes = ['restaurant', 'gas', 'hotel'];
        const poiType = poiTypes[Math.floor(Math.random() * poiTypes.length)];
        
        poiLayer.add({
          position: Cartesian3.fromDegrees(coord[0], coord[1], 2),
          image: `https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-marker/v0.1.0/marker-${poiType}.png`,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scale: 0.5
        });
      }
    });
  }
}

// Calculate fuel cost
function calculateFuelCost(distance) {
  const fuelPrice = 3.50; // $ per gallon
  const mpg = 25; // miles per gallon
  const distanceInMiles = distance / 1609.34; // convert meters to miles
  const gallons = distanceInMiles / mpg;
  return (gallons * fuelPrice).toFixed(2);
}

// Enhanced navigation UI update
function updateNavigationUI(currentLocation) {
  if (!currentRoute || !isNavigating) return;
  
  const steps = currentRoute.properties.segments[0].steps;
  const currentStep = steps[currentStepIndex];
  
  // Calculate distance to next turn
  const nextTurnLocation = Cartesian3.fromDegrees(
    currentStep.maneuver.location[0],
    currentStep.maneuver.location[1],
    2
  );
  
  const distanceToNextTurn = Cartesian3.distance(currentLocation, nextTurnLocation);
  
  // Update UI
  document.getElementById('nextTurn').textContent = currentStep.instruction;
  document.getElementById('nextTurnDistance').textContent = formatDistance(distanceToNextTurn);
  
  // Voice guidance
  if (distanceToNextTurn < 200) { // Announce 200 meters before turn
    voiceGuidance.speak(currentStep.instruction);
  }
  
  // Update progress bar
  const totalDistance = currentRoute.properties.summary.distance;
  const remainingDistance = calculateRemainingDistance(currentLocation);
  routeProgress = ((totalDistance - remainingDistance) / totalDistance) * 100;
  document.getElementById('progressBar').style.width = `${routeProgress}%`;
  
  // Check if we've reached the next turn
  if (distanceToNextTurn < 50) { // 50 meters threshold
    currentStepIndex++;
    if (currentStepIndex >= steps.length) {
      // Reached destination
      voiceGuidance.speak("You have reached your destination");
      clearRoute();
    }
  }
}

// Function to calculate remaining distance
function calculateRemainingDistance(currentLocation) {
  if (!currentRoute) return 0;
  
  const coordinates = currentRoute.geometry.coordinates;
  let minDistance = Infinity;
  let remainingDistance = 0;
  let foundClosest = false;
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const point1 = Cartesian3.fromDegrees(coordinates[i][0], coordinates[i][1], 2);
    const point2 = Cartesian3.fromDegrees(coordinates[i + 1][0], coordinates[i + 1][1], 2);
    
    const distance = Cartesian3.distance(currentLocation, point1);
    if (distance < minDistance) {
      minDistance = distance;
      foundClosest = true;
    }
    
    if (foundClosest) {
      remainingDistance += Cartesian3.distance(point1, point2);
    }
  }
  
  return remainingDistance;
}

// Function to create a route
async function createRoute(from, to, profile = 'driving-car') {
  try {
    // Get coordinates from Cartesian3
    const fromCartographic = Cartographic.fromCartesian(from);
    const toCartographic = Cartographic.fromCartesian(to);
    
    const fromLon = CesiumMath.toDegrees(fromCartographic.longitude);
    const fromLat = CesiumMath.toDegrees(fromCartographic.latitude);
    const toLon = CesiumMath.toDegrees(toCartographic.longitude);
    const toLat = CesiumMath.toDegrees(toCartographic.latitude);

    console.log('Requesting route with coordinates:', {
      from: [fromLon, fromLat],
      to: [toLon, toLat],
      profile: profile
    });

    // Call OpenRouteService API
    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${OPENROUTE_API_KEY}&start=${fromLon},${fromLat}&end=${toLon},${toLat}`,
      {
        headers: {
          'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('OpenRouteService API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      console.error('No route found in response:', data);
      throw new Error('No route found between the selected locations');
    }

    currentRoute = data.features[0];
    const coordinates = currentRoute.geometry.coordinates;
    
    // Create route line
    const positions = coordinates.map(coord => 
      Cartesian3.fromDegrees(coord[0], coord[1], 2)
    );

    // Add route line to the map
    routeEntities.push(viewer.entities.add({
      polyline: {
        positions: positions,
        width: 5,
        material: Color.BLUE
      }
    }));

    // Display route summary
    const summary = currentRoute.properties.summary;
    document.getElementById('routeDistance').textContent = formatDistance(summary.distance);
    document.getElementById('routeDuration').textContent = formatDuration(summary.duration);
    document.getElementById('fuelCost').textContent = `$${calculateFuelCost(summary.distance)}`;

    // Display turn-by-turn directions
    const directionsList = document.getElementById('directionsList');
    directionsList.innerHTML = '';
    
    currentRoute.properties.segments.forEach(segment => {
      segment.steps.forEach(step => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'direction-step';
        stepDiv.textContent = step.instruction;
        directionsList.appendChild(stepDiv);
      });
    });

    // Show directions panel
    document.getElementById('directionsPanel').style.display = 'block';

    // Position camera at start point
    const startPosition = positions[0];
    const heading = calculateHeading(startPosition, positions[1]);
    
    viewer.camera.flyTo({
      destination: startPosition,
      orientation: {
        heading: CesiumMath.toRadians(heading),
        pitch: CesiumMath.toRadians(0.0),
        roll: 0.0
      },
      duration: 2
    });

  } catch (error) {
    console.error('Error creating route:', error);
    let errorMessage = 'Error creating route. ';
    
    if (error.message.includes('API error: 400')) {
      errorMessage += 'The selected locations are too far apart or not connected by road.';
    } else if (error.message.includes('API error: 401')) {
      errorMessage += 'Invalid API key. Please check your OpenRouteService API key.';
    } else if (error.message.includes('API error: 429')) {
      errorMessage += 'Too many requests. Please try again in a few minutes.';
    } else if (error.message.includes('No route found')) {
      errorMessage += 'No route found between the selected locations.';
    } else {
      errorMessage += 'Please try again.';
    }
    
    alert(errorMessage);
  }
}

// Function to calculate heading between two points
function calculateHeading(from, to) {
  const fromCartographic = Cartographic.fromCartesian(from);
  const toCartographic = Cartographic.fromCartesian(to);
  
  const fromLongitude = CesiumMath.toDegrees(fromCartographic.longitude);
  const fromLatitude = CesiumMath.toDegrees(fromCartographic.latitude);
  const toLongitude = CesiumMath.toDegrees(toCartographic.longitude);
  const toLatitude = CesiumMath.toDegrees(toCartographic.latitude);
  
  const y = Math.sin(CesiumMath.toRadians(toLongitude - fromLongitude)) * Math.cos(CesiumMath.toRadians(toLatitude));
  const x = Math.cos(CesiumMath.toRadians(fromLatitude)) * Math.sin(CesiumMath.toRadians(toLatitude)) -
           Math.sin(CesiumMath.toRadians(fromLatitude)) * Math.cos(CesiumMath.toRadians(toLatitude)) * 
           Math.cos(CesiumMath.toRadians(toLongitude - fromLongitude));
  
  return CesiumMath.toDegrees(Math.atan2(y, x));
}

// Initialize premium features
initializePremiumFeatures();

// Add start navigation functionality
document.getElementById('startNavigation').addEventListener('click', () => {
  if (!currentRoute) {
    alert('Please create a route first');
    return;
  }

  isNavigating = true;
  currentStepIndex = 0;
  
  // Hide directions panel and show navigation mode
  document.getElementById('directionsPanel').style.display = 'none';
  document.getElementById('navigationMode').style.display = 'block';
  
  // Start watching user's position
  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const currentLocation = Cartesian3.fromDegrees(
          position.coords.longitude,
          position.coords.latitude,
          position.coords.altitude || 2
        );
        
        // Update navigation UI
        updateNavigationUI(currentLocation);
        
        // Update camera position
        viewer.camera.flyTo({
          destination: currentLocation,
          orientation: {
            heading: CesiumMath.toRadians(position.coords.heading || 0),
            pitch: CesiumMath.toRadians(-45.0),
            roll: 0.0
          },
          duration: 0.5
        });
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Error getting your location. Please make sure location services are enabled.');
        stopNavigation();
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  } else {
    alert('Geolocation is not supported by your browser');
    stopNavigation();
  }
});

// Add stop navigation functionality
document.getElementById('stopNavigation').addEventListener('click', stopNavigation);

function stopNavigation() {
  isNavigating = false;
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  document.getElementById('navigationMode').style.display = 'none';
  document.getElementById('directionsPanel').style.display = 'block';
}
