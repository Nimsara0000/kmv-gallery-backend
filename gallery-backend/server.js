// gallery-backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

// 🛑 NEW: File Upload Dependencies
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const dotenv = require('dotenv');

// 1. dotenv config
dotenv.config();

// 🛑 ඔබ ලබා දුන් MongoDB URI එක
const MONGO_URI = "mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/KMV_Gallery_DB"; 
const PORT = process.env.PORT || 5001;

const app = express();
const server = http.createServer(app);

// 🌐 CORS Setup: සියලුම origins සඳහා අවසර දීම
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// 🔌 Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Gallery Model Import කරන්න
const GalleryPhoto = require('./models/GalleryPhoto');


// ==========================================================
// 🛠️ NEW: CLOUDINARY & MULTER CONFIGURATION FOR FILE UPLOAD
// ==========================================================

// 2. Cloudinary Setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer Setup: Uploads තාවකාලිකව සර්වර් එකේ 'uploads' ෆෝල්ඩරයේ තබයි
const upload = multer({ dest: 'uploads/' });

// 🛑 Admin Authentication Middleware (Simplified)
const protectAdmin = (req, res, next) => {
    // 🛑 මෙය ඔබට අවශ්‍ය පරිදි වෙනස් කරන්න
    const token = req.header('Authorization'); 
    if (token && token === 'Admin_Access_Token_Placeholder') { 
        next(); 
    } else {
        res.status(401).json({ msg: 'Authorization denied. Admin access required.' });
    }
};

// ==========================================================


// 3. MongoDB සම්බන්ධතාවය
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully for Gallery'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// 4. Real-time update function
const emitGalleryUpdate = async () => {
    try {
        const photos = await GalleryPhoto.find().sort({ createdAt: -1 }); 
        io.emit('gallery_updated', photos);
    } catch (err) {
        console.error('Error emitting gallery update:', err);
    }
};

// 5. Routes Setup
const galleryRoutes = require('./routes/galleryRoutes')(emitGalleryUpdate, protectAdmin); 
app.use('/api/gallery', galleryRoutes);


// 6. 🛑 NEW ROUTE: DIRECT FILE UPLOAD (This is the route that accepts the file)
app.post('/api/gallery/upload', protectAdmin, upload.single('image'), async (req, res) => {
    
    if (!req.file) {
        return res.status(400).json({ msg: 'No image file uploaded.' });
    }
    
    const { caption, uploader } = req.body;

    try {
        // 1. Cloudinary වෙත ගොනුව Upload කිරීම
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'kmv_gallery', 
        });
        
        // 2. තාවකාලිකව සර්වර් එකේ තිබූ ගොනුව ඉවත් කිරීම
        fs.unlinkSync(req.file.path); 

        // 3. New Photo Link එක DB එකේ Save කිරීම
        const newPhoto = new GalleryPhoto({
            photoUrl: result.secure_url, 
            caption,
            uploader: uploader || 'Admin',
        });

        const photo = await newPhoto.save();
        
        // Real-time update
        emitGalleryUpdate(); 

        res.status(201).json({ 
            msg: 'Image uploaded and saved successfully', 
            photo: photo 
        });

    } catch (err) {
        console.error('Cloudinary Upload/Save Error:', err.message);
        // අසාර්ථක වුවහොත් තාවකාලික ගොනුව ඉවත් කිරීමට උත්සාහ කරන්න
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ msg: 'Server Error: Image processing failed.' });
    }
});
// ---------------------------------------------


// 7. Socket.io Connection Events
io.on('connection', (socket) => {
    console.log('A user connected to gallery socket:', socket.id);
    emitGalleryUpdate(); 
    socket.on('disconnect', () => {
        console.log('User disconnected from gallery socket:', socket.id);
    });
});

app.get('/', (req, res) => {
    res.send('KMV Gallery Backend is Running! Port: ' + PORT);
});

// 8. Server Start
server.listen(PORT, () => {
    console.log(`Gallery Server listening on port ${PORT}`);
});
