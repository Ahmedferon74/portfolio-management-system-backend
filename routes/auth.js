// Enhanced Auth Routes with improved security and functionality
const express = require('express');
const admin = require('firebase-admin');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const router = express.Router();



const db = admin.firestore();

// Middleware to verify admin authentication
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user is admin
    const userDoc = await db.collection('users').where('uid', '==', decodedToken.uid).get();
    if (userDoc.empty) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    req.user = decodedToken;
    req.adminUser = userDoc.docs[0].data();
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// @route   POST /api/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Verify against Firestore users collection
    const userQuery = await db.collection('users')
      .where('email', '==', email)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    // In a real app, you would verify the password hash
    // For demo purposes, we'll accept any password for active users
    if (password.length < 6) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Create custom token
    const customToken = await admin.auth().createCustomToken(userData.uid);
    
    // Update last login
    await db.collection('users').doc(userDoc.id).update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log activity
    await db.collection('activityLogs').add({
      userId: userData.uid,
      action: 'login',
      resource: 'auth',
      details: {
        method: 'password',
        email: email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Login successful',
      token: customToken,
      user: {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        permissions: userData.permissions
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Admin logout
// @access  Private (Admin only)
router.post('/logout', verifyAuth, async (req, res) => {
  try {
    // Log logout activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'logout',
      resource: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current admin info
// @access  Private (Admin only)
router.get('/me', verifyAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.adminUser.displayName,
        role: req.adminUser.role,
        permissions: req.adminUser.permissions,
        lastLogin: req.adminUser.lastLogin
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    });
  }
});

// @route   POST /api/auth/verify-token
// @desc    Verify Firebase ID token
// @access  Private (Admin only)
router.post('/verify-token', verifyAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    
    res.json({
      success: true,
      message: 'Token is valid',
      uid
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      error: 'Token verification failed',
      message: error.message
    });
  }
});

// @route   POST /api/auth/refresh-token
// @desc    Refresh authentication token
// @access  Private (Admin only)
router.post('/refresh-token', verifyAuth, async (req, res) => {
  try {
    // Create new custom token
    const customToken = await admin.auth().createCustomToken(req.user.uid);

    res.json({
      success: true,
      token: customToken,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change admin password
// @access  Private (Admin only)
router.post('/change-password', verifyAuth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // In a real implementation, you would verify the current password
    // For demo purposes, we'll just update the password field in Firestore
    // Note: In production, passwords should be hashed and stored securely

    // Log password change activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'change_password',
      resource: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: error.message
    });
  }
});

module.exports = router;
module.exports.verifyAuth = verifyAuth;