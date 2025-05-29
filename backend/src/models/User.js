const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'premium', 'admin'],
    default: 'user'
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    voiceGuidance: {
      type: Boolean,
      default: true
    },
    offlineMode: {
      type: Boolean,
      default: false
    }
  },
  savedRoutes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  }],
  lastLogin: {
    type: Date,
    default: Date.now
  },
  apiKey: {
    type: String,
    unique: true,
    sparse: true
  },
  subscription: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free'
  },
  subscriptionExpiry: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to generate API key
userSchema.methods.generateApiKey = function() {
  this.apiKey = require('crypto').randomBytes(32).toString('hex');
  return this.apiKey;
};

// Method to check if subscription is active
userSchema.methods.hasActiveSubscription = function() {
  if (this.subscription === 'free') return true;
  return this.subscriptionExpiry && this.subscriptionExpiry > new Date();
};

// Method to get user's features based on subscription
userSchema.methods.getFeatures = function() {
  const features = {
    free: {
      maxSavedRoutes: 5,
      offlineMode: false,
      voiceGuidance: true,
      trafficUpdates: false,
      multiStopRoutes: false
    },
    premium: {
      maxSavedRoutes: 50,
      offlineMode: true,
      voiceGuidance: true,
      trafficUpdates: true,
      multiStopRoutes: true
    },
    enterprise: {
      maxSavedRoutes: -1, // unlimited
      offlineMode: true,
      voiceGuidance: true,
      trafficUpdates: true,
      multiStopRoutes: true,
      analytics: true,
      apiAccess: true
    }
  };
  
  return features[this.subscription];
};

const User = mongoose.model('User', userSchema);

module.exports = User; 