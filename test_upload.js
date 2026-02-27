require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Testing Cloudinary configuration...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY);

// Search for a simple image to upload (or use a base64 dot)
const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

cloudinary.uploader.upload(testImage, { folder: 'test_connection' })
    .then(result => {
        console.log('✅ Upload successful!');
        console.log('Public ID:', result.public_id);
        console.log('URL:', result.secure_url);
        // Clean up
        return cloudinary.uploader.destroy(result.public_id);
    })
    .then(() => {
        console.log('✅ Cleanup successful!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Upload failed!');
        console.error(error);
        process.exit(1);
    });
