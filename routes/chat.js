// =====================================================================
// chat.js - Backend Chat Routes (Fixed Version)
// الإصلاحات:
// 1. حل تعارض الـ routes بين /rooms/join و /rooms/:roomId
// 2. تصحيح التحقق من الملكية
// 3. إضافة polling endpoint
// 4. تنظيم أولوية الـ routes بشكل صحيح
// =====================================================================

const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

const router = express.Router();
const getDb = () => admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

// تحقق من التوكن بدون throw
const verifyAdminToken = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    await admin.auth().verifyIdToken(authHeader.split(' ')[1]);
    return true;
  } catch {
    return false;
  }
};

// تحقق من ملكية الغرفة (أدمن أو زائر صاحب الغرفة)
const verifyRoomOwnership = async (req, roomData) => {
  const isAdmin = await verifyAdminToken(req);
  if (isAdmin) return { authorized: true, isAdmin: true };

  const visitorEmail = req.body?.visitorEmail || req.query?.visitorEmail;
  const password     = req.body?.password     || req.query?.password;

  if (!visitorEmail) {
    return { authorized: false, error: 'VISITOR_EMAIL_REQUIRED' };
  }

  if (roomData.visitorEmail.toLowerCase() !== visitorEmail.toLowerCase()) {
    return { authorized: false, error: 'NOT_AUTHORIZED' };
  }

  if (roomData.hasPassword) {
    if (!password) return { authorized: false, error: 'PASSWORD_REQUIRED' };
    if (hashPassword(password) !== roomData.password) {
      return { authorized: false, error: 'INVALID_PASSWORD' };
    }
  }

  return { authorized: true, isAdmin: false };
};

// ── Rate limiting لـ join (حماية من brute-force) ─────────────────────

const joinAttempts = new Map();
const MAX_JOIN_ATTEMPTS = 5;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

const checkJoinRateLimit = (ip, roomNumber) => {
  const key = `${ip}:${roomNumber}`;
  const now = Date.now();
  const record = joinAttempts.get(key);

  if (!record || now - record.firstAttempt > JOIN_WINDOW_MS) {
    joinAttempts.set(key, { count: 1, firstAttempt: now });
    return true;
  }
  if (record.count >= MAX_JOIN_ATTEMPTS) return false;
  record.count += 1;
  return true;
};

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of joinAttempts.entries()) {
    if (now - record.firstAttempt > JOIN_WINDOW_MS) joinAttempts.delete(key);
  }
}, 60 * 60 * 1000);

// =====================================================================
// ⚠️ مهم جداً: الـ routes الثابتة (static) لازم تيجي قبل الـ dynamic
// عشان Express ما يعملش تعارض بين /rooms/join و /rooms/:roomId
// =====================================================================

// ── Static Routes (بدون params) ──────────────────────────────────────

/**
 * GET /api/chat/rooms
 * جلب كل الغرف - Admin only
 */
router.get('/rooms', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const db = getDb();
    const { status } = req.query;

    let query = db.collection('chatRooms').orderBy('lastMessageAt', 'desc');

    if (status === 'active')  query = db.collection('chatRooms').where('isEnded', '==', false).orderBy('lastMessageAt', 'desc');
    if (status === 'ended')   query = db.collection('chatRooms').where('isEnded', '==', true).orderBy('lastMessageAt', 'desc');

    const snapshot = await query.limit(50).get();

    const rooms = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id:           doc.id,
        roomNumber:   d.roomNumber,
        visitorName:  d.visitorName,
        visitorEmail: d.visitorEmail,
        lastMessage:  d.lastMessage || '',
        hasPassword:  d.hasPassword || false,
        isEnded:      d.isEnded     || false,
        messageCount: d.messageCount || 0,
        createdAt:    d.createdAt?.toDate?.()     || new Date(),
        lastMessageAt: d.lastMessageAt?.toDate?.() || new Date(),
      };
    });

    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/rooms
 * إنشاء غرفة جديدة - Visitors
 */
