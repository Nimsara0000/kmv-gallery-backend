// gallery-backend/routes/galleryRoutes.js
const express = require('express');
const GalleryPhoto = require('../models/GalleryPhoto');
// 🛑 Cloudinary Library එක Route file එකට Import කිරීම
const cloudinary = require('cloudinary').v2; 

module.exports = (emitGalleryUpdate, protectAdmin) => {
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

    // 2. DELETE a photo (Admin Only) - 🛑 Cloudinary Logic එක එකතු කරන ලදී
    router.delete('/:id', protectAdmin, async (req, res) => {
        try {
            // 1. DB එකෙන් photo එක සොයා ගැනීම
            const photo = await GalleryPhoto.findById(req.params.id);

            if (!photo) {
                return res.status(404).json({ msg: 'Photo not found' });
            }
            
            const publicId = photo.publicId; 
            
            // 2. 🛑 Cloudinary වෙතින් photo එක මකා දැමීම
            if (publicId) {
                await cloudinary.uploader.destroy(publicId);
                console.log(`Cloudinary file deleted: ${publicId}`);
            }

            // 3. DB එකෙන් photo record එක මකා දැමීම
            await photo.deleteOne(); 

            // Real-time update
            emitGalleryUpdate(); 

            res.json({ msg: 'Photo removed successfully' });
        } catch (err) {
            console.error('Deletion Error:', err.message);
            res.status(500).send('Server Error: Deletion failed.');
        }
    });

    return router;
};
