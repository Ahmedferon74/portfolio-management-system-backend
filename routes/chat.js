// Chat Routes - Secured Version with proper ownership verification
const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

const router = express.Router();
const getDb = () => admin.firestore();

// Simple password hash
const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

// Verify admin token helper
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

// ====================================================================
// Ownership verification helper
// بيتأكد إن صاحب الطلب فعلاً هو صاحب الغرفة (نفس الإيميل + الباسورد
// لو الغرفة محمية) قبل ما يسمح له بقراءة أو كتابة الرسائل.
// لو الطلب جاي من أدمن (Bearer token صحيح) بيعدي على طول.
// ====================================================================
const verifyRoomOwnership = async (req, roomData) => {
  // الأدمن له صلاحية كاملة على أي غرفة
  const isAdmin = await verifyAdminToken(req);
  if (isAdmin) return { authorized: true, isAdmin: true };

  // الزائر لازم يبعت إيميله للتحقق من ملكية الغرفة
  // نقبله من query string (GET) أو من body (POST/PUT)
  const visitorEmail = req.body?.visitorEmail || req.query?.visitorEmail;
  const password = req.body?.password || req.query?.password;

  if (!visitorEmail) {
    return { authorized: false, isAdmin: false, error: 'VISITOR_EMAIL_REQUIRED' };
  }

  if (roomData.visitorEmail.toLowerCase() !== visitorEmail.toLowerCase()) {
    return { authorized: false, isAdmin: false, error: 'NOT_AUTHORIZED' };
  }

  if (roomData.hasPassword) {
    if (!password) {
      return { authorized: false, isAdmin: false, error: 'PASSWORD_REQUIRED' };
    }
    if (hashPassword(password) !== roomData.password) {
      return { authorized: false, isAdmin: false, error: 'INVALID_PASSWORD' };
    }
  }

  return { authorized: true, isAdmin: false };
};

// ====================================================================
// Rate limiting بسيط في الميموري لمحاولات الانضمام للغرفة (join)
// عشان نمنع تخمين الباسورد بالقوة (brute-force). ده تخزين مؤقت
// في ذاكرة السيرفر، فهيتصفّر لو السيرفر اعاد التشغيل، وهو كافي
// كحماية أساسية لمشروع بهذا الحجم.
// ====================================================================
const joinAttempts = new Map(); // key: `${ip}:${roomNumber}` -> { count, firstAttempt }
const MAX_JOIN_ATTEMPTS = 5;
const JOIN_WINDOW_MS = 10 * 60 * 1000; // 10 دقائق

const checkJoinRateLimit = (ip, roomNumber) => {
  const key = `${ip}:${roomNumber}`;
  const now = Date.now();
  const record = joinAttempts.get(key);

  if (!record || now - record.firstAttempt > JOIN_WINDOW_MS) {
    joinAttempts.set(key, { count: 1, firstAttempt: now });
    return true;
  }

  if (record.count >= MAX_JOIN_ATTEMPTS) {
    return false;
  }

  record.count += 1;
  return true;
};

// تنظيف دوري للذاكرة من المحاولات القديمة كل ساعة
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of joinAttempts.entries()) {
    if (now - record.firstAttempt > JOIN_WINDOW_MS) {
      joinAttempts.delete(key);
    }
  }
}, 60 * 60 * 1000);

// ==================== ADMIN-ONLY ROUTES (must be first) ====================

// Get all rooms (Admin only)
router.get('/rooms', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const { status } = req.query;
    const db = getDb();

    let query = db.collection('chatRooms').orderBy('lastMessageAt', 'desc');

    if (status === 'active') {
      query = query.where('isEnded', '==', false);
    } else if (status === 'ended') {
      query = query.where('isEnded', '==', true);
    }

    const snapshot = await query.limit(50).get();

    const rooms = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        roomNumber: data.roomNumber,
        visitorName: data.visitorName,
        visitorEmail: data.visitorEmail,
        lastMessage: data.lastMessage,
        hasPassword: data.hasPassword,
        isEnded: data.isEnded,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        lastMessageAt: data.lastMessageAt?.toDate?.() || new Date()
      };
    });

    res.json({ success: true, rooms });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End room (Admin only)
router.put('/rooms/:roomId/end', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const { roomId } = req.params;
    const db = getDb();

    await db.collection('chatRooms').doc(roomId).update({
      isEnded: true,
      status: 'ended',
      endedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content: 'Chat ended by admin',
      sender: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete room (Admin only)
router.delete('/rooms/:roomId', async (req, res) => {
  const isAdmin = await verifyAdminToken(req);
  if (!isAdmin) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const { roomId } = req.params;
    const db = getDb();

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

// ==================== MIXED ROUTES (work for both admin and visitors) ====================

// Get messages - works for both admin and visitors
// الزائر لازم يبعت visitorEmail (و password لو الغرفة محمية) في query string
// مثال: GET /rooms/{roomId}/messages?visitorEmail=foo@bar.com&password=1234
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

    const isEnded = roomData.isEnded;

    const snapshot = await db.collection('chatRooms').doc(roomId)
      .collection('messages').orderBy('createdAt', 'asc').get();

    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      content: doc.data().content,
      sender: doc.data().sender,
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    res.json({ success: true, messages, isEnded });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, messages: [] });
  }
});

