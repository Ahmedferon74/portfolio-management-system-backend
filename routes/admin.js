// Enhanced Admin Routes with chat management, maintenance mode, dashboard, and Cloudinary
const express = require('express');
const admin = require('firebase-admin');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage (for Cloudinary upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'));
    }
  }
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || 'portfolio',
      resource_type: options.resource_type || 'auto',
      public_id: options.public_id || uuidv4(),
      ...options
    };
    
    cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }).end(buffer);
  });
};

// Helper function to generate slug
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() + '-' + Date.now().toString(36);
}

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

// @route   GET /api/admin/dashboard
router.get('/dashboard', verifyAuth, async (req, res) => {
  try {
    const totalPostsSnapshot = await db.collection('posts').get();
    const totalPosts = totalPostsSnapshot.size;

    const publishedPostsSnapshot = await db.collection('posts')
      .where('status', '==', 'published').get();
    const publishedPosts = publishedPostsSnapshot.size;

    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;

    const chatRoomsSnapshot = await db.collection('chatRooms').get();
    const totalChatRooms = chatRoomsSnapshot.size;

    const unreadMessagesSnapshot = await db.collection('messages')
      .where('isRead', '==', false).get();
    const unreadMessages = unreadMessagesSnapshot.size;

    const activitiesSnapshot = await db.collection('activityLogs')
      .orderBy('timestamp', 'desc').limit(10).get();
    
    const recentActivities = [];
    activitiesSnapshot.forEach(doc => {
      recentActivities.push({ id: doc.id, ...doc.data() });
    });

    const maintenanceDoc = await db.collection('settings').doc('maintenance').get();
    const maintenanceStatus = maintenanceDoc.exists ? maintenanceDoc.data() : { isEnabled: false };

    res.json({
      success: true,
      statistics: {
        posts: { total: totalPosts, published: publishedPosts, draft: totalPosts - publishedPosts },
        users: { total: totalUsers },
        chat: { rooms: totalChatRooms, unreadMessages: unreadMessages },
        maintenance: { isEnabled: maintenanceStatus.isEnabled }
      },
      recentActivities
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data', message: error.message });
  }
});

// ==================== POSTS ROUTES ====================

// @route   GET /api/admin/posts
router.get('/posts', verifyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    let query = db.collection('posts').orderBy('createdAt', 'desc');
    
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    const offset = (page - 1) * limit;
    query = query.offset(offset).limit(limit);

    const snapshot = await query.get();
    const posts = [];

    snapshot.forEach(doc => {
      const postData = doc.data();
      posts.push({
        id: doc.id,
        ...postData,
        createdAt: postData.createdAt?.toDate ? postData.createdAt.toDate() : postData.createdAt,
        updatedAt: postData.updatedAt?.toDate ? postData.updatedAt.toDate() : postData.updatedAt
      });
    });

    const totalSnapshot = await db.collection('posts').get();
    const total = totalSnapshot.size;

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

// @route   GET /api/admin/posts/:id
router.get('/posts/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const postDoc = await db.collection('posts').doc(id).get();

    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postData = postDoc.data();
    res.json({
      success: true,
      post: {
        id: postDoc.id,
        ...postData,
        createdAt: postData.createdAt?.toDate ? postData.createdAt.toDate() : postData.createdAt,
        updatedAt: postData.updatedAt?.toDate ? postData.updatedAt.toDate() : postData.updatedAt
      }
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post', message: error.message });
  }
});

// @route   POST /api/admin/posts - Create post with Cloudinary image upload
router.post('/posts', verifyAuth, upload.single('featuredImage'), async (req, res) => {
  try {
    const { title, titleEn, content, contentEn, excerpt, excerptEn, category, tags, status } = req.body;

    let featuredImageUrl = req.body.featuredImage || '';

    // Upload featured image to Cloudinary if provided
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: 'portfolio/posts',
          transformation: [
            { width: 1200, height: 630, crop: 'fill', quality: 'auto' }
          ]
        });
        featuredImageUrl = result.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
      }
    }

    const postData = {
      title: title || '',
      titleEn: titleEn || '',
      content: content || '',
      contentEn: contentEn || '',
      excerpt: excerpt || '',
      excerptEn: excerptEn || '',
      category: category || 'general',
      tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : (tags || []),
      status: status || 'draft',
      featuredImage: featuredImageUrl,
      authorId: req.user.uid,
      views: 0,
      slug: generateSlug(title || titleEn || 'post'),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const postRef = await db.collection('posts').add(postData);

    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'create_post',
      resource: 'posts',
      resourceId: postRef.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ success: true, post: { id: postRef.id, ...postData } });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post', message: error.message });
  }
});

