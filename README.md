# Portfolio Management System - Backend

نظام إدارة البورتفوليو المتقدم - الخادم الخلفي

## 🚀 الميزات

- **Firebase Integration**: مصادقة وقاعدة بيانات
- **Cloudinary Integration**: إدارة الصور المتقدمة
- **RESTful APIs**: واجهات برمجية منظمة
- **Security**: حماية متقدمة مع Helmet و Rate Limiting
- **File Upload**: رفع متعدد للملفات مع تحسين تلقائي
- **Real-time Chat**: شات مباشر مع Firebase Realtime Database
- **Multi-language**: دعم كامل للعربية والإنجليزية

## 📋 المتطلبات

- Node.js (v16 أو أحدث)
- npm أو yarn
- Firebase Project مع Admin SDK
- Cloudinary Account

## ⚙️ الإعداد والتثبيت

### 1. تثبيت المتطلبات

```bash
npm install
```

### 2. إعداد متغيرات البيئة

انسخ ملف `.env.example` إلى `.env` وأضف بياناتك:

```bash
cp .env.example .env
```

قم بتعديل القيم التالية في ملف `.env`:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc123@your-project-id.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Security
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3000
```

### 3. إعداد Firebase

1. أنشئ مشروع Firebase جديد
2. فعّل Authentication, Firestore, Realtime Database
3. أنشئ Service Account Key
4. احفظ الملف في `config/serviceAccount.json`

### 4. إعداد Cloudinary

1. أنشئ حساب Cloudinary
2. احصل على Cloud Name, API Key, API Secret
3. أضفها إلى ملف `.env`

## 🏃‍♂️ تشغيل الخادم

### للتطوير:
```bash
npm run dev
```

### للإنتاج:
```bash
npm start
```

الخادم سيعمل على: `http://localhost:5000`

## 📡 APIs المتاحة

### المصادقة (Authentication)
- `POST /api/auth/login` - تسجيل دخول الأدمن
- `POST /api/auth/logout` - تسجيل خروج
- `GET /api/auth/me` - معلومات الأدمن الحالي

### إدارة الأدمن (Admin Management)
- `GET /api/admin/dashboard` - إحصائيات لوحة التحكم
- `GET /api/admin/portfolio` - بيانات البورتفوليو
- `PUT /api/admin/portfolio` - تحديث بيانات البورتفوليو
- `GET /api/admin/projects` - جميع المشاريع
- `POST /api/admin/projects` - إنشاء مشروع جديد
- `PUT /api/admin/projects/:id` - تحديث مشروع
- `DELETE /api/admin/projects/:id` - حذف مشروع
- `GET /api/admin/posts` - جميع المقالات
- `POST /api/admin/posts` - إنشاء مقال جديد
- `GET /api/admin/settings` - إعدادات الموقع
- `PUT /api/admin/settings` - تحديث الإعدادات

### الموقع العام (Public Portfolio)
- `GET /api/portfolio` - بيانات البورتفوليو العامة
- `GET /api/portfolio/personal-info` - المعلومات الشخصية
- `GET /api/portfolio/projects` - المشاريع العامة
- `GET /api/portfolio/projects/:id` - مشروع محدد
- `GET /api/portfolio/posts` - المقالات العامة
- `GET /api/portfolio/posts/:id` - مقال محدد
- `GET /api/portfolio/skills` - المهارات
- `GET /api/portfolio/experience` - الخبرات
- `GET /api/portfolio/stats` - الإحصائيات

### الشات (Chat)
- `GET /api/chat/messages` - الرسائل
- `POST /api/chat/send` - إرسال رسالة (للزوار)
- `POST /api/chat/admin/reply` - رد الأدمن
- `GET /api/chat/conversations` - جميع المحادثات
- `POST /api/chat/typing` - حالة الكتابة

### رفع الملفات (Upload)
- `POST /api/upload/single` - رفع صورة واحدة
- `POST /api/upload/multiple` - رفع صور متعددة
- `POST /api/upload/project` - رفع صور المشروع
- `POST /api/upload/post` - رفع صور المقال
- `DELETE /api/upload/:publicId` - حذف صورة
- `GET /api/upload/optimized/:publicId` - صورة محسّنة

## 🔒 الأمان

- **Helmet**: حماية رؤوس HTTP
- **Rate Limiting**: تحديد معدل الطلبات
- **CORS**: تحكم في الوصول
- **Input Validation**: التحقق من صحة البيانات
- **Firebase Auth**: مصادقة آمنة

## 📊 قاعدة البيانات

### Firestore Collections:
- `portfolio/data` - بيانات البورتفوليو
- `projects` - المشاريع
- `posts` - المقالات
- `settings/main` - إعدادات الموقع

### Realtime Database:
- `chat/messages` - رسائل الشات

## 🖼️ Cloudinary

الصور مرتّبة في المجلدات التالية:
- `portfolio/` - الصور الشخصية
- `portfolio/projects/` - صور المشاريع
- `portfolio/projects/screenshots/` - لقطات المشاريع
- `portfolio/posts/` - صور المقالات
- `portfolio/posts/content/` - صور محتوى المقالات

## 🛠️ معالجة الأخطاء

جميع APIs ترجع رسائل خطأ موحدة:
```json
{
  "error": "خطأ وصف",
  "message": "تفاصيل الخطأ"
}
```

## 📝 ملاحظات مهمة

1. **Firebase**: تأكد من إعداد Firebase Security Rules بشكل صحيح
2. **Cloudinary**: راجع حدود الخطة المجانية
3. **Environment**: لا ترفع ملفات البيئة إلى Git
4. **HTTPS**: استخدم HTTPS في الإنتاج

## 🐛 استكشاف الأخطاء

### مشاكل شائعة:

1. **خطأ في Firebase Auth**:
   - تأكد من صحة Service Account Key
   - تحقق من Firebase Project ID

2. **خطأ في Cloudinary**:
   - تحقق من صحة API Key و Secret
   - تأكد من وجود مجلدات الصور

3. **خطأ في CORS**:
   - تحقق من CORS_ORIGIN في ملف .env

4. **خطأ في رفع الملفات**:
   - تأكد من نوع الملف (صور فقط)
   - تحقق من حجم الملف (أقصى 10MB)

## 📄 الترخيص

MIT License - راجع ملف LICENSE للتفاصيل.