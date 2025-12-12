// gallery-backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// ============================================
// 1. CONFIGURATION CHECK
// ============================================
console.log('🔧 Checking Environment Configuration...');
console.log('Port:', PORT);
console.log('Cloudinary Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET');
console.log('MongoDB URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');

// ============================================
// 2. CLOUDINARY CONFIGURATION
// ============================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

console.log('✅ Cloudinary initialized');

// ============================================
// 3. MIDDLEWARE SETUP
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// 4. MONGODB CONNECTION
// ============================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/";

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Continuing without database...');
});

// ============================================
// 5. MONGOOSE MODELS
// ============================================
const photoSchema = new mongoose.Schema({
    photoUrl: {
        type: String,
        required: true
    },
    publicId: {
        type: String,
        required: true
    },
    caption: {
        type: String,
        default: 'No Caption'
    },
    uploader: {
        type: String,
        default: 'Admin'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const GalleryPhoto = mongoose.model('GalleryPhoto', photoSchema);

// ============================================
// 6. MULTER CONFIGURATION
// ============================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// ============================================
// 7. AUTHENTICATION MIDDLEWARE
// ============================================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Admin_Access_Token_Placeholder';

const protectAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.header('Authorization');
        
        console.log('🔐 Auth Check:');
        console.log('Request Headers:', JSON.stringify(req.headers));
        console.log('Auth Header:', authHeader);
        console.log('Expected Token:', ADMIN_TOKEN);
        
        if (!authHeader) {
            console.log('❌ No Authorization header');
            return res.status(401).json({
                success: false,
                message: 'Authorization header is missing'
            });
        }
        
        // Remove 'Bearer ' prefix if present
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
        
        console.log('Extracted Token:', token);
        
        if (token.trim() === ADMIN_TOKEN.trim()) {
            console.log('✅ Token verified successfully');
            req.user = { role: 'admin' };
            next();
        } else {
            console.log('❌ Token mismatch');
            return res.status(401).json({
                success: false,
                message: 'Invalid authorization token'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

// ============================================
// 8. SOCKET.IO SETUP
// ============================================
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const emitGalleryUpdate = async () => {
    try {
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
        io.emit('gallery_updated', photos);
        console.log('📡 Emitted gallery update to clients');
    } catch (error) {
        console.error('Error emitting gallery update:', error);
    }
};

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============================================
// 9. ROUTES
// ============================================

// HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'KMV Gallery Backend',
        timestamp: new Date().toISOString(),
        port: PORT,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured'
    });
});

// GET ALL PHOTOS (PUBLIC)
app.get('/api/gallery', async (req, res) => {
    try {
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            count: photos.length,
            photos: photos
        });
    } catch (error) {
        console.error('Error fetching photos:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch photos'
        });
    }
});

// UPLOAD PHOTO (ADMIN ONLY) - FIXED VERSION
app.post('/api/gallery/upload', protectAdmin, upload.single('image'), async (req, res) => {
    console.log('\n📤 ========== UPLOAD REQUEST STARTED ==========');
    console.log('Request Body:', req.body);
    console.log('Uploaded File:', req.file);
    
    if (!req.file) {
        console.log('❌ No file uploaded');
        return res.status(400).json({
            success: false,
            message: 'No image file provided'
        });
    }
    
    const { caption, uploader } = req.body;
    const tempFilePath = req.file.path;
    
    try {
        // Step 1: Check Cloudinary credentials
        if (!process.env.CLOUDINARY_CLOUD_NAME || 
            !process.env.CLOUDINARY_API_KEY || 
            !process.env.CLOUDINARY_API_SECRET) {
            throw new Error('Cloudinary credentials are not configured');
        }
        
        console.log('☁️ Step 1: Uploading to Cloudinary...');
        
        // Step 2: Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(tempFilePath, {
            folder: 'kmv_gallery',
            resource_type: 'auto',
            timeout: 60000 // 60 seconds timeout
        });
        
        console.log('✅ Cloudinary Upload Successful!');
        console.log('Public ID:', uploadResult.public_id);
        console.log('Secure URL:', uploadResult.secure_url);
        
        // Step 3: Remove temporary file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log('🗑️ Temporary file removed');
        }
        
        // Step 4: Save to database
        console.log('💾 Step 2: Saving to database...');
        
        const newPhoto = new GalleryPhoto({
            photoUrl: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            caption: caption || 'No Caption',
            uploader: uploader || 'Admin'
        });
        
        const savedPhoto = await newPhoto.save();
        console.log('✅ Database save successful');
        console.log('Photo ID:', savedPhoto._id);
        
        // Step 5: Emit real-time update
        await emitGalleryUpdate();
        
        console.log('📡 Gallery update emitted');
        console.log('========== UPLOAD COMPLETED SUCCESSFULLY ==========\n');
        
        res.status(201).json({
            success: true,
            message: 'Photo uploaded successfully!',
            photo: {
                _id: savedPhoto._id,
                photoUrl: savedPhoto.photoUrl,
                caption: savedPhoto.caption,
                uploader: savedPhoto.uploader,
                createdAt: savedPhoto.createdAt
            }
        });
        
    } catch (error) {
        console.error('\n❌ ========== UPLOAD ERROR ==========');
        console.error('Error Type:', error.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        
        // Clean up temporary file if it exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ Cleaned up temporary file after error');
            } catch (cleanupError) {
                console.error('Failed to clean up temp file:', cleanupError.message);
            }
        }
        
        // Determine error type and send appropriate response
        let errorMessage = 'Failed to upload photo';
        let statusCode = 500;
        
        if (error.message.includes('Cloudinary')) {
            errorMessage = 'Cloudinary upload failed. Please check your Cloudinary credentials.';
            statusCode = 400;
        } else if (error.message.includes('file size')) {
            errorMessage = 'File size too large. Maximum size is 10MB.';
            statusCode = 400;
        } else if (error.name === 'ValidationError') {
            errorMessage = 'Invalid data provided';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// TEST UPLOAD (NO AUTH REQUIRED)
app.post('/api/test-upload', upload.single('image'), async (req, res) => {
    console.log('🧪 Test upload request');
    
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file provided for test'
        });
    }
    
    try {
        // Just simulate upload without Cloudinary
        const tempFilePath = req.file.path;
        
        // Clean up temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        res.json({
            success: true,
            message: 'Test upload successful (file received)',
            fileInfo: {
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Test upload failed',
            error: error.message
        });
    }
});