router.post('/rooms', async (req, res) => {
  try {
    const { visitorName, visitorEmail, roomNumber, password } = req.body;

    if (!visitorName || !visitorEmail || !roomNumber) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'visitorName, visitorEmail, and roomNumber are required'
      });
    }

    // التحقق من صحة الإيميل
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(visitorEmail)) {
      return res.status(400).json({ success: false, error: 'INVALID_EMAIL' });
    }

    const db = getDb();

    // تحقق إن رقم الغرفة مش مستخدم
    const existingRoom = await db.collection('chatRooms')
      .where('roomNumber', '==', roomNumber.trim())
      .where('isEnded', '==', false)
      .limit(1).get();

    if (!existingRoom.empty) {
      return res.status(400).json({ success: false, error: 'ROOM_IN_USE' });
    }

    const roomId         = `room_${roomNumber.trim()}_${Date.now()}`;
    const hashedPassword = password ? hashPassword(password.trim()) : null;

    await db.collection('chatRooms').doc(roomId).set({
      roomId,
      roomNumber:   roomNumber.trim(),
      visitorName:  visitorName.trim(),
      visitorEmail: visitorEmail.toLowerCase().trim(),
      hasPassword:  !!hashedPassword,
      password:     hashedPassword,
      status:       'active',
      isEnded:      false,
      messageCount: 0,
      lastMessage:  '',
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    // رسالة ترحيب تلقائية من الأدمن
    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content:   language === 'ar'
        ? 'مرحباً! كيف يمكنني مساعدتك؟'
        : 'Welcome! How can I help you today?',
      sender:    'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // تحديث lastMessage بعد الرسالة الترحيبية
    await db.collection('chatRooms').doc(roomId).update({
      lastMessage: 'Welcome! How can I help you today?'
    });

    res.status(201).json({ success: true, roomId, roomNumber: roomNumber.trim() });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/rooms/join
 * الانضمام لغرفة موجودة - Visitors
 * ⚠️ لازم تيجي قبل /rooms/:roomId عشان ما يتعارضوش
 */
router.post('/rooms/join', async (req, res) => {
  try {
    const { roomNumber, password, visitorEmail } = req.body;

    if (!roomNumber || !visitorEmail) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'roomNumber and visitorEmail are required'
      });
    }

    // Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkJoinRateLimit(clientIp, roomNumber)) {
      return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS' });
    }

    const db = getDb();
    const roomQuery = await db.collection('chatRooms')
      .where('roomNumber', '==', roomNumber.trim())
      .where('isEnded', '==', false)
      .limit(1).get();

    if (roomQuery.empty) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomDoc  = roomQuery.docs[0];
    const roomData = roomDoc.data();

    // تحقق من الإيميل
    if (roomData.visitorEmail.toLowerCase() !== visitorEmail.toLowerCase().trim()) {
      return res.status(401).json({ success: false, error: 'INVALID_EMAIL' });
    }

    // تحقق من الباسورد لو الغرفة محمية
    if (roomData.hasPassword) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'PASSWORD_REQUIRED' });
      }
      if (hashPassword(password) !== roomData.password) {
        return res.status(401).json({ success: false, error: 'INVALID_PASSWORD' });
      }
    }

    res.json({
      success:     true,
      roomId:      roomDoc.id,
      roomNumber:  roomData.roomNumber,
      visitorName: roomData.visitorName,
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/rooms/check/:roomNumber
 * التحقق من توافر رقم الغرفة
 */
router.get('/rooms/check/:roomNumber', async (req, res) => {
  try {
    const { roomNumber } = req.params;
    const db = getDb();

    const roomQuery = await db.collection('chatRooms')
      .where('roomNumber', '==', roomNumber)
      .where('isEnded', '==', false)
      .limit(1).get();

    res.json({ success: true, available: roomQuery.empty });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Dynamic Routes (مع params) ───────────────────────────────────────

/**
 * GET /api/chat/rooms/:roomId
 * جلب غرفة بمعلوماتها - Admin or room owner
 */
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomData = roomDoc.data();
    const ownership = await verifyRoomOwnership(req, roomData);

    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED' });
    }

    res.json({
      success: true,
      room: {
        id:          roomDoc.id,
        roomNumber:  roomData.roomNumber,
        visitorName: roomData.visitorName,
        isEnded:     roomData.isEnded,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/rooms/:roomId/messages
 * جلب رسائل غرفة - Admin or room owner
 */
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND', messages: [] });
    }

    const roomData = roomDoc.data();
    const ownership = await verifyRoomOwnership(req, roomData);

    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED', messages: [] });
    }

    const snapshot = await db.collection('chatRooms')
      .doc(roomId).collection('messages')
      .orderBy('createdAt', 'asc')
      .get();

    const messages = snapshot.docs.map(doc => ({
      id:        doc.id,
      content:   doc.data().content,
      sender:    doc.data().sender,
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));

    res.json({ success: true, messages, isEnded: roomData.isEnded || false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, messages: [] });
  }
});

/**
 * POST /api/chat/rooms/:roomId/messages
 * إرسال رسالة - Admin or room owner
 */
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId }    = req.params;
    const { content, message, sender } = req.body;
    const messageContent = (content || message || '').trim();

    if (!messageContent) {
      return res.status(400).json({ success: false, error: 'CONTENT_REQUIRED' });
    }

    const db = getDb();
    const roomDoc = await db.collection('chatRooms').doc(roomId).get();

    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomData = roomDoc.data();

    if (roomData.isEnded) {
      return res.status(400).json({ success: false, error: 'ROOM_ENDED' });
    }

    const ownership = await verifyRoomOwnership(req, roomData);
    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED' });
    }

    // الأدمن دايماً sender = 'admin'، الزائر دايماً sender = 'visitor'
    const senderType = ownership.isAdmin ? 'admin' : 'visitor';

    const msgRef = await db.collection('chatRooms').doc(roomId)
      .collection('messages').add({
        content:   messageContent,
        sender:    senderType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('chatRooms').doc(roomId).update({
      lastMessage:   messageContent.substring(0, 100),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSender: senderType,
      messageCount:  admin.firestore.FieldValue.increment(1),
    });

    res.status(201).json({
      success: true,
      message: {
        id:        msgRef.id,
        content:   messageContent,
        sender:    senderType,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/chat/rooms/:roomId/end
 * إنهاء غرفة - Admin only
 */
router.put('/rooms/:roomId/end', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const { roomId } = req.params;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    await db.collection('chatRooms').doc(roomId).update({
      isEnded:  true,
      status:   'ended',
      endedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content:   'تم إنهاء المحادثة من قِبل الإدارة',
      sender:    'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/chat/rooms/:roomId/visitor-end
 * إنهاء غرفة من الزائر
 */
router.put('/rooms/:roomId/visitor-end', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomData = roomDoc.data();
    const ownership = await verifyRoomOwnership(req, roomData);

    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED' });
    }

    await db.collection('chatRooms').doc(roomId).update({
      isEnded: true,
      status:  'ended',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content:   'تم إنهاء المحادثة من قِبل الزائر',
      sender:    'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/chat/rooms/:roomId
 * حذف غرفة - Admin only
 */
router.delete('/rooms/:roomId', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const { roomId } = req.params;
    const db = getDb();

    // حذف كل الرسائل أولاً
    const messagesSnapshot = await db.collection('chatRooms').doc(roomId)
      .collection('messages').get();

    const batch = db.batch();
    messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    await db.collection('chatRooms').doc(roomId).delete();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;