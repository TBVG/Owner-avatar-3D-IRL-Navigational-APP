const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  startLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    name: String,
    address: String
  },
  endLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    name: String,
    address: String
  },
  waypoints: [{
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    name: String,
    address: String,
    stopType: {
      type: String,
      enum: ['fuel', 'rest', 'food', 'other'],
      default: 'other'
    }
  }],
  routeData: {
    geometry: {
      type: {
        type: String,
        enum: ['LineString'],
        default: 'LineString'
      },
      coordinates: {
        type: [[Number]], // Array of [longitude, latitude] pairs
        required: true
      }
    },
    properties: {
      distance: Number, // in meters
      duration: Number, // in seconds
      segments: [{
        distance: Number,
        duration: Number,
        steps: [{
          distance: Number,
          duration: Number,
          instruction: String,
          name: String,
          maneuver: {
            type: String,
            location: [Number]
          }
        }]
      }]
    }
  },
  trafficData: {
    lastUpdated: Date,
    segments: [{
      coordinates: [[Number]],
      congestion: Number, // 0-1 scale
      speed: Number // in km/h
    }]
  },
  preferences: {
    profile: {
      type: String,
      enum: ['driving-car', 'driving-car-shortest', 'driving-car-eco'],
      default: 'driving-car'
    },
    avoidHighways: {
      type: Boolean,
      default: false
    },
    avoidTolls: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    }
  }],
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    completions: {
      type: Number,
      default: 0
    },
    averageDuration: Number,
    lastUsed: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
routeSchema.index({ user: 1, createdAt: -1 });
routeSchema.index({ 'startLocation.coordinates': '2dsphere' });
routeSchema.index({ 'endLocation.coordinates': '2dsphere' });
routeSchema.index({ 'waypoints.coordinates': '2dsphere' });

// Method to calculate route statistics
routeSchema.methods.calculateStats = function() {
  const stats = {
    totalDistance: this.routeData.properties.distance,
    totalDuration: this.routeData.properties.duration,
    numberOfWaypoints: this.waypoints.length,
    averageSpeed: (this.routeData.properties.distance / 1000) / (this.routeData.properties.duration / 3600) // km/h
  };
  return stats;
};

// Method to check if route is accessible to a user
routeSchema.methods.isAccessibleTo = function(userId) {
  return this.user.equals(userId) || 
         this.sharedWith.some(share => share.user.equals(userId));
};

// Method to update traffic data
routeSchema.methods.updateTrafficData = function(trafficData) {
  this.trafficData = {
    lastUpdated: new Date(),
    segments: trafficData
  };
  return this.save();
};

// Method to share route with another user
routeSchema.methods.shareWith = async function(userId, permissions = 'view') {
  if (!this.sharedWith.some(share => share.user.equals(userId))) {
    this.sharedWith.push({ user: userId, permissions });
    return this.save();
  }
  return this;
};

const Route = mongoose.model('Route', routeSchema);

module.exports = Route; 