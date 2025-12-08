// gallery-backend/models/GalleryPhoto.js
const mongoose = require('mongoose');

const GalleryPhotoSchema = new mongoose.Schema({
    photoUrl: {
        type: String,
        required: true,
    },
    caption: {
        type: String,
        default: 'KMV Drama Event Photo',
    },
    uploader: {
        type: String, 
        default: 'Admin',
    },
}, { timestamps: true });

module.exports = mongoose.model('GalleryPhoto', GalleryPhotoSchema);