// @route   PUT /api/admin/posts/:id - Update post with Cloudinary image upload
router.put('/posts/:id', verifyAuth, upload.single('featuredImage'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const postDoc = await db.collection('posts').doc(id).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const updateData = { ...req.body };
    
    if (typeof updateData.tags === 'string') {
      updateData.tags = updateData.tags.split(',').map(t => t.trim());
    }

    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: 'portfolio/posts',
          transformation: [
            { width: 1200, height: 630, crop: 'fill', quality: 'auto' }
          ]
        });
        updateData.featuredImage = result.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
      }
    }

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('posts').doc(id).update(updateData);

    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'update_post',
      resource: 'posts',
      resourceId: id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await db.collection('posts').doc(id).get();
    const updatedPost = { id: updatedDoc.id, ...updatedDoc.data() };

    res.json({ success: true, message: 'Post updated successfully', post: updatedPost });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post', message: error.message });
  }
});

// @route   DELETE /api/admin/posts/:id
router.delete('/posts/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('posts').doc(id).delete();

    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'delete_post',
      resource: 'posts',
      resourceId: id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post', message: error.message });
  }
});

// @route   PUT /api/admin/posts/bulk - Bulk update posts
router.put('/posts/bulk', verifyAuth, async (req, res) => {
  try {
    const { action, ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No post IDs provided' });
    }

    const batch = db.batch();

    for (const id of ids) {
      const postRef = db.collection('posts').doc(id);
      
      if (action === 'publish') {
        batch.update(postRef, { status: 'published', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (action === 'draft') {
        batch.update(postRef, { status: 'draft', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (action === 'delete') {
        batch.delete(postRef);
      }
    }

    await batch.commit();

    res.json({ success: true, message: `Successfully ${action}ed ${ids.length} posts` });
  } catch (error) {
    console.error('Bulk update posts error:', error);
    res.status(500).json({ error: 'Failed to bulk update posts', message: error.message });
  }
});

// ==================== UPLOADS ROUTES (with Cloudinary) ====================

// @route   POST /api/admin/uploads
router.post('/uploads', verifyAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder = req.body.folder || 'portfolio/uploads';
    const category = req.body.category || 'general';

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: folder,
      resource_type: 'auto'
    });

    const fileData = {
      filename: result.public_id,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: result.secure_url,
      publicId: result.public_id,
      category: category,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const fileRef = await db.collection('uploadedFiles').add(fileData);

    res.status(201).json({
      success: true,
      file: { id: fileRef.id, ...fileData },
      url: result.secure_url
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file', message: error.message });
  }
});

// @route   GET /api/admin/uploads
router.get('/uploads', verifyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;

    let query = db.collection('uploadedFiles').orderBy('uploadedAt', 'desc');
    if (category) query = query.where('category', '==', category);

    const offset = (page - 1) * limit;
    query = query.offset(offset).limit(limit);

    const snapshot = await query.get();
    const uploads = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      uploads.push({
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : data.uploadedAt
      });
    });

    const totalSnapshot = await db.collection('uploadedFiles').get();
    const total = totalSnapshot.size;

    res.json({
      success: true,
      uploads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ error: 'Failed to get uploads', message: error.message });
  }
});

// @route   DELETE /api/admin/uploads/:id
router.delete('/uploads/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const fileDoc = await db.collection('uploadedFiles').doc(id).get();
    if (fileDoc.exists) {
      const fileData = fileDoc.data();
      if (fileData.publicId) {
        try {
          await cloudinary.uploader.destroy(fileData.publicId);
        } catch (cloudinaryError) {
          console.error('Cloudinary delete error:', cloudinaryError);
        }
      }
    }
    
    await db.collection('uploadedFiles').doc(id).delete();
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ error: 'Failed to delete file', message: error.message });
  }
});

