// gallery-backend/models/GalleryPhoto.js
const mongoose = require('mongoose');

const GalleryPhotoSchema = new mongoose.Schema({
    photoUrl: {
        type: String,
        required: true,
    },
    // 🛑 NEW FIELD ADDED: Cloudinary Public ID for deletion
    publicId: { 
        type: String,
        required: true, // මෙය Cloudinary upload එකේදී ලැබෙන නිසා, එය අනිවාර්ය විය යුතුය.
    },
    caption: {
        type: String,
        default: 'KMV Drama Event Photo',
    },
    uploader: {
        type: String, 
        default: 'Admin',
    },
}, { 
    // Note: ඔබ මෙහි timestamps: true ලෙස යොදා ඇත. එය හොඳයි.
    timestamps: true 
});

module.exports = mongoose.model('GalleryPhoto', GalleryPhotoSchema);
