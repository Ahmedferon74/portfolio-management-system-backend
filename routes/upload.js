// Backend routes/upload.js - Complete Cloudinary Upload Routes
const express = require('express');
const multer = require('multer');
const admin = require('firebase-admin');
const cloudinaryService = require('../services/cloudinaryService');
const { verifyAuth } = require('./auth');

const router = express.Router();
const db = admin.firestore();

// Multer configuration - memory storage for Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
});

// ==================== SINGLE IMAGE UPLOAD ====================
// @route   POST /api/upload/single
// @desc    Upload single image to Cloudinary
// @access  Private
router.post('/single', verifyAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No image file provided' 
      });
    }

    const folder = req.body.folder || 'portfolio';
    
    // Upload to Cloudinary
    const result = await cloudinaryService.uploadImage(req.file.buffer, folder);

    // Save upload record to Firestore
    const uploadRecord = {
      url: result.url,
      publicId: result.publicId,
      folder: folder,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('uploadedFiles').add(uploadRecord);

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        id: docRef.id,
        ...result
      }
    });

  } catch (error) {
    console.error('Single upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      message: error.message
    });
  }
});

// ==================== MULTIPLE IMAGES UPLOAD ====================
// @route   POST /api/upload/multiple
// @desc    Upload multiple images to Cloudinary
// @access  Private
router.post('/multiple', verifyAuth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No image files provided'
      });
    }

    const folder = req.body.folder || 'portfolio';
    
    // Upload all images to Cloudinary
    const result = await cloudinaryService.uploadMultipleImages(req.files, folder);

    // Save upload records to Firestore
    const batch = db.batch();
    const uploadedDocs = [];

    for (const uploadedImage of result.results) {
      const docRef = db.collection('uploadedFiles').doc();
      const uploadRecord = {
        url: uploadedImage.url,
        publicId: uploadedImage.publicId,
        folder: folder,
        format: uploadedImage.format,
        width: uploadedImage.width,
        height: uploadedImage.height,
        bytes: uploadedImage.bytes,
        uploadedBy: req.user.uid,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      batch.set(docRef, uploadRecord);
      uploadedDocs.push({ id: docRef.id, ...uploadedImage });
    }

    await batch.commit();

    res.status(201).json({
      success: true,
      message: `${result.uploaded} images uploaded successfully`,
      data: {
        uploaded: result.uploaded,
        failed: result.failed,
        images: uploadedDocs,
        errors: result.errors
      }
    });

  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload images',
      message: error.message
    });
  }
});

// ==================== PROJECT IMAGES UPLOAD ====================
// @route   POST /api/upload/project
// @desc    Upload project main image and screenshots
// @access  Private
router.post('/project', verifyAuth, upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'screenshots', maxCount: 10 }
]), async (req, res) => {
  try {
    const results = {
      mainImage: null,
      screenshots: []
    };

    const folder = req.body.folder || 'projects';

    // Upload main image
    if (req.files.mainImage && req.files.mainImage[0]) {
      const mainImageResult = await cloudinaryService.uploadImage(
        req.files.mainImage[0].buffer,
        `${folder}/main`
      );
      results.mainImage = mainImageResult;

      // Save to Firestore
      await db.collection('uploadedFiles').add({
        url: mainImageResult.url,
        publicId: mainImageResult.publicId,
        folder: `${folder}/main`,
        type: 'project-main',
        format: mainImageResult.format,
        width: mainImageResult.width,
        height: mainImageResult.height,
        bytes: mainImageResult.bytes,
        uploadedBy: req.user.uid,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Upload screenshots
    if (req.files.screenshots && req.files.screenshots.length > 0) {
      const screenshotsResult = await cloudinaryService.uploadMultipleImages(
        req.files.screenshots,
        `${folder}/screenshots`
      );
      results.screenshots = screenshotsResult.results;

      // Save to Firestore
      const batch = db.batch();
      for (const screenshot of screenshotsResult.results) {
        const docRef = db.collection('uploadedFiles').doc();
        batch.set(docRef, {
          url: screenshot.url,
          publicId: screenshot.publicId,
          folder: `${folder}/screenshots`,
          type: 'project-screenshot',
          format: screenshot.format,
          width: screenshot.width,
          height: screenshot.height,
          bytes: screenshot.bytes,
          uploadedBy: req.user.uid,
          uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
    }

    res.status(201).json({
      success: true,
      message: 'Project images uploaded successfully',
      data: results
    });

  } catch (error) {
    console.error('Project upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload project images',
      message: error.message
    });
  }
});

// ==================== PROFILE IMAGE UPLOAD ====================
// @route   POST /api/upload/profile
// @desc    Upload profile image
// @access  Private
router.post('/profile', verifyAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    // Upload to Cloudinary with profile folder
    const result = await cloudinaryService.uploadImage(req.file.buffer, 'profile');

    // Update portfolio settings with new profile image
    await db.collection('settings').doc('portfolio').set({
      personalInfo: {
        profileImage: result.url
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    }, { merge: true });

    // Save upload record
    await db.collection('uploadedFiles').add({
      url: result.url,
      publicId: result.publicId,
      folder: 'profile',
      type: 'profile-image',
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: result
    });

  } catch (error) {
    console.error('Profile upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload profile image',
      message: error.message
    });
  }
});

// ==================== POST IMAGE UPLOAD ====================
// @route   POST /api/upload/post
// @desc    Upload post featured image
// @access  Private
router.post('/post', verifyAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    // Upload to Cloudinary with posts folder
    const result = await cloudinaryService.uploadImage(req.file.buffer, 'posts');

    // Save upload record
    await db.collection('uploadedFiles').add({
      url: result.url,
      publicId: result.publicId,
      folder: 'posts',
      type: 'post-image',
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({
      success: true,
      message: 'Post image uploaded successfully',
      data: result
    });

  } catch (error) {
    console.error('Post upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload post image',
      message: error.message
    });
  }
});

// ==================== DELETE IMAGE ====================
// @route   DELETE /api/upload/:publicId
// @desc    Delete image from Cloudinary
// @access  Private
router.delete('/:publicId(*)', verifyAuth, async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        error: 'Public ID is required'
      });
    }

    // Delete from Cloudinary
    const result = await cloudinaryService.deleteImage(publicId);

    // Delete from Firestore
    const snapshot = await db.collection('uploadedFiles')
      .where('publicId', '==', publicId)
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete image',
      message: error.message
    });
  }
});

