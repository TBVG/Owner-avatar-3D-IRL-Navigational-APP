import { Cartesian3, Math } from 'cesium';
import { formatDistance } from '../utils/formatters.js';

export class NavigationManager {
  constructor(viewer, voiceGuidance) {
    this.viewer = viewer;
    this.voiceGuidance = voiceGuidance;
    this.isNavigating = false;
    this.currentStepIndex = 0;
    this.watchId = null;
    this.routeProgress = 0;
    this.currentRoute = null;
    this.isFirstPersonView = false;
  }

  startNavigation(route) {
    if (!route) {
      alert('Please create a route first');
      return;
    }

    this.isNavigating = true;
    this.currentStepIndex = 0;
    this.currentRoute = route;
    
    document.getElementById('directionsPanel').style.display = 'none';
    document.getElementById('navigationMode').style.display = 'block';
    
    if ('geolocation' in navigator) {
      this.watchId = navigator.geolocation.watchPosition(
        this.handlePositionUpdate.bind(this),
        this.handlePositionError.bind(this),
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
      this.stopNavigation();
    }
  }

  stopNavigation() {
    this.isNavigating = false;
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    document.getElementById('navigationMode').style.display = 'none';
    document.getElementById('directionsPanel').style.display = 'block';
  }

  handlePositionUpdate(position) {
    const currentLocation = Cartesian3.fromDegrees(
      position.coords.longitude,
      position.coords.latitude,
      position.coords.altitude || 2
    );
    
    this.updateNavigationUI(currentLocation, position);
  }

  handlePositionError(error) {
    console.error('Error getting location:', error);
    alert('Error getting your location. Please make sure location services are enabled.');
    this.stopNavigation();
  }

  updateNavigationUI(currentLocation, position) {
    if (!this.currentRoute || !this.isNavigating) return;
    
    const steps = this.currentRoute.properties.segments[0].steps;
    const currentStep = steps[this.currentStepIndex];
    
    const nextTurnLocation = Cartesian3.fromDegrees(
      currentStep.maneuver.location[0],
      currentStep.maneuver.location[1],
      2
    );
    
    const distanceToNextTurn = Cartesian3.distance(currentLocation, nextTurnLocation);
    
    document.getElementById('nextTurn').textContent = currentStep.instruction;
    document.getElementById('nextTurnDistance').textContent = formatDistance(distanceToNextTurn);
    
    if (distanceToNextTurn < 200) {
      this.voiceGuidance.speak(currentStep.instruction);
    }
    
    const totalDistance = this.currentRoute.properties.summary.distance;
    const remainingDistance = this.calculateRemainingDistance(currentLocation);
    this.routeProgress = ((totalDistance - remainingDistance) / totalDistance) * 100;
    document.getElementById('progressBar').style.width = `${this.routeProgress}%`;
    
    this.updateCameraPosition(currentLocation, nextTurnLocation, position);
    
    if (distanceToNextTurn < 50) {
      this.currentStepIndex++;
      if (this.currentStepIndex >= steps.length) {
        this.voiceGuidance.speak("You have reached your destination");
        this.stopNavigation();
      }
    }
  }

  updateCameraPosition(currentLocation, nextTurnLocation, position) {
    if (this.isFirstPersonView) {
      const heading = this.calculateHeading(currentLocation, nextTurnLocation);
      this.viewer.camera.setView({
        destination: currentLocation,
        orientation: {
          heading: CesiumMath.toRadians(heading),
          pitch: CesiumMath.toRadians(0.0),
          roll: 0.0
        }
      });
      this.viewer.camera.positionCartographic.height = 1.7;
    } else {
      this.viewer.camera.flyTo({
        destination: currentLocation,
        orientation: {
          heading: CesiumMath.toRadians(position.coords.heading || 0),
          pitch: CesiumMath.toRadians(-45.0),
          roll: 0.0
        },
        duration: 0.5
      });
    }
  }

  calculateRemainingDistance(currentLocation) {
    if (!this.currentRoute) return 0;
    
    const coordinates = this.currentRoute.geometry.coordinates;
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

  calculateHeading(from, to) {
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

  toggleView() {
    if (!this.currentRoute) return;
    
    this.isFirstPersonView = !this.isFirstPersonView;
    
    if (this.isFirstPersonView) {
      const currentLocation = this.viewer.camera.position;
      const heading = this.viewer.camera.heading;
      
      this.viewer.camera.setView({
        destination: currentLocation,
        orientation: {
          heading: heading,
          pitch: CesiumMath.toRadians(0.0),
          roll: 0.0
        }
      });
      
      this.viewer.camera.positionCartographic.height = 1.7;
      
      this.viewer.scene.screenSpaceCameraController.enableRotate = false;
      this.viewer.scene.screenSpaceCameraController.enableTilt = false;
      this.viewer.scene.screenSpaceCameraController.enableZoom = false;
    } else {
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
      this.viewer.scene.screenSpaceCameraController.enableTilt = true;
      this.viewer.scene.screenSpaceCameraController.enableZoom = true;
      
      const positions = this.currentRoute.geometry.coordinates.map(coord => 
        Cartesian3.fromDegrees(coord[0], coord[1], 2)
      );
      
      this.viewer.camera.flyTo({
        destination: positions[0],
        orientation: {
          heading: CesiumMath.toRadians(0.0),
          pitch: CesiumMath.toRadians(-45.0),
          roll: 0.0
        },
        duration: 1
      });
    }
  }
} 