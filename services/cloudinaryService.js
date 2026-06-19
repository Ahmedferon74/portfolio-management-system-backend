const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

class CloudinaryService {
  // Upload single image from buffer
  async uploadImage(buffer, folder = 'portfolio') {
    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: 'image',
            transformation: [
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                width: result.width,
                height: result.height,
                bytes: result.bytes
              });
            }
          }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
      });
    } catch (error) {
      console.error('Upload image error:', error);
      throw error;
    }
  }

  // Upload multiple images
  async uploadMultipleImages(files, folder = 'portfolio') {
    try {
      const uploadPromises = files.map(file => 
        this.uploadImage(file.buffer, folder)
      );

      const results = await Promise.allSettled(uploadPromises);
      
      const uploaded = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      
      const failed = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);

      return {
        uploaded: uploaded.length,
        failed: failed.length,
        results: uploaded,
        errors: failed
      };
    } catch (error) {
      console.error('Upload multiple images error:', error);
      throw error;
    }
  }

  // Delete image by public ID
  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      return {
        success: result.result === 'ok',
        message: result.result === 'ok' 
          ? 'Image deleted successfully' 
          : 'Image not found or already deleted'
      };
    } catch (error) {
      console.error('Delete image error:', error);
      throw error;
    }
  }

  // Get optimized image URL
  getOptimizedImageUrl(publicId, type = 'card') {
    const transformations = {
      thumbnail: {
        width: 150,
        height: 150,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto'
      },
      card: {
        width: 400,
        height: 250,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto'
      },
      hero: {
        width: 1200,
        height: 600,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto'
      },
      full: {
        quality: 'auto',
        fetch_format: 'auto'
      }
    };

    const transformation = transformations[type] || transformations.card;
    
    return cloudinary.url(publicId, transformation);
  }

  // Get image URL with custom transformations
  async getImageUrl(publicId, transformations = {}) {
    try {
      return cloudinary.url(publicId, {
        quality: 'auto',
        fetch_format: 'auto',
        ...transformations
      });
    } catch (error) {
      console.error('Get image URL error:', error);
      throw error;
    }
  }

  // Get all images from a folder
  async getImagesByFolder(folder = 'portfolio') {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: 500
      });

      return result.resources.map(resource => ({
        url: resource.secure_url,
        publicId: resource.public_id,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes,
        createdAt: resource.created_at
      }));
    } catch (error) {
      console.error('Get images by folder error:', error);
      throw error;
    }
  }

  // Delete multiple images
  async deleteMultipleImages(publicIds) {
    try {
      const result = await cloudinary.api.delete_resources(publicIds);
      
      return {
        deleted: Object.keys(result.deleted).length,
        results: result
      };
    } catch (error) {
      console.error('Delete multiple images error:', error);
      throw error;
    }
  }
}

module.exports = new CloudinaryService();
