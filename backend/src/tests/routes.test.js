const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../index');
const User = require('../models/User');
const Route = require('../models/Route');

describe('Routes API', () => {
  let token;
  let userId;
  let testRoute;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI_TEST, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Create test user
    const user = await User.create({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    });
    userId = user._id;

    // Generate JWT token
    token = jwt.sign(
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
      }
    });
  });

  afterEach(async () => {
    await Route.deleteMany({});
  });

  describe('POST /api/routes', () => {
    it('should create a new route', async () => {
      const response = await request(app)
        .post('/api/routes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Route',
          startLocation: {
            name: 'Home',
            coordinates: [0, 0]
          },
          endLocation: {
            name: 'Work',
            coordinates: [1, 1]
          },
          preferences: {
            profile: 'driving-car',
            avoidHighways: false,
            avoidTolls: true
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.route).toHaveProperty('name', 'New Route');
      expect(response.body.route).toHaveProperty('user', userId.toString());
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/routes')
        .send({
          name: 'New Route',
          startLocation: {
            name: 'Home',
            coordinates: [0, 0]
          },
          endLocation: {
            name: 'Work',
            coordinates: [1, 1]
          }
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/routes', () => {
    it('should get all routes for user', async () => {
      const response = await request(app)
        .get('/api/routes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.routes)).toBe(true);
      expect(response.body.routes.length).toBe(1);
      expect(response.body.routes[0]).toHaveProperty('name', 'Test Route');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/routes');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/routes/:id', () => {
    it('should get a specific route', async () => {
      const response = await request(app)
        .get(`/api/routes/${testRoute._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.route).toHaveProperty('name', 'Test Route');
    });

    it('should return 404 for non-existent route', async () => {
      const response = await request(app)
        .get(`/api/routes/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/routes/:id', () => {
    it('should update a route', async () => {
      const response = await request(app)
        .put(`/api/routes/${testRoute._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Route'
        });

      expect(response.status).toBe(200);
      expect(response.body.route).toHaveProperty('name', 'Updated Route');
    });

    it('should return 403 when updating another user\'s route', async () => {
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
        .put(`/api/routes/${testRoute._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          name: 'Updated Route'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/routes/:id', () => {
    it('should delete a route', async () => {
      const response = await request(app)
        .delete(`/api/routes/${testRoute._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const deletedRoute = await Route.findById(testRoute._id);
      expect(deletedRoute).toBeNull();
    });

    it('should return 403 when deleting another user\'s route', async () => {
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
        .delete(`/api/routes/${testRoute._id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/routes/:id/share', () => {
    it('should share a route with another user', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        password: 'password123',
        name: 'Other User'
      });

      const response = await request(app)
        .post(`/api/routes/${testRoute._id}/share`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          userId: otherUser._id,
          permissions: ['view']
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Route shared successfully');

      const updatedRoute = await Route.findById(testRoute._id);
      expect(updatedRoute.sharedWith).toHaveLength(1);
      expect(updatedRoute.sharedWith[0].user.toString()).toBe(otherUser._id.toString());
    });
  });

  describe('GET /api/routes/:id/traffic', () => {
    it('should get traffic data for a route', async () => {
      const response = await request(app)
        .get(`/api/routes/${testRoute._id}/traffic`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trafficData');
    });

    it('should return 403 for non-premium users', async () => {
      const freeUser = await User.create({
        email: 'free@example.com',
        password: 'password123',
        name: 'Free User',
        subscription: 'free'
      });

      const freeToken = jwt.sign(
        { userId: freeUser._id },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get(`/api/routes/${testRoute._id}/traffic`)
        .set('Authorization', `Bearer ${freeToken}`);

      expect(response.status).toBe(403);
    });
  });
}); 