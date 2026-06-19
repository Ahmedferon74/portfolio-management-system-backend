// Enhanced Firebase Setup Script with complete database structure
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
// Initialize Firebase Admin SDK
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

/**
 * Complete Firebase Database Setup for Portfolio Management System
 * This script creates all required collections and documents
 */

async function setupDatabase() {
  console.log('🚀 Starting Firebase Database Setup...');
  
  try {
    // 1. Create Admin User
    await createAdminUser();
    
    // 2. Create System Settings
    await createSystemSettings();
    
    // 3. Create Sample Posts
    await createSamplePosts();
    
    // 4. Create Sample Chat Room
    await createSampleChatRoom();
    
    // 5. Create Sample Uploaded Files
    await createSampleFiles();
    
    // 6. Create Indexes and Security Rules
    await createIndexes();
    
    console.log('✅ Database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Admin user created');
    console.log('   • System settings configured');
    console.log('   • Sample posts created');
    console.log('   • Sample chat room created');
    console.log('   • Database indexes created');
    console.log('\n🔑 Admin Credentials:');
    console.log('   Email: admin@portfolio.com');
    console.log('   Password: Admin123!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
}

async function createAdminUser() {
  console.log('👤 Creating admin user...');
  
  // Create admin user in Firebase Auth
  const adminUser = {
    email: 'admin@portfolio.com',
    password: 'Admin123!',
    displayName: 'Portfolio Admin',
    emailVerified: true
  };
  
  let userRecord;
  try {
    userRecord = await admin.auth().createUser(adminUser);
    console.log(`   ✓ Admin user created with UID: ${userRecord.uid}`);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('   ✓ Admin user already exists');
      const users = await admin.auth().getUsers([{ email: adminUser.email }]);
      userRecord = users.users[0];
    } else {
      throw error;
    }
  }
  
  // Create admin user document in Firestore
  const adminData = {
    uid: userRecord.uid,
    email: adminUser.email,
    displayName: adminUser.displayName,
    role: 'admin',
    isActive: true,
    permissions: {
      managePosts: true,
      manageUsers: true,
      manageChat: true,
      manageMaintenance: true,
      manageUploads: true,
      viewAnalytics: true,
      systemSettings: true
    },
    profile: {
      avatar: '',
      bio: 'Portfolio Administrator',
      socialLinks: {}
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    loginCount: 0,
    preferences: {
      language: 'ar',
      theme: 'light',
      notifications: {
        email: true,
        sms: false,
        push: true
      }
    }
  };
  
  const adminDoc = await db.collection('users').add(adminData);
  console.log(`   ✓ Admin document created with ID: ${adminDoc.id}`);
  
  return adminDoc;
}

async function createSystemSettings() {
  console.log('⚙️  Creating system settings...');
  
  // General settings
  const generalSettings = {
    site: {
      title: 'نظام إدارة المحفظة',
      titleEn: 'Portfolio Management System',
      description: 'نظام شامل لإدارة المحفظة الشخصية',
      descriptionEn: 'Comprehensive portfolio management system',
      url: process.env.SITE_URL || 'http://localhost:3000',
      logo: '',
      favicon: '',
      language: 'ar',
      timezone: 'Asia/Riyadh',
      currency: 'SAR'
    },
    seo: {
      keywords: ['portfolio', 'personal', 'management', 'blog'],
      keywordsEn: ['portfolio', 'personal', 'management', 'blog'],
      robots: 'index, follow',
      sitemapEnabled: true
    },
    social: {
      twitter: '',
      facebook: '',
      linkedin: '',
      instagram: '',
      github: '',
      email: 'admin@portfolio.com',
      phone: ''
    },
    analytics: {
      googleAnalytics: '',
      facebookPixel: '',
      enabled: false
    },
    features: {
      blogEnabled: true,
      chatEnabled: true,
      maintenanceMode: false,
      commentsEnabled: false,
      newsletterEnabled: false
    },
    lastModified: admin.firestore.FieldValue.serverTimestamp(),
    lastModifiedBy: 'system'
  };
  
  await db.collection('settings').doc('general').set(generalSettings);
  console.log('   ✓ General settings created');
  
  // Maintenance settings
  const maintenanceSettings = {
    isEnabled: false,
    message: 'الموقع تحت الصيانة حالياً',
    enabledAt: null,
    enabledBy: null,
    scheduledMaintenance: null,
    allowedIPs: [],
    allowedRoutes: ['/health', '/api/health'],
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
    },
    statistics: {
      totalDowntime: 0,
      requestsBlocked: 0,
      allowedRequests: 0
    }
  };
  
  await db.collection('settings').doc('maintenance').set(maintenanceSettings);
  console.log('   ✓ Maintenance settings created');
  
  // Email settings
  const emailSettings = {
    provider: 'sendgrid', // or 'smtp'
    fromEmail: 'noreply@portfolio.com',
    fromName: 'Portfolio System',
    templates: {
      welcome: 'welcome-email',
      passwordReset: 'password-reset',
      contact: 'contact-email',
      maintenance: 'maintenance-notification'
    },
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: ''
    },
    sendgrid: {
      apiKey: ''
    }
  };
  
  await db.collection('settings').doc('email').set(emailSettings);
  console.log('   ✓ Email settings created');
  
  // Upload settings
  const uploadSettings = {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: {
      images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      documents: ['application/pdf', 'application/msword', 'text/plain'],
      videos: ['video/mp4', 'video/avi', 'video/mov'],
      audio: ['audio/mp3', 'audio/wav']
    },
    cloudinary: {
      enabled: false,
      cloudName: '',
      apiKey: '',
      apiSecret: ''
    },
    storage: {
      provider: 'local', // or 'cloudinary'
      path: '/uploads'
    }
  };
  
  await db.collection('settings').doc('upload').set(uploadSettings);
  console.log('   ✓ Upload settings created');
}

