import { Cartesian3, Color, PolylineGlowMaterialProperty, Cartographic, Math } from 'cesium';
import { formatDistance, formatDuration, calculateFuelCost } from '../utils/formatters.js';

// Use environment variable for API key
const OPENROUTE_API_KEY = import.meta.env.VITE_OPENROUTE_API_KEY;

export class RouteManager {
  constructor(viewer) {
    this.viewer = viewer;
    this.routeEntities = [];
    this.fromLocation = null;
    this.toLocation = null;
    this.currentRoute = null;
  }

  async createRoute(from, to, profile = 'driving-car') {
    try {
      if (!from || !to) {
        throw new Error('Start and end locations are required');
      }

      const fromCartographic = Cartographic.fromCartesian(from);
      const toCartographic = Cartographic.fromCartesian(to);
      
      const fromLon = Math.toDegrees(fromCartographic.longitude);
      const fromLat = Math.toDegrees(fromCartographic.latitude);
      const toLon = Math.toDegrees(toCartographic.longitude);
      const toLat = Math.toDegrees(toCartographic.latitude);

      console.log('Requesting route with coordinates:', {
        from: [fromLon, fromLat],
        to: [toLon, toLat],
        profile: profile
      });

      // Clear any existing routes
      this.clearRoute();

      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${OPENROUTE_API_KEY}&start=${fromLon},${fromLat}&end=${toLon},${toLat}`,
        {
          headers: {
            'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
            'Content-Type': 'application/json'
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
      console.log('Route response:', data);
      
      if (!data.features || data.features.length === 0) {
        console.error('No route found in response:', data);
        throw new Error('No route found between the selected locations');
      }

      this.currentRoute = data.features[0];
      const coordinates = this.currentRoute.geometry.coordinates;
      
      // Create route visualization
      this.createRouteVisualization(coordinates);
      
      // Update UI with route information
      this.updateRouteUI();
      
      // Position camera at start
      this.positionCameraAtStart(coordinates);

      return this.currentRoute;
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
      return null;
    }
  }

  createRouteVisualization(coordinates) {
    // Create route line with improved highlighting
    this.routeEntities.push(this.viewer.entities.add({
      polyline: {
        positions: coordinates.map(coord => Cartesian3.fromDegrees(coord[0], coord[1], 2)),
        width: 8,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Color.fromCssColorString('#4CAF50'),
          taperPower: 1
        }),
        clampToGround: true
      }
    }));

    // Add a second polyline for the core route
    this.routeEntities.push(this.viewer.entities.add({
      polyline: {
        positions: coordinates.map(coord => Cartesian3.fromDegrees(coord[0], coord[1], 2)),
        width: 4,
        material: Color.fromCssColorString('#81C784'),
        clampToGround: true
      }
    }));
  }

  updateRouteUI() {
    if (!this.currentRoute || !this.currentRoute.properties || !this.currentRoute.properties.summary) {
      console.error('Invalid route data for UI update:', this.currentRoute);
      return;
    }

    const summary = this.currentRoute.properties.summary;
    
    // Update route summary
    document.getElementById('routeDistance').textContent = formatDistance(summary.distance);
    document.getElementById('routeDuration').textContent = formatDuration(summary.duration);
    document.getElementById('fuelCost').textContent = `$${calculateFuelCost(summary.distance)}`;

    // Update directions list
    const directionsList = document.getElementById('directionsList');
    directionsList.innerHTML = '';
    
    if (this.currentRoute.properties.segments) {
      this.currentRoute.properties.segments.forEach(segment => {
        if (segment.steps) {
          segment.steps.forEach(step => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'direction-step';
            stepDiv.textContent = step.instruction;
            directionsList.appendChild(stepDiv);
          });
        }
      });
    }

    // Show directions panel
    document.getElementById('directionsPanel').style.display = 'block';
  }

  positionCameraAtStart(coordinates) {
    // Use a higher altitude for city-to-city routes
    const altitude = 20000; // 20 km above ground
    const startLon = coordinates[0][0];
    const startLat = coordinates[0][1];
    const startPosition = Cartesian3.fromDegrees(startLon, startLat, altitude);
    const nextPosition = Cartesian3.fromDegrees(coordinates[1][0], coordinates[1][1], altitude);
    const heading = this.calculateHeading(startPosition, nextPosition);
    const pitch = -45.0; // Look down at the map

    console.log('Flying camera to:', {
      longitude: startLon,
      latitude: startLat,
      altitude,
      heading,
      pitch
    });

    this.viewer.camera.flyTo({
      destination: startPosition,
      orientation: {
        heading: Math.toRadians(heading),
        pitch: Math.toRadians(pitch),
        roll: 0.0
      },
      duration: 2
    });
  }

  clearRoute() {
    // Remove existing route entities
    this.routeEntities.forEach(entity => {
      this.viewer.entities.remove(entity);
    });
    this.routeEntities = [];
    this.currentRoute = null;
  }

  calculateHeading(from, to) {
    const fromCartographic = Cartographic.fromCartesian(from);
    const toCartographic = Cartographic.fromCartesian(to);
    
    const fromLongitude = Math.toDegrees(fromCartographic.longitude);
    const fromLatitude = Math.toDegrees(fromCartographic.latitude);
    const toLongitude = Math.toDegrees(toCartographic.longitude);
    const toLatitude = Math.toDegrees(toCartographic.latitude);
    
    const y = Math.sin(Math.toRadians(toLongitude - fromLongitude)) * Math.cos(Math.toRadians(toLatitude));
    const x = Math.cos(Math.toRadians(fromLatitude)) * Math.sin(Math.toRadians(toLatitude)) -
             Math.sin(Math.toRadians(fromLatitude)) * Math.cos(Math.toRadians(toLatitude)) * 
             Math.cos(Math.toRadians(toLongitude - fromLongitude));
    
    return Math.toDegrees(Math.atan2(y, x));
  }
} 