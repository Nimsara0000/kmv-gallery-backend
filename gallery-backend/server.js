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
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Admin_Access_Token_Placeholder';

console.log('🔧 Environment Check:');
console.log('- Port:', PORT);
console.log('- Cloudinary Cloud Name:', CLOUDINARY_CLOUD_NAME);
console.log('- Cloudinary API Key:', CLOUDINARY_API_KEY ? '✓ SET' : '✗ MISSING');
console.log('- Is Render.com?:', process.env.RENDER ? 'YES' : 'NO');

// ✅ Cloudinary Configuration (with your actual credentials)
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// Gallery Model
const gallerySchema = new mongoose.Schema({
    photoUrl: String,
    publicId: String,
    caption: String,
    uploader: String,
    createdAt: { type: Date, default: Date.now }
});
const GalleryPhoto = mongoose.model('GalleryPhoto', gallerySchema);

// Multer Setup
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Admin Auth Middleware
const protectAdmin = (req, res, next) => {
    const token = req.header('Authorization');
    if (token && token.trim() === ADMIN_TOKEN.trim()) {
        next();
    } else {
        res.status(401).json({ error: 'Authorization denied. Admin access required.' });
    }
};

// ✅ FIXED UPLOAD ENDPOINT
app.post('/api/gallery/upload', protectAdmin, upload.single('image'), async (req, res) => {
    console.log('📤 Upload Request - Render.com');
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { caption, uploader } = req.body;
    
    try {
        console.log('☁️ Uploading to Cloudinary...');
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'kmv_gallery'
        });
        
        console.log('✅ Cloudinary Success:', result.secure_url);
        
        // Remove temp file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // Save to database
        const newPhoto = new GalleryPhoto({
            photoUrl: result.secure_url,
            publicId: result.public_id,
            caption: caption || 'No caption',
            uploader: uploader || 'Admin'
        });
        
        const savedPhoto = await newPhoto.save();
        
        res.json({
            success: true,
            message: '✅ Photo uploaded successfully!',
            photo: savedPhoto
        });
        
    } catch (error) {
        console.error('❌ Upload Error:', error.message);
        
        // Clean up on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Upload failed',
            message: error.message
        });
    }
});

// Get all photos
app.get('/api/gallery', async (req, res) => {
    try {
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
        res.json(photos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: '✅ Server is working on Render.com',
        cloudinary: CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not configured',
        environment: process.env.NODE_ENV || 'development',
        render: process.env.RENDER ? 'Yes' : 'No'
    });
});

// Health check for Render.com
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'kmv-gallery-backend',
        cloudinary: CLOUDINARY_CLOUD_NAME ? 'ready' : 'not configured'
    });
});

// Home page
app.get('/', (req, res) => {
    res.send(`
        <h1>KMV Gallery Backend</h1>
        <p><strong>Status:</strong> ✅ Running on Render.com</p>
        <p><strong>Port:</strong> ${PORT}</p>
        <p><strong>Cloudinary:</strong> ${CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not Configured'}</p>
        <p><strong>Endpoints:</strong></p>
        <ul>
            <li><code>GET /api/test</code> - Server test</li>
            <li><code>GET /api/gallery</code> - View photos</li>
            <li><code>POST /api/gallery/upload</code> - Upload photo</li>
            <li><code>GET /health</code> - Health check</li>
        </ul>
        <p><a href="/api/test">Test Server</a></p>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT} (Render.com)`);
    console.log(`☁️ Cloudinary: ${CLOUDINARY_CLOUD_NAME}`);
    console.log(`🔑 Admin Token: "${ADMIN_TOKEN}"`);
    console.log(`🌐 URL: https://kmv-gallery-backend.onrender.com`);
    console.log('='.repeat(50));
});
