const admin = require('firebase-admin');

// Middleware to verify Firebase ID token
const verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Authorization header is required',
        message: 'يجب توفير رمز التفويض'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Invalid authorization format',
        message: 'صيغة التفويض غير صحيحة'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    if (!token || token.trim() === '') {
      return res.status(401).json({ 
        error: 'Bearer token is required',
        message: 'يجب توفير رمز الوصول'
      });
    }

    // Verify the token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(token, true);
    
    // Get user data from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();
    
    // Add user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
      picture: decodedToken.picture,
      role: userDoc.exists ? userDoc.data().role : 'user',
      admin: userDoc.exists ? userDoc.data().admin : false,
      ...decodedToken
    };
    
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    
    // Handle specific Firebase auth errors
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى'
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ 
        error: 'Token revoked',
        message: 'تم إلغاء صلاحية الجلسة'
      });
    }
    
    if (error.code === 'auth/argument-error') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'رمز الوصول غير صالح'
      });
    }
    
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      message: error.message || 'فشل التحقق من الهوية'
    });
  }
};

// Middleware to check admin privileges
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'يجب تسجيل الدخول أولاً'
      });
    }

    // Check if user has admin role
    if (req.user.role !== 'admin' && req.user.admin !== true) {
      return res.status(403).json({ 
        error: 'Admin privileges required',
        message: 'هذا الإجراء متاح للمسؤولين فقط'
      });
    }

    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'حدث خطأ أثناء التحقق من الصلاحيات'
    });
  }
};

// Optional auth - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      
      if (token && token.trim() !== '') {
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Get user data from Firestore
        const userDoc = await admin.firestore()
          .collection('users')
          .doc(decodedToken.uid)
          .get();
        
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          name: decodedToken.name,
          picture: decodedToken.picture,
          role: userDoc.exists ? userDoc.data().role : 'user',
          admin: userDoc.exists ? userDoc.data().admin : false
        };
      }
    }
  } catch (error) {
    // Silently ignore auth errors for optional auth
    console.log('Optional auth failed:', error.message);
  }
  
  next();
};

// Check if user owns the resource
const checkOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'يجب تسجيل الدخول أولاً'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin' || req.user.admin === true) {
      return next();
    }

    // Check if user owns the resource
    const resourceUserId = req.params[resourceField] || req.body[resourceField];
    
    if (resourceUserId !== req.user.uid) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد'
      });
    }

    next();
  };
};

module.exports = {
  verifyAuth,
  requireAdmin,
  optionalAuth,
  checkOwnership
};