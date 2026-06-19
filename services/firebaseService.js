const { db, realtimeDb, auth } = require('../config/firebase');

class FirebaseService {
  // Admin authentication
  async loginAdmin(email, password) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      
      // Check if user has admin role
      if (!userRecord.customClaims || !userRecord.customClaims.admin) {
        throw new Error('User does not have admin privileges');
      }

      // Create custom token for Firebase Auth
      const customToken = await auth.createCustomToken(userRecord.uid, {
        admin: true,
        role: 'admin'
      });

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          admin: true,
          role: 'admin'
        },
        customToken
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  // Portfolio data management
  async getPortfolioData() {
    try {
      const doc = await db.collection('portfolio').doc('data').get();
      
      if (!doc.exists) {
        return this.getDefaultPortfolioData();
      }
      
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to get portfolio data: ${error.message}`);
    }
  }

  async updatePortfolioData(data) {
    try {
      const docRef = db.collection('portfolio').doc('data');
      await docRef.set(data, { merge: true });
      
      const updatedDoc = await docRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      throw new Error(`Failed to update portfolio data: ${error.message}`);
    }
  }

  // Projects management
  async getProjects() {
    try {
      const snapshot = await db.collection('projects').orderBy('createdAt', 'desc').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw new Error(`Failed to get projects: ${error.message}`);
    }
  }

  async createProject(projectData) {
    try {
      const docRef = await db.collection('projects').add({
        ...projectData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async updateProject(projectId, updates) {
    try {
      const docRef = db.collection('projects').doc(projectId);
      await docRef.update({
        ...updates,
        updatedAt: new Date()
      });
      
      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  async deleteProject(projectId) {
    try {
      await db.collection('projects').doc(projectId).delete();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  // Posts management
  async getPosts() {
    try {
      const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw new Error(`Failed to get posts: ${error.message}`);
    }
  }

  async createPost(postData) {
    try {
      const docRef = await db.collection('posts').add({
        ...postData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to create post: ${error.message}`);
    }
  }

  // Chat management
  async getChatMessages() {
    try {
      const messagesRef = realtimeDb.ref('chat/messages');
      const snapshot = await messagesRef.once('value');
      
      const messages = [];
      snapshot.forEach((childSnapshot) => {
        messages.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      
      return messages.reverse(); // Latest messages first
    } catch (error) {
      throw new Error(`Failed to get chat messages: ${error.message}`);
    }
  }

  async sendChatMessage(messageData) {
    try {
      const messagesRef = realtimeDb.ref('chat/messages');
      const newMessageRef = messagesRef.push();
      
      await newMessageRef.set({
        ...messageData,
        timestamp: new Date().toISOString(),
        id: newMessageRef.key
      });
      
      return { id: newMessageRef.key, ...messageData };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  // Settings management
  async getSettings() {
    try {
      const doc = await db.collection('settings').doc('main').get();
      
      if (!doc.exists) {
        return this.getDefaultSettings();
      }
      
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Failed to get settings: ${error.message}`);
    }
  }

  async updateSettings(settings) {
    try {
      const docRef = db.collection('settings').doc('main');
      await docRef.set(settings, { merge: true });
      
      const updatedDoc = await docRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      throw new Error(`Failed to update settings: ${error.message}`);
    }
  }

  // Statistics
  async getStats() {
    try {
      const [projectsSnapshot, postsSnapshot] = await Promise.all([
        db.collection('projects').get(),
        db.collection('posts').get()
      ]);

      const messagesRef = realtimeDb.ref('chat/messages');
      const messagesSnapshot = await messagesRef.once('value');
      const messagesCount = messagesSnapshot.numChildren();

      return {
        totalProjects: projectsSnapshot.size,
        totalPosts: postsSnapshot.size,
        totalMessages: messagesCount,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  // Default data methods
  getDefaultPortfolioData() {
    return {
      personalInfo: {
        name: 'أحمد محمد',
        nameEn: 'Ahmed Mohamed',
        title: 'Full Stack Developer',
        titleEn: 'Full Stack Developer',
        bio: 'مطور ويب متخصص في تقنيات حديثة مع خبرة 5+ سنوات في تطوير تطبيقات الويب المتقدمة.',
        bioEn: 'Experienced web developer specializing in modern technologies with 5+ years in advanced web application development.',
        email: 'ahmed@example.com',
        phone: '+201234567890',
        location: 'القاهرة، مصر',
        locationEn: 'Cairo, Egypt'
      },
      skills: [
        { name: 'JavaScript', level: 95, category: 'Frontend' },
        { name: 'React', level: 90, category: 'Frontend' },
        { name: 'Node.js', level: 85, category: 'Backend' },
        { name: 'Python', level: 80, category: 'Backend' },
        { name: 'MongoDB', level: 75, category: 'Database' },
        { name: 'PostgreSQL', level: 80, category: 'Database' }
      ],
      experience: [
        {
          title: 'Senior Full Stack Developer',
          company: 'Tech Solutions Ltd',
          period: '2022 - Present',
          description: 'قيادة فريق تطوير وتطبيق أفضل الممارسات في البرمجة.'
        },
        {
          title: 'Frontend Developer',
          company: 'Digital Agency',
          period: '2020 - 2022',
          description: 'تطوير واجهات مستخدم متقدمة وتفاعلية.'
        }
      ],
      languages: {
        ar: 'العربية',
        en: 'English'
      },
      socialLinks: {
        github: 'https://github.com/ahmed',
        linkedin: 'https://linkedin.com/in/ahmed',
        twitter: 'https://twitter.com/ahmed'
      }
    };
  }

  getDefaultSettings() {
    return {
      maintenanceMode: false,
      maintenanceMessage: 'الموقع تحت الصيانة حالياً',
      maintenanceMessageEn: 'Site is under maintenance',
      defaultLanguage: 'ar',
      theme: 'dark',
      enableChat: true,
      enableContact: true,
      enableDownloadCV: true
    };
  }
}

module.exports = new FirebaseService();