// DELETE PHOTO (ADMIN ONLY)
app.delete('/api/gallery/:id', protectAdmin, async (req, res) => {
    try {
        const photoId = req.params.id;
        
        console.log('🗑️ Delete request for photo:', photoId);
        
        // Find the photo first
        const photo = await GalleryPhoto.findById(photoId);
        
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }
        
        // Delete from Cloudinary
        if (photo.publicId) {
            try {
                await cloudinary.uploader.destroy(photo.publicId);
                console.log('✅ Deleted from Cloudinary:', photo.publicId);
            } catch (cloudinaryError) {
                console.error('Cloudinary delete error:', cloudinaryError);
                // Continue with database deletion even if Cloudinary fails
            }
        }
        
        // Delete from database
        await GalleryPhoto.findByIdAndDelete(photoId);
        
        // Emit update
        await emitGalleryUpdate();
        
        res.json({
            success: true,
            message: 'Photo deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete photo'
        });
    }
});

// VERIFY ADMIN TOKEN
app.get('/api/verify-admin', protectAdmin, (req, res) => {
    res.json({
        success: true,
        message: 'Admin token is valid',
        user: req.user
    });
});

// CLOUDINARY TEST ENDPOINT
app.get('/api/test-cloudinary', async (req, res) => {
    try {
        // Simple ping to check Cloudinary connection
        const result = await cloudinary.api.ping();
        
        res.json({
            success: true,
            message: 'Cloudinary connection successful',
            cloudinary: {
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                status: 'connected'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Cloudinary connection failed',
            error: error.message
        });
    }
});

// ============================================
// 10. ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
    console.error('🚨 Unhandled Error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum 10MB allowed.'
            });
        }
        return res.status(400).json({
            success: false,
            message: 'File upload error: ' + err.message
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// ============================================
// 11. SERVER STARTUP
// ============================================
// Ensure uploads directory exists
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 KMV GALLERY BACKEND SERVER STARTED');
    console.log('='.repeat(50));
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'NOT CONFIGURED'}`);
    console.log(`🗄️ MongoDB: ${mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'}`);
    console.log(`🔑 Admin Token: "${ADMIN_TOKEN}"`);
    console.log('='.repeat(50));
    console.log('\n📋 AVAILABLE ENDPOINTS:');
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`   GET  http://localhost:${PORT}/api/gallery`);
    console.log(`   GET  http://localhost:${PORT}/api/test-cloudinary`);
    console.log(`   POST http://localhost:${PORT}/api/gallery/upload`);
    console.log(`   POST http://localhost:${PORT}/api/test-upload`);
    console.log(`   DELETE http://localhost:${PORT}/api/gallery/:id`);
    console.log('='.repeat(50));
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Ensure .env file exists in backend folder');
    console.log('2. Check Cloudinary credentials in .env');
    console.log('3. Verify MongoDB connection');
    console.log('='.repeat(50) + '\n');
});
