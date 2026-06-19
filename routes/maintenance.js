// Enhanced Maintenance Routes with scheduling and notification system
const express = require('express');
const admin = require('firebase-admin');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Initialize Firebase Admin SDK
const serviceAccount = require('../config/serviceAccount.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
}

const db = admin.firestore();

// Import verifyAuth from auth routes
const { verifyAuth } = require('./auth');

// @route   GET /api/maintenance/status
// @desc    Get maintenance mode status (public)
// @access  Public
router.get('/status', async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('maintenance').get();
    
    if (!doc.exists) {
      return res.json({
        success: true,
        maintenance: {
          isEnabled: false,
          message: 'الموقع يعمل بشكل طبيعي',
          enabledAt: null,
          enabledBy: null,
          scheduled: null
        }
      });
    }

    const maintenanceData = doc.data();
    res.json({
      success: true,
      maintenance: {
        isEnabled: maintenanceData.isEnabled,
        message: maintenanceData.message,
        enabledAt: maintenanceData.enabledAt ? maintenanceData.enabledAt.toDate() : null,
        enabledBy: maintenanceData.enabledBy,
        scheduledAt: maintenanceData.scheduledAt ? maintenanceData.scheduledAt.toDate() : null,
        estimatedDuration: maintenanceData.estimatedDuration || null,
        allowedIPs: maintenanceData.allowedIPs || [],
        allowedRoutes: maintenanceData.allowedRoutes || []
      }
    });

  } catch (error) {
    console.error('Get maintenance status error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance status',
      message: error.message
    });
  }
});

// @route   GET /api/maintenance/config
// @desc    Get maintenance configuration (admin only)
// @access  Private (Admin only)
router.get('/config', verifyAuth, async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('maintenance').get();
    
    const config = {
      isEnabled: false,
      message: 'الموقع يعمل بشكل طبيعي',
      enabledAt: null,
      enabledBy: null,
      scheduledAt: null,
      estimatedDuration: null,
      allowedIPs: [],
      allowedRoutes: [],
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookEnabled: false,
        webhookUrl: null
      },
      features: {
        allowReadOnly: false,
        allowAdminAccess: true,
        allowAPI: false,
        maintenancePage: 'default'
      }
    };

    if (doc.exists) {
      const data = doc.data();
      Object.assign(config, {
        isEnabled: data.isEnabled || false,
        message: data.message || 'الموقع تحت الصيانة',
        enabledAt: data.enabledAt ? data.enabledAt.toDate() : null,
        enabledBy: data.enabledBy,
        scheduledAt: data.scheduledAt ? data.scheduledAt.toDate() : null,
        estimatedDuration: data.estimatedDuration || null,
        allowedIPs: data.allowedIPs || [],
        allowedRoutes: data.allowedRoutes || [],
        notifications: data.notifications || config.notifications,
        features: data.features || config.features
      });
    }

    res.json({
      success: true,
      config: config
    });

  } catch (error) {
    console.error('Get maintenance config error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance configuration',
      message: error.message
    });
  }
});

// @route   POST /api/maintenance/enable
// @desc    Enable maintenance mode
// @access  Private (Admin only)
router.post('/enable', verifyAuth, [
  body('message').optional().isLength({ max: 500 }).withMessage('Message cannot exceed 500 characters'),
  body('estimatedDuration').optional().isInt({ min: 1, max: 1440 }).withMessage('Duration must be between 1 and 1440 minutes'),
  body('allowedIPs').optional().isArray().withMessage('Allowed IPs must be an array'),
  body('allowedRoutes').optional().isArray().withMessage('Allowed routes must be an array'),
  body('features').optional().isObject().withMessage('Features must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      message = 'الموقع تحت الصيانة حالياً. سنعود قريباً!',
      estimatedDuration,
      allowedIPs = [],
      allowedRoutes = [],
      features = {}
    } = req.body;

    // Check if maintenance is already enabled
    const existingDoc = await db.collection('settings').doc('maintenance').get();
    if (existingDoc.exists && existingDoc.data().isEnabled) {
      return res.status(400).json({
        error: 'Maintenance mode is already enabled'
      });
    }

    const maintenanceData = {
      isEnabled: true,
      message: message,
      enabledAt: admin.firestore.FieldValue.serverTimestamp(),
      enabledBy: req.user.uid,
      estimatedDuration: estimatedDuration || null,
      allowedIPs: allowedIPs,
      allowedRoutes: allowedRoutes,
      features: {
        allowReadOnly: features.allowReadOnly || false,
        allowAdminAccess: features.allowAdminAccess !== false,
        allowAPI: features.allowAPI || false,
        maintenancePage: features.maintenancePage || 'default'
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookEnabled: false,
        webhookUrl: null
      },
      statistics: {
        totalDowntime: 0,
        requestsBlocked: 0,
        allowedRequests: 0
      }
    };

    await db.collection('settings').doc('maintenance').set(maintenanceData);

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'enable_maintenance',
      resource: 'system',
      details: {
        message: message,
        estimatedDuration: estimatedDuration,
        allowedIPs: allowedIPs.length,
        allowedRoutes: allowedRoutes.length
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notifications (if configured)
    try {
      await sendMaintenanceNotifications('enabled', maintenanceData);
    } catch (notificationError) {
      console.error('Notification sending error:', notificationError);
    }

    res.json({
      success: true,
      message: 'Maintenance mode enabled successfully',
      maintenance: {
        isEnabled: true,
        message: message,
        enabledAt: new Date(),
        enabledBy: req.user.uid,
        estimatedDuration: estimatedDuration
      }
    });

  } catch (error) {
    console.error('Enable maintenance error:', error);
    res.status(500).json({
      error: 'Failed to enable maintenance mode',
      message: error.message
    });
  }
});