// Send message - check if admin or visitor
// الزائر لازم يبعت visitorEmail (و password لو الغرفة محمية) في الـ body
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, message, sender } = req.body;
    const messageContent = content || message;

    if (!messageContent) {
      return res.status(400).json({ success: false, error: 'Content required' });
    }

    const db = getDb();
    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const roomData = roomDoc.data();

    if (roomData.isEnded) {
      return res.status(400).json({ success: false, error: 'ROOM_ENDED' });
    }

    const ownership = await verifyRoomOwnership(req, roomData);
    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED' });
    }

    // Determine sender type
    const senderType = ownership.isAdmin ? 'admin' : (sender || 'visitor');

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content: messageContent,
      sender: senderType,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('chatRooms').doc(roomId).update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: messageContent.substring(0, 100),
      messageCount: admin.firestore.FieldValue.increment(1)
    });

    res.status(201).json({ 
      success: true,
      message: { content: messageContent, sender: senderType, createdAt: new Date() }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PUBLIC ROUTES ====================

// Check room availability
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

// Create new room
router.post('/rooms', async (req, res) => {
  try {
    const { visitorName, visitorEmail, roomNumber, password } = req.body;
    
    if (!visitorName || !visitorEmail || !roomNumber) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const db = getDb();

    const existingRoom = await db.collection('chatRooms')
      .where('roomNumber', '==', roomNumber)
      .where('isEnded', '==', false)
      .limit(1).get();

    if (!existingRoom.empty) {
      return res.status(400).json({ success: false, error: 'ROOM_IN_USE' });
    }

    const roomId = `room_${roomNumber}_${Date.now()}`;
    const hashedPassword = password ? hashPassword(password.trim()) : null;

    await db.collection('chatRooms').doc(roomId).set({
      roomId,
      roomNumber,
      visitorName,
      visitorEmail: visitorEmail.toLowerCase(),
      hasPassword: !!hashedPassword,
      password: hashedPassword,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      messageCount: 0,
      isEnded: false
    });

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content: 'Welcome! How can we help you?',
      sender: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ success: true, roomId, roomNumber });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Join room
router.post('/rooms/join', async (req, res) => {
  try {
    const { roomNumber, password, visitorEmail } = req.body;

    if (!roomNumber || !visitorEmail) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    // Rate limiting على محاولات الانضمام لمنع تخمين الباسورد بالقوة
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkJoinRateLimit(clientIp, roomNumber)) {
      return res.status(429).json({ success: false, error: 'TOO_MANY_ATTEMPTS' });
    }

    const db = getDb();
    const roomQuery = await db.collection('chatRooms')
      .where('roomNumber', '==', roomNumber)
      .where('isEnded', '==', false)
      .limit(1).get();

    if (roomQuery.empty) {
      return res.status(404).json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomDoc = roomQuery.docs[0];
    const roomData = roomDoc.data();

    if (roomData.visitorEmail.toLowerCase() !== visitorEmail.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'INVALID_EMAIL' });
    }

    if (roomData.hasPassword) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'PASSWORD_REQUIRED' });
      }
      if (hashPassword(password) !== roomData.password) {
        return res.status(401).json({ success: false, error: 'INVALID_PASSWORD' });
      }
    }

    res.json({ success: true, roomId: roomDoc.id, roomNumber, visitorName: roomData.visitorName });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get room with messages
// الزائر لازم يبعت visitorEmail (و password لو الغرفة محمية) في query string
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const roomData = roomDoc.data();

    const ownership = await verifyRoomOwnership(req, roomData);
    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'NOT_AUTHORIZED' });
    }

    const messagesSnapshot = await db.collection('chatRooms').doc(roomId)
      .collection('messages').orderBy('createdAt', 'asc').get();

    const messages = messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      content: doc.data().content,
      sender: doc.data().sender,
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    res.json({
      success: true,
      room: { id: roomDoc.id, roomNumber: roomData.roomNumber, visitorName: roomData.visitorName, isEnded: roomData.isEnded },
      messages
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Visitor end room
router.put('/rooms/:roomId/visitor-end', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { visitorEmail, password } = req.body;
    const db = getDb();

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const roomData = roomDoc.data();

    const ownership = await verifyRoomOwnership(req, roomData);
    if (!ownership.authorized) {
      return res.status(403).json({ success: false, error: ownership.error || 'Not authorized' });
    }

    await db.collection('chatRooms').doc(roomId).update({
      isEnded: true,
      status: 'ended',
      endedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('chatRooms').doc(roomId).collection('messages').add({
      content: 'Chat ended by visitor',
      sender: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;