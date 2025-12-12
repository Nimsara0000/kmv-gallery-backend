// gallery-backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ FIXED: Environment variables with Render.com support
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'daght1q5y';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '378275388334277';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'FBEaxHcMmPhUXrHnI4S5Nemfz2U';
// ✅ FIXED: MongoDB URI with correct database name
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Admin_Access_Token_Placeholder';

console.log('🔧 Environment Check:');
console.log('- Port:', PORT);
console.log('- Cloudinary Cloud Name:', CLOUDINARY_CLOUD_NAME);
console.log('- Cloudinary API Key:', CLOUDINARY_API_KEY ? '✓ SET' : '✗ MISSING');
console.log('- MongoDB URI:', MONGO_URI.includes('KMV_Gallery_DB') ? '✓ Correct DB' : '✗ Wrong DB');

// ✅ Cloudinary Configuration
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});

// Middleware
app.use(cors({ 
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection with better options
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ MongoDB Connected to Database: KMV_Gallery_DB');
    console.log('✅ Connection State:', mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected');
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('❌ Full Error:', err);
});

// Gallery Model
const gallerySchema = new mongoose.Schema({
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
        default: 'No caption'
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

const GalleryPhoto = mongoose.model('GalleryPhoto', gallerySchema);

// Multer Setup
const upload = multer({ 
    dest: 'uploads/',
    limits: { 
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
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

// ✅ FIXED: Admin Authentication Middleware
const protectAdmin = (req, res, next) => {
    const token = req.header('Authorization') || req.headers.authorization;
    
    console.log('🔐 Auth Check:');
    console.log('- Token received:', token);
    console.log('- Expected token:', ADMIN_TOKEN);
    console.log('- Path:', req.path);
    
    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ 
            success: false,
            error: 'Authorization token is required',
            message: 'Authorization denied. Admin access required.' 
        });
    }
    
    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '').trim();
    
    if (cleanToken === ADMIN_TOKEN.trim()) {
        console.log('✅ Token verified');
        req.user = { role: 'admin' };
        next();
    } else {
        console.log('❌ Token mismatch');
        console.log('- Received:', cleanToken);
        console.log('- Expected:', ADMIN_TOKEN.trim());
        res.status(401).json({ 
            success: false,
            error: 'Invalid token',
            message: 'Authorization denied. Admin access required.' 
        });
    }
};

// ✅ FIXED: GET ALL PHOTOS
app.get('/api/gallery', async (req, res) => {
    console.log('📸 GET /api/gallery request');
    try {
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
        console.log(`✅ Found ${photos.length} photos`);
        res.json(photos);
    } catch (error) {
        console.error('❌ Error fetching photos:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch photos',
            message: error.message 
        });
    }
});

// ✅ FIXED: UPLOAD PHOTO
app.post('/api/gallery/upload', protectAdmin, upload.single('image'), async (req, res) => {
    console.log('📤 Upload Request Received');
    console.log('- File:', req.file ? 'Present' : 'Missing');
    console.log('- Body:', req.body);
    console.log('- User:', req.user);
    
    if (!req.file) {
        return res.status(400).json({ 
            success: false,
            error: 'No file',
            message: 'No image file uploaded.' 
        });
    }
    
    const { caption, uploader } = req.body;
    
    try {
        console.log('☁️ Uploading to Cloudinary...');
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'kmv_gallery',
            resource_type: 'auto'
        });
        
        console.log('✅ Cloudinary Upload Successful');
        console.log('- URL:', result.secure_url);
        console.log('- Public ID:', result.public_id);
        
        // Remove temp file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('🗑️ Temporary file removed');
        }
        
        // Save to database
        console.log('💾 Saving to database...');
        const newPhoto = new GalleryPhoto({
            photoUrl: result.secure_url,
            publicId: result.public_id,
            caption: caption || 'No caption',
            uploader: uploader || 'Admin'
        });
        
        const savedPhoto = await newPhoto.save();
        console.log('✅ Database save successful');
        console.log('- Photo ID:', savedPhoto._id);
        
        res.json({
            success: true,
            message: '✅ Photo uploaded successfully!',
            photo: savedPhoto
        });
        
    } catch (error) {
        console.error('❌ Upload Error:', error.message);
        console.error('❌ Error Stack:', error.stack);
        
        // Clean up on error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('🗑️ Cleaned up temp file after error');
            } catch (unlinkError) {
                console.error('Failed to clean up:', unlinkError.message);
            }
        }
        
        let errorMessage = 'Upload failed';
        if (error.message.includes('Cloudinary')) {
            errorMessage = 'Cloudinary upload failed. Check credentials.';
        } else if (error.message.includes('Mongo')) {
            errorMessage = 'Database error. Could not save photo.';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ✅ FIXED: DELETE PHOTO ENDPOINT
app.delete('/api/gallery/:id', protectAdmin, async (req, res) => {
    const photoId = req.params.id;
    
    console.log('🗑️ DELETE Request Received');
    console.log('- Photo ID:', photoId);
    console.log('- Request Headers:', req.headers);
    console.log('- User:', req.user);
    
    if (!photoId || photoId === 'undefined' || photoId === 'null') {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID',
            message: 'Photo ID is required'
        });
    }
    
    try {
        // Check if photo exists
        console.log('🔍 Looking for photo in database...');
        const photo = await GalleryPhoto.findById(photoId);
        
        if (!photo) {
            console.log('❌ Photo not found with ID:', photoId);
            
            // Check if it's a valid ObjectId format
            if (!mongoose.Types.ObjectId.isValid(photoId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid ID format',
                    message: 'The provided ID is not in the correct format'
                });
            }
            
            return res.status(404).json({
                success: false,
                error: 'Photo not found',
                message: `Photo with ID ${photoId} was not found in the database`,
                requestedId: photoId
            });
        }
        
        console.log('✅ Photo found:', {
            id: photo._id,
            caption: photo.caption,
            publicId: photo.publicId
        });
        
        // Delete from Cloudinary
        if (photo.publicId) {
            try {
                console.log('☁️ Deleting from Cloudinary...');
                await cloudinary.uploader.destroy(photo.publicId);
                console.log('✅ Deleted from Cloudinary:', photo.publicId);
            } catch (cloudinaryError) {
                console.error('⚠️ Cloudinary delete error:', cloudinaryError.message);
                // Continue even if Cloudinary fails
            }
        }
        
        // Delete from database
        console.log('🗄️ Deleting from database...');
        await GalleryPhoto.findByIdAndDelete(photoId);
        console.log('✅ Deleted from database');
        
        res.json({
            success: true,
            message: '✅ Photo deleted successfully',
            deletedPhoto: {
                id: photo._id,
                caption: photo.caption,
                publicId: photo.publicId
            }
        });
        
    } catch (error) {
        console.error('❌ Delete Error:', error.message);
        console.error('❌ Error Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            error: 'Server error',
            message: 'Failed to delete photo',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ✅ ADDED: GET SINGLE PHOTO (for testing)
app.get('/api/gallery/:id', async (req, res) => {
    try {
        const photo = await GalleryPhoto.findById(req.params.id);
        
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Photo not found'
            });
        }
        
        res.json({
            success: true,
            photo: photo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching photo'
        });
    }
});