async function createSamplePosts() {
  console.log('📝 Creating sample posts...');
  
  const samplePosts = [
    {
      title: {
        ar: 'مرحباً بكم في موقعي الشخصي',
        en: 'Welcome to my personal website'
      },
      content: {
        ar: '<p>مرحباً بكم في موقعي الشخصي الجديد. هذا الموقع يحتوي على جميع أعمالي ومشاريعي الشخصية والمهنية.</p><p>يمكنك تصفح المقالات والمشاريع والتواصل معي من خلال نموذج الاتصال.</p>',
        en: '<p>Welcome to my new personal website. This site contains all my personal and professional work and projects.</p><p>You can browse articles and projects and contact me through the contact form.</p>'
      },
      excerpt: {
        ar: 'مرحباً بكم في موقعي الشخصي الجديد. هذا الموقع يحتوي على جميع أعمالي ومشاريعي الشخصية والمهنية.',
        en: 'Welcome to my new personal website. This site contains all my personal and professional work and projects.'
      },
      slug: 'welcome-to-my-website',
      category: 'عام',
      tags: ['ترحيب', 'موقع شخصي'],
      status: 'published',
      featured: true,
      readingTime: 2,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      authorId: 'admin',
      viewCount: 0,
      featuredImage: ''
    },
    {
      title: {
        ar: 'مشاريعي التقنية',
        en: 'My Technical Projects'
      },
      content: {
        ar: '<p>في هذا المقال سأعرض عليكم أهم المشاريع التقنية التي عملت عليها خلال السنوات الماضية.</p><p>تشمل هذه المشاريع تطبيقات الويب، تطبيقات الهاتف المحمول، وأنظمة إدارة البيانات.</p>',
        en: '<p>In this article, I will show you the most important technical projects I have worked on in the past years.</p><p>These projects include web applications, mobile applications, and data management systems.</p>'
      },
      excerpt: {
        ar: 'في هذا المقال سأعرض عليكم أهم المشاريع التقنية التي عملت عليها خلال السنوات الماضية.',
        en: 'In this article, I will show you the most important technical projects I have worked on in the past years.'
      },
      slug: 'my-technical-projects',
      category: 'تقنية',
      tags: ['مشاريع', 'تطوير', 'تقنية'],
      status: 'published',
      featured: false,
      readingTime: 5,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      authorId: 'admin',
      viewCount: 0,
      featuredImage: ''
    },
    {
      title: {
        ar: 'نصائح للمطورين المبتدئين',
        en: 'Tips for Beginner Developers'
      },
      content: {
        ar: '<p>إذا كنت مطوراً مبتدئاً، فإليك بعض النصائح التي ستساعدك في رحلة التعلم والتطوير.</p><ul><li>تعلم الأساسيات جيداً</li><li>مارس البرمجة يومياً</li><li>اقرأ كود الآخرين</li><li>انضم لمجتمع المطورين</li></ul>',
        en: '<p>If you are a beginner developer, here are some tips that will help you in your learning and development journey.</p><ul><li>Learn the basics well</li><li>Practice coding daily</li><li>Read others code</li><li>Join developer communities</li></ul>'
      },
      excerpt: {
        ar: 'إذا كنت مطوراً مبتدئاً، فإليك بعض النصائح التي ستساعدك في رحلة التعلم والتطوير.',
        en: 'If you are a beginner developer, here are some tips that will help you in your learning and development journey.'
      },
      slug: 'tips-for-beginner-developers',
      category: 'تعليمي',
      tags: ['نصائح', 'مطورين', 'تعلم'],
      status: 'published',
      featured: true,
      readingTime: 3,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      authorId: 'admin',
      viewCount: 0,
      featuredImage: ''
    }
  ];
  
  for (const post of samplePosts) {
    const docRef = await db.collection('posts').add(post);
    console.log(`   ✓ Sample post created: ${post.title.ar} (ID: ${docRef.id})`);
  }
}