// ==================== SETTINGS ROUTES ====================

router.get('/settings', verifyAuth, async (req, res) => {
  try {
    const settingsDoc = await db.collection('settings').doc('general').get();
    
    if (!settingsDoc.exists) {
      return res.json({
        success: true,
        settings: {
          site: { title: 'Portfolio', description: '' },
          social: {},
          seo: {},
          features: { blogEnabled: true, chatEnabled: true }
        }
      });
    }

    res.json({ success: true, settings: settingsDoc.data() });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings', message: error.message });
  }
});

router.put('/settings', verifyAuth, async (req, res) => {
  try {
    const settings = req.body;
    
    await db.collection('settings').doc('general').set({
      ...settings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    }, { merge: true });

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings', message: error.message });
  }
});

// ==================== CHAT ROUTES ====================

router.get('/chat/rooms', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('chatRooms').orderBy('lastMessageAt', 'desc').get();
    const rooms = [];
    snapshot.forEach(doc => {
      const roomData = doc.data();
      rooms.push({
        id: doc.id,
        ...roomData,
        lastMessageAt: roomData.lastMessageAt?.toDate ? roomData.lastMessageAt.toDate() : null
      });
    });
    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Get chat rooms error:', error);
    res.status(500).json({ error: 'Failed to get chat rooms', message: error.message });
  }
});

router.get('/chat/conversations', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('chatRooms').orderBy('lastMessageAt', 'desc').get();
    const conversations = [];
    snapshot.forEach(doc => {
      const roomData = doc.data();
      conversations.push({
        id: doc.id,
        ...roomData,
        lastMessageAt: roomData.lastMessageAt?.toDate ? roomData.lastMessageAt.toDate() : null
      });
    });
    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations', message: error.message });
  }
});

router.get('/chat/rooms/:id/messages', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const messagesSnapshot = await db.collection('messages').where('roomId', '==', id).get();
    const messages = [];
    messagesSnapshot.forEach(doc => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : null
      });
    });
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages', message: error.message });
  }
});

router.post('/chat/rooms/:id/messages', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, type = 'text' } = req.body;
    const messageData = {
      roomId: id,
      senderId: req.user.uid,
      senderType: 'admin',
      message,
      type,
      isRead: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    const messageRef = await db.collection('messages').add(messageData);
    await db.collection('chatRooms').doc(id).update({
      lastMessage: message,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active'
    });
    res.status(201).json({ success: true, message: { id: messageRef.id, ...messageData } });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message', message: error.message });
  }
});

router.delete('/chat/rooms/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const messagesSnapshot = await db.collection('messages').where('roomId', '==', id).get();
    const batch = db.batch();
    messagesSnapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await db.collection('chatRooms').doc(id).delete();
    res.json({ success: true, message: 'Chat room deleted successfully' });
  } catch (error) {
    console.error('Delete chat room error:', error);
    res.status(500).json({ error: 'Failed to delete chat room', message: error.message });
  }
});

// ==================== MAINTENANCE ROUTES ====================

router.get('/maintenance', verifyAuth, async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('maintenance').get();
    if (!doc.exists) {
      return res.json({ success: true, data: { enabled: false, message: '' } });
    }
    const data = doc.data();
    res.json({ success: true, data: { enabled: data.isEnabled || false, message: data.message || '' } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get maintenance status', message: error.message });
  }
});