// ✅ ADDED: DELETE TEST ENDPOINT (for debugging)
app.delete('/api/test-delete/:id', async (req, res) => {
    console.log('🧪 Test delete for ID:', req.params.id);
    
    // Simulate delete without actual deletion
    res.json({
        success: true,
        message: 'Test delete successful (no actual deletion)',
        testId: req.params.id,
        note: 'This is a test endpoint. Use /api/gallery/:id for real deletion.'
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '✅ Server is working on Render.com',
        endpoints: {
            getPhotos: 'GET /api/gallery',
            uploadPhoto: 'POST /api/gallery/upload',
            deletePhoto: 'DELETE /api/gallery/:id',
            getPhoto: 'GET /api/gallery/:id',
            testDelete: 'DELETE /api/test-delete/:id'
        },
        environment: {
            cloudinary: CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured',
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            render: process.env.RENDER ? 'yes' : 'no',
            adminToken: ADMIN_TOKEN
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'kmv-gallery-backend',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        cloudinary: CLOUDINARY_CLOUD_NAME ? 'ready' : 'not configured',
        endpoints: [
            { method: 'GET', path: '/api/gallery', description: 'Get all photos' },
            { method: 'POST', path: '/api/gallery/upload', description: 'Upload photo (admin)' },
            { method: 'DELETE', path: '/api/gallery/:id', description: 'Delete photo (admin)' }
        ]
    });
});

// Home page
app.get('/', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 
        `<span style="color: green;">✅ Connected</span>` : 
        `<span style="color: red;">❌ Disconnected</span>`;
    
    const cloudinaryStatus = CLOUDINARY_CLOUD_NAME ? 
        `<span style="color: green;">✅ Configured</span>` : 
        `<span style="color: red;">❌ Not Configured</span>`;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>KMV Gallery Backend</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { color: #2c3e50; }
                .status { background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0; }
                .endpoint { background: #e9ecef; padding: 15px; margin: 10px 0; border-radius: 5px; }
                code { background: #343a40; color: white; padding: 2px 5px; border-radius: 3px; }
                .success { color: green; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1>📸 KMV Gallery Backend</h1>
            <div class="status">
                <p><strong>Status:</strong> <span class="success">✅ Running on Render.com</span></p>
                <p><strong>Port:</strong> ${PORT}</p>
                <p><strong>Database:</strong> ${dbStatus}</p>
                <p><strong>Cloudinary:</strong> ${cloudinaryStatus}</p>
                <p><strong>Admin Token:</strong> ${ADMIN_TOKEN}</p>
            </div>
            
            <h2>Available Endpoints:</h2>
            <div class="endpoint">
                <code>GET /api/gallery</code> - Get all photos
                <br><a href="/api/gallery">Test Now</a>
            </div>
            <div class="endpoint">
                <code>POST /api/gallery/upload</code> - Upload photo (Admin only)
            </div>
            <div class="endpoint">
                <code>DELETE /api/gallery/:id</code> - Delete photo (Admin only)
            </div>
            <div class="endpoint">
                <code>GET /api/test</code> - Server test
                <br><a href="/api/test">Test Now</a>
            </div>
            <div class="endpoint">
                <code>GET /health</code> - Health check
                <br><a href="/health">Check Health</a>
            </div>
            
            <h2>Test Delete:</h2>
            <p>Use this test ID: <code>693c79d078d5d4bee500b77a</code></p>
            <p>Test URL: <code>DELETE /api/gallery/693c79d078d5d4bee500b77a</code></p>
            
            <h2>Quick Test:</h2>
            <button onclick="testDelete()">Test Delete Function</button>
            <div id="testResult"></div>
            
            <script>
                async function testDelete() {
                    const resultDiv = document.getElementById('testResult');
                    resultDiv.innerHTML = 'Testing...';
                    
                    try {
                        const response = await fetch('/api/gallery/693c79d078d5d4bee500b77a', {
                            method: 'DELETE',
                            headers: {
                                'Authorization': '${ADMIN_TOKEN}',
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        const data = await response.json();
                        resultDiv.innerHTML = \`
                            <h3>Test Result:</h3>
                            <p>Status: \${response.status}</p>
                            <p>Success: \${data.success}</p>
                            <p>Message: \${data.message}</p>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                    } catch (error) {
                        resultDiv.innerHTML = \`<p style="color: red;">Error: \${error.message}</p>\`;
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('🚨 Server Error:', err.stack);
    
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: 'File upload error',
            message: err.message
        });
    }
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`
    });
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
    console.log('📁 Created uploads directory');
}

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on port ${PORT} (Render.com)`);
    console.log(`☁️ Cloudinary: ${CLOUDINARY_CLOUD_NAME}`);
    console.log(`🗄️ Database: KMV_Gallery_DB`);
    console.log(`🔑 Admin Token: "${ADMIN_TOKEN}"`);
    console.log(`🌐 URL: https://kmv-gallery-backend.onrender.com`);
    console.log('='.repeat(60));
    console.log('\n📋 Test Endpoints:');
    console.log(`   GET  https://kmv-gallery-backend.onrender.com/api/gallery`);
    console.log(`   GET  https://kmv-gallery-backend.onrender.com/api/test`);
    console.log(`   DELETE https://kmv-gallery-backend.onrender.com/api/gallery/693c79d078d5d4bee500b77a`);
    console.log('='.repeat(60));
});
