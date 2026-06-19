// أضف هذا الـ route في ملف admin.js أو أنشئ ملف جديد routes/upload.js

// ==================== CLOUDINARY UPLOAD ====================

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

// Configure Cloudinary - أضف هذه القيم في ملف .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory storage for Cloudinary
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  }
});

// Upload image to Cloudinary
// @route   POST /api/admin/upload/image
router.post('/upload/image', verifyAuth, uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder = req.body.folder || 'portfolio';

    // Upload to Cloudinary using stream
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' }, // Max dimensions
            { quality: 'auto:good' }, // Auto quality
            { fetch_format: 'auto' } // Auto format (webp, etc)
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    const result = await uploadPromise;

    // Save to Firestore (optional - for tracking uploads)
    await db.collection('uploadedFiles').add({
      url: result.secure_url,
      publicId: result.public_id,
      folder: folder,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    });

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload image', 
      message: error.message 
    });
  }
});

// Delete image from Cloudinary
// @route   DELETE /api/admin/upload/image/:publicId
router.delete('/upload/image/:publicId', verifyAuth, async (req, res) => {
  try {
    const { publicId } = req.params;
    
    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);
    
    // Delete from Firestore
    const snapshot = await db.collection('uploadedFiles')
      .where('publicId', '==', publicId)
      .get();
    
    snapshot.forEach(doc => doc.ref.delete());

    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image', message: error.message });
  }
});

// ==================== PUBLIC PORTFOLIO ROUTE ====================
// أضف هذا في ملف routes/public.js

// @route   GET /api/public/portfolio
router.get('/portfolio', async (req, res) => {
  try {
    const portfolioDoc = await db.collection('settings').doc('portfolio').get();
    const skillsSnapshot = await db.collection('skills').orderBy('order', 'asc').get();

    const skills = [];
    skillsSnapshot.forEach(doc => {
      skills.push({ id: doc.id, ...doc.data() });
    });

    if (!portfolioDoc.exists) {
      return res.json({
        success: true,
        data: {
          personalInfo: {},
          skills: skills,
          experience: [],
          education: [],
          socialLinks: {}
        }
      });
    }

    const portfolioData = portfolioDoc.data();
    res.json({
      success: true,
      data: {
        personalInfo: portfolioData.personalInfo || {},
        skills: skills,
        experience: portfolioData.experience || [],
        education: portfolioData.education || [],
        socialLinks: portfolioData.socialLinks || {}
      }
    });
  } catch (error) {
    console.error('Get public portfolio error:', error);
    res.status(500).json({ error: 'Failed to get portfolio', message: error.message });
  }
});
