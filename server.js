// =====================================================================
// server.js - Fixed Version
// الإصلاحات:
// 1. middleware الصيانة يتحقق من التوكن عشان يسمح للأدمن
// 2. مسارات الصيانة والـ auth مستثناة دايماً
// 3. الأدمن بتوكن صحيح يعدي حتى لو الصيانة شغالة
// =====================================================================

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();

// ── Firebase Admin ───────────────────────────────────────────────────
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
      || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
  });
}

const app  = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 'loopback');

// ── Security ─────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: process.env.FRONTEND_URL
    || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods:  ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ─────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      const ip = req.ip || req.connection.remoteAddress;
      return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
    }
    return false;
  },
});
app.use('/api/', limiter);

// ── Static Files ──────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health Check ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:      'OK',
    timestamp:   new Date().toISOString(),
    uptime:      process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── Maintenance Middleware ─────────────────────────────────────────────
// ⚠️ لازم يكون قبل الـ routes
// المنطق:
// 1. لو مفيش صيانة → كل الطلبات تعدي
// 2. لو في صيانة:
//    - مسارات الـ auth و maintenance تعدي دايماً
//    - لو في توكن أدمن صحيح → تعدي
//    - باقي الطلبات → 503

app.use(async (req, res, next) => {
  // استثناءات دايمة - مش محتاجة تحقق من الصيانة
  const alwaysAllowed = [
    '/health',
    '/api/maintenance/status', // عشان الفرونت يعرف حالة الصيانة
    '/api/auth/login',         // عشان الأدمن يقدر يسجل دخول
    '/api/auth/logout',
    '/api/auth/verify-token',
    '/api/auth/refresh-token',
  ];

  if (alwaysAllowed.some(path => req.path === path || req.path.startsWith(path))) {
    return next();
  }

  try {
    const maintenanceDoc = await admin.firestore()
      .collection('settings')
      .doc('maintenance')
      .get();

    // لو مفيش صيانة أو مش مفعلة → كمّل
    if (!maintenanceDoc.exists || !maintenanceDoc.data().isEnabled) {
      return next();
    }

    const maintenanceData = maintenanceDoc.data();

    // ── تحقق من التوكن عشان تسمح للأدمن ──────────────────────────
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token       = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // تحقق إن المستخدم أدمن من Firestore
        const userDoc = await admin.firestore()
          .collection('users')
          .doc(decodedToken.uid)
          .get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          const isAdmin  = userData.role === 'admin' || userData.admin === true;

          if (isAdmin) {
            // الأدمن يعدي حتى في الصيانة
            req.user = { ...decodedToken, ...userData };
            return next();
          }
        }
      } catch (tokenError) {
        // التوكن غلط → وصّله لصفحة الصيانة
        console.log('Invalid token during maintenance:', tokenError.message);
      }
    }

    // ── رد بحالة الصيانة للزوار ───────────────────────────────────
    return res.status(503).json({
      success:     false,
      maintenance: true,
      isEnabled:   true,
      message:     maintenanceData.message   || 'الموقع تحت الصيانة حالياً',
      messageEn:   maintenanceData.messageEn || 'Site is under maintenance',
      scheduledEnd: maintenanceData.scheduledEnd || null,
    });

  } catch (error) {
    console.error('Maintenance middleware error:', error);
    // لو حصل error في الـ middleware → كمّل عادي (fail open)
    next();
  }
});

// ── Routes ────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const uploadRoutes      = require('./routes/upload');
const postsRoutes       = require('./routes/posts');
const chatRoutes        = require('./routes/chat');
const maintenanceRoutes = require('./routes/maintenance');
const publicRoutes      = require('./routes/public');

app.use('/api/auth',        authRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/upload',      uploadRoutes);
app.use('/api/posts',       postsRoutes);
app.use('/api/chat',        chatRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/public',      publicRoutes);

// ── Production Static Files ───────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// ── 404 ───────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    error:   'Not Found',
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Global Error Handler ──────────────────────────────────────────────
app.use((error, req, res, next) => {
  console.error('Global error:', error);

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation Error', message: error.message });
  }
  if (error.code?.startsWith('auth/')) {
    return res.status(401).json({ error: 'Authentication Error', message: error.message });
  }

  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message,
  });
});

// ── Uploads Dir ───────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Start ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`🌍 ENV: ${process.env.NODE_ENV || 'development'}`);
});

const gracefulShutdown = () => {
  console.log('\nShutting down...');
  server.close(() => { process.exit(0); });
  setTimeout(() => { process.exit(1); }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT',  gracefulShutdown);

module.exports = app;