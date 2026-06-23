// =====================================================================
// maintenance.js - Backend Routes (Fixed)
// الإصلاحات:
// 1. توحيد المسارات - كلها تحت /api/maintenance
// 2. endpoint عام للتحقق من حالة الصيانة بدون توكن
// 3. endpoints محمية للأدمن فقط
// =====================================================================

const express = require('express');
const admin   = require('firebase-admin');
const { body, validationResult } = require('express-validator');
const { verifyAuth } = require('../middleware/auth');

const router = express.Router();
const getDb  = () => admin.firestore();

// ── Helper ──────────────────────────────────────────────────────────

const getMaintenanceDoc = async () => {
  const db  = getDb();
  const doc = await db.collection('settings').doc('maintenance').get();
  return { doc, data: doc.exists ? doc.data() : null };
};

// =====================================================================
// PUBLIC ROUTES (بدون توكن)
// =====================================================================

/**
 * GET /api/maintenance/status
 * جلب حالة الصيانة - متاح للجميع
 */
router.get('/status', async (req, res) => {
  try {
    const { data } = await getMaintenanceDoc();

    if (!data) {
      return res.json({
        success:     true,
        isEnabled:   false,
        message:     '',
        messageEn:   '',
        scheduledEnd: null,
      });
    }

    res.json({
      success:      true,
      isEnabled:    data.isEnabled     || false,
      message:      data.message       || '',
      messageEn:    data.messageEn     || '',
      reason:       data.reason        || '',
      scheduledEnd: data.scheduledEnd  || null,
      enabledAt:    data.enabledAt?.toDate?.() || null,
    });
  } catch (error) {
    console.error('Get maintenance status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================================
// ADMIN ROUTES (محتاج توكن أدمن)
// =====================================================================

/**
 * GET /api/maintenance/config
 * جلب كامل إعدادات الصيانة - Admin only
 */
router.get('/config', verifyAuth, async (req, res) => {
  try {
    const { data } = await getMaintenanceDoc();

    res.json({
      success:  true,
      settings: {
        isEnabled:        data?.isEnabled        || false,
        message:          data?.message          || '',
        messageEn:        data?.messageEn        || '',
        reason:           data?.reason           || '',
        allowAdminAccess: data?.allowAdminAccess !== false,
        scheduledEnd:     data?.scheduledEnd     || '',
        enabledAt:        data?.enabledAt?.toDate?.() || null,
        enabledBy:        data?.enabledBy        || null,
        updatedAt:        data?.updatedAt?.toDate?.() || null,
      },
    });
  } catch (error) {
    console.error('Get maintenance config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/maintenance/enable
 * تفعيل وضع الصيانة - Admin only
 */
router.post('/enable', verifyAuth, [
  body('message').optional().isLength({ max: 500 }),
  body('messageEn').optional().isLength({ max: 500 }),
  body('reason').optional().isLength({ max: 200 }),
  body('scheduledEnd').optional(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const db = getDb();
    const {
      message     = 'الموقع تحت الصيانة حالياً. سنعود قريباً!',
      messageEn   = 'The site is currently under maintenance. We\'ll be back soon!',
      reason      = '',
      scheduledEnd = '',
      allowAdminAccess = true,
    } = req.body;

    await db.collection('settings').doc('maintenance').set({
      isEnabled:        true,
      message,
      messageEn,
      reason,
      allowAdminAccess,
      scheduledEnd,
      enabledAt:  admin.firestore.FieldValue.serverTimestamp(),
      enabledBy:  req.user.uid,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // سجل النشاط
    await db.collection('activityLogs').add({
      userId:    req.user.uid,
      action:    'enable_maintenance',
      resource:  'system',
      details:   { message, reason },
      ipAddress: req.ip,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: 'Maintenance mode enabled' });
  } catch (error) {
    console.error('Enable maintenance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/maintenance/disable
 * إيقاف وضع الصيانة - Admin only
 */
router.post('/disable', verifyAuth, async (req, res) => {
  try {
    const db = getDb();

    await db.collection('settings').doc('maintenance').set({
      isEnabled:   false,
      disabledAt:  admin.firestore.FieldValue.serverTimestamp(),
      disabledBy:  req.user.uid,
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // سجل النشاط
    await db.collection('activityLogs').add({
      userId:    req.user.uid,
      action:    'disable_maintenance',
      resource:  'system',
      ipAddress: req.ip,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: 'Maintenance mode disabled' });
  } catch (error) {
    console.error('Disable maintenance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/maintenance/settings
 * تحديث إعدادات الصيانة - Admin only
 */
router.put('/settings', verifyAuth, [
  body('message').optional().isLength({ max: 500 }),
  body('messageEn').optional().isLength({ max: 500 }),
  body('reason').optional().isLength({ max: 200 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const db = getDb();
    const updates = {};

    const fields = ['message', 'messageEn', 'reason', 'scheduledEnd', 'allowAdminAccess'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    updates.updatedAt  = admin.firestore.FieldValue.serverTimestamp();
    updates.updatedBy  = req.user.uid;

    await db.collection('settings').doc('maintenance').set(updates, { merge: true });

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Update maintenance settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;