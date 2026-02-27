const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - The image buffer to upload
 * @param {string} folder - The folder to upload to
 * @param {string} publicId - Optional public ID
 * @returns {Promise<Object>} - The Cloudinary upload result
 */
const uploadBuffer = (buffer, folder = 'tax_app', publicId = null) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: folder,
            resource_type: 'auto',
        };

        if (publicId) {
            uploadOptions.public_id = publicId;
        }

        const stream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(error);
                }
            }
        );

        streamifier.createReadStream(buffer).pipe(stream);
    });
};

/**
 * Delete an image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} - The Cloudinary delete result
 */
const deleteImage = (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (result) {
                resolve(result);
            } else {
                reject(error);
            }
        });
    });
};

module.exports = {
    uploadBuffer,
    deleteImage,
};