async function createSampleChatRoom() {
  console.log('💬 Creating sample chat room...');
  
  const chatRoom = {
    roomId: 'sample_room_001',
    visitorName: 'زائر تجريبي',
    visitorEmail: 'visitor@example.com',
    subject: 'استفسار عام',
    status: 'resolved',
    priority: 'normal',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: 'شكراً لكم على الرد السريع',
    lastMessageSender: 'visitor',
    messageCount: 4,
    isResolved: true,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedBy: 'admin',
    tags: ['استفسار', 'عام'],
    metadata: {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1'
    }
  };
  
  const roomRef = await db.collection('chatRooms').add(chatRoom);
  console.log(`   ✓ Sample chat room created (ID: ${roomRef.id})`);
  
  // Create sample messages
  const messages = [
    {
      roomId: 'sample_room_001',
      senderType: 'visitor',
      senderId: 'visitor_sample',
      senderName: 'زائر تجريبي',
      message: 'مرحباً، أريد الاستفسار عن خدماتكم',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true
    },
    {
      roomId: 'sample_room_001',
      senderType: 'admin',
      senderId: 'admin',
      senderName: 'Portfolio Admin',
      message: 'مرحباً بك! يسعدني مساعدتك. ما هو استفسارك تحديداً؟',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true
    },
    {
      roomId: 'sample_room_001',
      senderType: 'visitor',
      senderId: 'visitor_sample',
      senderName: 'زائر تجريبي',
      message: 'أريد معرفة المزيد عن خدمات تطوير المواقع',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true
    },
    {
      roomId: 'sample_room_001',
      senderType: 'admin',
      senderId: 'admin',
      senderName: 'Portfolio Admin',
      message: 'نحن نقدم خدمات تطوير المواقع وتطبيقات الويب بتقنيات حديثة. هل تريد مني إرسال المزيد من التفاصيل؟',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true
    }
  ];
  
  for (const message of messages) {
    await db.collection('messages').add(message);
  }
  console.log('   ✓ Sample chat messages created');
}

async function createSampleFiles() {
  console.log('📁 Creating sample file records...');
  
  const sampleFiles = [
    {
      filename: 'sample-document.pdf',
      originalName: 'مستند تجريبي.pdf',
      mimetype: 'application/pdf',
      size: 1024000,
      category: 'document',
      uploadedBy: 'admin',
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      cloudinary: null,
      localPath: '/uploads/sample-document.pdf',
      isActive: true
    },
    {
      filename: 'sample-image.jpg',
      originalName: 'صورة تجريبية.jpg',
      mimetype: 'image/jpeg',
      size: 512000,
      category: 'image',
      uploadedBy: 'admin',
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      cloudinary: {
        publicId: 'portfolio/sample-image',
        url: 'https://res.cloudinary.com/demo/image/upload/sample-image.jpg',
        width: 1920,
        height: 1080,
        format: 'jpg'
      },
      localPath: '/uploads/sample-image.jpg',
      isActive: true
    }
  ];
  
  for (const file of sampleFiles) {
    const docRef = await db.collection('uploadedFiles').add(file);
    console.log(`   ✓ Sample file created: ${file.originalName} (ID: ${docRef.id})`);
  }
}

