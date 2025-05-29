const express = require('express');
const router = express.Router();
const Route = require('../models/Route');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Get overall analytics (admin only)
router.get('/overall', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const [
      totalUsers,
      totalRoutes,
      activeRoutes,
      completedRoutes
    ] = await Promise.all([
      User.countDocuments(),
      Route.countDocuments(),
      Route.countDocuments({ status: 'active' }),
      Route.countDocuments({ status: 'completed' })
    ]);

    // Get route completion rate
    const completionRate = totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0;

    // Get average route duration
    const routes = await Route.find({ status: 'completed' });
    const totalDuration = routes.reduce((sum, route) => sum + route.routeData.properties.duration, 0);
    const averageDuration = routes.length > 0 ? totalDuration / routes.length : 0;

    // Get most popular routes
    const popularRoutes = await Route.find()
      .sort({ 'analytics.views': -1 })
      .limit(5)
      .populate('user', 'name email');

    // Get user growth over time
    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      totalUsers,
      totalRoutes,
      activeRoutes,
      completedRoutes,
      completionRate,
      averageDuration,
      popularRoutes,
      userGrowth
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching overall analytics' });
  }
});

// Get user-specific analytics
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const routes = await Route.find({ user: req.user.userId });

    // Calculate user statistics
    const totalRoutes = routes.length;
    const completedRoutes = routes.filter(route => route.status === 'completed').length;
    const completionRate = totalRoutes > 0 ? (completedRoutes / totalRoutes) * 100 : 0;

    // Calculate total distance and duration
    const totalDistance = routes.reduce((sum, route) => sum + route.routeData.properties.distance, 0);
    const totalDuration = routes.reduce((sum, route) => sum + route.routeData.properties.duration, 0);

    // Get most frequent destinations
    const destinations = routes.reduce((acc, route) => {
      const dest = route.endLocation.name;
      acc[dest] = (acc[dest] || 0) + 1;
      return acc;
    }, {});

    const frequentDestinations = Object.entries(destinations)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Get route history
    const routeHistory = routes
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(route => ({
        id: route._id,
        name: route.name,
        startLocation: route.startLocation.name,
        endLocation: route.endLocation.name,
        status: route.status,
        createdAt: route.createdAt,
        completedAt: route.status === 'completed' ? route.updatedAt : null
      }));

    res.json({
      totalRoutes,
      completedRoutes,
      completionRate,
      totalDistance,
      totalDuration,
      frequentDestinations,
      routeHistory
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user analytics' });
  }
});

// Get route-specific analytics
router.get('/route/:id', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.isAccessibleTo(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get route statistics
    const stats = {
      views: route.analytics.views,
      completions: route.analytics.completions,
      averageDuration: route.analytics.averageDuration,
      lastUsed: route.analytics.lastUsed,
      sharedWith: route.sharedWith.length
    };

    // Get traffic data if available
    const trafficData = route.trafficData ? {
      lastUpdated: route.trafficData.lastUpdated,
      congestion: route.trafficData.congestion,
      averageSpeed: route.trafficData.averageSpeed
    } : null;

    res.json({
      stats,
      trafficData
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching route analytics' });
  }
});

// Track user activity
router.post('/track', authenticateToken, async (req, res) => {
  try {
    const { action, data } = req.body;

    // Log the activity (implement your logging system here)
    console.log(`User ${req.user.userId} performed ${action}:`, data);

    res.json({ message: 'Activity tracked' });
  } catch (error) {
    res.status(500).json({ error: 'Error tracking activity' });
  }
});

module.exports = router; 