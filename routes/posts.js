// Enhanced Posts Routes with complete blog management
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

// Helper function to generate slug from title
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');
};

// Helper function to calculate reading time
const calculateReadingTime = (content) => {
  const wordsPerMinute = 200;
  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

// GET /api/posts - Get public posts (for portfolio)
router.get('/', async (req, res) => {
  try {
    const lang = req.query.lang || 'ar';
    const category = req.query.category;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const featured = req.query.featured === 'true';
    const search = req.query.search;

    let query = db.collection('posts')
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc');

    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }

    if (featured) {
      query = query.where('featured', '==', true);
    }

    // Search functionality
    if (search) {
      // Simple search in titles and excerpts
      const searchQuery = await db.collection('posts')
        .where('status', '==', 'published')
        .orderBy('title.ar')
        .startAt(search)
        .endAt(search + '\uf8ff')
        .get();

      const posts = [];
      searchQuery.forEach(doc => {
        const postData = doc.data();
        if (postData.status === 'published') {
          posts.push({
            id: doc.id,
            title: postData.title[lang] || postData.title.ar,
            excerpt: postData.excerpt[lang] || postData.excerpt.ar,
            content: postData.content[lang] || postData.content.ar,
            slug: postData.slug,
            featuredImage: postData.featuredImage,
            category: postData.category,
            tags: postData.tags,
            featured: postData.featured,
            readingTime: postData.readingTime,
            publishedAt: postData.publishedAt,
            createdAt: postData.createdAt,
            updatedAt: postData.updatedAt
          });
        }
      });

      return res.json({
        posts: posts.slice(0, limit),
        pagination: {
          page: 1,
          limit,
          total: posts.length,
          pages: Math.ceil(posts.length / limit)
        }
      });
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.offset(offset).limit(limit);

    const snapshot = await query.get();
    const posts = [];

    snapshot.forEach(doc => {
      const postData = doc.data();
      posts.push({
        id: doc.id,
        title: postData.title[lang] || postData.title.ar,
        excerpt: postData.excerpt[lang] || postData.excerpt.ar,
        content: postData.content[lang] || postData.content.ar,
        slug: postData.slug,
        featuredImage: postData.featuredImage,
        category: postData.category,
        tags: postData.tags,
        featured: postData.featured,
        readingTime: postData.readingTime,
        publishedAt: postData.publishedAt,
        createdAt: postData.createdAt,
        updatedAt: postData.updatedAt
      });
    });

    // Get total count for pagination
    let countQuery = db.collection('posts').where('status', '==', 'published');
    if (category) {
      countQuery = countQuery.where('category', '==', category);
    }
    if (featured) {
      countQuery = countQuery.where('featured', '==', true);
    }
    const totalSnapshot = await countQuery.get();
    const total = totalSnapshot.size;

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// GET /api/posts/:id - Get single post
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lang = req.query.lang || 'ar';

    const doc = await db.collection('posts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postData = doc.data();
    
    // Check if post is published (public access)
    if (postData.status !== 'published') {
      return res.status(403).json({ error: 'Post not published' });
    }

    const post = {
      id: doc.id,
      title: postData.title[lang] || postData.title.ar,
      content: postData.content[lang] || postData.content.ar,
      excerpt: postData.excerpt[lang] || postData.excerpt.ar,
      slug: postData.slug,
      featuredImage: postData.featuredImage,
      category: postData.category,
      tags: postData.tags,
      featured: postData.featured,
      readingTime: postData.readingTime,
      publishedAt: postData.publishedAt,
      createdAt: postData.createdAt,
      updatedAt: postData.updatedAt
    };

    res.json(post);
  } catch (error) {
    console.error('Error getting post:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// GET /api/posts/slug/:slug - Get post by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const lang = req.query.lang || 'ar';

    const query = await db.collection('posts')
      .where('slug', '==', slug)
      .where('status', '==', 'published')
      .limit(1)
      .get();

    if (query.empty) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const doc = query.docs[0];
    const postData = doc.data();

    const post = {
      id: doc.id,
      title: postData.title[lang] || postData.title.ar,
      content: postData.content[lang] || postData.content.ar,
      excerpt: postData.excerpt[lang] || postData.excerpt.ar,
      slug: postData.slug,
      featuredImage: postData.featuredImage,
      category: postData.category,
      tags: postData.tags,
      featured: postData.featured,
      readingTime: postData.readingTime,
      publishedAt: postData.publishedAt,
      createdAt: postData.createdAt,
      updatedAt: postData.updatedAt
    };

    res.json(post);
  } catch (error) {
    console.error('Error getting post by slug:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// GET /api/posts/categories - Get all categories (public)
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('posts')
      .where('status', '==', 'published')
      .get();
    
    const categories = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    });

    res.json({
      categories: Array.from(categories).sort()
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// GET /api/posts/tags - Get all tags (public)
router.get('/tags', async (req, res) => {
  try {
    const snapshot = await db.collection('posts')
      .where('status', '==', 'published')
      .get();
    
    const tags = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.tags && Array.isArray(data.tags)) {
        data.tags.forEach(tag => tags.add(tag));
      }
    });

    res.json({
      tags: Array.from(tags).sort()
    });
  } catch (error) {
    console.error('Error getting tags:', error);
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// GET /api/posts/featured - Get featured posts (public)
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const lang = req.query.lang || 'ar';

    const query = await db.collection('posts')
      .where('status', '==', 'published')
      .where('featured', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(limit)
      .get();

    const posts = [];
    query.forEach(doc => {
      const postData = doc.data();
      posts.push({
        id: doc.id,
        title: postData.title[lang] || postData.title.ar,
        excerpt: postData.excerpt[lang] || postData.excerpt.ar,
        slug: postData.slug,
        featuredImage: postData.featuredImage,
        category: postData.category,
        readingTime: postData.readingTime,
        publishedAt: postData.publishedAt
      });
    });

    res.json({ posts });
  } catch (error) {
    console.error('Error getting featured posts:', error);
    res.status(500).json({ error: 'Failed to get featured posts' });
  }
});

// Admin Routes (require authentication)

// GET /api/admin/posts - Get all posts (admin)
router.get('/admin/posts', verifyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search;
    const status = req.query.status;
    const category = req.query.category;

    let query = db.collection('posts').orderBy('createdAt', 'desc');

    // Apply filters
    if (status) {
      query = query.where('status', '==', status);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    if (search) {
      // Search in titles (both languages)
      const searchQuery = db.collection('posts')
        .orderBy('title.ar')
        .startAt(search)
        .endAt(search + '\uf8ff');
      
      const snapshot = await searchQuery.get();
      const posts = [];
      snapshot.forEach(doc => {
        posts.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
          updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : null,
          publishedAt: doc.data().publishedAt ? doc.data().publishedAt.toDate() : null
        });
      });
      
      return res.json({
        posts: posts.slice(0, limit),
        pagination: {
          page,
          limit,
          total: posts.length,
          pages: Math.ceil(posts.length / limit)
        }
      });
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.offset(offset).limit(limit);

    const snapshot = await query.get();
    const posts = [];

    snapshot.forEach(doc => {
      const postData = doc.data();
      posts.push({
        id: doc.id,
        ...postData,
        createdAt: postData.createdAt ? postData.createdAt.toDate() : null,
        updatedAt: postData.updatedAt ? postData.updatedAt.toDate() : null,
        publishedAt: postData.publishedAt ? postData.publishedAt.toDate() : null
      });
    });

    // Get total count
    let countQuery = db.collection('posts');
    if (status) {
      countQuery = countQuery.where('status', '==', status);
    }
    if (category) {
      countQuery = countQuery.where('category', '==', category);
    }
    const totalSnapshot = await countQuery.get();
    const total = totalSnapshot.size;

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting admin posts:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// GET /api/admin/posts/:id - Get single post (admin)
router.get('/admin/posts/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await db.collection('posts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postData = doc.data();
    res.json({
      id: doc.id,
      ...postData,
      createdAt: postData.createdAt ? postData.createdAt.toDate() : null,
      updatedAt: postData.updatedAt ? postData.updatedAt.toDate() : null,
      publishedAt: postData.publishedAt ? postData.publishedAt.toDate() : null
    });
  } catch (error) {
    console.error('Error getting admin post:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// POST /api/admin/posts - Create new post
router.post('/admin/posts', verifyAuth, [
  body('title.ar').notEmpty().withMessage('Arabic title is required'),
  body('title.en').notEmpty().withMessage('English title is required'),
  body('content.ar').notEmpty().withMessage('Arabic content is required'),
  body('content.en').notEmpty().withMessage('English content is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('status').isIn(['draft', 'published', 'archived']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Generate slug if not provided
    let slug = req.body.slug || generateSlug(req.body.title.ar);
    
    // Check if slug already exists
    const existingPost = await db.collection('posts').where('slug', '==', slug).get();
    if (!existingPost.empty) {
      slug = `${slug}-${Date.now()}`;
    }

    const postData = {
      title: req.body.title,
      content: req.body.content,
      excerpt: req.body.excerpt || {},
      slug: slug,
      featuredImage: req.body.featuredImage || '',
      category: req.body.category,
      tags: req.body.tags || [],
      status: req.body.status,
      featured: req.body.featured || false,
      readingTime: req.body.readingTime || calculateReadingTime(req.body.content.ar),
      publishedAt: req.body.status === 'published' ? admin.firestore.FieldValue.serverTimestamp() : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      authorId: req.user.uid,
      viewCount: 0
    };

    // Generate excerpts if not provided
    if (!postData.excerpt.ar) {
      postData.excerpt.ar = req.body.content.ar.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
    }
    if (!postData.excerpt.en) {
      postData.excerpt.en = req.body.content.en.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
    }

    const docRef = await db.collection('posts').add(postData);

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'create',
      resource: 'post',
      resourceId: docRef.id,
      details: {
        title: req.body.title,
        category: req.body.category,
        status: req.body.status
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      id: docRef.id,
      ...postData,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: postData.publishedAt ? new Date() : null
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/admin/posts/:id - Update post
router.put('/admin/posts/:id', verifyAuth, [
  body('title.ar').optional().notEmpty().withMessage('Arabic title cannot be empty'),
  body('title.en').optional().notEmpty().withMessage('English title cannot be empty'),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    
    // Check if post exists
    const currentDoc = await db.collection('posts').doc(id).get();
    if (!currentDoc.exists) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const currentData = currentDoc.data();
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // If publishing for the first time, set publishedAt
    if (currentData.status !== 'published' && req.body.status === 'published') {
      updateData.publishedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // Generate excerpts if content is updated but excerpt is not provided
    if (req.body.content && !req.body.excerpt) {
      updateData.excerpt = {
        ar: req.body.content.ar ? req.body.content.ar.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : currentData.excerpt?.ar,
        en: req.body.content.en ? req.body.content.en.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : currentData.excerpt?.en
      };
    }

    // Update reading time if content is updated
    if (req.body.content && req.body.content.ar) {
      updateData.readingTime = calculateReadingTime(req.body.content.ar);
    }

    await db.collection('posts').doc(id).update(updateData);

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'update',
      resource: 'post',
      resourceId: id,
      details: {
        changes: Object.keys(updateData)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Post updated successfully' });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/admin/posts/:id - Delete post
router.delete('/admin/posts/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection('posts').doc(id).delete();

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'delete',
      resource: 'post',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// PUT /api/admin/posts/:id/feature - Toggle featured status
router.put('/admin/posts/:id/feature', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    await db.collection('posts').doc(id).update({
      featured: featured,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log activity
    await db.collection('activityLogs').add({
      userId: req.user.uid,
      action: 'toggle_featured',
      resource: 'post',
      resourceId: id,
      details: {
        featured: featured
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: `Post ${featured ? 'featured' : 'unfeatured'} successfully` });
  } catch (error) {
    console.error('Error toggling featured status:', error);
    res.status(500).json({ error: 'Failed to update featured status' });
  }
});

// PUT /api/admin/posts/:id/view - Increment view count
router.put('/admin/posts/:id/view', async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection('posts').doc(id).update({
      viewCount: admin.firestore.FieldValue.increment(1)
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to increment view count' });
  }
});

// GET /api/admin/posts/categories - Get all categories (admin)
router.get('/admin/posts/categories', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('posts').get();
    const categories = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    });

    res.json({
      categories: Array.from(categories).sort()
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// GET /api/admin/posts/stats - Get posts statistics
router.get('/admin/posts/stats', verifyAuth, async (req, res) => {
  try {
    // Get total posts
    const totalSnapshot = await db.collection('posts').get();
    const totalPosts = totalSnapshot.size;

    // Get published posts
    const publishedQuery = await db.collection('posts')
      .where('status', '==', 'published')
      .get();
    const publishedPosts = publishedQuery.size;

    // Get draft posts
    const draftQuery = await db.collection('posts')
      .where('status', '==', 'draft')
      .get();
    const draftPosts = draftQuery.size;

    // Get archived posts
    const archivedQuery = await db.collection('posts')
      .where('status', '==', 'archived')
      .get();
    const archivedPosts = archivedQuery.size;

    // Get featured posts
    const featuredQuery = await db.collection('posts')
      .where('featured', '==', true)
      .get();
    const featuredPosts = featuredQuery.size;

    // Get posts this month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const thisMonthQuery = await db.collection('posts')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(firstDayOfMonth))
      .get();
    const postsThisMonth = thisMonthQuery.size;

    // Get total views
    let totalViews = 0;
    totalSnapshot.forEach(doc => {
      totalViews += doc.data().viewCount || 0;
    });

    res.json({
      totalPosts,
      publishedPosts,
      draftPosts,
      archivedPosts,
      featuredPosts,
      postsThisMonth,
      totalViews
    });
  } catch (error) {
    console.error('Error getting posts stats:', error);
    res.status(500).json({ error: 'Failed to get posts statistics' });
  }
});

module.exports = router;