async function createIndexes() {
  console.log('🔍 Creating database indexes...');
  
  const indexes = [
    // Posts indexes
    { collection: 'posts', fields: ['status', 'publishedAt'] },
    { collection: 'posts', fields: ['featured', 'status'] },
    { collection: 'posts', fields: ['category', 'status'] },
    { collection: 'posts', fields: ['slug'] },
    { collection: 'posts', fields: ['createdAt'] },
    
    // Users indexes
    { collection: 'users', fields: ['uid'] },
    { collection: 'users', fields: ['email'] },
    { collection: 'users', fields: ['role', 'isActive'] },
    
    // Chat rooms indexes
    { collection: 'chatRooms', fields: ['status', 'lastMessageAt'] },
    { collection: 'chatRooms', fields: ['priority', 'status'] },
    { collection: 'chatRooms', fields: ['roomId'] },
    
    // Messages indexes
    { collection: 'messages', fields: ['roomId', 'timestamp'] },
    { collection: 'messages', fields: ['isRead', 'roomId'] },
    
    // Activity logs indexes
    { collection: 'activityLogs', fields: ['userId', 'timestamp'] },
    { collection: 'activityLogs', fields: ['resource', 'timestamp'] },
    { collection: 'activityLogs', fields: ['action', 'timestamp'] },
    
    // Uploaded files indexes
    { collection: 'uploadedFiles', fields: ['category', 'isActive'] },
    { collection: 'uploadedFiles', fields: ['uploadedBy', 'uploadedAt'] },
    { collection: 'uploadedFiles', fields: ['isActive'] }
  ];
  
  console.log('   ℹ️  Please create these indexes manually in Firebase Console:');
  for (const index of indexes) {
    console.log(`   • ${index.collection}: ${index.fields.join(', ')}`);
  }
  
  console.log('\n   📖 To create indexes:');
  console.log('   1. Go to Firebase Console');
  console.log('   2. Select your project');
  console.log('   3. Go to Firestore Database');
  console.log('   4. Click on "Indexes" tab');
  console.log('   5. Create composite indexes for the above fields');
}

// Reset database (optional)
async function resetDatabase() {
  console.log('⚠️  Resetting database...');
  
  const collections = [
    'users', 'posts', 'chatRooms', 'messages', 
    'uploadedFiles', 'activityLogs', 'settings'
  ];
  
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    const batchSize = snapshot.size;
    
    if (batchSize === 0) {
      console.log(`   ✓ ${collectionName} is already empty`);
      continue;
    }
    
    const batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      count++;
      
      if (count === 400) {
        batch.commit();
        count = 0;
      }
    });
    
    if (count > 0) {
      await batch.commit();
    }
    
    console.log(`   ✓ Deleted ${batchSize} documents from ${collectionName}`);
  }
  
  console.log('✅ Database reset completed');
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setupDatabase().catch(console.error);
      break;
    case 'reset':
      resetDatabase().then(() => {
        console.log('Now you can run: node firebase-setup-enhanced.js setup');
      }).catch(console.error);
      break;
    default:
      console.log(`
Usage:
  node firebase-setup-enhanced.js setup    - Setup the complete database
  node firebase-setup-enhanced.js reset    - Reset the database

Examples:
  node firebase-setup-enhanced.js setup
  node firebase-setup-enhanced.js reset && node firebase-setup-enhanced.js setup
      `);
  }
}

module.exports = {
  setupDatabase,
  resetDatabase,
  createAdminUser,
  createSystemSettings,
  createSamplePosts,
  createSampleChatRoom,
  createSampleFiles,
  createIndexes
};