// gallery-backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const dotenv = require('dotenv');

// 1. Load environment variables
dotenv.config();

// Debug: Check Cloudinary config
console.log('🔧 Cloudinary Config Check:');
console.log('- Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET');
console.log('- API Key:', process.env.CLOUDINARY_API_KEY ? 'SET' : 'NOT SET');
console.log('- API Secret:', process.env.CLOUDINARY_API_SECRET ? 'SET' : 'NOT SET');

const ADMIN_TOKEN = 'Admin_Access_Token_Placeholder';
const MONGO_URI = "mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/KMV_Gallery_DB"; 
const PORT = process.env.PORT || 5001;

const app = express();
const server = http.createServer(app);

// 2. CORS Setup
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

// 3. MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// 4. Gallery Model
const gallerySchema = new mongoose.Schema({
    photoUrl: String,
    publicId: String,
    caption: String,
    uploader: String,
    createdAt: { type: Date, default: Date.now }
});
const GalleryPhoto = mongoose.model('GalleryPhoto', gallerySchema);

// 5. ✅ FIXED: Cloudinary Configuration with fallback
const cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dummy',
    api_key: process.env.CLOUDINARY_API_KEY || 'dummy',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'dummy'
};

console.log('☁️ Cloudinary Configuration:', cloudinaryConfig.cloud_name);

cloudinary.config(cloudinaryConfig);

// 6. Multer Setup with file validation
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Error: Images only! (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// 7. Admin Auth Middleware
const protectAdmin = (req, res, next) => {
    const token = req.header('Authorization');
    
    if (token && token.trim() === ADMIN_TOKEN.trim()) {
        next();
    } else {
        res.status(401).json({ 
            success: false,
            msg: 'Authorization denied. Admin access required.'
        });
    }
};

// 8. ✅ FIXED UPLOAD ROUTE WITH BETTER ERROR HANDLING
app.post('/api/gallery/upload', protectAdmin, upload.single('image'), async (req, res) => {
    console.log('📤 Upload Request Started');
    console.log('- File received:', req.file ? 'Yes' : 'No');
    console.log('- File details:', req.file);
    console.log('- Request body:', req.body);
    
    if (!req.file) {
        console.log('❌ No file in request');
        return res.status(400).json({ 
            success: false,
            msg: 'No image file uploaded or file is invalid.' 
        });
    }
    
    const { caption, uploader } = req.body;
    
    try {
        // STEP 1: Check Cloudinary credentials
        if (!process.env.CLOUDINARY_CLOUD_NAME || 
            !process.env.CLOUDINARY_API_KEY || 
            !process.env.CLOUDINARY_API_SECRET) {
            console.log('❌ Cloudinary credentials missing');
            throw new Error('Cloudinary configuration is incomplete');
        }
        
        console.log('☁️ Attempting Cloudinary upload...');
        
        // STEP 2: Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'kmv_gallery',
            resource_type: 'auto',
            timeout: 60000 // 60 seconds timeout
        }).catch(cloudinaryErr => {
            console.error('❌ Cloudinary Upload Error:', cloudinaryErr);
            throw new Error(`Cloudinary upload failed: ${cloudinaryErr.message}`);
        });
        
        console.log('✅ Cloudinary upload successful:', result.secure_url);
        
        // STEP 3: Remove temp file
        try {
            fs.unlinkSync(req.file.path);
            console.log('🗑️ Temp file removed');
        } catch (unlinkErr) {
            console.warn('⚠️ Could not remove temp file:', unlinkErr.message);
        }
        
        // STEP 4: Save to MongoDB
        console.log('💾 Saving to database...');
        const newPhoto = new GalleryPhoto({
            photoUrl: result.secure_url,
            publicId: result.public_id,
            caption: caption || 'Untitled',
            uploader: uploader || 'Admin',
        });
        
        const savedPhoto = await newPhoto.save();
        console.log('✅ Database save successful:', savedPhoto._id);
        
        // STEP 5: Real-time update
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
        io.emit('gallery_updated', photos);
        
        res.status(201).json({ 
            success: true,
            msg: '✅ Image uploaded successfully!', 
            photo: savedPhoto 
        });
        
    } catch (err) {
        console.error('❌ UPLOAD ERROR DETAILS:');
        console.error('- Error message:', err.message);
        console.error('- Error stack:', err.stack);
        console.error('- File path:', req.file?.path);
        
        // Clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('🗑️ Cleaned up temp file after error');
            } catch (cleanupErr) {
                console.error('⚠️ Failed to clean up temp file:', cleanupErr.message);
            }
        }
        
        // Determine error type
        let errorMsg = 'Server Error: Image processing failed.';
        
        if (err.message.includes('Cloudinary')) {
            errorMsg = 'Cloudinary upload failed. Check API credentials.';
        } else if (err.message.includes('database') || err.message.includes('Mongo')) {
            errorMsg = 'Database error. Could not save photo.';
        } else if (err.message.includes('file size')) {
            errorMsg = 'File too large. Maximum size is 10MB.';
        }
        
        res.status(500).json({ 
            success: false,
            msg: errorMsg,
            debug: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// 9. Test Cloudinary connection
app.get('/api/test-cloudinary', async (req, res) => {
    try {
        // Simple test to check Cloudinary connection
        const testResult = await cloudinary.api.ping();
        res.json({
            success: true,
            message: 'Cloudinary connection OK',
            cloudinary: testResult
        });
    } catch (err) {
        res.json({
            success: false,
            message: 'Cloudinary connection failed',
            error: err.message
        });
    }
});

// 10. Alternative upload (save locally for testing)
app.post('/api/upload-local', protectAdmin, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ msg: 'No file' });
    }
    
    try {
        // Save locally without Cloudinary
        const localUrl = `/uploads/${req.file.filename}`;
        
        const newPhoto = new GalleryPhoto({
            photoUrl: localUrl,
            caption: req.body.caption || 'Local Test',
            uploader: 'Admin'
        });
        
        await newPhoto.save();
        
        res.json({
            success: true,
            message: 'Local upload successful (for testing)',
            photo: newPhoto
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            msg: 'Local upload failed',
            error: err.message 
        });
    }
});

// 11. Socket.io setup
const io = new Server(server, { cors: { origin: "*" } });
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
});

// 12. Create uploads folder
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
    console.log('📁 Created uploads folder');
}

// 13. Serve static files (for local testing)
app.use('/uploads', express.static('uploads'));

// 14. Home route with instructions
app.get('/', (req, res) => {
    res.send(`
        <h1>KMV Gallery Backend</h1>
        <p>Status: <strong>Running</strong></p>
        <p>To fix upload errors:</p>
        <ol>
            <li>Create <code>.env</code> file with Cloudinary credentials</li>
            <li>Check file size (max 10MB)</li>
            <li>Use supported image formats</li>
        </ol>
        <p>Test endpoints:</p>
        <ul>
            <li><a href="/api/test-cloudinary">Test Cloudinary</a></li>
            <li><a href="/api/gallery">View Gallery</a></li>
        </ul>
    `);
});

// 15. Start server
server.listen(PORT, () => {
    console.log('=========================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 Admin Token: "${ADMIN_TOKEN}"`);
    console.log('=========================================');
    console.log('\n🔧 TO FIX UPLOAD ERROR:');
    console.log('1. Check .env file has Cloudinary credentials');
    console.log('2. Test Cloudinary: GET /api/test-cloudinary');
    console.log('3. Test local upload: POST /api/upload-local');
    console.log('=========================================');
});
