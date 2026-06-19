// Public Routes for Portfolio (No Authentication Required)
const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

// Get Firestore instance
const getDb = () => admin.firestore();

// ==================== PROJECTS ====================

// @route   GET /api/public/projects
// @desc    Get all active projects (for visitors)
router.get('/projects', async (req, res) => {
  try {
    const db = getDb();
    const category = req.query.category;
    const featured = req.query.featured;
    const limit = parseInt(req.query.limit) || 50;

    let query = db.collection('projects')
      .where('isActive', '==', true)
      .orderBy('order', 'asc');

    const snapshot = await query.limit(limit).get();
    const projects = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Filter by category if specified
      if (category && category !== 'all' && data.category !== category) return;
      
      // Filter by featured if specified
      if (featured === 'true' && !data.featured) return;

      projects.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
      });
    });

    res.json({ success: true, projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to get projects', message: error.message });
  }
});

// @route   GET /api/public/projects/:id
// @desc    Get single project
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const doc = await db.collection('projects').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = doc.data();
    res.json({
      success: true,
      project: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
      }
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to get project', message: error.message });
  }
});

// ==================== POSTS/BLOG ====================

// @route   GET /api/public/posts
// @desc    Get all published posts
router.get('/posts', async (req, res) => {
  try {
    const db = getDb();
    const category = req.query.category;
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;

    const snapshot = await db.collection('posts')
      .where('status', '==', 'published')
      .get();

    let posts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Filter by category if specified
      if (category && category !== 'all' && data.category !== category) return;
      
      posts.push({
        id: doc.id,
        slug: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
      });
    });

    // Sort by createdAt descending (newest first)
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination in JavaScript
    const total = posts.length;
    const offset = (page - 1) * limit;
    posts = posts.slice(offset, offset + limit);

    res.json({
      success: true,
      posts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to get posts', message: error.message });
  }
});

// @route   GET /api/public/posts/:id
// @desc    Get single post
router.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const doc = await db.collection('posts').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const data = doc.data();
    
    // Only return published posts
    if (data.status !== 'published') {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({
      success: true,
      post: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
      }
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post', message: error.message });
  }
});

// ==================== SKILLS ====================

// @route   GET /api/public/skills
// @desc    Get all skills
router.get('/skills', async (req, res) => {
  try {
    const db = getDb();

    const snapshot = await db.collection('skills')
      .orderBy('order', 'asc')
      .get();

    const skills = [];
    snapshot.forEach(doc => {
      skills.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, skills });
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({ error: 'Failed to get skills', message: error.message });
  }
});

// ==================== SETTINGS ====================

// @route   GET /api/public/settings
// @desc    Get public site settings
router.get('/settings', async (req, res) => {
  try {
    const db = getDb();

    const doc = await db.collection('settings').doc('general').get();

    if (!doc.exists) {
      return res.json({
        success: true,
        settings: {
          site: { title: 'Portfolio', description: '' },
          social: {},
          features: {}
        }
      });
    }

    const data = doc.data();
    
    // Return only public settings
    res.json({
      success: true,
      settings: {
        site: data.site || {},
        social: data.social || {},
        features: data.features || {}
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings', message: error.message });
  }
});

// ==================== PORTFOLIO INFO ====================

// @route   GET /api/public/portfolio
// @desc    Get portfolio owner info
router.get('/portfolio', async (req, res) => {
  try {
    const db = getDb();

    const doc = await db.collection('settings').doc('portfolio').get();

    if (!doc.exists) {
      return res.json({
        success: true,
        portfolio: {
          name: { ar: '', en: '' },
          title: { ar: '', en: '' },
          bio: { ar: '', en: '' },
          avatar: '',
          social: {}
        }
      });
    }

    const data = doc.data();
    const personalInfo = data.personalInfo || {};
    
    // تحويل البيانات للصيغة المتوقعة
    res.json({ 
      success: true, 
      portfolio: {
        name: { 
          ar: personalInfo.name || '', 
          en: personalInfo.nameEn || '' 
        },
        title: { 
          ar: personalInfo.title || '', 
          en: personalInfo.titleEn || '' 
        },
        bio: { 
          ar: personalInfo.bio || '', 
          en: personalInfo.bioEn || '' 
        },
        avatar: personalInfo.profileImage || '',
        social: data.socialLinks || {}
      }
    });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Failed to get portfolio info', message: error.message });
  }
});

// ==================== PUBLIC CHAT ====================

// @route   POST /api/public/chat/start
// @desc    Start a new chat session for visitors
router.post('/chat/start', async (req, res) => {
  try {
    const db = getDb();
    const { visitorName, visitorEmail, message } = req.body;

    // Create a new chat room
    const roomData = {
      visitorName: visitorName || 'زائر',
      visitorEmail: visitorEmail || '',
      status: 'active',
      lastMessage: message || '',
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSender: 'visitor',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const roomRef = await db.collection('chatRooms').add(roomData);

    // Add the first message if provided
    if (message) {
      await db.collection('messages').add({
        roomId: roomRef.id,
        senderId: 'visitor',
        senderType: 'visitor',
        senderName: visitorName || 'زائر',
        message: message,
        type: 'text',
        isRead: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(201).json({
      success: true,
      roomId: roomRef.id,
      room: { id: roomRef.id, ...roomData }
    });
  } catch (error) {
    console.error('Start chat error:', error);
    res.status(500).json({ error: 'Failed to start chat', message: error.message });
  }
});

// @route   GET /api/public/chat/:roomId/messages
// @desc    Get messages for a chat room
router.get('/chat/:roomId/messages', async (req, res) => {
  try {
    const db = getDb();
    const { roomId } = req.params;

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const messagesSnapshot = await db.collection('messages')
      .where('roomId', '==', roomId)
      .orderBy('timestamp', 'asc')
      .get();

    const messages = [];
    messagesSnapshot.forEach(doc => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp
      });
    });

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages', message: error.message });
  }
});

// @route   POST /api/public/chat/:roomId/messages
// @desc    Send a message as a visitor
router.post('/chat/:roomId/messages', async (req, res) => {
  try {
    const db = getDb();
    const { roomId } = req.params;
    const { message, visitorName } = req.body;

    const roomDoc = await db.collection('chatRooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    const messageData = {
      roomId: roomId,
      senderId: 'visitor',
      senderType: 'visitor',
      senderName: visitorName || 'زائر',
      message: message,
      type: 'text',
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };

    const messageRef = await db.collection('messages').add(messageData);

    // Update room's last message
    await db.collection('chatRooms').doc(roomId).update({
      lastMessage: message,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageSender: 'visitor'
    });

    res.status(201).json({
      success: true,
      message: { id: messageRef.id, ...messageData }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', message: error.message });
  }
});

module.exports = router;