// @route   POST /api/maintenance/disable
// @desc    Disable maintenance mode
// @access  Private (Admin only)
router.post('/disable', verifyAuth, [
  body('message').optional().isLength({ max: 200 }).withMessage('Message cannot exceed 200 characters')
], async (req, res) => {
  try {
    const { message = 'الموقع عاد للعمل بشكل طبيعي!' } = req.body;

    // Check if maintenance is enabled
    const existingDoc = await db.collection('settings').doc('maintenance').get();
    if (!existingDoc.exists || !existingDoc.data().isEnabled) {
      return res.status(400).json({
        error: 'Maintenance mode is not enabled'
      });
    }

    const existingData = existingDoc.data();
    const enabledAt = existingData.enabledAt ? existingData.enabledAt.toDate() : new Date();
    const downtime = Date.now() - enabledAt.getTime();

    const updateData = {
      isEnabled: false,
      disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      disabledBy: req.user.uid,
      totalDowntime: downtime,
      finalMessage: message
    };

    await db.collection('settings').doc('maintenance').update(updateData);

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'disable_maintenance',
      resource: 'system',
      details: {
        downtime: downtime,
        finalMessage: message,
        requestsBlocked: existingData.statistics?.requestsBlocked || 0
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notifications (if configured)
    try {
      await sendMaintenanceNotifications('disabled', {
        ...existingData,
        ...updateData
      });
    } catch (notificationError) {
      console.error('Notification sending error:', notificationError);
    }

    res.json({
      success: true,
      message: 'Maintenance mode disabled successfully',
      downtime: downtime,
      finalMessage: message
    });

  } catch (error) {
    console.error('Disable maintenance error:', error);
    res.status(500).json({
      error: 'Failed to disable maintenance mode',
      message: error.message
    });
  }
});

// @route   POST /api/maintenance/schedule
// @desc    Schedule maintenance mode
// @access  Private (Admin only)
router.post('/schedule', verifyAuth, [
  body('scheduledAt').isISO8601().withMessage('Valid scheduled date is required'),
  body('message').optional().isLength({ max: 500 }).withMessage('Message cannot exceed 500 characters'),
  body('estimatedDuration').isInt({ min: 1, max: 1440 }).withMessage('Duration must be between 1 and 1440 minutes'),
  body('notifyBefore').optional().isInt({ min: 5, max: 1440 }).withMessage('Notify before must be between 5 and 1440 minutes')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      scheduledAt,
      message = 'الموقع سيكون تحت الصيانة قريباً',
      estimatedDuration,
      notifyBefore = 30
    } = req.body;

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({
        error: 'Scheduled time must be in the future'
      });
    }

    // Check for existing scheduled maintenance
    const existingDoc = await db.collection('settings').doc('maintenance').get();
    if (existingDoc.exists && existingDoc.data().scheduledAt) {
      const existingScheduled = existingDoc.data().scheduledAt.toDate();
      if (existingScheduled > new Date()) {
        return res.status(400).json({
          error: 'Maintenance is already scheduled for later time'
        });
      }
    }

    const scheduleData = {
      scheduledAt: admin.firestore.Timestamp.fromDate(scheduledDate),
      scheduledMessage: message,
      estimatedDuration: estimatedDuration,
      notifyBefore: notifyBefore,
      scheduledBy: req.user.uid,
      scheduledAtAdmin: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('settings').doc('maintenance').set({
      scheduledMaintenance: scheduleData,
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: req.user.uid
    }, { merge: true });

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'schedule_maintenance',
      resource: 'system',
      details: {
        scheduledAt: scheduledDate,
        message: message,
        estimatedDuration: estimatedDuration,
        notifyBefore: notifyBefore
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send immediate notification about scheduled maintenance
    try {
      await sendMaintenanceNotifications('scheduled', scheduleData);
    } catch (notificationError) {
      console.error('Scheduled notification error:', notificationError);
    }

    res.json({
      success: true,
      message: 'Maintenance scheduled successfully',
      scheduledAt: scheduledDate,
      estimatedDuration: estimatedDuration
    });

  } catch (error) {
    console.error('Schedule maintenance error:', error);
    res.status(500).json({
      error: 'Failed to schedule maintenance',
      message: error.message
    });
  }
});