// ==================== DELETE MULTIPLE IMAGES ====================
// @route   POST /api/upload/delete-multiple
// @desc    Delete multiple images from Cloudinary
// @access  Private
router.post('/delete-multiple', verifyAuth, async (req, res) => {
  try {
    const { publicIds } = req.body;

    if (!publicIds || !Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Public IDs array is required'
      });
    }

    // Delete from Cloudinary
    const result = await cloudinaryService.deleteMultipleImages(publicIds);

    // Delete from Firestore
    const batch = db.batch();
    for (const publicId of publicIds) {
      const snapshot = await db.collection('uploadedFiles')
        .where('publicId', '==', publicId)
        .get();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
    }
    await batch.commit();

    res.json({
      success: true,
      message: `${result.deleted} images deleted successfully`,
      data: result
    });

  } catch (error) {
    console.error('Delete multiple images error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete images',
      message: error.message
    });
  }
});

// ==================== GET UPLOADS ====================
// @route   GET /api/upload/list
// @desc    Get all uploaded images
// @access  Private
router.get('/list', verifyAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const folder = req.query.folder;

    let query = db.collection('uploadedFiles').orderBy('uploadedAt', 'desc');
    
    if (folder) {
      query = query.where('folder', '==', folder);
    }

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

    // Get total count
    const totalSnapshot = await db.collection('uploadedFiles').get();
    const total = totalSnapshot.size;

    res.json({
      success: true,
      data: {
        uploads,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get uploads',
      message: error.message
    });
  }
});

// ==================== GET IMAGES BY FOLDER ====================
// @route   GET /api/upload/folder/:folder
// @desc    Get all images from a specific folder
// @access  Private
router.get('/folder/:folder', verifyAuth, async (req, res) => {
  try {
    const { folder } = req.params;

    // Get from Cloudinary
    const images = await cloudinaryService.getImagesByFolder(folder);

    res.json({
      success: true,
      data: images
    });

  } catch (error) {
    console.error('Get images by folder error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get images',
      message: error.message
    });
  }
});

// ==================== GET OPTIMIZED IMAGE URL ====================
// @route   GET /api/upload/optimize/:publicId
// @desc    Get optimized image URL
// @access  Public
router.get('/optimize/:publicId(*)', async (req, res) => {
  try {
    const { publicId } = req.params;
    const type = req.query.type || 'card';

    const url = cloudinaryService.getOptimizedImageUrl(publicId, type);

    res.json({
      success: true,
      data: { url }
    });

  } catch (error) {
    console.error('Get optimized URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get optimized URL',
      message: error.message
    });
  }
});

module.exports = router;
