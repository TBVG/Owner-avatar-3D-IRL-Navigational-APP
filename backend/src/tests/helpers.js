const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Route = require('../models/Route');

/**
 * Create a test user and return the user object and JWT token
 * @param {Object} options - User creation options
 * @returns {Promise<{user: Object, token: string}>}
 */
const createTestUser = async (options = {}) => {
  const defaultUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    role: 'user',
    subscription: 'free'
  };

  const user = await User.create({ ...defaultUser, ...options });
  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { user, token };
};

/**
 * Create a test route and return the route object
 * @param {Object} userId - User ID to associate with the route
 * @param {Object} options - Route creation options
 * @returns {Promise<Object>}
 */
const createTestRoute = async (userId, options = {}) => {
  const defaultRoute = {
    user: userId,
    name: 'Test Route',
    startLocation: {
      name: 'Start',
      coordinates: [0, 0]
    },
    endLocation: {
      name: 'End',
      coordinates: [1, 1]
    },
    routeData: {
      geometry: {
        coordinates: [[0, 0], [1, 1]]
      },
      properties: {
        distance: 1000,
        duration: 600
      }
    },
    preferences: {
      profile: 'driving-car',
      avoidHighways: false,
      avoidTolls: false
    }
  };

  return await Route.create({ ...defaultRoute, ...options });
};

/**
 * Clean up test data from the database
 * @returns {Promise<void>}
 */
const cleanupTestData = async () => {
  await User.deleteMany({});
  await Route.deleteMany({});
};

/**
 * Generate a mock OpenRouteService response
 * @param {Array<number>} coordinates - Array of coordinate pairs
 * @returns {Object} Mock route data
 */
const mockRouteData = (coordinates = [[0, 0], [1, 1]]) => ({
  type: 'Feature',
  properties: {
    distance: 1000,
    duration: 600,
    segments: [
      {
        distance: 1000,
        duration: 600,
        steps: [
          {
            distance: 500,
            duration: 300,
            type: 'turn',
            instruction: 'Turn right'
          },
          {
            distance: 500,
            duration: 300,
            type: 'arrive',
            instruction: 'Arrive at destination'
          }
        ]
      }
    ]
  },
  geometry: {
    type: 'LineString',
    coordinates
  }
});

/**
 * Generate a mock traffic data response
 * @returns {Object} Mock traffic data
 */
const mockTrafficData = () => ({
  type: 'Feature',
  properties: {
    congestion: 0.5,
    speed: 50,
    timestamp: new Date().toISOString()
  },
  geometry: {
    type: 'LineString',
    coordinates: [[0, 0], [1, 1]]
  }
});

/**
 * Create a test admin user
 * @returns {Promise<{user: Object, token: string}>}
 */
const createTestAdmin = async () => {
  return createTestUser({
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    subscription: 'enterprise'
  });
};

/**
 * Create a test premium user
 * @returns {Promise<{user: Object, token: string}>}
 */
const createTestPremiumUser = async () => {
  return createTestUser({
    email: 'premium@example.com',
    name: 'Premium User',
    subscription: 'premium'
  });
};

/**
 * Create a test enterprise user
 * @returns {Promise<{user: Object, token: string}>}
 */
const createTestEnterpriseUser = async () => {
  return createTestUser({
    email: 'enterprise@example.com',
    name: 'Enterprise User',
    subscription: 'enterprise'
  });
};

module.exports = {
  createTestUser,
  createTestRoute,
  cleanupTestData,
  mockRouteData,
  mockTrafficData,
  createTestAdmin,
  createTestPremiumUser,
  createTestEnterpriseUser
}; 