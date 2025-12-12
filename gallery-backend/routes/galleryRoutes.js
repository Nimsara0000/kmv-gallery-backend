// gallery-backend/routes/galleryRoutes.js
const express = require('express');
const GalleryPhoto = require('../models/GalleryPhoto');
// Note: Multer, Cloudinary මෙහිදී අවශ්‍ය නැත, ඒවා server.js හි භාවිතා වේ.

// Middleware එක server.js වෙතින් ලැබේ
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

    // 2. 🛑 POST a new photo (The file upload route is now in server.js at /api/gallery/upload)
    // මෙම Route එක හිස්ව තබයි, නැතිනම් URL-based upload සඳහා නම් වෙනස් කරයි.
    
    // 3. DELETE a photo (Admin Only)
    router.delete('/:id', protectAdmin, async (req, res) => {
        try {
            // 🛑 Note: Cloudinary එකෙනුත් photo එක delete කිරීමට මෙහි logic ලිවිය යුතුය.
            // උදා: await cloudinary.uploader.destroy(publicId);
            
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
