const express = require('express');
const firebaseService = require('../services/firebaseService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/portfolio
// @desc    Get public portfolio data
// @access  Public
router.get('/', async (req, res) => {
  try {
    const portfolio = await firebaseService.getPortfolioData();
    const settings = await firebaseService.getSettings();
    
    // Check maintenance mode
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true,
        message: settings[req.query.lang === 'en' ? 'maintenanceMessageEn' : 'maintenanceMessage']
      });
    }
    
    res.json({
      success: true,
      data: {
        portfolio,
        settings
      }
    });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({
      error: 'Failed to get portfolio data',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/personal-info
// @desc    Get personal information
// @access  Public
router.get('/personal-info', async (req, res) => {
  try {
    const portfolio = await firebaseService.getPortfolioData();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    res.json({
      success: true,
      data: portfolio.personalInfo
    });
  } catch (error) {
    console.error('Get personal info error:', error);
    res.status(500).json({
      error: 'Failed to get personal information',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/projects
// @desc    Get public projects
// @access  Public
router.get('/projects', async (req, res) => {
  try {
    const projects = await firebaseService.getProjects();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    // Filter only published/active projects for public view
    const publicProjects = projects.filter(project => 
      project.status === 'published' || project.status === 'active'
    );
    
    res.json({
      success: true,
      data: publicProjects
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      error: 'Failed to get projects',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/projects/:id
// @desc    Get single project
// @access  Public
router.get('/projects/:id', async (req, res) => {
  try {
    const projects = await firebaseService.getProjects();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    const project = projects.find(p => p.id === req.params.id);
    
    if (!project) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }
    
    // Check if project is public
    if (project.status !== 'published' && project.status !== 'active') {
      return res.status(404).json({
        error: 'Project not found'
      });
    }
    
    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      error: 'Failed to get project',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/posts
// @desc    Get public posts
// @access  Public
router.get('/posts', async (req, res) => {
  try {
    const posts = await firebaseService.getPosts();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    // Filter only published posts for public view
    const publicPosts = posts.filter(post => post.status === 'published');
    
    res.json({
      success: true,
      data: publicPosts
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      error: 'Failed to get posts',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/posts/:id
// @desc    Get single post
// @access  Public
router.get('/posts/:id', async (req, res) => {
  try {
    const posts = await firebaseService.getPosts();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    const post = posts.find(p => p.id === req.params.id);
    
    if (!post) {
      return res.status(404).json({
        error: 'Post not found'
      });
    }
    
    // Check if post is public
    if (post.status !== 'published') {
      return res.status(404).json({
        error: 'Post not found'
      });
    }
    
    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({
      error: 'Failed to get post',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/skills
// @desc    Get skills
// @access  Public
router.get('/skills', async (req, res) => {
  try {
    const portfolio = await firebaseService.getPortfolioData();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    res.json({
      success: true,
      data: portfolio.skills || []
    });
  } catch (error) {
    console.error('Get skills error:', error);
    res.status(500).json({
      error: 'Failed to get skills',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/experience
// @desc    Get experience
// @access  Public
router.get('/experience', async (req, res) => {
  try {
    const portfolio = await firebaseService.getPortfolioData();
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    res.json({
      success: true,
      data: portfolio.experience || []
    });
  } catch (error) {
    console.error('Get experience error:', error);
    res.status(500).json({
      error: 'Failed to get experience',
      message: error.message
    });
  }
});

// @route   GET /api/portfolio/stats
// @desc    Get portfolio statistics
// @access  Public
router.get('/stats', async (req, res) => {
  try {
    const [portfolio, projects, posts] = await Promise.all([
      firebaseService.getPortfolioData(),
      firebaseService.getProjects(),
      firebaseService.getPosts()
    ]);
    
    const settings = await firebaseService.getSettings();
    
    if (settings.maintenanceMode) {
      return res.status(503).json({
        error: 'Site under maintenance',
        maintenance: true
      });
    }
    
    const publicProjects = projects.filter(p => p.status === 'published' || p.status === 'active');
    const publicPosts = posts.filter(p => p.status === 'published');
    
    res.json({
      success: true,
      data: {
        totalProjects: publicProjects.length,
        totalPosts: publicPosts.length,
        totalSkills: portfolio.skills?.length || 0,
        yearsExperience: portfolio.experience?.length || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

module.exports = router;