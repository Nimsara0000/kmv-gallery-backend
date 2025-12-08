// gallery-backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

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
const galleryRoutes = require('./routes/galleryRoutes')(emitGalleryUpdate);
app.use('/api/gallery', galleryRoutes);

// 6. Socket.io Connection Events
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

// 7. Server Start
server.listen(PORT, () => {
    console.log(`Gallery Server listening on port ${PORT}`);
});
