const express = require('express');
const router = express.Router();
const Route = require('../models/Route');
const { authenticateToken, requireSubscription } = require('../middleware/auth');
const fetch = require('node-fetch');

// Create new route
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      startLocation,
      endLocation,
      waypoints,
      preferences
    } = req.body;

    // Get route data from OpenRouteService
    const coordinates = [
      startLocation.coordinates,
      ...(waypoints || []).map(wp => wp.coordinates),
      endLocation.coordinates
    ];

    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/${preferences.profile}?api_key=${process.env.OPENROUTE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
        },
        body: JSON.stringify({
          coordinates,
          instructions: true,
          preference: preferences.profile,
          avoid_features: [
            ...(preferences.avoidHighways ? ['highways'] : []),
            ...(preferences.avoidTolls ? ['tollways'] : [])
          ]
        })
      }
    );

    const routeData = await response.json();

    if (!routeData.features || routeData.features.length === 0) {
      return res.status(400).json({ error: 'Could not find route' });
    }

    // Create route in database
    const route = new Route({
      user: req.user.userId,
      name,
      startLocation,
      endLocation,
      waypoints,
      routeData: routeData.features[0],
      preferences
    });

    await route.save();

    // Add to user's saved routes
    const user = await User.findById(req.user.userId);
    user.savedRoutes.push(route._id);
    await user.save();

    res.status(201).json({ route });
  } catch (error) {
    res.status(500).json({ error: 'Error creating route' });
  }
});

// Get user's routes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const routes = await Route.find({ user: req.user.userId })
      .sort({ createdAt: -1 });

    res.json({ routes });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching routes' });
  }
});

// Get shared routes
router.get('/shared', authenticateToken, async (req, res) => {
  try {
    const routes = await Route.find({
      'sharedWith.user': req.user.userId
    }).populate('user', 'name email');

    res.json({ routes });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching shared routes' });
  }
});

// Get route by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id)
      .populate('user', 'name email')
      .populate('sharedWith.user', 'name email');

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.isAccessibleTo(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update analytics
    route.analytics.views += 1;
    route.analytics.lastUsed = new Date();
    await route.save();

    res.json({ route });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching route' });
  }
});

// Update route
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.user.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedRoute = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.json({ route: updatedRoute });
  } catch (error) {
    res.status(500).json({ error: 'Error updating route' });
  }
});

// Share route
router.post('/:id/share', authenticateToken, async (req, res) => {
  try {
    const { userId, permissions } = req.body;
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.user.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await route.shareWith(userId, permissions);

    res.json({ message: 'Route shared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error sharing route' });
  }
});

// Get route traffic data
router.get('/:id/traffic', authenticateToken, requireSubscription(['premium', 'enterprise']), async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.isAccessibleTo(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get real-time traffic data from OpenRouteService
    const response = await fetch(
      `https://api.openrouteservice.org/v2/traffic?api_key=${process.env.OPENROUTE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          coordinates: route.routeData.geometry.coordinates
        })
      }
    );

    const trafficData = await response.json();

    // Update route with new traffic data
    await route.updateTrafficData(trafficData);

    res.json({ trafficData });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching traffic data' });
  }
});

// Complete route
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.user.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    route.status = 'completed';
    route.analytics.completions += 1;
    await route.save();

    res.json({ message: 'Route completed' });
  } catch (error) {
    res.status(500).json({ error: 'Error completing route' });
  }
});

// Delete route
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.user.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await route.remove();

    // Remove from user's saved routes
    const user = await User.findById(req.user.userId);
    user.savedRoutes = user.savedRoutes.filter(id => !id.equals(route._id));
    await user.save();

    res.json({ message: 'Route deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting route' });
  }
});

module.exports = router; 