// gallery-backend/routes/galleryRoutes.js
const express = require('express');
const GalleryPhoto = require('../models/GalleryPhoto');

// 🛑 Admin Authentication Middleware (මෙහිදී Token එකක් header එකේ තිබේදැයි සරලව බලයි)
const protectAdmin = (req, res, next) => {
    // Frontend එකේ localStorage.getItem('adminToken') එක 'true' ලෙස යවනු ඇත.
    const token = req.header('Authorization'); 
    if (token) {
        next(); 
    } else {
        // මෙය Admin Login එකේ Token එක මත පදනම් වේ.
        res.status(401).json({ msg: 'Authorization denied. Admin access required.' });
    }
};

module.exports = (emitGalleryUpdate) => {
    const router = express.Router();

    // 1. GET all photos (Public Access)
    router.get('/', async (req, res) => {
        try {
            const photos = await GalleryPhoto.find().sort({ createdAt: -1 });
            res.json(photos);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    });

    // 2. POST a new photo (Admin Only)
    router.post('/', protectAdmin, async (req, res) => {
        const { photoUrl, caption, uploader } = req.body;

        if (!photoUrl) {
            return res.status(400).json({ msg: 'Photo URL is required.' });
        }

        try {
            const newPhoto = new GalleryPhoto({
                photoUrl,
                caption,
                uploader: uploader || 'Admin',
            });

            const photo = await newPhoto.save();
            
            // Real-time update
            emitGalleryUpdate(); 

            res.json(photo);
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    });

    // 3. DELETE a photo (Admin Only)
    router.delete('/:id', protectAdmin, async (req, res) => {
        try {
            const photo = await GalleryPhoto.findByIdAndDelete(req.params.id);

            if (!photo) {
                return res.status(404).json({ msg: 'Photo not found' });
            }

            // Real-time update
            emitGalleryUpdate(); 

            res.json({ msg: 'Photo removed' });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    });

    return router;
};
