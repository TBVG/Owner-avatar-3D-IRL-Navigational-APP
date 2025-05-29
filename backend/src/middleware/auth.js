const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate JWT token
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Middleware to check if user has required role
exports.requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Error checking permissions' });
    }
  };
};

// Middleware to check if user has required subscription
exports.requireSubscription = (subscriptions) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!subscriptions.includes(user.subscription)) {
        return res.status(403).json({ error: 'Subscription required' });
      }

      if (!user.hasActiveSubscription()) {
        return res.status(403).json({ error: 'Subscription expired' });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Error checking subscription' });
    }
  };
};

// Middleware to check API key
exports.authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const user = await User.findOne({ apiKey });

    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (user.subscription !== 'enterprise') {
      return res.status(403).json({ error: 'Enterprise subscription required' });
    }

    req.user = { userId: user._id };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error authenticating API key' });
  }
}; 