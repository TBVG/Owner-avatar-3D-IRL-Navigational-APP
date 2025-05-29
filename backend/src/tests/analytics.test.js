const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Route = require('../models/Route');

describe('Analytics API', () => {
  let adminToken;
  let userToken;
  let adminId;
  let userId;
  let testRoute;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI_TEST, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Create admin user
    const admin = await User.create({
      email: 'admin@example.com',
      password: 'password123',
      name: 'Admin User',
      role: 'admin'
    });
    adminId = admin._id;

    // Create regular user
    const user = await User.create({
      email: 'user@example.com',
      password: 'password123',
      name: 'Regular User',
      role: 'user'
    });
    userId = user._id;

    // Generate JWT tokens
    adminToken = jwt.sign(
      { userId: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    userToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({});
    await Route.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create test route
    testRoute = await Route.create({
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
      },
      analytics: {
        views: 5,
        completions: 2,
        averageDuration: 550,
        lastUsed: new Date()
      }
    });
  });

  afterEach(async () => {
    await Route.deleteMany({});
  });

  describe('GET /api/analytics/overall', () => {
    it('should get overall analytics for admin', async () => {
      const response = await request(app)
        .get('/api/analytics/overall')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalUsers');
      expect(response.body).toHaveProperty('totalRoutes');
      expect(response.body).toHaveProperty('activeRoutes');
      expect(response.body).toHaveProperty('completedRoutes');
      expect(response.body).toHaveProperty('completionRate');
      expect(response.body).toHaveProperty('averageDuration');
      expect(response.body).toHaveProperty('popularRoutes');
      expect(response.body).toHaveProperty('userGrowth');
    });

    it('should return 403 for non-admin users', async () => {
      const response = await request(app)
        .get('/api/analytics/overall')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/overall');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/user', () => {
    it('should get user-specific analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/user')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalRoutes');
      expect(response.body).toHaveProperty('completedRoutes');
      expect(response.body).toHaveProperty('completionRate');
      expect(response.body).toHaveProperty('totalDistance');
      expect(response.body).toHaveProperty('totalDuration');
      expect(response.body).toHaveProperty('frequentDestinations');
      expect(response.body).toHaveProperty('routeHistory');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/user');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/route/:id', () => {
    it('should get route-specific analytics', async () => {
      const response = await request(app)
        .get(`/api/analytics/route/${testRoute._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('views', 5);
      expect(response.body.stats).toHaveProperty('completions', 2);
      expect(response.body.stats).toHaveProperty('averageDuration', 550);
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app)
        .get(`/api/analytics/route/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for unauthorized access', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        password: 'password123',
        name: 'Other User'
      });

      const otherToken = jwt.sign(
        { userId: otherUser._id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/analytics/route/${testRoute._id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/analytics/track', () => {
    it('should track user activity', async () => {
      const response = await request(app)
        .post('/api/analytics/track')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          action: 'view_route',
          data: {
            routeId: testRoute._id,
            timestamp: new Date()
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Activity tracked');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/analytics/track')
        .send({
          action: 'view_route',
          data: {
            routeId: testRoute._id,
            timestamp: new Date()
          }
        });

      expect(response.status).toBe(401);
    });
  });
}); 