// @route   DELETE /api/maintenance/schedule
// @desc    Cancel scheduled maintenance
// @access  Private (Admin only)
router.delete('/schedule', verifyAuth, async (req, res) => {
  try {
    await db.collection('settings').doc('maintenance').update({
      scheduledMaintenance: admin.firestore.FieldValue.delete(),
      scheduleCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      scheduleCancelledBy: req.user.uid
    });

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'cancel_scheduled_maintenance',
      resource: 'system',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Scheduled maintenance cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel scheduled maintenance error:', error);
    res.status(500).json({
      error: 'Failed to cancel scheduled maintenance',
      message: error.message
    });
  }
});

// @route   PUT /api/maintenance/config
// @desc    Update maintenance configuration
// @access  Private (Admin only)
router.put('/config', verifyAuth, [
  body('notifications').optional().isObject().withMessage('Notifications must be an object'),
  body('features').optional().isObject().withMessage('Features must be an object'),
  body('allowedIPs').optional().isArray().withMessage('Allowed IPs must be an array'),
  body('allowedRoutes').optional().isArray().withMessage('Allowed routes must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { notifications, features, allowedIPs, allowedRoutes } = req.body;

    const updateData = {
      lastModified: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: req.user.uid
    };

    if (notifications) updateData.notifications = notifications;
    if (features) updateData.features = features;
    if (allowedIPs) updateData.allowedIPs = allowedIPs;
    if (allowedRoutes) updateData.allowedRoutes = allowedRoutes;

    await db.collection('settings').doc('maintenance').set(updateData, { merge: true });

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'update_maintenance_config',
      resource: 'system',
      details: {
        notifications: !!notifications,
        features: !!features,
        allowedIPs: allowedIPs?.length || 0,
        allowedRoutes: allowedRoutes?.length || 0
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Maintenance configuration updated successfully'
    });

  } catch (error) {
    console.error('Update maintenance config error:', error);
    res.status(500).json({
      error: 'Failed to update maintenance configuration',
      message: error.message
    });
  }
});

// @route   GET /api/maintenance/history
// @desc    Get maintenance history
// @access  Private (Admin only)
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Get maintenance history from activity logs
    const historyQuery = await db.collection('activityLogs')
      .where('resource', '==', 'system')
      .where('action', 'in', ['enable_maintenance', 'disable_maintenance', 'schedule_maintenance', 'cancel_scheduled_maintenance'])
      .orderBy('timestamp', 'desc')
      .limit(limit * page)
      .get();

    const history = [];
    historyQuery.forEach(doc => {
      const data = doc.data();
      history.push({
        id: doc.id,
        action: data.action,
        userId: data.userId,
        details: data.details,
        timestamp: data.timestamp ? data.timestamp.toDate() : null,
        ipAddress: data.ipAddress
      });
    });

    const paginatedHistory = history.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      history: paginatedHistory,
      pagination: {
        page,
        limit,
        total: history.length,
        pages: Math.ceil(history.length / limit)
      }
    });

  } catch (error) {
    console.error('Get maintenance history error:', error);
    res.status(500).json({
      error: 'Failed to get maintenance history',
      message: error.message
    });
  }
});

// Helper function to send maintenance notifications
const sendMaintenanceNotifications = async (type, data) => {
  try {
    // Email notifications (if configured)
    if (data.notifications?.emailEnabled) {
      // Implement email sending logic here
      console.log(`Email notification: Maintenance ${type}`, data);
    }

    // SMS notifications (if configured)
    if (data.notifications?.smsEnabled) {
      // Implement SMS sending logic here
      console.log(`SMS notification: Maintenance ${type}`, data);
    }

    // Webhook notifications (if configured)
    if (data.notifications?.webhookEnabled && data.notifications?.webhookUrl) {
      // Implement webhook sending logic here
      console.log(`Webhook notification: Maintenance ${type}`, data);
    }
  } catch (error) {
    console.error('Notification sending error:', error);
    throw error;
  }
};

module.exports = router;