router.post('/maintenance/enable', verifyAuth, async (req, res) => {
  try {
    const { message = 'الموقع تحت الصيانة حالياً' } = req.body;
    await db.collection('settings').doc('maintenance').set({
      isEnabled: true,
      message,
      enabledAt: admin.firestore.FieldValue.serverTimestamp(),
      enabledBy: req.user.uid
    });
    res.json({ success: true, message: 'Maintenance mode enabled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to enable maintenance', message: error.message });
  }
});

router.post('/maintenance/disable', verifyAuth, async (req, res) => {
  try {
    await db.collection('settings').doc('maintenance').update({
      isEnabled: false,
      disabledAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'Maintenance mode disabled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable maintenance', message: error.message });
  }
});

// ==================== PROJECTS ROUTES ====================

router.get('/projects', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('projects').orderBy('order', 'asc').get();
    const projects = [];
    snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get projects', message: error.message });
  }
});

router.post('/projects', verifyAuth, async (req, res) => {
  try {
    const projectData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const projectRef = await db.collection('projects').add(projectData);
    res.status(201).json({ success: true, project: { id: projectRef.id, ...projectData } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

router.put('/projects/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('projects').doc(id).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'Project updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project', message: error.message });
  }
});

router.delete('/projects/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('projects').doc(id).delete();
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project', message: error.message });
  }
});

// ==================== PORTFOLIO/PROFILE ROUTES ====================

router.get('/portfolio', verifyAuth, async (req, res) => {
  try {
    const portfolioDoc = await db.collection('settings').doc('portfolio').get();
    const skillsSnapshot = await db.collection('skills').orderBy('order', 'asc').get();
    const skills = [];
    skillsSnapshot.forEach(doc => skills.push({ id: doc.id, ...doc.data() }));

    if (!portfolioDoc.exists) {
      return res.json({
        success: true,
        data: {
          personalInfo: { name: '', nameEn: '', title: '', titleEn: '', bio: '', bioEn: '', email: '', phone: '', location: '', locationEn: '', profileImage: '' },
          skills,
          experience: [],
          education: [],
          socialLinks: { github: '', linkedin: '', twitter: '' }
        }
      });
    }

    const portfolioData = portfolioDoc.data();
    res.json({
      success: true,
      data: {
        personalInfo: portfolioData.personalInfo || {},
        skills,
        experience: portfolioData.experience || [],
        education: portfolioData.education || [],
        socialLinks: portfolioData.socialLinks || {}
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get portfolio data', message: error.message });
  }
});

router.put('/portfolio', verifyAuth, async (req, res) => {
  try {
    const { personalInfo, skills, experience, education, socialLinks } = req.body;
    await db.collection('settings').doc('portfolio').set({
      personalInfo: personalInfo || {},
      experience: experience || [],
      education: education || [],
      socialLinks: socialLinks || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    }, { merge: true });
    res.json({ success: true, message: 'Portfolio updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update portfolio', message: error.message });
  }
});

// ==================== ACTIVITY LOGS ROUTES ====================

router.get('/activity-logs', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(50).get();
    const logs = [];
    snapshot.forEach(doc => {
      const logData = doc.data();
      logs.push({
        id: doc.id,
        ...logData,
        timestamp: logData.timestamp?.toDate ? logData.timestamp.toDate() : null
      });
    });
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get activity logs', message: error.message });
  }
});

// ==================== USERS ROUTES ====================

router.get('/users', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    const users = [];
    snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users', message: error.message });
  }
});

router.post('/users', verifyAuth, async (req, res) => {
  try {
    const userData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const userRef = await db.collection('users').add(userData);
    res.status(201).json({ success: true, user: { id: userRef.id, ...userData } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user', message: error.message });
  }
});

router.put('/users/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user', message: error.message });
  }
});

router.delete('/users/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).delete();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user', message: error.message });
  }
});

module.exports = router;
